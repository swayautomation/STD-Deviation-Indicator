# inspection.py
import os
import sys
import time
import ctypes
from ctypes import *
from datetime import datetime
import threading

import numpy as np
import cv2
import queue
from time import perf_counter
import json

import re

import tempfile, shutil
from pathlib import Path

# MVS SDK Import

MVS_PY_PATH = r"C:/Program Files (x86)/MVS\Development/Samples/Python/MvImport"
if MVS_PY_PATH not in sys.path:
    sys.path.append(MVS_PY_PATH)

from CameraParams_header import *
from MvCameraControl_class import *
from MvErrorDefine_const import *

with open("config.json") as f:
    _cfg = json.load(f)

# ==================== CONFIGURATION  ====================

TARGET_DEVICE_USER_ID           = _cfg["target_device_user_id"]
USE_EXTERNAL_TRIGGER            = _cfg["use_external_trigger"]
TRIGGER_SOURCE                  = _cfg["trigger_source"]
TRIGGER_ACTIVATION              = _cfg["trigger_activation"]
PIXEL_FORMAT                    = _cfg["pixel_format"]
FRAME_WIDTH                     = _cfg["frame_width"]
FRAME_HEIGHT                    = _cfg["frame_height"]
ROI_OFFSET_X                    = _cfg["roi_offset_x"]
ROI_OFFSET_Y                    = _cfg["roi_offset_y"]
EXPOSURE_TIME_US                = _cfg["exposure_time_us"]
GAIN_DB                         = _cfg["gain_db"]
MAX_PARALLEL_FRAMES             = _cfg["max_parallel_frames"]
SAVE_DIRECTORY                  = _cfg["save_directory"]
SAVE_FORMAT                     = _cfg["save_format"]
JPEG_QUALITY                    = _cfg["jpeg_quality"]
AUTO_EXPOSURE                   = _cfg["auto_exposure"]
AUTO_GAIN                       = _cfg["auto_gain"]
WHITE_BALANCE_AUTO              = _cfg["white_balance_auto"]
WB_RED_RATIO                    = _cfg["wb_red_ratio"]
WB_GREEN_RATIO                  = _cfg["wb_green_ratio"]
WB_BLUE_RATIO                   = _cfg["wb_blue_ratio"]
TARGET_FORCE_IP                 = _cfg["target_force_ip"]
TARGET_FORCE_SUBNET             = _cfg["target_force_subnet"]
TARGET_FORCE_GATEWAY            = _cfg["target_force_gateway"]
ROI_ENABLE                      = _cfg["roi_enable"]

# -------------------- CAMERA SELECTION (CONNECT BY DEVICE USER ID ONLY) --------------------
AUTO_CONNECT_FIRST_CAMERA = True       # If TARGET_DEVICE_USER_ID not found, connect first available camera

# Connection Check Interval
STATUS_CHECK_INTERVAL_SEC = 5.0

# Debug Output
ENABLE_DEBUG_LOGS = True
# ==================== END CONFIGURATION ====================

# ==================== INSPECTION CONFIG ====================

INDICATOR_SLOTS = []

RAW_FRAME_QUEUE = queue.Queue(maxsize=MAX_PARALLEL_FRAMES * 2)

FONT = cv2.FONT_HERSHEY_SIMPLEX

# ==================== END INSPECTION CONFIG ====================



COLOR_HSV_RANGES = {
    "Orange": ([10,  100, 100], [25,  255, 255]),
    "Blue":   ([100, 100, 50],  [130, 255, 255]),
    "Green":  ([45,  50,  50],  [85,  255, 255]),
}

FACE_STD_THRESHOLD = 58.0

# Shared state globals

JPEG_LOCK = threading.Lock()
DETECTION_LOCK = threading.Lock()
LATEST_JPEG_PROCESS = None
LATEST_JPEG_LIVE = None
LATEST_DETECTION = None
SYSTEM_RUNNING = False
CAMERA_CONTROLLERS = []

def to_hex_str(num):
    cha = {10:'a',11:'b',12:'c',13:'d',14:'e',15:'f'}
    if num < 0:
        num += 2**32
    s = ""
    while num >= 16:
        d = num % 16
        s = cha.get(d, str(d)) + s
        num //= 16
    return cha.get(num, str(num)) + s

def decoding_char(c_ubyte_value):
    p = ctypes.cast(c_ubyte_value, ctypes.c_char_p)
    try:
        return p.value.decode('gbk')
    except:
        try:
            return p.value.decode('utf-8')
        except:
            return str(p.value)

def ensure_dir(directory):
    try:
        os.makedirs(directory, exist_ok=True)
        print(f"[INFO] Save directory ready: {directory}")
    except Exception as e:
        print(f"[ERROR] Could not create directory {directory}: {e}")

def get_last_image_count(save_dir):
    max_count = 0

    if not os.path.exists(save_dir):
        return 0

    for filename in os.listdir(save_dir):

        name, ext = os.path.splitext(filename)

        if ext.lower() not in ('.jpg', '.jpeg', '.png', '.bmp'):
            continue

        match = re.search(r'(\d+)$', name)

        if match:
            count = int(match.group(1))

            if count > max_count:
                max_count = count

    return max_count
