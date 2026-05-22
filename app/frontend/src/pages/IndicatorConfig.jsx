import React, { useState, useEffect, useRef } from 'react'
import * as api from '../api/client'
import styles from './IndicatorConfig.module.css'

export default function IndicatorConfig() {
  const [slots, setSlots] = useState([])
  const [hsvRanges, setHsvRanges] = useState({})
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  
  // Reference Image State
  const [refImageUrl, setRefImageUrl] = useState(`${api.referenceImageUrl()}?t=${Date.now()}`)
  const [uploadingImage, setUploadingImage] = useState(false)

  // Unified Visual Configuration Modal States
  const [isEditorModalOpen, setIsEditorModalOpen] = useState(false)
  const [editingSlotIdx, setEditingSlotIdx] = useState(null)
  const [tempRoi, setTempRoi] = useState([0, 100, 0, 100])
  const [modalDragState, setModalDragState] = useState(null)
  const [modalImgDims, setModalImgDims] = useState({ dispW: 0, dispH: 0, natW: 1, natH: 1 })

  const modalImageRef = useRef(null)
  const modalContainerRef = useRef(null)

  useEffect(() => {
    loadConfig()
  }, [])

  const loadConfig = async () => {
    setLoading(true)
    try {
      const data = await api.getConfigIndicatorSlots()
      setSlots(data.indicator_slots || [])
      const hsvData = await api.getConfigColorHsvRanges()
      setHsvRanges(hsvData.color_hsv_ranges || {})
    } catch (e) {
      console.error(e)
    } finally {
      setLoading(false)
    }
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await api.saveConfigIndicatorSlots(slots)
      await api.saveConfigColorHsvRanges(hsvRanges)
      alert('Indicator configuration saved successfully!')
    } catch (e) {
      console.error(e)
      alert('Failed to save configuration.')
    } finally {
      setSaving(false)
    }
  }

  const updateHsvRange = (color, type, idx, val) => {
    let newVal = parseInt(val, 10) || 0
    if (idx === 0) newVal = Math.max(0, Math.min(179, newVal)) // Hue is 0-179 in OpenCV
    else newVal = Math.max(0, Math.min(255, newVal)) // Saturation/Value is 0-255
    const newRanges = { ...hsvRanges }
    newRanges[color][type][idx] = newVal
    setHsvRanges(newRanges)
  }

  const handleImageUpload = async (e) => {
    const file = e.target.files[0]
    if (!file) return
    setUploadingImage(true)
    const formData = new FormData()
    formData.append('file', file)
    try {
      await api.uploadReferenceImage(formData)
      setRefImageUrl(`${api.referenceImageUrl()}?t=${Date.now()}`)
    } catch (error) {
      console.error('Failed to upload image', error)
      alert('Failed to upload reference image')
    } finally {
      setUploadingImage(false)
    }
  }

  const addSlot = () => {
    setSlots([
      ...slots,
      {
        name: `New_Slot_${slots.length + 1}`,
        expected_color: 'Green',
        roi: [0, 100, 0, 100]
      }
    ])
  }

  const removeSlot = (index) => {
    if (!window.confirm('Are you sure you want to remove this indicator slot?')) return
    const newSlots = [...slots]
    newSlots.splice(index, 1)
    setSlots(newSlots)
  }

  const updateSlot = (index, field, value) => {
    const newSlots = [...slots]
    newSlots[index][field] = value
    setSlots(newSlots)
  }

  // Visual Configuration Modal Handlers
  const handleOpenEditorModal = (idx) => {
    setEditingSlotIdx(idx)
    setTempRoi([...slots[idx].roi])
    setIsEditorModalOpen(true)
  }

  const handleSaveEditorModal = () => {
    const { natW, natH } = modalImgDims
    if (natW > 1 && natH > 1) {
      const [y1, y2, x1, x2] = tempRoi
      if (y1 < 0 || y2 > natH || x1 < 0 || x2 > natW) {
        alert(`ROI coordinates exceed image dimensions (${natW}x${natH}). Please adjust them first.`)
        return
      }
      if (y1 > y2 || x1 > x2) {
        alert("ROI top/left coordinates cannot exceed bottom/right coordinates.")
        return
      }
    }

    const newSlots = [...slots]
    newSlots[editingSlotIdx].roi = [...tempRoi]
    setSlots(newSlots)
    setIsEditorModalOpen(false)
  }

  const handleModalImageLoad = () => {
    if (modalImageRef.current) {
      setModalImgDims({
        dispW: modalImageRef.current.clientWidth,
        dispH: modalImageRef.current.clientHeight,
        natW: modalImageRef.current.naturalWidth || 1,
        natH: modalImageRef.current.naturalHeight || 1,
      })
    }
  }

  useEffect(() => {
    if (isEditorModalOpen) {
      const handleResize = () => handleModalImageLoad()
      window.addEventListener('resize', handleResize)
      const timer = setTimeout(handleModalImageLoad, 150)
      return () => {
        window.removeEventListener('resize', handleResize)
        clearTimeout(timer)
      }
    }
  }, [isEditorModalOpen, refImageUrl])

  const handleModalMouseDown = (e, handleType) => {
    e.stopPropagation()
    if (!modalContainerRef.current) return
    const rect = modalContainerRef.current.getBoundingClientRect()
    const startX = e.clientX - rect.left
    const startY = e.clientY - rect.top

    setModalDragState({
      type: handleType,
      startX,
      startY,
      startVal: [...tempRoi]
    })
  }

  const handleModalMouseMove = (e) => {
    if (!modalDragState || !modalImgDims.dispW) return
    const rect = modalContainerRef.current.getBoundingClientRect()
    const currentX = e.clientX - rect.left
    const currentY = e.clientY - rect.top

    const dx = currentX - modalDragState.startX
    const dy = currentY - modalDragState.startY

    const { dispW, dispH, natW, natH } = modalImgDims
    const scaleX = natW / dispW
    const scaleY = natH / dispH

    const [y1, y2, x1, x2] = modalDragState.startVal
    let ny1 = y1, ny2 = y2, nx1 = x1, nx2 = x2

    if (modalDragState.type === 'tl') {
      nx1 = Math.max(0, Math.min(x2 - 10, x1 + Math.round(dx * scaleX)))
      ny1 = Math.max(0, Math.min(y2 - 10, y1 + Math.round(dy * scaleY)))
    } else if (modalDragState.type === 'br') {
      nx2 = Math.max(x1 + 10, Math.min(natW, x2 + Math.round(dx * scaleX)))
      ny2 = Math.max(y1 + 10, Math.min(natH, y2 + Math.round(dy * scaleY)))
    } else if (modalDragState.type === 'move') {
      const shiftX = Math.round(dx * scaleX)
      const shiftY = Math.round(dy * scaleY)
      const w = x2 - x1
      const h = y2 - y1

      nx1 = Math.max(0, Math.min(natW - w, x1 + shiftX))
      nx2 = nx1 + w
      ny1 = Math.max(0, Math.min(natH - h, y1 + shiftY))
      ny2 = ny1 + h
    } else if (modalDragState.type === 'draw') {
      const px1 = Math.round(Math.min(modalDragState.startX, currentX) * scaleX)
      const py1 = Math.round(Math.min(modalDragState.startY, currentY) * scaleY)
      const px2 = Math.round(Math.max(modalDragState.startX, currentX) * scaleX)
      const py2 = Math.round(Math.max(modalDragState.startY, currentY) * scaleY)

      nx1 = Math.max(0, px1)
      ny1 = Math.max(0, py1)
      nx2 = Math.min(natW, px2)
      ny2 = Math.min(natH, py2)
    }

    setTempRoi([ny1, ny2, nx1, nx2])
  }

  const handleModalMouseUp = () => {
    setModalDragState(null)
  }

  const handleTempRoiCoordChange = (coordIdx, val) => {
    let numVal = Number(val)
    if (isNaN(numVal)) numVal = 0

    const { natW, natH } = modalImgDims
    if (natW > 1 && natH > 1) {
      if (coordIdx === 0 || coordIdx === 1) numVal = Math.max(0, Math.min(natH, numVal))
      else numVal = Math.max(0, Math.min(natW, numVal))
    }

    const nextRoi = [...tempRoi]
    nextRoi[coordIdx] = numVal
    setTempRoi(nextRoi)
  }

  const renderModalRect = () => {
    if (!tempRoi || tempRoi.length < 4 || !modalImgDims.dispW) return null
    const [y1, y2, x1, x2] = tempRoi
    const { dispW, dispH, natW, natH } = modalImgDims

    const left = (x1 / natW) * dispW
    const top = (y1 / natH) * dispH
    const width = ((x2 - x1) / natW) * dispW
    const height = ((y2 - y1) / natH) * dispH

    return (
      <g>
        <rect
          x={left}
          y={top}
          width={width}
          height={height}
          fill="rgba(16, 185, 129, 0.15)"
          stroke="#10b981"
          strokeWidth={2}
          style={{ cursor: 'move' }}
          onMouseDown={(e) => handleModalMouseDown(e, 'move')}
        />
        {/* Top-left corner drag handle */}
        <circle
          cx={left}
          cy={top}
          r="6"
          fill="#10b981"
          stroke="#ffffff"
          strokeWidth="1.5"
          style={{ cursor: 'nwse-resize' }}
          onMouseDown={(e) => handleModalMouseDown(e, 'tl')}
        />
        {/* Bottom-right corner drag handle */}
        <circle
          cx={left + width}
          cy={top + height}
          r="6"
          fill="#10b981"
          stroke="#ffffff"
          strokeWidth="1.5"
          style={{ cursor: 'nwse-resize' }}
          onMouseDown={(e) => handleModalMouseDown(e, 'br')}
        />
        <text
          x={left + 5}
          y={top + 15}
          fill="#10b981"
          fontSize="12"
          fontWeight="bold"
          style={{ pointerEvents: 'none', textShadow: '0 1px 2px rgba(0,0,0,0.8)' }}
        >
          Expected ROI
        </text>
      </g>
    )
  }

  if (loading) return <div className={styles.container}>Loading configuration...</div>

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <h2 className={styles.headerTitle}>Indicator Configuration</h2>
        <div className={styles.actions}>
          <button className={`${styles.btn} ${styles.btnAdd}`} onClick={addSlot}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
            Add Slot
          </button>
          <button className={`${styles.btn} ${styles.btnSave}`} onClick={handleSave} disabled={saving}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"></path><polyline points="17 21 17 13 7 13 7 21"></polyline><polyline points="7 3 7 8 15 8"></polyline></svg>
            {saving ? 'Saving...' : 'Save Configuration'}
          </button>
        </div>
      </header>

      {/* Reference Image Upload Section */}
      <div className={styles.uploadSection}>
        <div style={{ flex: 1 }}>
          <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>Reference Image</h3>
          <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
            Upload an image to visually mark regions of interest.
          </p>
        </div>
        <img 
          src={refImageUrl} 
          alt="Reference" 
          className={styles.refImageThumb}
          onError={(e) => { e.target.style.display = 'none' }}
          onLoad={(e) => { e.target.style.display = 'block' }}
        />
        <label className={styles.uploadLabel}>
          {uploadingImage ? 'Uploading...' : 'Upload Image'}
          <input 
            type="file" 
            accept="image/*" 
            className={styles.uploadInput} 
            onChange={handleImageUpload}
            disabled={uploadingImage}
          />
        </label>
      </div>

      {/* HSV Calibration Section */}
      {Object.keys(hsvRanges).length > 0 && (
        <div className={styles.hsvSection}>
          <div style={{ marginBottom: '16px' }}>
            <h3 style={{ margin: 0, fontSize: 16, color: '#1e293b' }}>Color HSV Calibration</h3>
            <p style={{ margin: '4px 0 0 0', fontSize: 13, color: '#64748b' }}>
              Fine-tune the Lower and Upper [Hue, Saturation, Value] boundaries for each color.
            </p>
          </div>
          <div className={styles.hsvGrid}>
            {Object.entries(hsvRanges).map(([color, [lower, upper]]) => (
              <div key={color} className={styles.hsvCard}>
                <div className={styles.hsvCardHeader}>
                  <span className={styles.hsvColorDot} style={{ backgroundColor: color.toLowerCase() }}></span>
                  <strong>{color}</strong>
                </div>
                <div className={styles.hsvRow}>
                  <span className={styles.hsvLabel}>Lower</span>
                  <input type="number" min="0" max="179" value={lower[0]} onChange={(e) => updateHsvRange(color, 0, 0, e.target.value)} title="Hue (0-179)" />
                  <input type="number" min="0" max="255" value={lower[1]} onChange={(e) => updateHsvRange(color, 0, 1, e.target.value)} title="Saturation (0-255)" />
                  <input type="number" min="0" max="255" value={lower[2]} onChange={(e) => updateHsvRange(color, 0, 2, e.target.value)} title="Value (0-255)" />
                </div>
                <div className={styles.hsvRow}>
                  <span className={styles.hsvLabel}>Upper</span>
                  <input type="number" min="0" max="179" value={upper[0]} onChange={(e) => updateHsvRange(color, 1, 0, e.target.value)} title="Hue (0-179)" />
                  <input type="number" min="0" max="255" value={upper[1]} onChange={(e) => updateHsvRange(color, 1, 1, e.target.value)} title="Saturation (0-255)" />
                  <input type="number" min="0" max="255" value={upper[2]} onChange={(e) => updateHsvRange(color, 1, 2, e.target.value)} title="Value (0-255)" />
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {slots.length === 0 ? (
        <div className={styles.emptyState}>
          <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>
          <h3>No Indicator Slots Configured</h3>
          <p>Add a slot to start configuring regions of interest for color inspection.</p>
        </div>
      ) : (
        <div className={styles.grid}>
          {slots.map((slot, i) => (
            <div key={i} className={styles.card}>
              <div className={styles.cardHeader}>
                <input
                  type="text"
                  className={styles.cardTitle}
                  value={slot.name}
                  onChange={(e) => updateSlot(i, 'name', e.target.value)}
                  placeholder="Slot Name"
                />
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button className={styles.btnDraw} onClick={() => handleOpenEditorModal(i)} title="Draw ROI on Image">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"></path><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"></path></svg>
                    Draw
                  </button>
                  <button className={styles.btnRemove} onClick={() => removeSlot(i)} title="Remove Slot">
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path></svg>
                  </button>
                </div>
              </div>
              <div className={styles.cardBody}>
                <div className={styles.formGroup}>
                  <label className={styles.label}>Expected Color</label>
                  <select
                    className={styles.select}
                    value={slot.expected_color}
                    onChange={(e) => updateSlot(i, 'expected_color', e.target.value)}
                  >
                    <option value="Green">Green</option>
                    <option value="Blue">Blue</option>
                    <option value="Orange">Orange</option>
                  </select>
                </div>
                
                <div className={styles.formGroup}>
                  <label className={styles.label}>Region of Interest (Y1, Y2, X1, X2)</label>
                  <div className={styles.roiGridDisplay}>
                    <span className={styles.roiValDisplay}>[ {slot.roi.join(', ')} ]</span>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* UNIFIED VISUAL CONFIGURATION MODAL */}
      {isEditorModalOpen && editingSlotIdx !== null && (
        <div className={styles.modalBackdrop}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h3>Visual Configuration - {slots[editingSlotIdx].name}</h3>
              <button className={styles.closeBtn} onClick={() => setIsEditorModalOpen(false)}>&times;</button>
            </div>
            
            <div className={styles.modalBody}>
              <div
                className={styles.modalCanvasContainer}
                onMouseMove={handleModalMouseMove}
                onMouseUp={handleModalMouseUp}
                onMouseLeave={handleModalMouseUp}
              >
                <div ref={modalContainerRef} className={styles.imageWrapper}>
                  <img
                    ref={modalImageRef}
                    src={refImageUrl}
                    alt="Visual configuration reference"
                    onLoad={handleModalImageLoad}
                    className={styles.templateImg}
                    draggable="false"
                    onError={(e) => {
                      alert("Please upload a reference image first.");
                      setIsEditorModalOpen(false);
                    }}
                  />
                  {/* SVG Drawing Overlay */}
                  <svg
                    className={styles.svgOverlay}
                    onMouseDown={(e) => handleModalMouseDown(e, 'draw')}
                  >
                    {renderModalRect()}
                  </svg>
                </div>
              </div>

              {/* Coordinates Inputs Display inside Modal */}
              <div className={styles.modalCoordsContainer}>
                <div className={styles.modalCoordsColumn}>
                  <div className={styles.coordTitle}>
                    <span className={styles.coordBulletRoi}>●</span> Expected ROI
                  </div>
                  <div className={styles.coordInputs}>
                    <div className={styles.inputGroup}>
                      <label>Y1 (Top)</label>
                      <input
                        type="number"
                        min={0}
                        max={modalImgDims.natH}
                        value={tempRoi[0]}
                        onChange={(e) => handleTempRoiCoordChange(0, e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>Y2 (Bottom)</label>
                      <input
                        type="number"
                        min={0}
                        max={modalImgDims.natH}
                        value={tempRoi[1]}
                        onChange={(e) => handleTempRoiCoordChange(1, e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>X1 (Left)</label>
                      <input
                        type="number"
                        min={0}
                        max={modalImgDims.natW}
                        value={tempRoi[2]}
                        onChange={(e) => handleTempRoiCoordChange(2, e.target.value)}
                      />
                    </div>
                    <div className={styles.inputGroup}>
                      <label>X2 (Right)</label>
                      <input
                        type="number"
                        min={0}
                        max={modalImgDims.natW}
                        value={tempRoi[3]}
                        onChange={(e) => handleTempRoiCoordChange(3, e.target.value)}
                      />
                    </div>
                  </div>
                </div>

                {/* Integrated Sidebar Actions */}
                <div className={styles.sidebarActions}>
                  <button className={styles.cancelBtn} onClick={() => setIsEditorModalOpen(false)}>
                    Cancel
                  </button>
                  <button className={styles.saveBtnSide} onClick={handleSaveEditorModal}>
                    Save ROI
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
