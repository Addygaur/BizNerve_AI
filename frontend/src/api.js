const API_BASE = '';

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

/** Download demo samples zip (samples folder with Shop A, Shop B, etc.) */
async function downloadDemoSamples() {
  const r = await fetch(`${API_BASE}/api/data/demo-samples`);
  if (!r.ok) throw new Error('Demo dataset unavailable');
  const blob = await r.blob();
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'samples.zip';
  a.click();
  URL.revokeObjectURL(url);
}

export { checkHealth, uploadCsv, runAnalysis, getAnalysisStatus, getPriorityAlerts, getForecastBySku, getForecastReorder, downloadDemoSamples };
