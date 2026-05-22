import os
import sys
import time
import ctypes
from ctypes import *
from datetime import datetime
import threading
import numpy as np
import cv2
import json

from force_ip import force_ip_before_open

MVS_PY_PATH = r"C:/Program Files (x86)/MVS\Development/Samples/Python/MvImport"
if MVS_PY_PATH not in sys.path:
    sys.path.append(MVS_PY_PATH)

from CameraParams_header import *
from MvCameraControl_class import *
from MvErrorDefine_const import *

cfg_path = "dataset_config.json"
with open(cfg_path) as f:
    _cfg = json.load(f)

TARGET_DEVICE_USER_ID           = _cfg["target_device_user_id"]
SAVE_DIRECTORY                  = _cfg["save_directory"]
SAVE_FORMAT                     = _cfg["save_format"]
USE_EXTERNAL_TRIGGER            = _cfg["use_external_trigger"]
TRIGGER_SOURCE                  = _cfg["trigger_source"]
TRIGGER_ACTIVATION              = _cfg["trigger_activation"]
EXPOSURE_TIME_US                = _cfg["exposure_time_us"]
GAIN_DB                         = _cfg["gain_db"]
ROI_ENABLE                      = _cfg["roi_enable"]
ROI_OFFSET_X                    = _cfg["roi_offset_x"]
ROI_OFFSET_Y                    = _cfg["roi_offset_y"]
FRAME_WIDTH                     = _cfg["frame_width"]
FRAME_HEIGHT                    = _cfg["frame_height"]
PIXEL_FORMAT                    = _cfg["pixel_format"]
JPEG_QUALITY                    = _cfg["jpeg_quality"]
AUTO_EXPOSURE                   = _cfg["auto_exposure"]
AUTO_GAIN                       = _cfg["auto_gain"]
WHITE_BALANCE_AUTO              = _cfg["white_balance_auto"]
WB_RED_RATIO                    = _cfg["wb_red_ratio"]
WB_GREEN_RATIO                  = _cfg["wb_green_ratio"]
WB_BLUE_RATIO                   = _cfg["wb_blue_ratio"]

SYSTEM_RUNNING = False
CAMERA_CONTROLLERS = []
LATEST_JPEG_PROCESS = None
JPEG_LOCK = threading.Lock()

def _reload_config():
    global TARGET_DEVICE_USER_ID, SAVE_DIRECTORY, SAVE_FORMAT, USE_EXTERNAL_TRIGGER
    global TRIGGER_SOURCE, TRIGGER_ACTIVATION, EXPOSURE_TIME_US, GAIN_DB
    global ROI_ENABLE, ROI_OFFSET_X, ROI_OFFSET_Y, FRAME_WIDTH, FRAME_HEIGHT
    global PIXEL_FORMAT, JPEG_QUALITY, AUTO_EXPOSURE, AUTO_GAIN
    global WHITE_BALANCE_AUTO, WB_RED_RATIO, WB_GREEN_RATIO, WB_BLUE_RATIO

    cfg_path = "dataset_config.json"
    with open(cfg_path) as f:
        c = json.load(f)

    TARGET_DEVICE_USER_ID           = c["target_device_user_id"]
    SAVE_DIRECTORY                  = c["save_directory"]
    SAVE_FORMAT                     = c["save_format"]
    USE_EXTERNAL_TRIGGER            = c["use_external_trigger"]
    TRIGGER_SOURCE                  = c["trigger_source"]
    TRIGGER_ACTIVATION              = c["trigger_activation"]
    EXPOSURE_TIME_US                = c["exposure_time_us"]
    GAIN_DB                         = c["gain_db"]
    ROI_ENABLE                      = c["roi_enable"]
    ROI_OFFSET_X                    = c["roi_offset_x"]
    ROI_OFFSET_Y                    = c["roi_offset_y"]
    FRAME_WIDTH                     = c["frame_width"]
    FRAME_HEIGHT                    = c["frame_height"]
    PIXEL_FORMAT                    = c["pixel_format"]
    JPEG_QUALITY                    = c["jpeg_quality"]
    AUTO_EXPOSURE                   = c["auto_exposure"]
    AUTO_GAIN                       = c["auto_gain"]
    WHITE_BALANCE_AUTO              = c["white_balance_auto"]
    WB_RED_RATIO                    = c["wb_red_ratio"]
    WB_GREEN_RATIO                  = c["wb_green_ratio"]
    WB_BLUE_RATIO                   = c["wb_blue_ratio"]

def ensure_dir(directory):
    try:
        os.makedirs(directory, exist_ok=True)
    except Exception as e:
        print(f"Could not create directory {directory}: {e}")

def get_last_image_count(save_dir):
    max_count = 0
    if not os.path.exists(save_dir):
        return 0
    for filename in os.listdir(save_dir):
        name, ext = os.path.splitext(filename)
        if ext.lower() in ('.jpg', '.png', '.bmp'):
            if name.isdigit():
                count = int(name)
                if count > max_count:
                    max_count = count
    return max_count

