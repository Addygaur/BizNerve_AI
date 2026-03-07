// In production (e.g. AWS), set VITE_API_ORIGIN to your backend URL so /api and /health
// are requested from the correct host (e.g. http://44.200.47.3:8080). Leave empty when using
// Vite dev proxy or when the same server proxies /api to the backend.
const API_BASE = import.meta.env.VITE_API_ORIGIN ?? '';

async function checkHealth() {
  const r = await fetch(`${API_BASE}/health`);
  if (!r.ok) throw new Error('API not ready');
  return r.json();
}

async function uploadCsv(endpoint, file) {
  const form = new FormData();
  form.append('file', file);
  const r = await fetch(`${API_BASE}${endpoint}`, { method: 'POST', body: form });
  if (!r.ok) {
    const err = await r.text();
    throw new Error(err || `Upload failed: ${r.status}`);
  }
  return r.json();
}

async function runAnalysis() {
  const r = await fetch(`${API_BASE}/api/analyze/run`, { method: 'POST' });
  if (!r.ok) throw new Error('Failed to start analysis');
  return r.json();
}

async function getAnalysisStatus(jobId) {
  const r = await fetch(`${API_BASE}/api/analyze/status/${jobId}`);
  if (!r.ok) throw new Error('Failed to get status');
  return r.json();
}

async function getPriorityAlerts() {
  const r = await fetch(`${API_BASE}/api/alerts/priority`);
  if (!r.ok) throw new Error('Failed to load alerts');
  return r.json();
}

async function getForecastBySku(sku) {
  const r = await fetch(`${API_BASE}/api/forecast/${encodeURIComponent(sku)}`);
  if (!r.ok) return null;
  return r.json();
}

async function getForecastReorder() {
  const r = await fetch(`${API_BASE}/api/forecast/reorder`);
  if (!r.ok) return [];
  const data = await r.json();
  return Array.isArray(data) ? data : [];
}

export { checkHealth, uploadCsv, runAnalysis, getAnalysisStatus, getPriorityAlerts, getForecastBySku, getForecastReorder };
