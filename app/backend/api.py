# api.py
import os
from fastapi import FastAPI
from fastapi.responses import StreamingResponse, JSONResponse
from fastapi.middleware.cors import CORSMiddleware
import time
import inspection
import dataset_engine
import shutil
from fastapi import UploadFile, File
from fastapi.responses import FileResponse
import json
import plc_control

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.post("/start")
def start():
    try:
        inspection.start_system()
        return {"status": "started"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "detail": str(e)})

@app.post("/stop")
def stop():
    inspection.stop_system()
    return {"status": "stopped"}

@app.get("/live")
def live():
    def generate():
        while True:
            with inspection.JPEG_LOCK:
                frame = getattr(inspection, 'LATEST_JPEG_LIVE', None)
            if frame:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame + b"\r\n"
                )
            time.sleep(0.05)
    return StreamingResponse(generate(), media_type="multipart/x-mixed-replace; boundary=frame")

@app.get("/live_process")
def live_process():
    def generate():
        while True:
            with inspection.JPEG_LOCK:
                frame = inspection.LATEST_JPEG_PROCESS
            if frame:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame + b"\r\n"
                )
            time.sleep(0.1)
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache"},
    )

@app.get("/status")
def status():
    return {"running": inspection.SYSTEM_RUNNING}

@app.get("/detected")
def detected():
    with inspection.DETECTION_LOCK:
        return inspection.LATEST_DETECTION or {}

@app.get("/config")
def get_config():
    with open("config.json") as f:
        return json.load(f)

@app.put("/config")
def save_config(data: dict):
    with open("config.json", "w") as f:
        json.dump(data, f, indent=2)
        
    # Auto-restart camera to apply ROI/Hardware changes
    if inspection.SYSTEM_RUNNING:
        inspection.stop_system()
        inspection.start_system()
        
    return {"status": "saved"}

@app.get("/browse_directory")
def browse_directory():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        folder = filedialog.askdirectory(parent=root, title="Select Save Directory")
        root.destroy()
        return {"path": folder}
    except Exception as e:
        return {"path": "", "error": str(e)}

@app.get("/browse_file")
def browse_file():
    try:
        import tkinter as tk
        from tkinter import filedialog
        root = tk.Tk()
        root.withdraw()
        root.attributes('-topmost', True)
        file_path = filedialog.askopenfilename(
            parent=root,
            title="Select PatchCore Model",
            filetypes=[("Checkpoint files", "*.ckpt"), ("All files", "*.*")]
        )
        root.destroy()
        return {"path": file_path}
    except Exception as e:
        return {"path": "", "error": str(e)}



# --- DATASET ENGINE ENDPOINTS ---

@app.get("/dataset/status")
def dataset_status():
    return {"running": dataset_engine.SYSTEM_RUNNING}

@app.post("/dataset/start")
def dataset_start():
    if inspection.SYSTEM_RUNNING:
        return {"error": "Inspection engine is running. Stop it first."}
    try:
        success = dataset_engine.start_system()
        return {"status": "started" if success else "failed"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e), "detail": str(e)})

@app.post("/dataset/stop")
def dataset_stop():
    dataset_engine.stop_system()
    return {"status": "stopped"}

@app.get("/dataset/live_process")
def dataset_live_process():
    def generate():
        import time
        while True:
            with dataset_engine.JPEG_LOCK:
                frame = dataset_engine.LATEST_JPEG_PROCESS
            if frame:
                yield (
                    b"--frame\r\n"
                    b"Content-Type: image/jpeg\r\n\r\n"
                    + frame + b"\r\n"
                )
            time.sleep(0.1)
    return StreamingResponse(
        generate(),
        media_type="multipart/x-mixed-replace; boundary=frame",
        headers={"Cache-Control": "no-cache"},
    )

@app.get("/dataset/config")
def get_dataset_config():
    with open("dataset_config.json") as f:
        return json.load(f)

@app.put("/dataset/config")
def save_dataset_config(data: dict):
    with open("dataset_config.json", "w") as f:
        json.dump(data, f, indent=2)
    try:
        dataset_engine._reload_config()
    except Exception as e:
        print(f"[ERROR] Failed to reload dataset config: {e}")
    return {"status": "saved"}

@app.post("/dataset/trigger")
def dataset_trigger():
    if dataset_engine.SYSTEM_RUNNING and not dataset_engine.USE_EXTERNAL_TRIGGER:
        dataset_engine.request_save_frame()
        return {"status": "success"}
    return {"error": "Camera not running or in hardware trigger mode"}

# --- INDICATOR SLOTS CONFIGURATION ENDPOINTS ---

@app.get("/config/indicator_slots")
def get_config_indicator_slots():
    with open("config.json") as f:
        cfg = json.load(f)
    return {"indicator_slots": cfg.get("indicator_slots", [])}

@app.put("/config/indicator_slots")
def save_config_indicator_slots(data: dict):
    with open("config.json", "r") as f:
        cfg = json.load(f)
    cfg["indicator_slots"] = data.get("indicator_slots", [])
    with open("config.json", "w") as f:
        json.dump(cfg, f, indent=2)
    try:
        inspection._reload_config()
    except Exception as e:
        print(f"Error reloading config: {e}")
    return {"status": "saved"}

@app.get("/config/color_hsv_ranges")
def get_config_color_hsv_ranges():
    with open("config.json") as f:
        cfg = json.load(f)
    default_hsv = {
        "Orange": [[10, 100, 100], [25, 255, 255]],
        "Blue": [[100, 100, 50], [130, 255, 255]],
        "Green": [[45, 50, 50], [85, 255, 255]]
    }
    return {"color_hsv_ranges": cfg.get("color_hsv_ranges", default_hsv)}