def decoding_char(c_ubyte_value):
    p = ctypes.cast(c_ubyte_value, ctypes.c_char_p)
    try:
        return p.value.decode('gbk')
    except:
        try:
            return p.value.decode('utf-8')
        except:
            return str(p.value)

def frame_to_bgr(frame_data, cam):
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
        raise RuntimeError(f"ISP conversion failed")
        
    return np.frombuffer(dst, dtype=np.uint8).reshape((frame_data['height'], frame_data['width'], 3))

def get_device_user_id(device_info):
    try:
        if device_info.nTLayerType in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            gige_info = device_info.SpecialInfo.stGigEInfo
            return decoding_char(gige_info.chUserDefinedName).strip()
    except:
        pass
    return ""

def find_device_by_user_id(device_list, target_user_id):
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

class CameraController:
    def __init__(self, config):
        self.config = config
        self.obj_cam = MvCamera()
        self.is_open = False
        self.is_grabbing = False
        self.stop_event = threading.Event()
        self.grab_thread = None
        self.saved_frame_count = 0
        self.save_next_frame = False

    def connect(self, device_info):
        print("[INFO] Dataset Engine connecting to camera...")
        if self.is_open:
            print("[WARN] Camera is already open.")
            return False
        ret = self.obj_cam.MV_CC_CreateHandle(device_info)
        if ret != MV_OK: 
            print(f"[ERROR] CreateHandle failed with {hex(ret)}")
            return False
        ret = self.obj_cam.MV_CC_OpenDevice()
        if ret != MV_OK: 
            print(f"[ERROR] OpenDevice failed with {hex(ret)}")
            self.obj_cam.MV_CC_DestroyHandle()
            return False
        
        if device_info.nTLayerType in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            packet_size = self.obj_cam.MV_CC_GetOptimalPacketSize()
            if packet_size > 0:
                self.obj_cam.MV_CC_SetIntValue("GevSCPSPacketSize", packet_size)
                print(f"[INFO] Set optimal packet size: {packet_size}")
                
        self.is_open = True
        print("[INFO] Camera opened successfully. Configuring...")
        self._configure_camera()
        return True

    def _set_enum_str(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetEnumValueByString(key, value)
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            print(f"  [WARN] Failed to set {key}={value} ({hex(ret)})")
        return ret

    def _set_int(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetIntValue(key, int(value))
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            print(f"  [WARN] Failed to set {key}={value} ({hex(ret)})")
        return ret

    def _set_float(self, key, value, quiet=False):
        ret = self.obj_cam.MV_CC_SetFloatValue(key, float(value))
        if ret == MV_OK and not quiet:
            print(f"  [OK] {key} = {value}")
        elif not quiet:
            print(f"  [WARN] Failed to set {key}={value} ({hex(ret)})")
        return ret

    def _configure_camera(self):
        print(f"\n[INFO] Configuring dataset camera parameters...")
        if ROI_ENABLE:
            self._set_int("OffsetX", ROI_OFFSET_X)
            self._set_int("OffsetY", ROI_OFFSET_Y)
            self._set_int("Width", FRAME_WIDTH)
            self._set_int("Height", FRAME_HEIGHT)
        else:
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
        
        self._set_enum_str("AcquisitionMode", "Continuous")
        if USE_EXTERNAL_TRIGGER:
            self._set_enum_str("TriggerMode", "On")
            self._set_enum_str("TriggerSelector", "FrameStart", quiet=True)
            self._set_enum_str("TriggerSource", TRIGGER_SOURCE)
            self._set_enum_str("TriggerActivation", TRIGGER_ACTIVATION)
        else:
            self._set_enum_str("TriggerMode", "Off")

    def start_grabbing(self):
        if not self.is_open or self.is_grabbing:
            print("[WARN] Camera not open or already grabbing.")
            return False
            
        save_dir = SAVE_DIRECTORY
        ensure_dir(save_dir)
        
        print("[INFO] Starting image grabbing thread for dataset...")
        ret = self.obj_cam.MV_CC_StartGrabbing()
        if ret != MV_OK: 
            print(f"[ERROR] StartGrabbing failed with {hex(ret)}")
            return False
        
        self.is_grabbing = True
        self.stop_event.clear()
        self.grab_thread = threading.Thread(target=self._grab_loop, daemon=True)
        self.grab_thread.start()
        print("[INFO] Dataset Engine Camera Grabbing Started!")
        return True

    def _grab_loop(self):
        stOutFrame = MV_FRAME_OUT()
        while not self.stop_event.is_set():
            memset(byref(stOutFrame), 0, sizeof(stOutFrame))
            ret = self.obj_cam.MV_CC_GetImageBuffer(stOutFrame, 1000)
            if ret == MV_OK:
                frame_data = {
                    'width': stOutFrame.stFrameInfo.nWidth,
                    'height': stOutFrame.stFrameInfo.nHeight,
                    'pixel_type': stOutFrame.stFrameInfo.enPixelType,
                    'data_len': stOutFrame.stFrameInfo.nFrameLen,
                    'data': string_at(stOutFrame.pBufAddr, stOutFrame.stFrameInfo.nFrameLen)
                }
                self.obj_cam.MV_CC_FreeImageBuffer(stOutFrame)
                
                try:
                    bgr = frame_to_bgr(frame_data, self.obj_cam)
                    
                    should_save = False
                    if USE_EXTERNAL_TRIGGER:
                        should_save = True
                    else:
                        if self.save_next_frame:
                            should_save = True
                            self.save_next_frame = False
                            
                    if should_save:
                        ensure_dir(SAVE_DIRECTORY)
                        self.saved_frame_count = get_last_image_count(SAVE_DIRECTORY)
                        ext = ".png" if SAVE_FORMAT == "PNG" else ".jpg"
                        filepath = os.path.join(SAVE_DIRECTORY, f"{self.saved_frame_count + 1:04d}{ext}")
                        if SAVE_FORMAT == "PNG":
                            cv2.imwrite(filepath, bgr)
                        else:
                            cv2.imwrite(filepath, bgr, [int(cv2.IMWRITE_JPEG_QUALITY), JPEG_QUALITY])
                    
                    ok, jpeg = cv2.imencode(".jpg", bgr, [int(cv2.IMWRITE_JPEG_QUALITY), 85])
                    if ok:
                        with JPEG_LOCK:
                            global LATEST_JPEG_PROCESS
                            LATEST_JPEG_PROCESS = jpeg.tobytes()
                            
                except Exception as e:
                    print(f"Dataset engine frame processing error: {e}")

    def stop_grabbing(self):
        if not self.is_grabbing: return
        self.stop_event.set()
        if self.grab_thread: self.grab_thread.join(timeout=2.0)
        if self.is_open:
            self.obj_cam.MV_CC_StopGrabbing()
        self.is_grabbing = False

    def disconnect(self):
        if self.is_grabbing: self.stop_grabbing()
        if self.is_open:
            self.obj_cam.MV_CC_CloseDevice()
            self.obj_cam.MV_CC_DestroyHandle()
            self.is_open = False

def start_system():
    global SYSTEM_RUNNING, CAMERA_CONTROLLERS
    print("[INFO] Attempting to start Dataset Engine...")
    if SYSTEM_RUNNING: 
        print("[INFO] Dataset Engine is already running.")
        return True
    
    _reload_config()
        
    MvCamera.MV_CC_Initialize()
    deviceList = MV_CC_DEVICE_INFO_LIST()
    layers = (MV_GIGE_DEVICE | MV_USB_DEVICE | MV_GENTL_CAMERALINK_DEVICE |
              MV_GENTL_CXP_DEVICE | MV_GENTL_XOF_DEVICE)
    ret = MvCamera.MV_CC_EnumDevices(layers, deviceList)
    if ret != MV_OK or deviceList.nDeviceNum == 0:
        print("[ERROR] No devices found or EnumDevices failed.")
        return False
        
    print(f"[INFO] Found {deviceList.nDeviceNum} devices.")
    force_ip_before_open(deviceList)
    time.sleep(3) # Match inspection.py wait time
    MvCamera.MV_CC_EnumDevices(layers, deviceList)
        
    idx = find_device_by_user_id(deviceList, TARGET_DEVICE_USER_ID)
    if idx < 0: 
        print(f"[WARN] Target camera '{TARGET_DEVICE_USER_ID}' not found, defaulting to index 0.")
        idx = 0
    else:
        print(f"[INFO] Target camera '{TARGET_DEVICE_USER_ID}' found at index {idx}.")
    
    device_info = cast(deviceList.pDeviceInfo[idx], POINTER(MV_CC_DEVICE_INFO)).contents
    controller = CameraController({"user_id": TARGET_DEVICE_USER_ID, "save_dir": SAVE_DIRECTORY})
    
    if controller.connect(device_info):
        print("[INFO] Camera configured successfully.")
        controller.start_grabbing()
        CAMERA_CONTROLLERS.append(controller)
        SYSTEM_RUNNING = True
        print("[INFO] Dataset Engine started successfully.")
        return True
    
    print("[ERROR] Failed to start Dataset Engine.")
    return False

def stop_system():
    global SYSTEM_RUNNING, CAMERA_CONTROLLERS
    if not SYSTEM_RUNNING: return True
    for cam in CAMERA_CONTROLLERS:
        cam.disconnect()
    CAMERA_CONTROLLERS.clear()
    MvCamera.MV_CC_Finalize()
    SYSTEM_RUNNING = False
    return True

def request_save_frame():
    for cam in CAMERA_CONTROLLERS:
        cam.save_next_frame = True