def timestamp_filename(ext):
    return datetime.now().strftime("%Y%m%d_%H%M%S_%f") + ext

def log_debug(message):
    if ENABLE_DEBUG_LOGS:
        print(f"[DEBUG] {message}")

def _reload_config():
    """Re-read config.json into all global constants so UI changes take effect on START."""
    global TARGET_DEVICE_USER_ID, USE_EXTERNAL_TRIGGER, TRIGGER_SOURCE, TRIGGER_ACTIVATION
    global PIXEL_FORMAT, FRAME_WIDTH, FRAME_HEIGHT, ROI_ENABLE, ROI_OFFSET_X, ROI_OFFSET_Y
    global EXPOSURE_TIME_US, GAIN_DB, AUTO_EXPOSURE, AUTO_GAIN
    global WHITE_BALANCE_AUTO, WB_RED_RATIO, WB_GREEN_RATIO, WB_BLUE_RATIO
    global MAX_PARALLEL_FRAMES, SAVE_DIRECTORY, SAVE_FORMAT, JPEG_QUALITY
    global TARGET_FORCE_IP, TARGET_FORCE_SUBNET, TARGET_FORCE_GATEWAY
    global INDICATOR_SLOTS
    global COLOR_HSV_RANGES

    with open("config.json") as f:
        c = json.load(f)

    TARGET_DEVICE_USER_ID           = c["target_device_user_id"]
    USE_EXTERNAL_TRIGGER            = c["use_external_trigger"]
    TRIGGER_SOURCE                  = c["trigger_source"]
    TRIGGER_ACTIVATION              = c["trigger_activation"]
    PIXEL_FORMAT                    = c["pixel_format"]
    FRAME_WIDTH                     = c["frame_width"]
    FRAME_HEIGHT                    = c["frame_height"]
    ROI_ENABLE                      = c["roi_enable"]
    ROI_OFFSET_X                    = c["roi_offset_x"]
    ROI_OFFSET_Y                    = c["roi_offset_y"]
    EXPOSURE_TIME_US                = c["exposure_time_us"]
    GAIN_DB                         = c["gain_db"]
    AUTO_EXPOSURE                   = c["auto_exposure"]
    AUTO_GAIN                       = c["auto_gain"]
    WHITE_BALANCE_AUTO              = c["white_balance_auto"]
    WB_RED_RATIO                    = c["wb_red_ratio"]
    WB_GREEN_RATIO                  = c["wb_green_ratio"]
    WB_BLUE_RATIO                   = c["wb_blue_ratio"]
    MAX_PARALLEL_FRAMES             = c["max_parallel_frames"]
    SAVE_DIRECTORY                  = c["save_directory"]
    SAVE_FORMAT                     = c["save_format"]
    JPEG_QUALITY                    = c["jpeg_quality"]
    TARGET_FORCE_IP                 = c["target_force_ip"]
    TARGET_FORCE_SUBNET             = c["target_force_subnet"]
    TARGET_FORCE_GATEWAY            = c["target_force_gateway"]

    INDICATOR_SLOTS = c.get("indicator_slots", [])
    
    default_hsv = {
        "Orange": ([10,  100, 100], [25,  255, 255]),
        "Blue":   ([100, 100, 50],  [130, 255, 255]),
        "Green":  ([45,  50,  50],  [85,  255, 255]),
    }
    COLOR_HSV_RANGES = c.get("color_hsv_ranges", default_hsv)
    print(f"[INFO] Loaded {len(INDICATOR_SLOTS)} indicator slots.")

                        
def ip_to_int(ip_str):
    parts = ip_str.split('.')
    return (int(parts[0])<<24)+(int(parts[1])<<16)+(int(parts[2])<<8)+int(parts[3])

def int_to_ip(ip_int):
    return f"{(ip_int>>24)&0xFF}.{(ip_int>>16)&0xFF}.{(ip_int>>8)&0xFF}.{ip_int&0xFF}"

