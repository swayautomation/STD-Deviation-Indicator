import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import styles from './DatasetGallery.module.css'

export default function DatasetGallery() {
  const navigate = useNavigate()
  const [images, setImages] = useState([])
  const [loading, setLoading] = useState(true)
  const [selectedImage, setSelectedImage] = useState(null)
  const [saveDirectory, setSaveDirectory] = useState('')
  
  const refreshImages = async () => {
    try {
      const data = await api.getDatasetImages()
      setImages(data.images || [])
    } catch (e) {
      console.error("Could not fetch dataset images", e)
    } finally {
      setLoading(false)
    }
  }
  
  useEffect(() => {
    refreshImages()
    api.getDatasetConfig()
      .then(config => setSaveDirectory(config.save_directory || ''))
      .catch(() => {})
  }, [])

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
    // Prevent click event propagation if called from the grid card button
    if (e) e.stopPropagation()
    
    if (confirm(`Are you sure you want to delete ${filename}?`)) {
      try {
        await api.deleteDatasetImage(filename)
        // If we deleted from inside the lightbox, close it
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
          <button className={styles.btnBack} onClick={() => navigate('/dataset-preparation')}>
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="19" y1="12" x2="5" y2="12"></line>
              <polyline points="12 19 5 12 12 5"></polyline>
            </svg>
            Back to Dataset
          </button>
          <div>
            <h1 className={styles.pageTitle}>Dataset Gallery</h1>
            <p className={styles.pageDesc}>
              Loading images from: <code style={{ background: '#f1f5f9', border: '1px solid #e2e8f0', padding: '2px 6px', borderRadius: '4px', fontFamily: 'monospace', fontSize: '11px', color: '#0f172a', marginLeft: '4px' }}>{saveDirectory || 'Loading...'}</code>
            </p>
          </div>
        </div>
      </div>

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
            <p className={styles.placeholderText}>No images found in the dataset directory.</p>
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
                    src={api.datasetImageUrl(img)} 
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
                  src={api.datasetImageUrl(selectedImage)}
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
