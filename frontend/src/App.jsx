import { useState, useCallback, useEffect } from 'react'
import {
  checkHealth,
  uploadCsv,
  runAnalysis,
  getAnalysisStatus,
  getPriorityAlerts,
  downloadDemoSamples,
} from './api'
import './App.css'

const POLL_INTERVAL_MS = 2000
const POLL_TIMEOUT_MS = 180000
const PROCESSING_STEPS = ['Uploading data', 'Running forecast models', 'Detecting inventory risks', 'Generating alerts']

function App() {
  const [step, setStep] = useState('upload')
  const [uploads, setUploads] = useState({ products: null, inventory: null, sales: null })
  const [uploadError, setUploadError] = useState('')
  const [jobId, setJobId] = useState(null)
  const [jobStatus, setJobStatus] = useState(null)
  const [alerts, setAlerts] = useState(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [processingStepIndex, setProcessingStepIndex] = useState(0)
  const [demoDownloading, setDemoDownloading] = useState(false)
  const [demoDownloadError, setDemoDownloadError] = useState('')

  const handleFile = useCallback(async (key, file) => {
    if (!file) return
    setUploadError('')
    setDemoDownloadError('')
    setError('')
    const endpoints = {
      products: '/api/data/products',
      inventory: '/api/data/inventory',
      sales: '/api/data/sales',
    }
    try {
      const result = await uploadCsv(endpoints[key], file)
      setUploads((u) => ({ ...u, [key]: result }))
    } catch (e) {
      setUploadError(e.message || 'Upload failed')
    }
  }, [])

  const handleRunAnalysis = useCallback(async () => {
    setError('')
    setLoading(true)
    setProcessingStepIndex(0)
    try {
      await checkHealth()
      const { jobId: id } = await runAnalysis()
      setJobId(id)
      setStep('analyzing')
      setJobStatus({ status: 'PENDING' })

      const startedAt = Date.now()
      const poll = async () => {
        if (Date.now() - startedAt > POLL_TIMEOUT_MS) {
          setError('Analysis timed out')
          setLoading(false)
          return
        }
        const status = await getAnalysisStatus(id)
        setJobStatus(status)
        if (status.status === 'COMPLETED') {
          const { alerts: list } = await getPriorityAlerts()
          setAlerts(list)
          setStep('alerts')
          setLoading(false)
          return
        }
        if (status.status === 'FAILED') {
          setError(status.error || 'Analysis failed')
          setLoading(false)
          return
        }
        setTimeout(poll, POLL_INTERVAL_MS)
      }
      poll()
    } catch (e) {
      setError(e.message || 'Failed to start analysis')
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    if (step !== 'analyzing' || !loading) return
    const t = setInterval(() => {
      setProcessingStepIndex((i) => Math.min(i + 1, PROCESSING_STEPS.length - 1))
    }, 4000)
    return () => clearInterval(t)
  }, [step, loading])

  const canRun =
    uploads.products?.processedRows != null &&
    uploads.inventory?.processedRows != null &&
    uploads.sales?.processedRows != null

  const summary = alerts
    ? (() => {
        const high = alerts.filter((a) => (a.severity || '').toUpperCase() === 'HIGH').length
        const medium = alerts.filter((a) => (a.severity || '').toUpperCase() === 'MEDIUM').length
        const low = alerts.filter((a) => (a.severity || '').toUpperCase() === 'LOW').length
        const totalImpact = alerts.reduce((s, a) => s + (Number(a.estimated_impact) || 0), 0)
        const affectedSkus = new Set(alerts.map((a) => a.sku).filter(Boolean)).size
        return { total: alerts.length, high, medium, low, totalImpact, affectedSkus }
      })()
    : null

  return (
    <div className="app">
      <header className="header">
        <h1>BizNerve AI</h1>
        <p>Retail risk monitoring — demand, revenue & margin alerts</p>
        <div className="ai-model-info">
          <p className="ai-model-title">Powered by:</p>
          <ul>
            <li>Time-series forecasting (Prophet)</li>
            <li>Inventory anomaly detection (Z-score)</li>
            <li>Financial impact prioritization</li>
          </ul>
        </div>
      </header>

      <main className="main">
        {step === 'upload' && (
          <section className="card upload-card">
            <h2>Upload data</h2>
            <ol className="upload-steps-list">
              <li>
                Download demo dataset or upload your own CSV files
                <p className="hint demo-download-row">
                  <button
                    type="button"
                    className="btn btn-demo"
                    disabled={demoDownloading}
                    onClick={async () => {
                      setDemoDownloadError('')
                      setDemoDownloading(true)
                      try {
                        await downloadDemoSamples()
                      } catch (e) {
                        setDemoDownloadError(e.message || 'Download failed')
                      } finally {
                        setDemoDownloading(false)
                      }
                    }}
                  >
                    {demoDownloading ? 'Downloading…' : 'Download demo dataset'}
                  </button>
                  <span className="demo-download-hint">ZIP with sample shops (Shop A, Shop B, etc.)</span>
                </p>
              </li>
              <li>
                Upload Products → Inventory → Sales
                <div className="upload-grid">
                  <label className="upload-box">
                    <span className="upload-label">Products</span>
                    <input type="file" accept=".csv" onChange={(e) => handleFile('products', e.target.files?.[0])} />
                    {uploads.products ? (
                      <span className="upload-result upload-done">
                        ✓ Uploaded ({uploads.products.processedRows} rows)
                      </span>
                    ) : (
                      <span className="upload-result">CSV</span>
                    )}
                  </label>
                  <label className="upload-box">
                    <span className="upload-label">Inventory</span>
                    <input type="file" accept=".csv" onChange={(e) => handleFile('inventory', e.target.files?.[0])} />
                    {uploads.inventory ? (
                      <span className="upload-result upload-done">
                        ✓ Uploaded ({uploads.inventory.processedRows} rows)
                      </span>
                    ) : (
                      <span className="upload-result">CSV</span>
                    )}
                  </label>
                  <label className="upload-box">
                    <span className="upload-label">Sales</span>
                    <input type="file" accept=".csv" onChange={(e) => handleFile('sales', e.target.files?.[0])} />
                    {uploads.sales ? (
                      <span className="upload-result upload-done">
                        ✓ Uploaded ({uploads.sales.processedRows} rows)
                      </span>
                    ) : (
                      <span className="upload-result">CSV</span>
                    )}
                  </label>
                </div>
              </li>
              <li>
                Click Run analysis to generate AI alerts
                <div className="actions">
                  <button
                    className="btn btn-primary"
                    disabled={!canRun || loading}
                    onClick={handleRunAnalysis}
                  >
                    {loading ? 'Starting…' : 'Run analysis'}
                  </button>
                </div>
              </li>
            </ol>
            {(uploadError || demoDownloadError) && <p className="error">{uploadError || demoDownloadError}</p>}
          </section>
        )}

        {step === 'analyzing' && (
          <section className="card processing-card">
            <h2>Analysis running</h2>
            <p className="status-badge">{jobStatus?.status ?? 'PENDING'}</p>
            {error && <p className="error">{error}</p>}
            <div className="processing-steps">
              {PROCESSING_STEPS.map((label, i) => (
                <div
                  key={label}
                  className={`processing-step ${i <= processingStepIndex ? 'active' : ''} ${i < processingStepIndex ? 'done' : ''}`}
                >
                  <span className="step-indicator">
                    {i < processingStepIndex ? '✓' : i === processingStepIndex ? (
                      <span className="spinner" />
                    ) : (
                      <span className="step-num">{i + 1}</span>
                    )}
                  </span>
                  <span className="step-label">{label}</span>
                </div>
              ))}
            </div>
            <p className="hint">This may take a minute. You’ll be redirected when done.</p>
          </section>
        )}

        {step === 'alerts' && (
          <>
            {summary && summary.total > 0 && (
              <section className="card impact-card">
                <h2>Financial Impact Overview</h2>
                <div className="impact-grid">
                  <div className="impact-item">
                    <span className="impact-value">₹{formatRupees(summary.totalImpact)}</span>
                    <span className="impact-label">Estimated revenue at risk</span>
                  </div>
                  <div className="impact-item">
                    <span className="impact-value">{summary.affectedSkus}</span>
                    <span className="impact-label">SKUs affected</span>
                  </div>
                  <div className="impact-item">
                    <span className="impact-value">{summary.high}</span>
                    <span className="impact-label">Immediate actions required (HIGH)</span>
                  </div>
                </div>
              </section>
            )}

            <section className="card alerts-card">
              <h2>Priority alerts</h2>
              {error && <p className="error">{error}</p>}
              {alerts && alerts.length === 0 && (
                <p className="hint">No alerts right now. Upload Products → Inventory → Sales (in that order) and run analysis to see results.</p>
              )}
              {alerts && alerts.length > 0 && (
                <ol className="alert-list">
                  {alerts.map((a, i) => (
                    <li key={a.alert_id || i} className={`alert-item severity-${(a.severity || '').toLowerCase()}`}>
                      <div className="alert-header">
                        <span className="alert-rank">#{i + 1}</span>
                        <span className="alert-type">{a.alert_type}</span>
                        <span className="alert-severity badge-severity">{a.severity}</span>
                      </div>
                      {a.sku && (
                        <p className="alert-sku">
                          {a.product_name ? `${a.product_name} (${a.sku})` : a.sku}
                        </p>
                      )}
                      {a.estimated_impact != null && (
                        <p className="alert-impact">
                          <span className="impact-label-inline">Impact:</span>{' '}
                          <strong className="impact-value-inline">₹{formatRupees(a.estimated_impact)}</strong>
                        </p>
                      )}
                      {a.urgency_days != null && (
                        <p className="alert-urgency">Urgency: {a.urgency_days} day(s)</p>
                      )}
                      <p className="alert-action">{a.recommended_action}</p>
                    </li>
                  ))}
                </ol>
              )}
              <div className="actions">
                <button
                  className="btn btn-secondary"
                  onClick={() => {
                    setStep('upload')
                    setUploads({ products: null, inventory: null, sales: null })
                    setAlerts(null)
                    setJobId(null)
                    setJobStatus(null)
                    setError('')
                  }}
                >
                  Upload new data
                </button>
              </div>
            </section>
          </>
        )}
      </main>

      <footer className="footer">
        <p className="footer-tagline">BizNerve AI — Prevent retail losses before they happen.</p>
      </footer>
    </div>
  )
}

function formatRupees(value) {
  const n = Number(value)
  if (!Number.isFinite(n)) return String(value)
  const abs = Math.abs(n)
  if (abs >= 100000) return `${(n / 100000).toFixed(1)}L`
  if (abs >= 1000) return `${(n / 1000).toFixed(1)}k`
  return n.toFixed(0)
}

export default App
