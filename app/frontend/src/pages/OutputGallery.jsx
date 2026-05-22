import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import styles from './OutputGallery.module.css'

export default function OutputGallery() {
  const navigate = useNavigate()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(null)
  
  // Configuration Settings States
  const [config, setConfig] = useState(null)
  const [showSettings, setShowSettings] = useState(false)
  const [saveDirectory, setSaveDirectory] = useState('')
  const [saveHeatmap, setSaveHeatmap] = useState(false)
  const [tempSaveDirectory, setTempSaveDirectory] = useState('')
  const [tempSaveHeatmap, setTempSaveHeatmap] = useState(false)
  
  const refreshImages = async () => {
    try {
      const data = await api.getOutputImages()
      setImages(data.images || [])
    } catch (e) {
      console.error("Could not fetch output images", e)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    refreshImages()
    api.getConfig()
      .then(cfg => {
        setConfig(cfg)
        setSaveDirectory(cfg.save_directory || '')
        setTempSaveDirectory(cfg.save_directory || '')
        setSaveHeatmap(cfg.save_heatmap ?? false)
        setTempSaveHeatmap(cfg.save_heatmap ?? false)
      })
      .catch(() => {})
  }, [])

  const handleBrowseDirectory = async () => {
    const input = document.createElement('input')
    input.type = 'file'
    input.webkitdirectory = true
    input.directory = true
    input.onchange = async (e) => {
      const files = e.target.files
      if (!files || files.length === 0) {
        alert("Selected folder is empty. Please select a folder with at least one file, or choose a file to resolve the path.")
        return
      }
      const file = files[0]
      try {
        const res = await api.locateMarker(file.name, true)
        if (res?.path) {
          setTempSaveDirectory(res.path)
        } else {
          alert(res?.error || "Failed to resolve directory path. Make sure the folder is located inside the project workspace directory.")
        }
      } catch (err) {
        alert("Failed to resolve directory: " + err.message)
      }
    }
    input.click()
  }

  const handleSaveSettings = async () => {
    if (!config) return
    try {
      const updatedConfig = {
        ...config,
        save_directory: tempSaveDirectory,
        save_heatmap: tempSaveHeatmap
      }
      await api.saveConfig(updatedConfig)
      setConfig(updatedConfig)
      setSaveDirectory(tempSaveDirectory)
      setSaveHeatmap(tempSaveHeatmap)
      setShowSettings(false)
      alert('Settings saved and inspection engine reloaded successfully!')
      refreshImages() // Refresh the image list
    } catch (e) {
      alert('Failed to save settings: ' + e.message)
    }
  }

  const handlePrevImage = () => {
    const idx = images.indexOf(selectedImage)
    if (idx > -1) {
      const prevIdx = idx > 0 ? idx - 1 : images.length - 1
      setSelectedImage(images[prevIdx])
    }
  }

  const handleNextImage = () => {
    const idx = images.indexOf(selectedImage)
    if (idx > -1) {
      const nextIdx = idx < images.length - 1 ? idx + 1 : 0
      setSelectedImage(images[nextIdx])
    }
  }

  useEffect(() => {
    if (!selectedImage) return
    const handleKeyDown = (e) => {
      if (e.key === 'ArrowLeft') {
        handlePrevImage()
      } else if (e.key === 'ArrowRight') {
        handleNextImage()
      } else if (e.key === 'Escape') {
        setSelectedImage(null)
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedImage, images])
  
  const handleDelete = async (filename, e) => {
    if (e) e.stopPropagation()
    
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
      try {
        await api.deleteOutputImage(filename)
        if (selectedImage === filename) {
          setSelectedImage(null)
        }
        refreshImages()
      } catch (err) {
        alert('Failed to delete image')
      }
    }
  }
  
  return (
    <div className={styles.page}>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div className={styles.headerLeft}>
          <button className={styles.btnBack} onClick={() => navigate('/inspection')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Inspection
          </button>
          <div>
            <h1 className={styles.pageTitle}>Inspection Output Gallery</h1>
            <p className={styles.pageDesc}>
              Loading images from: <code style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#0f172a', marginLeft: '4px' }}>{saveDirectory || 'Loading...'}</code>
              <span style={{ marginLeft: '12px', fontSize: '12px', color: saveHeatmap ? '#10b981' : '#94a3b8', fontWeight: '600' }}>
                ● Heatmap: {saveHeatmap ? 'ENABLED' : 'DISABLED'}
              </span>
            </p>
          </div>
        </div>
        <div>
          <button className={styles.btnConfig} onClick={() => setShowSettings(!showSettings)}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <circle cx="12" cy="12" r="3"></circle>
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"></path>
            </svg>
            Configure
          </button>
        </div>
      </div>

      {/* SETTINGS POPUP MODAL */}
      {showSettings && (
        <div className={styles.modalOverlay} onClick={() => {
          setShowSettings(false);
          setTempSaveDirectory(saveDirectory);
          setTempSaveHeatmap(saveHeatmap);
        }}>
          <div className={styles.modalContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalTitle}>Gallery & Inspection Settings</span>
              <button className={styles.btnCloseModal} onClick={() => {
                setShowSettings(false);
                setTempSaveDirectory(saveDirectory);
                setTempSaveHeatmap(saveHeatmap);
              }}>
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>Output Path (Save Directory)</label>
                <div className={styles.dirInputWrapper}>
                  <input
                    type="text"
                    value={tempSaveDirectory}
                    onChange={(e) => setTempSaveDirectory(e.target.value)}
                    className={styles.dirInput}
                  />
                  <button className={styles.btnBrowse} onClick={handleBrowseDirectory}>
                    Browse
                  </button>
                </div>
              </div>
              <div className={styles.settingGroup}>
                <label className={styles.settingLabel}>Save Heatmap</label>
                <label className={styles.switch}>
                  <input
                    type="checkbox"
                    checked={tempSaveHeatmap}
                    onChange={(e) => setTempSaveHeatmap(e.target.checked)}
                  />
                  <span className={styles.slider}></span>
                </label>
              </div>
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.btnSaveSettings} onClick={handleSaveSettings}>
                Save Settings
              </button>
              <button className={styles.btnCancelSettings} onClick={() => {
                setShowSettings(false);
                setTempSaveDirectory(saveDirectory);
                setTempSaveHeatmap(saveHeatmap);
              }}>
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}

      {/* GALLERY GRID BODY */}
      <div className={styles.body}>
        {loading ? (
          <div className={styles.placeholder}>
            <p className={styles.placeholderText}>Loading gallery...</p>
          </div>
        ) : images.length === 0 ? (
          <div className={styles.placeholder}>
            <div className={styles.placeholderIcon}>
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            </div>
            <p className={styles.placeholderText}>No saved inspection output images found.</p>
          </div>
        ) : (
          <div className={styles.galleryGrid}>
            {images.map(img => (
              <div 
                key={img} 
                className={styles.galleryCard}
                onClick={() => setSelectedImage(img)}
              >
                <div className={styles.galleryImgWrapper}>
                  <img 
                    src={api.outputImageUrl(img)} 
                    alt={img} 
                    className={styles.galleryImg} 
                    loading="lazy" 
                  />
                </div>
                <div className={styles.galleryFooter}>
                  <span className={styles.galleryFilename} title={img}>{img}</span>
                  <button 
                    className={styles.btnDelete} 
                    onClick={(e) => handleDelete(img, e)}
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* FULLSIZE LIGHTBOX MODAL */}
      {selectedImage && (
        <div className={styles.lightboxOverlay} onClick={() => setSelectedImage(null)}>
          <div className={styles.lightboxContent} onClick={(e) => e.stopPropagation()}>
            <div className={styles.lightboxHeader}>
              <span className={styles.lightboxTitle}>
                Image #{images.indexOf(selectedImage)}: {selectedImage}
              </span>
              <button className={styles.btnCloseLightbox} onClick={() => setSelectedImage(null)}>
                &times;
              </button>
            </div>

            <div className={styles.lightboxMain}>
              <button
                className={`${styles.lightboxNavBtn} ${styles.lightboxPrevBtn}`}
                onClick={handlePrevImage}
                title="Previous Image (Left Arrow)"
              >
                &#10094;
              </button>

              <div className={styles.lightboxImageContainer}>
                <img
                  src={api.outputImageUrl(selectedImage)}
                  alt={selectedImage}
                  className={styles.lightboxImg}
                />
              </div>

              <button
                className={`${styles.lightboxNavBtn} ${styles.lightboxNextBtn}`}
                onClick={handleNextImage}
                title="Next Image (Right Arrow)"
              >
                &#10095;
              </button>
            </div>

            <div className={styles.lightboxFooter}>
              <button
                className={styles.btnDeleteLightbox}
                onClick={() => handleDelete(selectedImage)}
              >
                Delete Image
              </button>
              <div className={styles.lightboxInstructions}>
                Use Left / Right arrow keys or click buttons to navigate. Press Escape to close.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
