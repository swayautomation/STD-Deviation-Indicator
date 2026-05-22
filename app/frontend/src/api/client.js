const BASE = 'http://localhost:8000'

export const startSystem = () =>
  fetch(`${BASE}/start`, { method: 'POST' }).then(r => r.json())

export const stopSystem = () =>
  fetch(`${BASE}/stop`, { method: 'POST' }).then(r => r.json())

export const getStatus = () =>
  fetch(`${BASE}/status`).then(r => r.json())

export const getDetected = () =>
  fetch(`${BASE}/detected`).then(r => r.json())

export const liveProcessUrl = () => `${BASE}/live_process`

export const getConfig = () =>
  fetch(`${BASE}/config`).then(r => r.json())

export const saveConfig = (data) =>
  fetch(`${BASE}/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  }).then(r => r.json())

export const browseDirectory = () =>
  fetch(`${BASE}/browse_directory`).then(r => r.json())

export const browseFile = () =>
  fetch(`${BASE}/browse_file`).then(r => r.json())

export const liveUrl = () => `${BASE}/live`

export const getDatasetStatus = () => fetch(`${BASE}/dataset/status`).then(r => r.json())
export const startDataset = () => fetch(`${BASE}/dataset/start`, { method: 'POST' }).then(r => r.json())
export const stopDataset = () => fetch(`${BASE}/dataset/stop`, { method: 'POST' }).then(r => r.json())
export const datasetLiveUrl = () => `${BASE}/dataset/live_process`
export const getDatasetConfig = () => fetch(`${BASE}/dataset/config`).then(r => r.json())
export const saveDatasetConfig = (data) => fetch(`${BASE}/dataset/config`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
}).then(r => r.json())
export const triggerDataset = () => fetch(`${BASE}/dataset/trigger`, { method: 'POST' }).then(r => r.json())
export const triggerInspection = () => fetch(`${BASE}/inspection/trigger`, { method: 'POST' }).then(r => r.json())

export const getConfigIndicatorSlots = () => fetch(`${BASE}/config/indicator_slots`).then(r => r.json())
export const saveConfigIndicatorSlots = (indicator_slots) => fetch(`${BASE}/config/indicator_slots`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ indicator_slots })
}).then(r => r.json())

export const uploadReferenceImage = (formData) => fetch(`${BASE}/config/reference_image`, {
    method: 'POST',
    body: formData
}).then(r => r.json())
export const referenceImageUrl = () => `${BASE}/config/reference_image`

export const getConfigColorHsvRanges = () => fetch(`${BASE}/config/color_hsv_ranges`).then(r => r.json())
export const saveConfigColorHsvRanges = (color_hsv_ranges) => fetch(`${BASE}/config/color_hsv_ranges`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ color_hsv_ranges })
}).then(r => r.json())

export const triggerPlc = () => fetch(`${BASE}/trigger_plc`, { method: 'POST' }).then(r => r.json())
export const getNetworkConfig = () => fetch(`${BASE}/network/config`).then(r => r.json())
export const saveNetworkConfig = (data) => fetch(`${BASE}/network/config`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) }).then(r => r.json())
export const locateMarker = (marker, is_dir = false) => fetch(`${BASE}/locate_marker?marker=${marker}&is_dir=${is_dir}`, { method: 'POST' }).then(r => r.json())

export const getDatasetImages = () => fetch(`${BASE}/dataset/images`).then(r => r.json())
export const datasetLiveProcessUrl = () => `${BASE}/dataset/live_process`

export const datasetImageUrl = (filename) => `${BASE}/dataset/image_file/${filename}`
export const deleteDatasetImage = (filename) => fetch(`${BASE}/dataset/images/${filename}`, { method: 'DELETE' }).then(r => r.json())

export const getOutputImages = () => fetch(`${BASE}/output/images`).then(r => r.json())
export const outputImageUrl = (filename) => `${BASE}/output/image_file/${filename}`
export const deleteOutputImage = (filename) => fetch(`${BASE}/output/images/${filename}`, { method: 'DELETE' }).then(r => r.json())