@app.put("/config/color_hsv_ranges")
def save_config_color_hsv_ranges(data: dict):
    with open("config.json", "r") as f:
        cfg = json.load(f)
    cfg["color_hsv_ranges"] = data.get("color_hsv_ranges", {})
    with open("config.json", "w") as f:
        json.dump(cfg, f, indent=2)
    try:
        inspection._reload_config()
    except Exception as e:
        print(f"Error reloading config: {e}")
    return {"status": "saved"}

@app.post("/config/reference_image")
def upload_reference_image(file: UploadFile = File(...)):
    path = "reference_image.jpg"
    try:
        with open(path, "wb") as f:
            f.write(file.file.read())
        return {"status": "uploaded"}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": str(e)})

@app.get("/config/reference_image")
def get_reference_image():
    path = "reference_image.jpg"
    if os.path.exists(path):
        return FileResponse(path)
    return JSONResponse(status_code=404, content={"error": "File not found"})

# --- TRIGGER FOR INSPECTION (NO PLC REQUIRED) ---
@app.post("/inspection/trigger")
def inspection_trigger():
    if inspection.SYSTEM_RUNNING and not getattr(inspection, 'USE_EXTERNAL_TRIGGER', True):
        try:
            # Look for request_process_frame or similar in inspection.py
            # For backward compatibility, if it doesn't exist, we might need to add it to inspection.py
            if hasattr(inspection, 'request_process_frame'):
                inspection.request_process_frame()
                return {"status": "success", "mode": "software_frame_process"}
        except Exception as e:
            return {"error": str(e)}
    return {"error": "Inspection not running or in hardware trigger mode"}


@app.post("/trigger_plc")
def trigger_plc():
    if dataset_engine.SYSTEM_RUNNING and not dataset_engine.USE_EXTERNAL_TRIGGER:
        dataset_engine.request_save_frame()
        return {"status": "success", "mode": "software_frame_save"}
    if getattr(inspection, 'SYSTEM_RUNNING', False) and not getattr(inspection, 'USE_EXTERNAL_TRIGGER', True):
        if hasattr(inspection, 'request_process_frame'):
            inspection.request_process_frame()
        return {"status": "success", "mode": "software_frame_process"}
    
    # Actually trigger the PLC M60 address if we are in Hardware Trigger Mode
    success = plc_control.trigger_m60()
    if success:
        return {"status": "success", "mode": "hardware_plc_m60_triggered"}
    else:
        return {"status": "error", "message": "Failed to trigger M60 on PLC"}

@app.get("/network/config")
def get_network_config(): return {}

@app.put("/network/config")
def save_network_config(data: dict): return {"status": "saved"}

@app.post("/locate_marker")
def locate_marker(marker: str, is_dir: bool = False):
    try:
        is_dir_mode = is_dir or marker.startswith("sway_dir_marker_")
        current_dir = os.path.abspath(os.path.dirname(__file__))
        while True:
            for root, dirs, files in os.walk(current_dir):
                depth = root.replace(current_dir, "").count(os.sep)
                if depth > 3:
                    dirs[:] = []
                    continue
                if marker in files:
                    found_path = os.path.join(root, marker)
                    return {"path": os.path.dirname(found_path).replace("\\", "/") if is_dir_mode else found_path.replace("\\", "/")}
            parent = os.path.dirname(current_dir)
            if parent == current_dir or not parent:
                break
            current_dir = parent
        return {"error": f"Could not find marker file: {marker} in workspace"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/dataset/images")
def get_dataset_images():
    try:
        with open("dataset_config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "dataset/train/OK")
        if not os.path.exists(save_dir):
            return {"images": []}
        files = [f for f in os.listdir(save_dir) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]
        return {"images": sorted(files, reverse=True)}
    except Exception as e:
        return {"images": []}

@app.delete("/dataset/images/{filename}")
def delete_dataset_image(filename: str):
    try:
        with open("dataset_config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "dataset/train/OK")
        path = os.path.join(save_dir, filename)
        if os.path.exists(path):
            os.remove(path)
        return {"status": "deleted"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/dataset/image_file/{filename}")
def get_dataset_image_file(filename: str):
    try:
        with open("dataset_config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "dataset/train/OK")
        path = os.path.join(save_dir, filename)
        if os.path.exists(path):
            return FileResponse(path)
        return {"error": "not found"}
    except Exception as e:
        return {"error": str(e)}


@app.get("/output/images")
def get_output_images():
    try:
        with open("config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "output")
        if not os.path.exists(save_dir):
            return {"images": []}
        files = [f for f in os.listdir(save_dir) if f.lower().endswith(('.jpg', '.png', '.jpeg'))]
        return {"images": sorted(files, reverse=True)}
    except Exception as e:
        return {"images": []}

@app.delete("/output/images/{filename}")
def delete_output_image(filename: str):
    try:
        with open("config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "output")
        path = os.path.join(save_dir, filename)
        if os.path.exists(path):
            os.remove(path)
        return {"status": "deleted"}
    except Exception as e:
        return {"error": str(e)}

@app.get("/output/image_file/{filename}")
def get_output_image_file(filename: str):
    try:
        with open("config.json") as f:
            config = json.load(f)
        save_dir = config.get("save_directory", "output")
        path = os.path.join(save_dir, filename)
        if os.path.exists(path):
            return FileResponse(path)
        return {"error": "not found"}
    except Exception as e:
        return {"error": str(e)}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
