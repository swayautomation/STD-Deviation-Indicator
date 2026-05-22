import sys
import ctypes
from ctypes import *
import time
import json

MVS_PY_PATH = r"C:/Program Files (x86)/MVS\Development/Samples/Python/MvImport"
if MVS_PY_PATH not in sys.path:
    sys.path.append(MVS_PY_PATH)
from CameraParams_header import *
from MvCameraControl_class import *

def to_hex_str(ret):
    return hex(ret)

def ip_to_int(ip_str):
    parts = ip_str.split('.')
    return (int(parts[0])<<24)+(int(parts[1])<<16)+(int(parts[2])<<8)+int(parts[3])

def int_to_ip(ip_int):
    return f"{(ip_int>>24)&0xFF}.{(ip_int>>16)&0xFF}.{(ip_int>>8)&0xFF}.{ip_int&0xFF}"

def force_ip_before_open(device_list):
    try:
        with open("network_config.json") as f:
            config = json.load(f)
    except FileNotFoundError:
        print("[WARN] network_config.json not found, skipping Force IP")
        return

    force_ip = config.get("target_force_ip")
    if not force_ip:
        return
        
    for i in range(device_list.nDeviceNum):
        info = cast(device_list.pDeviceInfo[i], POINTER(MV_CC_DEVICE_INFO)).contents
        if info.nTLayerType not in (MV_GIGE_DEVICE, MV_GENTL_GIGE_DEVICE):
            continue
        
        current_ip = int_to_ip(info.SpecialInfo.stGigEInfo.nCurrentIp)
        if current_ip == force_ip:
            continue
        
        print(f"[INFO] Camera at {current_ip}, forcing to {force_ip}...")
        
        tmp = MvCamera()
        ret = tmp.MV_CC_CreateHandle(info)
        if ret != 0: # MV_OK
            print(f"[WARN] ForceIP CreateHandle failed: {to_hex_str(ret)}")
            continue
            
        ip_int  = ip_to_int(force_ip)
        sub_int = ip_to_int(config.get("target_force_subnet", "255.255.255.0"))
        gw_int  = ip_to_int(config.get("target_force_gateway", "169.154.0.1"))
        
        ret = tmp.MV_GIGE_ForceIpEx(ip_int, sub_int, gw_int)
        tmp.MV_CC_DestroyHandle()
        
        if ret == 0: # MV_OK
            print("[OK] ForceIP success. Waiting 3s for camera to reconfigure...")
            time.sleep(3)
        else:
            print(f"[WARN] ForceIP failed: {to_hex_str(ret)}")
