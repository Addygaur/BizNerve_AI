const fs = require("node:fs/promises");
const path = require("node:path");

const API_BASE_URL = process.env.DEMO_API_BASE_URL || "http://localhost:8080";
const POLL_INTERVAL_MS = Number(process.env.DEMO_POLL_INTERVAL_MS || 3000);
const POLL_TIMEOUT_MS = Number(process.env.DEMO_POLL_TIMEOUT_MS || 180000);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForHealth(timeoutMs = 60000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < timeoutMs) {
    try {
      const res = await fetch(`${API_BASE_URL}/health`);
      if (res.ok) return;
    } catch (error) {
      // API might not be ready yet (connection refused) — retry.
    }
    await sleep(1000);
  }
  throw new Error("API not ready (health check timeout)");
}

async function parseJson(response, context) {
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`${context} failed (${response.status}): ${text}`);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    throw new Error(`${context} returned invalid JSON: ${text}`);
  }
}

async function uploadCsv(endpoint, filePath) {
  const fileBuffer = await fs.readFile(filePath);
  const form = new FormData();
  form.append("file", new Blob([fileBuffer]), path.basename(filePath));

  const response = await fetch(`${API_BASE_URL}${endpoint}`, {
    method: "POST",
    body: form,
  });
  return parseJson(response, `Upload ${endpoint}`);
}

async function triggerAnalysis() {
  const response = await fetch(`${API_BASE_URL}/api/analyze/run`, {
    method: "POST",
  });
  return parseJson(response, "Trigger analysis");
}

async function getAnalysisStatus(jobId) {
  const response = await fetch(`${API_BASE_URL}/api/analyze/status/${jobId}`);
  return parseJson(response, "Get analysis status");
}

async function getPriorityAlerts() {
  const response = await fetch(`${API_BASE_URL}/api/alerts/priority`);
  return parseJson(response, "Get priority alerts");
}

function formatRupeesShort(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 100000) {
    return `₹${(n / 100000).toFixed(1)} lakh`;
  }
  if (abs >= 1000) {
    return `₹${(n / 1000).toFixed(1)}k`;
  }
  return `₹${n.toFixed(0)}`;
}

function printAlert(alert, index) {
  console.log(`\n#${index + 1} ${alert.alert_type} [${alert.severity}]`);
  if (alert.sku) console.log(`SKU: ${alert.sku}`);
  console.log(`Impact: ${formatRupeesShort(alert.estimated_impact)}`);
  console.log(`Urgency Days: ${alert.urgency_days}`);
  console.log(`Action: ${alert.recommended_action}`);
}

async function main() {
  if (typeof fetch !== "function") {
    throw new Error(
      "This script requires Node 18+ (global fetch). Please upgrade Node or run inside a Node 18+ environment."
    );
  }

  const demoDir = path.resolve(__dirname, "../../samples/demo");
  const productsPath = path.join(demoDir, "products_demo.csv");
  const inventoryPath = path.join(demoDir, "inventory_demo.csv");
  const salesPath = path.join(demoDir, "sales_demo_90d.csv");

  console.log(`Using API: ${API_BASE_URL}`);
  console.log(`Using demo dataset: ${demoDir}`);

  process.stdout.write("Waiting for API health...");
  await waitForHealth(60000);
  process.stdout.write(" ok\n");

  const [products, inventory, sales] = await Promise.all([
    uploadCsv("/api/data/products", productsPath),
    uploadCsv("/api/data/inventory", inventoryPath),
    uploadCsv("/api/data/sales", salesPath),
  ]);

  console.log("\nUpload summary:");
  console.log(`- products: ${products.processedRows}/${products.totalRows}`);
  console.log(`- inventory: ${inventory.processedRows}/${inventory.totalRows}`);
  console.log(`- sales: ${sales.processedRows}/${sales.totalRows}`);

  const run = await triggerAnalysis();
  const jobId = run.jobId;
  console.log(`\nTriggered analysis job: ${jobId}`);

  const startedAt = Date.now();
  let status;
  while (Date.now() - startedAt < POLL_TIMEOUT_MS) {
    status = await getAnalysisStatus(jobId);
    process.stdout.write(`\rJob status: ${status.status}   `);
    if (status.status === "COMPLETED") break;
    if (status.status === "FAILED") {
      throw new Error(`Analysis failed: ${status.error || "Unknown error"}`);
    }
    await sleep(POLL_INTERVAL_MS);
  }
  process.stdout.write("\n");

  if (!status || status.status !== "COMPLETED") {
    throw new Error("Timed out waiting for analysis completion");
  }

  const alerts = await getPriorityAlerts();
  const top5 = alerts.slice(0, 5);

  console.log(`\nTop ${top5.length} priority alerts:`);
  if (!top5.length) {
    console.log("No alerts found.");
  } else {
    top5.forEach(printAlert);
  }

  console.log("\nDemo flow completed successfully.");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(`\nDemo flow failed: ${error.message}`);
    process.exit(1);
  });
