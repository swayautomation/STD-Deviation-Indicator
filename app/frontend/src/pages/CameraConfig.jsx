import { useState, useEffect } from 'react'
import { getConfig, saveConfig, getDatasetConfig, saveDatasetConfig, browseDirectory, browseFile, locateMarker, getNetworkConfig, saveNetworkConfig } from '../api/client'
import styles from './CameraConfig.module.css'

const triggerSourceOptions = [
  { label: 'Line0', value: 'Line0' },
  { label: 'Line1', value: 'Line1' },
]

const triggerActivationOptions = [
  { label: 'Rising Edge', value: 'RisingEdge' },
  { label: 'Falling Edge', value: 'FallingEdge' },
  { label: 'Any Edge', value: 'AnyEdge' },
  { label: 'High', value: 'High' },
  { label: 'Low', value: 'Low' },
]

const pixelFormatOptions = [
  { label: 'Mono 8', value: 'Mono8' },
  { label: 'Bayer RG 8', value: 'BayerRG8' },
  { label: 'Bayer RG 10', value: 'BayerRG10' },
  { label: 'Bayer RG 10 Packed', value: 'BayerRG10Packed' },
  { label: 'Bayer RG 12', value: 'BayerRG12' },
  { label: 'Bayer RG 12 Packed', value: 'BayerRG12Packed' },
  { label: 'RGB 8', value: 'RGB8' },
  { label: 'YUV 422 (YUYV) Packed', value: 'YUV422Packed' },
]

const saveFormatOptions = [
  { label: 'JPEG', value: 'JPEG' },
  { label: 'PNG', value: 'PNG' },
]

