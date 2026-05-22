import { useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import * as api from '../api/client'
import styles from './Dataset.module.css'

export default function Dataset() {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [images, setImages] = useState([])
  const [error, setError] = useState(null)
  const [saveDirectory, setSaveDirectory] = useState('')
  const [isSavingPath, setIsSavingPath] = useState(false)
  const [browsing, setBrowsing] = useState(false)
  const [streamKey, setStreamKey] = useState(0)

  const handleBrowseDirectory = async () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.webkitdirectory = true;
    input.directory = true;
    input.onchange = async (e) => {
      const files = e.target.files;
      if (!files || files.length === 0) {
        alert("Selected folder is empty. Please select a folder with at least one file, or choose a file to resolve the path.");
        return;
      }
      const file = files[0];

      setBrowsing(true)
      try {
        const res = await api.locateMarker(file.name, true);
        if (res?.path) {
          setSaveDirectory(res.path);
        } else {
          alert(res?.error || "Failed to resolve directory path. Make sure the folder is located inside the project workspace directory.");
        }
      } catch (err) {
        alert("Failed to resolve directory: " + err.message);
      } finally {
        setBrowsing(false)
      }
    };
    input.click();
  };
  
  const refreshImages = () => {
    api.getDatasetImages().then(data => setImages(data.images || [])).catch(() => {})
  }
  
  useEffect(() => {
    refreshImages()
    const interval = setInterval(refreshImages, 2000)
    return () => clearInterval(interval)
  }, [])

  useEffect(() => {
    api.getDatasetStatus().then(s => {
      if (s.running) {
        setRunning(true)
      }
    }).catch(() => {})
    
    api.getDatasetConfig().then(cfg => {
      setSaveDirectory(cfg.save_directory || '')
    }).catch(() => {})
  }, [])
  
  const handleStart = async () => {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      await api.stopSystem() // stop inspection to free camera
      const res = await api.startDataset()
      if (res && res.error) {
        setError(res.error)
        return
      }
      if (res.status === 'started') {
        setStreamKey(k => k + 1)
        setRunning(true)
      } else {
        setError('No Camera Detected - Please ensure the camera is properly connected and try again.')
      }
    } catch {
      setError('Could not connect to backend')
    } finally {
      setLoading(false)
    }
  }
  
  const handleStop = async () => {
    if (loading) return
    setLoading(true)
    try {
      await api.stopDataset()
    } finally {
      setRunning(false)
      setLoading(false)
    }
  }
  
  const handleTrigger = async () => {
    if (!running) return
    try {
      await api.triggerPlc()
    } catch {
      alert('Failed to send manual trigger')
    }
  }
  
  return (
    <div className={styles.page}>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Dataset Preparation</h1>
          <p className={styles.pageDesc}>Capture images to train the AI model</p>
        </div>
        <span className={running ? `${styles.badge} ${styles.badgeRunning}` : `${styles.badge} ${styles.badgeStopped}`}>
          <span className={styles.badgeDot} />
          {running ? 'Running' : 'Stopped'}
        </span>
      </div>

      {error && (
        <div className={styles.errorBar}>{error}</div>
      )}

      {/* MAIN BODY */}
      <div className={styles.body}>

        {/* VIDEO CARD */}
        <div className={styles.videoCard}>
          <div className={styles.cardHeader}>
            <span>Live Camera Feed</span>
          </div>
          <div className={styles.feedArea}>
            {running ? (
              <img
                key={streamKey}
                src={api.datasetLiveProcessUrl()}
                className={styles.cameraFeed}
                alt="Live Stream"
              />
            ) : (
              <div className={styles.placeholder}>
                <div className={styles.placeholderIcon}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <p className={styles.placeholderText}>System stopped</p>
                <p className={styles.placeholderSub}>Press START to connect the camera</p>
              </div>
            )}
          </div>
        </div>

        {/* SIDEBAR */}
        <div className={styles.sidePanel}>
          <div className={styles.card}>
            <div className={styles.cardTitle}>Controls</div>
            <div className={styles.btnGroup}>
              <button
                className={`${styles.btn} ${styles.btnStart}`}
                onClick={handleStart}
                disabled={running || loading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <polygon points="5,3 19,12 5,21" />
                </svg>
                {loading && !running ? 'STARTING...' : 'START'}
              </button>
              <button
                className={`${styles.btn} ${styles.btnStop}`}
                onClick={handleStop}
                disabled={!running || loading}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor">
                  <rect x="3" y="3" width="18" height="18" rx="2" />
                </svg>
                {loading && running ? 'STOPPING...' : 'STOP'}
              </button>
              <button className={`${styles.btn} ${styles.btnTrigger}`} onClick={handleTrigger} disabled={!running}>
                Trigger
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Dataset ({images.length} images)</div>
            <div className={styles.btnGroup}>
              <button className={`${styles.btn} ${styles.btnGallery}`} onClick={() => navigate('/dataset-gallery')}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                Open Gallery
              </button>
            </div>
          </div>

          <div className={styles.card}>
            <div className={styles.cardTitle}>Save Directory</div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              <div style={{ display: 'flex', gap: '8px' }}>
                <input
                  type="text"
                  style={{
                    flex: 1,
                    padding: '8px 12px',
                    borderRadius: '6px',
                    border: '1px solid var(--border)',
                    fontSize: '13px',
                    color: 'var(--text-primary)',
                    background: '#f8fafc',
                    minWidth: 0
                  }}
                  value={saveDirectory}
                  onChange={(e) => setSaveDirectory(e.target.value)}
                />
                <button
                  type="button"
                  style={{
                    padding: '8px 12px',
                    background: '#64748b',
                    color: '#fff',
                    border: 'none',
                    borderRadius: '6px',
                    fontSize: '12px',
                    fontWeight: '600',
                    cursor: browsing ? 'default' : 'pointer',
                    whiteSpace: 'nowrap',
                    opacity: browsing ? 0.7 : 1
                  }}
                  disabled={browsing}
                  onClick={handleBrowseDirectory}
                >
                  {browsing ? 'Opening...' : 'Browse'}
                </button>
              </div>
              <button
                type="button"
                className={styles.btn}
                style={{
                  background: '#10b981',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: '600',
                  padding: '8px 12px'
                }}
                disabled={isSavingPath}
                onClick={async () => {
                  setIsSavingPath(true)
                  try {
                    const cfg = await api.getDatasetConfig()
                    cfg.save_directory = saveDirectory
                    await api.saveDatasetConfig(cfg)
                    refreshImages()
                    alert('Save directory updated successfully!')
                  } catch {
                    alert('Failed to save directory path')
                  } finally {
                    setIsSavingPath(false)
                  }
                }}
              >
                {isSavingPath ? 'Saving...' : 'Save Path'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
