/**
 * Fetches the Plotly Supermarket Sales CSV (real-world style data) and converts
 * it to BizNerve format: products.csv, inventory.csv, sales.csv.
 *
 * Usage: node scripts/adapt_supermarket_sales.js
 *
 * Reads from URL or from samples/realworld/supermarket_sales_raw.csv if present.
 * Writes to samples/realworld/products.csv, inventory.csv, sales.csv.
 */

const fs = require("node:fs").promises;
const path = require("node:path");

// Simple CSV parse (no deps); handles quoted fields
function parseCsv(text) {
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  if (!lines.length) return [];
  let headers = [];
  const dataRows = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const values = [];
    let cur = "";
    let inQuotes = false;
    for (let j = 0; j < line.length; j++) {
      const c = line[j];
      if (c === '"') inQuotes = !inQuotes;
      else if (c === "," && !inQuotes) {
        values.push(cur.trim());
        cur = "";
      } else {
        cur += c;
      }
    }
    values.push(cur.trim());
    if (i === 0) headers = values;
    else dataRows.push(values);
  }
  return dataRows.map((arr) => {
    const obj = {};
    headers.forEach((h, idx) => { obj[h] = arr[idx] != null ? arr[idx] : ""; });
    return obj;
  });
}

const SOURCE_URL =
  "https://raw.githubusercontent.com/plotly/datasets/master/supermarket_Sales.csv";
// Output under backend/samples/realworld (run from backend/ so cwd is backend)
const ROOT = process.cwd();
const REALWORLD = path.join(ROOT, "samples", "realworld");
const RAW_FILE = path.join(REALWORLD, "supermarket_sales_raw.csv");

function slug(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const [m, d, y] = s.split("/").map(Number);
  if (!y || !m || !d) return null;
  const year = y < 100 ? 2000 + y : y;
  const month = String(m).padStart(2, "0");
  const day = String(d).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

async function fetchCsv() {
  try {
    await fs.access(RAW_FILE);
    return await fs.readFile(RAW_FILE, "utf8");
  } catch {
    // File not found, fetch from URL
    const res = await fetch(SOURCE_URL);
    if (!res.ok) throw new Error(`Fetch failed: ${res.status}`);
    const text = await res.text();
    await fs.mkdir(REALWORLD, { recursive: true });
    await fs.writeFile(RAW_FILE, text, "utf8");
    return text;
  }
}

async function run() {
  const csvText = await fetchCsv();
  const rows = parseCsv(csvText);

  // Map (Product line, Unit price) -> { sku, name, category, cost_price, selling_price }
  const productMap = new Map();
  const productCostSums = new Map();
  const productCostCounts = new Map();

  for (const row of rows) {
    const productLine = (row["Product line"] || "").trim();
    const unitPrice = parseFloat(row["Unit price"]) || 0;
    const quantity = parseInt(row["Quantity"], 10) || 0;
    const costOfGoods = parseFloat(row["Cost of goods sold"]) || 0;
    if (!productLine || unitPrice <= 0) continue;

    const key = `${productLine}|${unitPrice}`;
    const sku = `${slug(productLine)}-${unitPrice.toFixed(2).replace(".", "_")}`;

    if (!productMap.has(key)) {
      productMap.set(key, {
        sku,
        name: productLine,
        category: productLine,
        selling_price: unitPrice,
      });
      productCostSums.set(sku, 0);
      productCostCounts.set(sku, 0);
    }
    if (quantity > 0 && costOfGoods >= 0) {
      const unitCost = costOfGoods / quantity;
      productCostSums.set(sku, (productCostSums.get(sku) || 0) + unitCost * quantity);
      productCostCounts.set(sku, (productCostCounts.get(sku) || 0) + quantity);
    }
  }

  for (const [key, p] of productMap) {
    const sku = p.sku;
    const sum = productCostSums.get(sku) || 0;
    const count = productCostCounts.get(sku) || 1;
    p.cost_price = count > 0 ? sum / count : p.selling_price * 0.7;
  }

  const products = Array.from(productMap.values()).map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    supplier_id: "SUP-1",
    cost_price: Number(p.cost_price.toFixed(2)),
    selling_price: Number(p.selling_price.toFixed(2)),
    supplier_lead_time_days: 7,
  }));

  const sales = [];
  for (const row of rows) {
    const productLine = (row["Product line"] || "").trim();
    const unitPrice = parseFloat(row["Unit price"]) || 0;
    const quantity = parseInt(row["Quantity"], 10);
    const total = parseFloat(row["Total"]) || quantity * unitPrice;
    const date = parseDate(row["Date"]);
    const invoiceId = (row["Invoice ID"] || "").trim();
    const payment = (row["Payment"] || "offline").trim();
    if (!productLine || unitPrice <= 0 || !quantity || quantity <= 0 || !date) continue;

    const key = `${productLine}|${unitPrice}`;
    const sku = productMap.get(key)?.sku;
    if (!sku) continue;

    sales.push({
      transaction_id: invoiceId || `tx-${sales.length + 1}`,
      sku,
      quantity,
      unit_price: unitPrice,
      total_amount: Number(total.toFixed(2)),
      sale_date: date,
      channel: payment.toLowerCase().includes("wallet") ? "online" : "offline",
    });
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const qtyBySku = new Map();
  for (const s of sales) {
    qtyBySku.set(s.sku, (qtyBySku.get(s.sku) || 0) + s.quantity);
  }
  const inventory = products.map((p) => ({
    sku: p.sku,
    current_stock: Math.max(0, Math.min(150, Math.floor((qtyBySku.get(p.sku) || 0) * 0.3) + 20)),
    snapshot_date: snapshotDate,
  }));

  function toCsv(headers, rows) {
    const line = (r) => headers.map((h) => (r[h] != null ? String(r[h]) : "")).join(",");
    return [headers.join(","), ...rows.map(line)].join("\n");
  }

  await fs.mkdir(REALWORLD, { recursive: true });
  await fs.writeFile(
    path.join(REALWORLD, "products.csv"),
    toCsv(
      ["sku", "name", "category", "supplier_id", "cost_price", "selling_price", "supplier_lead_time_days"],
      products
    ),
    "utf8"
  );
  await fs.writeFile(
    path.join(REALWORLD, "inventory.csv"),
    toCsv(["sku", "current_stock", "snapshot_date"], inventory),
    "utf8"
  );
  await fs.writeFile(
    path.join(REALWORLD, "sales.csv"),
    toCsv(["transaction_id", "sku", "quantity", "unit_price", "total_amount", "sale_date", "channel"], sales),
    "utf8"
  );

  console.log("Wrote:");
  console.log("  samples/realworld/products.csv  (%d rows)", products.length);
  console.log("  samples/realworld/inventory.csv (%d rows)", inventory.length);
  console.log("  samples/realworld/sales.csv    (%d rows)", sales.length);
  console.log("\nRun demo with real-world data:");
  console.log("  cd backend/api && DEMO_DATASET=../samples/realworld node scripts/demo.js");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