export default function CameraConfig() {
  const [activeTab, setActiveTab] = useState('inspection')
  const [form, setForm] = useState(null)
  const [datasetForm, setDatasetForm] = useState(null)
  const [error, setError] = useState(null)
  const [dirty, setDirty] = useState({ inspection: false, dataset: false })
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState({ inspection: false, dataset: false })
  const [showNetworkModal, setShowNetworkModal] = useState(false)
  const [networkConfig, setNetworkConfig] = useState(null)
  const [savingNetwork, setSavingNetwork] = useState(false)

  const handleBrowseDirectory = async (key) => {
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

      try {
        const res = await locateMarker(file.name, true);
        if (res?.path) {
          set(key, res.path);
        } else {
          alert(res?.error || "Failed to resolve directory path. Make sure the folder is located inside the project workspace directory.");
        }
      } catch (err) {
        alert("Failed to resolve directory: " + err.message);
      }
    };
    input.click();
  };

  const handleBrowseModel = async (key) => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = '.ckpt,.pth';
    input.onchange = async (e) => {
      const file = e.target.files?.[0];
      if (!file) return;

      try {
        const markerRes = await locateMarker(file.name);
        if (markerRes?.path) {
          set(key, markerRes.path);
          return;
        }
      } catch (err) {
        console.warn("Marker search failed, uploading instead", err);
      }

      const originalPath = currentForm[key];
      set(key, `Uploading ${file.name}...`);
      
      const formData = new FormData();
      formData.append('file', file);
      try {
        const res = await uploadModel(formData);
        if (res?.path) {
          set(key, res.path);
        } else {
          alert(res?.error || "Failed to upload model.");
          set(key, originalPath);
        }
      } catch (err) {
        alert("Model upload failed: " + err.message);
        set(key, originalPath);
      }
    };
    input.click();
  };

  useEffect(() => {
    getConfig().then(data => setForm(data)).catch(() => setError('Could not load inspection config.'))
    getDatasetConfig().then(data => setDatasetForm(data)).catch(() => setError('Could not load dataset config.'))
    getNetworkConfig().then(data => setNetworkConfig(data)).catch(() => console.error('Could not load network config'))
  }, [])

  const currentForm = activeTab === 'inspection' ? form : datasetForm
  const currentDirty = dirty[activeTab]
  const currentSaved = saved[activeTab]

  const set = (key, value) => {
    if (activeTab === 'inspection') {
      setForm(prev => ({ ...prev, [key]: value }))
      setDirty(prev => ({ ...prev, inspection: true }))
      setSaved(prev => ({ ...prev, inspection: false }))
    } else {
      setDatasetForm(prev => ({ ...prev, [key]: value }))
      setDirty(prev => ({ ...prev, dataset: true }))
      setSaved(prev => ({ ...prev, dataset: false }))
    }
  }

  const handleSave = async () => {
    setSaving(true)
    setError(null)

    if (activeTab === 'inspection') {
      const payload = { ...form }
      try {
        await saveConfig(payload)
        setForm(payload)
        setSaved(prev => ({ ...prev, inspection: true }))
        setDirty(prev => ({ ...prev, inspection: false }))
      } catch {
        setError('Failed to save inspection config.')
      }
    } else {
      try {
        await saveDatasetConfig(datasetForm)
        setSaved(prev => ({ ...prev, dataset: true }))
        setDirty(prev => ({ ...prev, dataset: false }))
      } catch {
        setError('Failed to save dataset config.')
      }
    }
    setSaving(false)
  }

  const isValidIP = (ip) => {
    if (!ip) return true; // allow empty to disable
    return /^(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)\.(25[0-5]|2[0-4]\d|[01]?\d\d?)$/.test(ip);
  }

  const isNetworkValid = networkConfig && isValidIP(networkConfig.target_force_ip) && isValidIP(networkConfig.target_force_subnet) && isValidIP(networkConfig.target_force_gateway);

  if (!form || !datasetForm) {
    return (
      <div className={styles.page}>
        <div className={styles.pageHeader}>
          <h1 className={styles.pageTitle}>Camera Config</h1>
        </div>
        <div className={styles.skeletonGrid}>
          {[200, 340, 220, 300, 200, 200].map((h, i) => (
            <div key={i} className={styles.skeleton} style={{ height: h }} />
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className={styles.page}>

      {/* ── Header ── */}
      <div className={styles.pageHeader}>
        <div>
          <h1 className={styles.pageTitle}>Camera Config</h1>
          <div className={styles.tabs}>
            <button className={`${styles.tabBtn} ${activeTab === 'inspection' ? styles.tabActive : ''}`} onClick={() => setActiveTab('inspection')}>Inspection Engine</button>
            <button className={`${styles.tabBtn} ${activeTab === 'dataset' ? styles.tabActive : ''}`} onClick={() => setActiveTab('dataset')}>Dataset Engine</button>
          </div>
        </div>
        <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
          <button
            className={styles.advancedBtn}
            onClick={() => setShowNetworkModal(true)}
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="2" width="20" height="8" rx="2" ry="2"></rect>
              <rect x="2" y="14" width="20" height="8" rx="2" ry="2"></rect>
              <line x1="6" y1="6" x2="6.01" y2="6"></line>
              <line x1="6" y1="18" x2="6.01" y2="18"></line>
            </svg>
            Advanced Network
          </button>
          <button
            className={`${styles.saveBtn} ${currentSaved ? styles.saveBtnSaved : ''}`}
            onClick={handleSave}
            disabled={!currentDirty || saving}
          >
          {saving ? (
            <><span className={styles.spinner} /> Saving…</>
          ) : currentSaved ? (
            <>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                <polyline points="20 6 9 17 4 12" />
              </svg>
              Saved
            </>
          ) : 'Save Changes'}
        </button>
        </div>
      </div>

      {error && <div className={styles.errorBar}>{error}</div>}

      {/* ── Grid of section cards ── */}
      <div className={styles.pageGrid}>

        {/* ── Trigger ── */}
        <Card title="Trigger" color="#f59e0b">
          <Toggle label="External Trigger" value={currentForm.use_external_trigger} onChange={v => set('use_external_trigger', v)} />
          <Select label="Trigger Source"   value={currentForm.trigger_source}       onChange={v => set('trigger_source', v)}       options={triggerSourceOptions} />
          <Select label="Activation"       value={currentForm.trigger_activation}   onChange={v => set('trigger_activation', v)}   options={triggerActivationOptions} />
        </Card>

        {/* ── Camera ── */}
        <Card title="Camera" color="#3b82f6">
          <Text   label="Device User ID"  value={currentForm.target_device_user_id} onChange={v => set('target_device_user_id', v)} span />
          <Select label="Pixel Format"    value={currentForm.pixel_format}          onChange={v => set('pixel_format', v)}          options={pixelFormatOptions} />
          <Toggle label="ROI Enable"      value={currentForm.roi_enable}            onChange={v => set('roi_enable', v)} />
          <Num    label="Width"           value={currentForm.frame_width}           onChange={v => set('frame_width', v)}           suffix="px" />
          <Num    label="Height"          value={currentForm.frame_height}          onChange={v => set('frame_height', v)}          suffix="px" />
          <Num    label="ROI Offset X"    value={currentForm.roi_offset_x}          onChange={v => set('roi_offset_x', v)}          suffix="px" />
          <Num    label="ROI Offset Y"    value={currentForm.roi_offset_y}          onChange={v => set('roi_offset_y', v)}          suffix="px" />
          <Toggle label="Auto Exposure"   value={currentForm.auto_exposure}         onChange={v => set('auto_exposure', v)} />
          <Num    label="Exposure"        value={currentForm.exposure_time_us}      onChange={v => set('exposure_time_us', v)}      suffix="µs" step="100" min={4} max={9999875} buttons />
          <Toggle label="Auto Gain"       value={currentForm.auto_gain}             onChange={v => set('auto_gain', v)} />
          <Num    label="Gain"            value={currentForm.gain_db}               onChange={v => set('gain_db', v)}               suffix="dB" step="0.1" min={0} max={40} buttons />
        </Card>

        {/* ── White Balance ── */}
        <Card title="White Balance" color="#8b5cf6">
          <Toggle label="Auto White Balance" value={currentForm.white_balance_auto} onChange={v => set('white_balance_auto', v)} span />
          <Num    label="Red Ratio"    value={currentForm.wb_red_ratio}   onChange={v => set('wb_red_ratio', v)}   step="0.1" />
          <Num    label="Green Ratio"  value={currentForm.wb_green_ratio} onChange={v => set('wb_green_ratio', v)} step="0.1" />
          <Num    label="Blue Ratio"   value={currentForm.wb_blue_ratio}  onChange={v => set('wb_blue_ratio', v)}  step="0.1" />
        </Card>

        {/* ── Output ── */}
        <Card title="Output" color="#64748b">
          <Text   label="Save Directory" value={currentForm.save_directory} onChange={v => set('save_directory', v)} span onBrowse={() => handleBrowseDirectory('save_directory')} />
          <Select label="Format" value={currentForm.save_format} onChange={v => set('save_format', v)} options={saveFormatOptions} />
          <Num    label="JPEG Quality"   value={currentForm.jpeg_quality}   onChange={v => set('jpeg_quality', v)}   suffix="/ 100" min={1} max={100} buttons />
          {activeTab === 'inspection' && <Toggle label="Save Heatmap" value={currentForm.save_heatmap} onChange={v => set('save_heatmap', v)} />}
        </Card>

        {/* ── Inspection Engines & Processing ── */}
        {activeTab === 'inspection' && (
          <Card title="Engines & Processing" color="#10b981">
            <Num    label="Parallel Workers"    value={currentForm.max_parallel_frames}      onChange={v => set('max_parallel_frames', v)} />
            <Toggle label="Template Matching"   value={currentForm.enable_template_matching} onChange={v => set('enable_template_matching', v)} />
          </Card>
        )}

      </div>

      {showNetworkModal && networkConfig && (
        <div className={styles.modalOverlay}>
          <div className={styles.modalContent}>
            <div className={styles.modalHeader}>
              <h2 className={styles.modalTitle}>Advanced Network Settings</h2>
              <p className={styles.modalSubtitle}>Configure the Force IP parameters applied on camera initialization.</p>
            </div>
            
            <div className={styles.fieldGrid}>
              <Text 
                label="Target Force IP" 
                value={networkConfig.target_force_ip} 
                onChange={v => setNetworkConfig({...networkConfig, target_force_ip: v})} 
                span 
                invalid={networkConfig.target_force_ip && !isValidIP(networkConfig.target_force_ip)}
              />
              <Text 
                label="Subnet Mask" 
                value={networkConfig.target_force_subnet} 
                onChange={v => setNetworkConfig({...networkConfig, target_force_subnet: v})} 
                span 
                invalid={networkConfig.target_force_subnet && !isValidIP(networkConfig.target_force_subnet)}
              />
              <Text 
                label="Gateway" 
                value={networkConfig.target_force_gateway} 
                onChange={v => setNetworkConfig({...networkConfig, target_force_gateway: v})} 
                span 
                invalid={networkConfig.target_force_gateway && !isValidIP(networkConfig.target_force_gateway)}
              />
            </div>

            <div className={styles.modalActions}>
              <button 
                className={styles.cancelBtn} 
                onClick={() => setShowNetworkModal(false)}
                disabled={savingNetwork}
              >
                Cancel
              </button>
              <button 
                className={styles.saveBtn} 
                onClick={async () => {
                  setSavingNetwork(true)
                  try {
                    await saveNetworkConfig(networkConfig)
                    setShowNetworkModal(false)
                  } catch (e) {
                    alert("Failed to save network configuration.")
                  }
                  setSavingNetwork(false)
                }}
                disabled={savingNetwork || !isNetworkValid}
              >
                {savingNetwork ? 'Saving...' : 'Save Settings'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

/* ── Card ─────────────────────────────────────────── */
function Card({ title, color, children }) {
  return (
    <div className={styles.card}>
      <div className={styles.cardHeader} style={{ borderLeftColor: color }}>
        <span className={styles.cardTitle}>{title}</span>
      </div>
      <div className={styles.fieldGrid}>{children}</div>
    </div>
  )
}

/* ── Field components ─────────────────────────────── */
function Select({ label, value, onChange, options, span }) {
  return (
    <div className={`${styles.field} ${span ? styles.fieldSpan : ''}`}>
      <label className={styles.fieldLabel}>{label}</label>
      <select
        className={styles.select}
        value={value ?? ''}
        onChange={e => onChange(e.target.value)}
      >
        {options.map(opt => (
          <option key={opt.value} value={opt.value}>
            {opt.label}
          </option>
        ))}
      </select>
    </div>
  )
}

function Text({ label, value, onChange, hint, span, onBrowse, invalid }) {
  return (
    <div className={`${styles.field} ${span ? styles.fieldSpan : ''}`}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.inputRow}>
        <input
          type="text"
          className={`${styles.input} ${invalid ? styles.inputInvalid : ''}`}
          value={value ?? ''}
          onChange={e => onChange(e.target.value)}
          placeholder={hint ?? ''}
        />
        {onBrowse && (
          <button type="button" className={styles.browseBtn} onClick={onBrowse}>
            Browse…
          </button>
        )}
      </div>
    </div>
  )
}

function Num({ label, value, onChange, suffix, step = '1', min, max, span, buttons }) {
  const handleStep = (direction) => {
    const current = value ?? 0
    const delta = parseFloat(step) || 1
    let nextVal = direction === 'up' ? current + delta : current - delta
    if (min !== undefined && nextVal < min) nextVal = min
    if (max !== undefined && nextVal > max) nextVal = max
    const decimals = step.toString().split('.')[1]?.length || 0
    nextVal = parseFloat(nextVal.toFixed(decimals))
    onChange(nextVal)
  }

  const handleChange = (val) => {
    if (isNaN(val)) {
      onChange(val)
      return
    }
    let clamped = val
    if (min !== undefined && clamped < min) clamped = min
    if (max !== undefined && clamped > max) clamped = max
    onChange(clamped)
  }

  return (
    <div className={`${styles.field} ${span ? styles.fieldSpan : ''}`}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.inputRow}>
        {buttons && (
          <button type="button" className={styles.stepBtn} onClick={() => handleStep('down')}>
            -
          </button>
        )}
        <div className={styles.inputWrap}>
          <input
            type="number"
            className={`${styles.input} ${suffix ? styles.inputSuffixed : ''}`}
            value={value ?? ''}
            step={step}
            min={min}
            max={max}
            onChange={e => {
              const val = parseFloat(e.target.value)
              onChange(isNaN(val) ? '' : val)
            }}
            onBlur={e => {
              const val = parseFloat(e.target.value)
              if (!isNaN(val)) handleChange(val)
            }}
          />
          {suffix && <span className={styles.suffix}>{suffix}</span>}
        </div>
        {buttons && (
          <button type="button" className={styles.stepBtn} onClick={() => handleStep('up')}>
            +
          </button>
        )}
      </div>
    </div>
  )
}

function Toggle({ label, value, onChange, span }) {
  return (
    <div className={`${styles.field} ${span ? styles.fieldSpan : ''}`}>
      <label className={styles.fieldLabel}>{label}</label>
      <div className={styles.toggleRow}>
        <button
          type="button"
          role="switch"
          aria-checked={!!value}
          className={`${styles.toggle} ${value ? styles.toggleOn : ''}`}
          onClick={() => onChange(!value)}
        >
          <span className={styles.thumb} />
        </button>
        <span className={styles.toggleLabel}>{value ? 'On' : 'Off'}</span>
      </div>
    </div>
  )
}
