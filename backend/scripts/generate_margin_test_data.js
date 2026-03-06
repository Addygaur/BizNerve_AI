/**
 * Generates a dataset that triggers the MARGIN_EROSION alert:
 * - Sales in "last month" with healthy margin (~28%)
 * - Sales in "this month" with lower margin (~15%) and revenue growth < 5%
 *
 * Run from backend/: node scripts/generate_margin_test_data.js
 * Then: cd api && DEMO_DATASET=../samples/margin_test node scripts/demo.js
 */

const fs = require("node:fs").promises;
const path = require("node:path");

const ROOT = process.cwd();
const OUT_DIR = path.join(ROOT, "samples", "margin_test");

function toCsv(headers, rows) {
  const line = (r) => headers.map((h) => (r[h] != null ? String(r[h]) : "")).join(",");
  return [headers.join(","), ...rows.map(line)].join("\n");
}

function formatDate(d) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function firstDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}
function lastDayOfMonth(d) {
  return new Date(d.getFullYear(), d.getMonth() + 1, 0);
}

async function run() {
  const today = new Date();
  const startThisMonth = firstDayOfMonth(today);
  const endThisMonth = lastDayOfMonth(today);
  const startLastMonth = firstDayOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));
  const endLastMonth = lastDayOfMonth(new Date(today.getFullYear(), today.getMonth() - 1, 1));

  const products = [
    { sku: "MARG-A", name: "Product A", category: "Category1", supplier_id: "SUP1", cost_price: 72, selling_price: 100, supplier_lead_time_days: 7 },
    { sku: "MARG-B", name: "Product B", category: "Category1", supplier_id: "SUP1", cost_price: 72, selling_price: 100, supplier_lead_time_days: 7 },
    { sku: "MARG-C", name: "Product C", category: "Category2", supplier_id: "SUP1", cost_price: 72, selling_price: 100, supplier_lead_time_days: 7 },
  ];

  const sales = [];
  let txId = 1;

  // Last month: sell at full price → margin ~28% (cost 72, sell 100)
  const lastMonthDays = Math.ceil((endLastMonth - startLastMonth) / (24 * 60 * 60 * 1000)) + 1;
  for (let d = 0; d < lastMonthDays; d++) {
    const dte = new Date(startLastMonth);
    dte.setDate(dte.getDate() + d);
    const date = formatDate(dte);
    const qty = 20 + (d % 15);
    const unitPrice = 100;
    const total = qty * unitPrice;
    sales.push({
      transaction_id: `tx-last-${txId++}`,
      sku: products[d % products.length].sku,
      quantity: qty,
      unit_price: unitPrice,
      total_amount: total,
      sale_date: date,
      channel: "offline",
    });
  }

  // This month: sell at discount (85) → margin ~15.3% (cost 72, sell 85). Revenue slightly lower → growth < 5%
  const daysInThisMonth = Math.ceil((endThisMonth - startThisMonth) / (24 * 60 * 60 * 1000)) + 1;
  const thisMonthDays = Math.min(today.getDate(), daysInThisMonth);
  for (let d = 0; d < thisMonthDays; d++) {
    const dte = new Date(startThisMonth);
    dte.setDate(dte.getDate() + d);
    const date = formatDate(dte);
    const qty = 18 + (d % 12);
    const unitPrice = 85;
    const total = qty * unitPrice;
    sales.push({
      transaction_id: `tx-this-${txId++}`,
      sku: products[d % products.length].sku,
      quantity: qty,
      unit_price: unitPrice,
      total_amount: total,
      sale_date: date,
      channel: "offline",
    });
  }

  const snapshotDate = formatDate(today);
  const inventory = products.map((p) => ({
    sku: p.sku,
    current_stock: 80,
    snapshot_date: snapshotDate,
  }));

  await fs.mkdir(OUT_DIR, { recursive: true });
  await fs.writeFile(
    path.join(OUT_DIR, "products.csv"),
    toCsv(["sku", "name", "category", "supplier_id", "cost_price", "selling_price", "supplier_lead_time_days"], products),
    "utf8"
  );
  await fs.writeFile(
    path.join(OUT_DIR, "inventory.csv"),
    toCsv(["sku", "current_stock", "snapshot_date"], inventory),
    "utf8"
  );
  await fs.writeFile(
    path.join(OUT_DIR, "sales.csv"),
    toCsv(["transaction_id", "sku", "quantity", "unit_price", "total_amount", "sale_date", "channel"], sales),
    "utf8"
  );

  console.log("Wrote samples/margin_test/ (products, inventory, sales)");
  console.log(`  Last month: ${lastMonthDays} days of sales at full price (~28% margin)`);
  console.log(`  This month: ${thisMonthDays} days of sales at discount (~15% margin), revenue growth < 5%`);
  console.log("\nRun demo: cd api && DEMO_DATASET=../samples/margin_test MARGIN_ALERT_ONLY_FROM_DAY=1 node scripts/demo.js");
  console.log("(Set MARGIN_ALERT_ONLY_FROM_DAY=1 in API env so margin check runs any day; then restart API or pass when starting.)");
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
