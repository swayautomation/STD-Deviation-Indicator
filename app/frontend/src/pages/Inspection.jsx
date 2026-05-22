import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { startSystem, stopSystem, getStatus, getDetected, liveProcessUrl, liveUrl, triggerPlc, triggerInspection, getConfig } from '../api/client'
import styles from './Inspection.module.css'

export default function Inspection() {
  const navigate = useNavigate()
  const [running, setRunning] = useState(false)
  const [loading, setLoading] = useState(false)
  const [detection, setDetection] = useState(null)
  const [streamKey, setStreamKey] = useState(0)
  const [error, setError] = useState(null)
  const [config, setConfig] = useState(null)

  // Restore state when navigating back to this page
  useEffect(() => {
    getConfig().then(cfg => setConfig(cfg)).catch(() => {})
    getStatus().then(s => {
      if (s.running) {
        setRunning(true)
        setStreamKey(k => k + 1)
        getDetected().then(d => {
          if (d && d.final_status) setDetection(d)
        }).catch(() => {})
      }
    }).catch(() => {})
  }, [])

  useEffect(() => {
    if (!running) return

    const id = setInterval(async () => {
      try {
        const data = await getDetected()
        if (data && data.final_status) {
          setDetection(data)
        }
      } catch {
        // backend unreachable — ignore, keep trying
      }
    }, 1000)

    return () => clearInterval(id)
  }, [running])

  const handleStart = async () => {
    if (loading) return
    setError(null)
    setLoading(true)
    try {
      const res = await startSystem()
      if (res && res.error) {
        setError(res.error)
        return
      }
      setStreamKey(k => k + 1)
      setDetection(null)
      setRunning(true)
    } catch {
      setError('Could not connect to backend at localhost:8000')
    } finally {
      setLoading(false)
    }
  }

  const handleStop = async () => {
    if (loading) return
    setLoading(true)
    try {
      await stopSystem()
    } finally {
      setRunning(false)
      setDetection(null)
      setLoading(false)
    }
  }

  const handleTrigger = async () => {
    if (!running) return
    try {
      if (config?.use_external_trigger) {
        await triggerPlc()
      } else {
        await triggerInspection()
      }
    } catch {
      alert('Failed to send manual trigger')
    }
  }

  const status = detection?.final_status
  const isPass   = status === 'PASS'
  const isReject = status === 'REJECT'
  const isNoPart = status === 'NO_PART'

  const enableTM = detection && typeof detection.enable_template_matching === 'boolean'
    ? detection.enable_template_matching
    : (config?.enable_template_matching ?? false)
    
  const enablePC = detection && typeof detection.enable_patchcore === 'boolean'
    ? detection.enable_patchcore
    : (config?.enable_patchcore ?? false)
    
  const enableTXT = detection && typeof detection.enable_text_template === 'boolean'
    ? detection.enable_text_template
    : (config?.enable_text_template ?? false)

  return (
    <div className={styles.page}>
      {/* PAGE HEADER */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Inspection</h1>
          <p className={styles.pageDesc}>Hardware-triggered camera inspection</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <span className={running ? `${styles.badge} ${styles.badgeRunning}` : `${styles.badge} ${styles.badgeStopped}`}>
            <span className={styles.badgeDot} />
            {running ? 'Running' : 'Stopped'}
          </span>
          <button className={styles.btnHeaderGallery} onClick={() => navigate('/output-gallery')}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ marginRight: '6px' }}>
              <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
              <circle cx="8.5" cy="8.5" r="1.5" />
              <polyline points="21 15 16 10 5 21" />
            </svg>
            Open Gallery
          </button>
        </div>
      </div>

      {error && (
        <div className={styles.errorBar}>{error}</div>
      )}

      {/* MAIN BODY */}
      <div className={styles.body}>

        {/* VIDEO CARD */}
        <div className={styles.videoCard}>
          <div className={styles.cardHeader}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              <span>Last Inspection Result</span>
              <span className={styles.headerEngines}>
                {enableTM && <span className={styles.headerEngineActive}>Part Match</span>}
                {enablePC && <span className={styles.headerEngineActive}>AI Defect</span>}
                {enableTXT && <span className={styles.headerEngineActive}>Text Detection</span>}
              </span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
              {detection && (
                <>
                  <span className={styles.headerMeta}>
                    Frame: <strong className={styles.headerMetaVal}>{detection.frame_count ?? '—'}</strong>
                  </span>
                  <span className={styles.headerMeta}>
                    Workers: <strong className={styles.headerMetaVal}>{detection.active_worker ?? '—'}/{detection.total_worker ?? '—'}</strong>
                  </span>
                  <span className={isPass ? `${styles.resultPill} ${styles.pillPass}` : `${styles.resultPill} ${styles.pillReject}`}>
                    {isPass ? 'PASS' : isReject ? 'REJECT' : status}
                  </span>
                </>
              )}
            </div>
          </div>
          <div className={styles.feedArea}>
            {running && config?.use_external_trigger === false ? (
              <div className={styles.dualFeedGrid}>
                <div className={styles.feedCol}>
                  <div className={styles.feedLabel}>Live Video</div>
                  <img
                    key={streamKey}
                    src={liveUrl()}
                    className={styles.cameraFeed}
                    alt="Live Video"
                  />
                </div>
                <div className={styles.feedCol}>
                  <div className={styles.feedLabel}>Last Inspection</div>
                  {detection ? (
                    <img
                      key={`proc-${streamKey}`}
                      src={liveProcessUrl()}
                      className={styles.cameraFeed}
                      alt="Last Inspection"
                    />
                  ) : (
                    <div className={styles.placeholder} style={{ height: '100%', minHeight: '300px' }}>
                       <p className={styles.placeholderText}>Waiting for manual trigger...</p>
                    </div>
                  )}
                </div>
              </div>
            ) : running && detection ? (
              <img
                key={streamKey}
                src={liveProcessUrl()}
                className={styles.cameraFeed}
                alt="Last inspection result"
              />
            ) : running ? (
              <div className={styles.placeholder}>
                <div className={styles.placeholderIcon}>
                  <svg width="52" height="52" viewBox="0 0 24 24" fill="none" stroke="#94a3b8" strokeWidth="1.2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
                    <circle cx="12" cy="13" r="4" />
                  </svg>
                </div>
                <p className={styles.placeholderText}>Waiting for hardware trigger...</p>
                <p className={styles.placeholderSub}>Camera armed on {' '}
                  <code className={styles.code}>Line0 / RisingEdge</code>
                </p>
              </div>
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

        {/* SIDE PANEL */}
        <div className={styles.sidePanel}>

          {/* CONTROLS */}
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

          {/* RESULT */}
          <div className={styles.card}>
            <div className={styles.cardTitle}>Inspection Result</div>

            {detection ? (
              <div className={styles.resultList}>
                {/* 1. Primary Status */}
                <div className={styles.resultRow}>
                  <span className={styles.rowLabel}>Primary Status</span>
                  <span className={`${styles.rowValue} ${styles.rowValueLarge} ${isPass ? styles.colorPass : isReject ? styles.colorReject : styles.colorWarn}`}>
                    {isPass ? 'PASS' : isReject ? 'REJECT' : isNoPart ? 'NO PART' : status}
                  </span>
                </div>

                {/* 2. Part Match & Score */}
                {enableTM && (
                  <>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>Part Match</span>
                      <span className={styles.rowValue}>{detection.part_id ?? '—'}</span>
                    </div>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>Alignment Score</span>
                      <span className={styles.rowValue}>
                        {typeof detection.score === 'number'
                          ? `${(detection.score * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  </>
                )}

                {/* 3. Text Detection & Alignment Score */}
                {enableTXT && (
                  <>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>Text Detection</span>
                      <span className={`${styles.rowValue} ${detection.ocr_matched ? styles.colorPass : styles.colorReject}`}>
                        {detection.ocr_side ? `${detection.ocr_side} (${detection.ocr_matched ? 'OK' : 'FAIL'})` : '—'}
                      </span>
                    </div>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>Alignment Score</span>
                      <span className={styles.rowValue}>
                        {detection.ocr_text ? `${(parseFloat(detection.ocr_text) * 100).toFixed(1)}%` : '—'}
                      </span>
                    </div>
                  </>
                )}

                {/* 4. AI Defect & Anomaly Score */}
                {enablePC && (
                  <>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>AI Defect</span>
                      <span className={`${styles.rowValue} ${detection.patchcore_result === 'OK' ? styles.colorPass : detection.patchcore_result === 'NG' ? styles.colorReject : ''}`}>
                        {detection.patchcore_result ?? '—'}
                      </span>
                    </div>
                    <div className={styles.resultRow}>
                      <span className={styles.rowLabel}>Anomaly Score</span>
                      <span className={styles.rowValue}>
                        {typeof detection.patchcore_confidence === 'number'
                          ? `${(detection.patchcore_confidence * 100).toFixed(1)}%`
                          : '—'}
                      </span>
                    </div>
                  </>
                )}
              </div>
            ) : (
              <p className={styles.noResult}>
                {running ? 'Waiting for first trigger...' : 'No result yet'}
              </p>
            )}
          </div>

        </div>
      </div>
    </div>
  )
}