def force_ip_before_open(device_list):
    """
    If camera is found but on wrong subnet, use ForceIP to push it
    to a reachable IP before opening.
    Call this AFTER EnumDevices but BEFORE CreateHandle/OpenDevice.
    """

    for i in range(device_list.nDeviceNum):
        info = cast(device_list.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents
        if info.nTLayerType not in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            continue

        current_ip = int_to_ip(info.SpecialInfo.stGigEInfo.nCurrentIp)
        if current_ip == TARGET_FORCE_IP:
            continue  # already correct

        print(f"[INFO] Camera at {current_ip}, forcing to {TARGET_FORCE_IP}...")

        tmp = MvCamera()
        ret = tmp.MV_CC_CreateHandle(info)
        if ret != MV_OK:
            print(f"[WARN] ForceIP CreateHandle failed: 0x{to_hex_str(ret)}")
            continue

        ip_int  = ip_to_int(TARGET_FORCE_IP)
        sub_int = ip_to_int(TARGET_FORCE_SUBNET)
        gw_int  = ip_to_int(TARGET_FORCE_GATEWAY)

        ret = tmp.MV_GIGE_ForceIpEx(ip_int, sub_int, gw_int)
        tmp.MV_CC_DestroyHandle()

        if ret == MV_OK:
            print(f"[OK] ForceIP success. Waiting 3s for camera to reconfigure...")
            time.sleep(3)
        else:
            print(f"[WARN] ForceIP failed: 0x{to_hex_str(ret)}")

def frame_to_bgr(frame_data, cam):
    """Convert raw camera buffer to BGR numpy array using ISP."""
    src = (ctypes.c_ubyte * frame_data['data_len']).from_buffer_copy(frame_data['data'])
    dst_len = frame_data['width'] * frame_data['height'] * 3
    dst = (ctypes.c_ubyte * dst_len)()

    convert_param = MV_CC_PIXEL_CONVERT_PARAM()
    memset(byref(convert_param), 0, sizeof(convert_param))
    convert_param.nWidth         = frame_data['width']
    convert_param.nHeight        = frame_data['height']
    convert_param.pSrcData       = ctypes.cast(src, POINTER(ctypes.c_ubyte))
    convert_param.nSrcDataLen    = frame_data['data_len']
    convert_param.enSrcPixelType = frame_data['pixel_type']
    convert_param.enDstPixelType = PixelType_Gvsp_BGR8_Packed
    convert_param.pDstBuffer     = ctypes.cast(dst, POINTER(ctypes.c_ubyte))
    convert_param.nDstBufferSize = dst_len

    ret = cam.MV_CC_ConvertPixelType(convert_param)
    if ret != MV_OK:
        raise RuntimeError(f"ISP conversion failed: 0x{to_hex_str(ret)}")

    return np.frombuffer(dst, dtype=np.uint8).reshape(
        (frame_data['height'], frame_data['width'], 3)
    )

def get_device_user_id(device_info):
    """
    Read DeviceUserID / UserDefinedName from MV_CC_DEVICE_INFO (without opening device).
    Hikrobot MVS typically stores this in:
      - GigE: stGigEInfo.chUserDefinedName
      - USB : stUsb3VInfo.chUserDefinedName
    """
    try:
        if device_info.nTLayerType in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            gige_info = device_info.SpecialInfo.stGigEInfo
            return decoding_char(gige_info.chUserDefinedName).strip()
        elif device_info.nTLayerType == MV_USB_DEVICE:
            usb_info = device_info.SpecialInfo.stUsb3VInfo
            return decoding_char(usb_info.chUserDefinedName).strip()
    except:
        pass
    return ""

def get_device_info_string(device_info):
    """Readable device info (includes DeviceUserID if available)"""
    uid = get_device_user_id(device_info)
    if device_info.nTLayerType in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
        gige_info = device_info.SpecialInfo.stGigEInfo
        serial = decoding_char(gige_info.chSerialNumber).strip()
        model = decoding_char(gige_info.chModelName).strip()
        # IP is not used for connection anymore, but can show as info
        ip_int = gige_info.nCurrentIp
        ip = f"{(ip_int>>24)&0xFF}.{(ip_int>>16)&0xFF}.{(ip_int>>8)&0xFF}.{ip_int&0xFF}"
        return f"UserID: {uid}, Model: {model}, S/N: {serial}, IP: {ip}"
    elif device_info.nTLayerType == MV_USB_DEVICE:
        usb_info = device_info.SpecialInfo.stUsb3VInfo
        serial = decoding_char(usb_info.chSerialNumber).strip()
        model = decoding_char(usb_info.chModelName).strip()
        return f"UserID: {uid}, Model: {model}, S/N: {serial}, USB"
    else:
        return f"UserID: {uid}, Other transport"

def find_device_by_user_id(device_list, target_user_id):
    """Find device index by Device User ID (UserDefinedName)"""
    if device_list is None or device_list.nDeviceNum == 0:
        return -1

    target = (target_user_id or "").strip()
    if not target:
        return -1

    for i in range(device_list.nDeviceNum):
        info = cast(device_list.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents
        uid = get_device_user_id(info)
        if uid == target:
            return i

    return -1

def detect_color_in_roi(roi_bgr):
    hsv = cv2.cvtColor(roi_bgr, cv2.COLOR_BGR2HSV)
    best_color = None
    best_pixels = 0
    for color_name, (lower, upper) in COLOR_HSV_RANGES.items():
        mask = cv2.inRange(hsv, np.array(lower), np.array(upper))
        count = cv2.countNonZero(mask)
        if count > best_pixels:
            best_pixels = count
            best_color = color_name
    return best_color, best_pixels


def check_color_positions(bgr):
    results = []
    for slot in INDICATOR_SLOTS:
        y1, y2, x1, x2 = slot["roi"]
        roi_crop = bgr[y1:y2, x1:x2]
        detected, px_count = detect_color_in_roi(roi_crop)
        position_ok = (detected == slot["expected_color"])
        results.append({
            "name":           slot["name"],
            "roi":            slot["roi"],
            "expected_color": slot["expected_color"],
            "detected_color": detected,
            "pixel_count":    px_count,
            "position_ok":    position_ok,
        })
    return results

def check_top_bottom(bgr, roi, slot_name="slot"):
    y1, y2, x1, x2 = roi
    crop = bgr[y1:y2, x1:x2]
    gray = cv2.cvtColor(crop, cv2.COLOR_BGR2GRAY)

    blurred = cv2.GaussianBlur(gray, (9, 9), 0)
    _, binary = cv2.threshold(blurred, 0, 255, cv2.THRESH_BINARY_INV + cv2.THRESH_OTSU)

    kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (25, 25))
    binary = cv2.morphologyEx(binary, cv2.MORPH_CLOSE, kernel)

    contours, _ = cv2.findContours(binary, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

    best = None
    best_area = 0
    for cnt in contours:
        area = cv2.contourArea(cnt)
        if area < 5000:
            continue
        if area > best_area:
            best_area = area
            best = cnt

    if best is None:
        return {"label": "UNKNOWN", "score": 0.0}

    mask = np.zeros_like(gray)
    cv2.drawContours(mask, [best], -1, 255, -1)

    erode_kernel = cv2.getStructuringElement(cv2.MORPH_ELLIPSE, (40, 40))
    inner_mask = cv2.erode(mask, erode_kernel)

    if cv2.countNonZero(inner_mask) == 0:
        return {"label": "UNKNOWN", "score": 0.0}

    score = float(gray[inner_mask == 255].std())
    label = "BOTTOM" if score > FACE_STD_THRESHOLD else "TOP"

    # ==================== DEBUG WINDOW ====================
    p1 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)

    p2 = cv2.cvtColor(binary, cv2.COLOR_GRAY2BGR)
    cv2.drawContours(p2, [best], -1, (0, 255, 0), 2)

    p3 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    cv2.drawContours(p3, [best], -1, (0, 255, 0), 2)

    p4 = cv2.cvtColor(gray, cv2.COLOR_GRAY2BGR)
    inner_overlay = np.zeros_like(p4)
    inner_overlay[inner_mask == 255] = (0, 0, 255)
    p4 = cv2.addWeighted(p4, 0.6, inner_overlay, 0.4, 0)
    cv2.putText(p4, f"inner_px={cv2.countNonZero(inner_mask)}",
                (5, 20), cv2.FONT_HERSHEY_SIMPLEX, 0.5, (0, 255, 255), 1)

    h_target = 300
    def resize_h(img, h):
        ratio = h / img.shape[0]
        return cv2.resize(img, (int(img.shape[1] * ratio), h))

    p1 = resize_h(p1, h_target)
    p2 = resize_h(p2, h_target)
    p3 = resize_h(p3, h_target)
    p4 = resize_h(p4, h_target)

    combined = np.hstack([p1, p2, p3, p4])

    for i, txt in enumerate(["Original", "Binary+Contour", "Disc Mask", f"Inner(std={score:.1f})"]):
        cv2.putText(combined, txt,
                    (i * p1.shape[1] + 5, 20),
                    cv2.FONT_HERSHEY_SIMPLEX, 0.5, (255, 255, 0), 1)

    cv2.putText(combined, f"{label}  area={best_area:.0f}  inner_px={cv2.countNonZero(inner_mask)}",
                (5, h_target - 10), cv2.FONT_HERSHEY_SIMPLEX, 0.6, (0, 255, 255), 2)

    # Save to file instead of imshow
    cv2.imwrite(f"debug_topbottom_{slot_name}.jpg", combined)
    # ==================== END DEBUG ====================

    return {"label": label, "score": score}

class CameraController:
    def __init__(self, cam_config):
        self.config = cam_config
        self.obj_cam = MvCamera()
        self.is_open = False
        self.is_grabbing = False

        self.grab_thread = None
        self.timer_thread = None
        self.status_thread = None
        self.process_threads = []
        self.stop_event = threading.Event()
        self._save_count_lock = threading.Lock()
        self._active_workers = 0

        self.last_save_time = 0
        self.saved_frame_count = 0
        self.frame_count = 0

        self.latest_frame = None
        self.frame_lock = threading.Lock()
        self.process_next_frame = False

    def _set_enum_str(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetEnumValueByString(key, value)
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            log_debug(f"{key} = {value} failed (0x{to_hex_str(ret)})")
        return ret

    def _set_int(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetIntValue(key, int(value))
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            log_debug(f"{key} = {value} failed (0x{to_hex_str(ret)})")
        return ret

    def _set_float(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetFloatValue(key, float(value))
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            log_debug(f"{key} = {value} failed (0x{to_hex_str(ret)})")
        return ret

    def connect(self, device_info):
        if self.is_open:
            print(f"[DeviceUserID: {self.config.get('user_id','?')}] Already connected")
            return False

        uid = self.config.get('user_id', 'Unknown')
        print(f"\n{'='*70}")
        print(f"[DeviceUserID: {uid}] Connecting...")
        print(f"  Device Info: {get_device_info_string(device_info)}")

        ret = self.obj_cam.MV_CC_CreateHandle(device_info)
        if ret != MV_OK:
            print(f"  [ERROR] Create handle failed: 0x{to_hex_str(ret)}")
            return False

        ret = self.obj_cam.MV_CC_OpenDevice()
        if ret != MV_OK:
            print(f"  [ERROR] Open device failed: 0x{to_hex_str(ret)}")
            self.obj_cam.MV_CC_DestroyHandle()
            return False

        if device_info.nTLayerType in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            packet_size = self.obj_cam.MV_CC_GetOptimalPacketSize()
            if packet_size > 0:
                self.obj_cam.MV_CC_SetIntValue("GevSCPSPacketSize", packet_size)
                log_debug(f"Set packet size: {packet_size}")

        self.is_open = True
        print(f"  [OK] Camera opened successfully")

        self._configure_camera()
        return True

    def _configure_camera(self):
        uid = self.config.get('user_id', 'Unknown')
        print(f"\n[DeviceUserID: {uid}] Configuring parameters...")

        if ROI_ENABLE:
            self._set_int("OffsetX", ROI_OFFSET_X)
            self._set_int("OffsetY", ROI_OFFSET_Y)
            self._set_int("Width", FRAME_WIDTH)
            self._set_int("Height", FRAME_HEIGHT)

        if not ROI_ENABLE :
            self._set_int("OffsetX", 0)
            self._set_int("OffsetY", 0)
            self._set_int("Width", 2448)
            self._set_int("Height", 2048)

        if PIXEL_FORMAT:
            self._set_enum_str("PixelFormat", PIXEL_FORMAT)

        if AUTO_EXPOSURE:
            self._set_enum_str("ExposureAuto", "Continuous")
        else:
            self._set_enum_str("ExposureAuto", "Off")
            self._set_float("ExposureTime", EXPOSURE_TIME_US)

        if AUTO_GAIN:
            self._set_enum_str("GainAuto", "Continuous")
        else:
            self._set_enum_str("GainAuto", "Off")
            self._set_float("Gain", GAIN_DB)

        if WHITE_BALANCE_AUTO:
            self._set_enum_str("BalanceWhiteAuto", "Continuous")
        else:
            self._set_enum_str("BalanceWhiteAuto", "Off")
            self._set_enum_str("BalanceRatioSelector", "Red", quiet=True)
            self._set_float("BalanceRatio", WB_RED_RATIO, quiet=True)
            self._set_enum_str("BalanceRatioSelector", "Green", quiet=True)
            self._set_float("BalanceRatio", WB_GREEN_RATIO, quiet=True)
            self._set_enum_str("BalanceRatioSelector", "Blue", quiet=True)
            self._set_float("BalanceRatio", WB_BLUE_RATIO, quiet=True)

        # self._set_enum_str("AcquisitionMode", "Continuous")
        if USE_EXTERNAL_TRIGGER:
            self._set_enum_str("TriggerMode", "On")
            self._set_enum_str("TriggerSelector", "FrameStart", quiet=True)
            self._set_enum_str("TriggerSource", TRIGGER_SOURCE)
            self._set_enum_str("TriggerActivation", TRIGGER_ACTIVATION)
            print(f"  [OK] External trigger enabled on {TRIGGER_SOURCE}")

        else:
            self._set_enum_str("TriggerMode", "Off")
            print(f"  [OK] Continuous (free-run) mode enabled")

        print(f"  [OK] Configuration complete")

    def start_grabbing(self):
        uid = self.config.get('user_id', 'Unknown')

        if not self.is_open:
            print(f"[DeviceUserID: {uid}] Camera not open")
            return False

        if self.is_grabbing:
            print(f"[DeviceUserID: {uid}] Already grabbing")
            return False

        save_dir = self.config.get('save_dir', SAVE_DIRECTORY)
        ensure_dir(save_dir)

        self.saved_frame_count = get_last_image_count(save_dir)

        ret = self.obj_cam.MV_CC_StartGrabbing()
        if ret != MV_OK:
            print(f"[DeviceUserID: {uid}] Start grabbing failed: 0x{to_hex_str(ret)}")
            return False

        self.is_grabbing = True
        self.stop_event.clear()
        self.frame_count = 0
        self.last_save_time = time.time()

        self.grab_thread = threading.Thread(target=self._grab_loop, daemon=True)
        self.grab_thread.start()

        self.process_threads = []
        for _ in range(MAX_PARALLEL_FRAMES):
            t = threading.Thread(target=self._process_worker, daemon=True)
            t.start()
            self.process_threads.append(t)

        self.status_thread = threading.Thread(target=self._status_monitor, daemon=True)
        self.status_thread.start()

        print(f"\n{'='*70}")
        print(f"[DeviceUserID: {uid}] ✓ STARTED AUTOMATIC IMAGE CAPTURE")
        print(f"  Save Directory: {save_dir}")
        print(f"  Format: {SAVE_FORMAT} (Quality: {JPEG_QUALITY if SAVE_FORMAT=='JPEG' else 'N/A'})")
        print(f"{'='*70}\n")

        return True

    def _grab_loop(self):
        stOutFrame = MV_FRAME_OUT()
        uid = self.config.get('user_id', 'Unknown')

        while not self.stop_event.is_set():
            memset(byref(stOutFrame), 0, sizeof(stOutFrame))
            ret = self.obj_cam.MV_CC_GetImageBuffer(stOutFrame, 5000)

            if ret == MV_OK:
                self.frame_count += 1
                
                frame_data = {
                    'width':      stOutFrame.stFrameInfo.nWidth,
                    'height':     stOutFrame.stFrameInfo.nHeight,
                    'pixel_type': stOutFrame.stFrameInfo.enPixelType,
                    'data_len':   stOutFrame.stFrameInfo.nFrameLen,
                    'data':       string_at(stOutFrame.pBufAddr,
                                            stOutFrame.stFrameInfo.nFrameLen)
                }
                self.obj_cam.MV_CC_FreeImageBuffer(stOutFrame)

                try:
                    # Always convert to BGR for live stream
                    bgr = frame_to_bgr(frame_data, self.obj_cam)
                    ok, jpeg = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 60])
                    if ok:
                        with JPEG_LOCK:
                            global LATEST_JPEG_LIVE
                            LATEST_JPEG_LIVE = jpeg.tobytes()
                            
                    # Decide if we should process
                    should_process = False
                    if USE_EXTERNAL_TRIGGER:
                        should_process = True
                    else:
                        if self.process_next_frame:
                            should_process = True
                            self.process_next_frame = False

                    if should_process:
                        if RAW_FRAME_QUEUE.full():
                            try: RAW_FRAME_QUEUE.get_nowait()
                            except queue.Empty: pass
                        RAW_FRAME_QUEUE.put(frame_data)
                        log_debug(f"[{uid}] Frame {self.frame_count} queued for inspection")
                except Exception as e:
                    print(f"[{uid}] Grab loop error: {e}")

            elif ret == MV_E_NODATA:
                pass
            else:
                log_debug(f"[{uid}] Get frame failed: 0x{to_hex_str(ret)}")
    
    def _process_worker(self):
        uid = self.config.get('user_id', 'Unknown')
        save_dir = self.config.get('save_dir', SAVE_DIRECTORY)

        while not self.stop_event.is_set():
            try:
                frame_data = RAW_FRAME_QUEUE.get(timeout=1.0)
            except queue.Empty:
                continue

            with self._save_count_lock:
                self._active_workers += 1

            try:
                t_total_start = perf_counter()

                # Step 1: Convert raw buffer → BGR
                t0 = perf_counter()
                bgr = frame_to_bgr(frame_data, self.obj_cam)
                convert_ms = (perf_counter() - t0) * 1000

                # Step 2: Color position check
                t0 = perf_counter()
                color_results = check_color_positions(bgr)
                color_ms = (perf_counter() - t0) * 1000

                # Step 3: Top/Bottom check only for position OK slots
                t0 = perf_counter()
                face_results = {}
                for slot in color_results:
                    if slot["position_ok"]:
                        face = check_top_bottom(bgr, slot["roi"], slot_name=slot["name"])
                        face_results[slot["name"]] = face
                face_ms = (perf_counter() - t0) * 1000

                # Step 4: Draw overlay
                overlay = bgr.copy()

                for slot in color_results:
                    y1, y2, x1, x2 = slot["roi"]
                    color_ok = slot["position_ok"]
                    box_color = (0, 255, 0) if color_ok else (0, 0, 255)
                    cv2.rectangle(overlay, (x1, y1), (x2, y2), box_color, 2)

                    face = face_results.get(slot["name"])
                    if face:
                        face_color = (0, 255, 0) if face["label"] == "TOP" else (0, 0, 255)
                        cv2.putText(overlay,
                                    f"{slot['name']} | {slot['detected_color']} | {face['label']}({face['score']:.1f})",
                                    (x1, y1 - 10), FONT, 0.6, face_color, 2)
                    else:
                        cv2.putText(overlay,
                                    f"{slot['name']} | {slot['detected_color']} NG",
                                    (x1, y1 - 10), FONT, 0.6, (0, 0, 255), 2)

                # Step 5: Final QC decision
                color_ng = any(not s["position_ok"] for s in color_results)
                face_ng  = any(f["label"] != "TOP" for f in face_results.values())
                unknown  = any(f["label"] == "UNKNOWN" for f in face_results.values())

                if color_ng:
                    final_status = "NG-COLOR"
                    status_color = (0, 0, 255)
                elif face_ng:
                    final_status = "NG-FACE"
                    status_color = (0, 0, 255)
                elif unknown:
                    final_status = "NG-NODISC"
                    status_color = (0, 165, 255)
                else:
                    final_status = "OK"
                    status_color = (0, 255, 0)

                cv2.putText(overlay, f"FINAL: {final_status}",
                            (30, 40), FONT, 1.2, status_color, 3)

                total_ms = (perf_counter() - t_total_start) * 1000

                with self._save_count_lock:
                    self.saved_frame_count += 1
                    count = self.saved_frame_count
                    # active_now = self._active_workers

                # Step 6: Encode and publish
                ok, jpeg = cv2.imencode(".jpg", overlay,
                                        [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                if ok:
                    with JPEG_LOCK:
                        global LATEST_JPEG_PROCESS
                        LATEST_JPEG_PROCESS = jpeg.tobytes()

                det = {
                    "final_status":  final_status,
                    "color_results": color_results,
                    "face_results":  {k: v for k, v in face_results.items()},
                    # "active_worker": active_now,
                    # "total_worker":  MAX_PARALLEL_FRAMES,
                    "frame_count":   count,
                }
                with DETECTION_LOCK:
                    global LATEST_DETECTION
                    LATEST_DETECTION = det

                print(
                    f"[{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}] [{uid}] "
                    f"#{count} → {final_status} | "
                    # f"active={active_now}/{MAX_PARALLEL_FRAMES} | "
                    f"convert={convert_ms:.1f}ms | "
                    f"color={color_ms:.1f}ms | "
                    f"face={face_ms:.1f}ms | "
                    f"TOTAL={total_ms:.1f}ms"
                )

            except Exception as e:
                print(f"[{uid}] [ERROR] Process worker: {e}")
                import traceback
                traceback.print_exc()
            finally:
                with self._save_count_lock:
                    self._active_workers -= 1

    def _status_monitor(self):
        uid = self.config.get('user_id', 'Unknown')
        while not self.stop_event.is_set():
            if self.is_open:
                ret = self.obj_cam.MV_CC_IsDeviceConnected()
                if not ret:
                    print(f"\n[DeviceUserID: {uid}] *** WARNING: Camera disconnected! ***\n")

            time.sleep(STATUS_CHECK_INTERVAL_SEC)

    def stop_grabbing(self):
        if not self.is_grabbing:
            return

        uid = self.config.get('user_id', 'Unknown')
        print(f"\n[DeviceUserID: {uid}] Stopping...")

        self.stop_event.set()

        if self.grab_thread:
            self.grab_thread.join(timeout=2.0)

        for t in self.process_threads:
            t.join(timeout=3.0)
        self.process_threads = []

        if self.is_open:
            ret = self.obj_cam.MV_CC_StopGrabbing()
            if ret != MV_OK:
                print(f"[DeviceUserID: {uid}] Stop failed: 0x{to_hex_str(ret)}")

        self.is_grabbing = False
        print(f"[DeviceUserID: {uid}] Stopped (Frames: {self.frame_count}, Saved: {self.saved_frame_count})")

    def disconnect(self):
        if self.is_grabbing:
            self.stop_grabbing()

        uid = self.config.get('user_id', 'Unknown')
        if self.is_open:
            ret = self.obj_cam.MV_CC_CloseDevice()
            if ret == MV_OK:
                print(f"[DeviceUserID: {uid}] Disconnected")
            self.obj_cam.MV_CC_DestroyHandle()
            self.is_open = False

def main():
    print("\n" + "=" * 80)
    print(" itek Camera - Device User ID Connection (NO IP)")
    print("=" * 80)

    if ENABLE_MULTIPLE_CAMERAS:
        print(" Mode: MULTI CAMERA")
        for c in CAMERA_LIST:
            print(f"  - UserID: {c.get('user_id')} -> Save: {c.get('save_dir')}")
    else:
        print(" Mode: SINGLE CAMERA")
        print(f" Target DeviceUserID: {TARGET_DEVICE_USER_ID}")
        print(f" Save Directory: {SAVE_DIRECTORY}")

    # print(f" Timer Interval: {TIMER_SAVE_INTERVAL_SEC} seconds")
    print("=" * 80 + "\n")

    MvCamera.MV_CC_Initialize()

    deviceList = MV_CC_DEVICE_INFO_LIST()
    layers = (MV_GIGE_DEVICE | MV_USB_DEVICE | MV_GENTL_CAMERALINK_DEVICE |
              MV_GENTL_CXP_DEVICE | MV_GENTL_XOF_DEVICE)
    ret = MvCamera.MV_CC_EnumDevices(layers, deviceList)

    if ret != MV_OK:
        print(f"[ERROR] Enumerate failed: 0x{to_hex_str(ret)}")
        MvCamera.MV_CC_Finalize()
        return

    # set static ip
    force_ip_before_open(deviceList)

    # Then re-enumerate so SDK sees the new IP
    time.sleep(3)
    ret = MvCamera.MV_CC_EnumDevices(layers, deviceList)

    if deviceList.nDeviceNum == 0:
        print("[ERROR] No cameras found!")
        print("\nTroubleshooting:")
        print("  1. Check camera power")
        print("  2. Check network cable / USB cable")
        print("  3. Open MVS software to verify camera")
        print("  4. Check firewall settings")
        MvCamera.MV_CC_Finalize()
        return

    print(f"Found {deviceList.nDeviceNum} camera(s)\n")
    print("Available cameras:")
    for i in range(deviceList.nDeviceNum):
        device_info = cast(deviceList.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents
        print(f"  [{i}] {get_device_info_string(device_info)}")
    print()

    cameras = []

    try:
        if ENABLE_MULTIPLE_CAMERAS:
            # Connect each camera by user_id from CAMERA_LIST
            for cam_cfg in CAMERA_LIST:
                uid = (cam_cfg.get("user_id") or "").strip()
                if not uid:
                    print("[WARN] Empty user_id in CAMERA_LIST, skipping...")
                    continue

                idx = find_device_by_user_id(deviceList, uid)
                if idx < 0:
                    print(f"[WARN] Camera UserID '{uid}' not found, skipping...")
                    continue

                device_info = cast(deviceList.pDeviceInfo[idx], POINTER(MV_CC_DEVICE_INFO)).contents
                controller = CameraController(cam_cfg)

                if controller.connect(device_info):
                    controller.start_grabbing()
                    cameras.append(controller)

            if not cameras:
                print("[ERROR] No cameras connected (check DeviceUserID in MVS tool).")
                MvCamera.MV_CC_Finalize()
                return

        else:
            # Single camera by TARGET_DEVICE_USER_ID
            if not TARGET_DEVICE_USER_ID:
                print("[ERROR] TARGET_DEVICE_USER_ID not set!")
                MvCamera.MV_CC_Finalize()
                return

            idx = find_device_by_user_id(deviceList, TARGET_DEVICE_USER_ID)

            if idx < 0:
                print(f"[WARNING] Camera UserID '{TARGET_DEVICE_USER_ID}' not found!")
                if AUTO_CONNECT_FIRST_CAMERA and deviceList.nDeviceNum > 0:
                    print("[INFO] Auto-connecting to first camera...")
                    idx = 0
                    first_info = cast(deviceList.pDeviceInfo[0], POINTER(MV_CC_DEVICE_INFO)).contents
                    actual_uid = get_device_user_id(first_info)
                    config = {"user_id": actual_uid if actual_uid else "FIRST_CAMERA", "save_dir": SAVE_DIRECTORY}
                else:
                    print("\n[ERROR] Cannot connect!")
                    print("Manual fix required:")
                    print("  1. Open MVS software")
                    print("  2. Select your camera")
                    print(f"  3. Set DeviceUserID / UserDefinedName to: {TARGET_DEVICE_USER_ID}")
                    print("  4. Run this script again")
                    MvCamera.MV_CC_Finalize()
                    return
            else:
                config = {"user_id": TARGET_DEVICE_USER_ID, "save_dir": SAVE_DIRECTORY}

            device_info = cast(deviceList.pDeviceInfo[idx], POINTER(MV_CC_DEVICE_INFO)).contents
            controller = CameraController(config)

            if controller.connect(device_info):
                controller.start_grabbing()
                cameras.append(controller)

            if not cameras:
                print("[ERROR] Failed to connect")
                MvCamera.MV_CC_Finalize()
                return

        print("=" * 80)
        print(" AUTOMATIC IMAGE CAPTURE ACTIVE")
        if ENABLE_MULTIPLE_CAMERAS:
            print(" Multiple cameras are saving automatically.")
        else:
            print(f" Saving every seconds to {SAVE_DIRECTORY}")
        print(" Press Ctrl+C to stop...")
        print("=" * 80 + "\n")

        while True:
            time.sleep(1)

    except KeyboardInterrupt:
        print("\n\n" + "=" * 80)
        print(" SHUTDOWN REQUESTED")
        print("=" * 80)

    except Exception as e:
        print(f"\n[ERROR] {e}")
        import traceback
        traceback.print_exc()

    finally:
        print("\nCleaning up...")
        for cam in cameras:
            cam.disconnect()

        MvCamera.MV_CC_Finalize()
        print("\n" + "=" * 80)
        print(" Cleanup complete. Exited.")
        print("=" * 80 + "\n")



def request_process_frame():
    for cam in CAMERA_CONTROLLERS:
        cam.process_next_frame = True
def start_system():
    global SYSTEM_RUNNING, CAMERA_CONTROLLERS

    if SYSTEM_RUNNING:
        return True

    _reload_config()
    SYSTEM_RUNNING = True
    CAMERA_CONTROLLERS.clear()

    MvCamera.MV_CC_Initialize()

    try:
        deviceList = MV_CC_DEVICE_INFO_LIST()
        layers = (MV_GIGE_DEVICE | MV_USB_DEVICE | MV_GENTL_CAMERALINK_DEVICE |
                  MV_GENTL_CXP_DEVICE | MV_GENTL_XOF_DEVICE)
        ret = MvCamera.MV_CC_EnumDevices(layers, deviceList)
        if ret != MV_OK or deviceList.nDeviceNum == 0:
            raise RuntimeError("No camera found")

        force_ip_before_open(deviceList)
        time.sleep(3)
        MvCamera.MV_CC_EnumDevices(layers, deviceList)

        idx = find_device_by_user_id(deviceList, TARGET_DEVICE_USER_ID)
        if idx < 0:
            idx = 0

        device_info = cast(deviceList.pDeviceInfo[idx], POINTER(MV_CC_DEVICE_INFO)).contents
        controller = CameraController({"user_id": TARGET_DEVICE_USER_ID, "save_dir": SAVE_DIRECTORY})

        if controller.connect(device_info):
            controller.start_grabbing()
            CAMERA_CONTROLLERS.append(controller)
        else:
            raise RuntimeError("Failed to connect to camera")

        return True
    except Exception as e:
        SYSTEM_RUNNING = False
        raise e

def stop_system():
    global SYSTEM_RUNNING, CAMERA_CONTROLLERS

    if not SYSTEM_RUNNING:
        return True

    for cam in CAMERA_CONTROLLERS:
        cam.disconnect()

    CAMERA_CONTROLLERS.clear()
    MvCamera.MV_CC_Finalize()
    SYSTEM_RUNNING = False
    return True