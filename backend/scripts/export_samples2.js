/**
 * Reads samples2/online_retail_raw.csv (project root), segregates into
 * products, inventory, sales using the API's segregateCsv, and writes
 * products.csv, inventory.csv, sales.csv into samples2.
 *
 * Run from backend/: node scripts/export_samples2.js
 */

const fs = require("node:fs");
const path = require("node:path");

const SAMPLES2 = path.join(__dirname, "../../samples2");
const RAW_CSV = path.join(SAMPLES2, "online_retail_raw.csv");

function escapeCsvField(val) {
  const s = val == null ? "" : String(val);
  if (/[,"\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function toCsv(headers, rows) {
  const line = (r) =>
    headers.map((h) => escapeCsvField(r[h])).join(",");
  return [headers.join(","), ...rows.map(line)].join("\n");
}

function main() {
  if (!fs.existsSync(RAW_CSV)) {
    console.error("Missing file: %s", RAW_CSV);
    process.exit(1);
  }

  const { parseCsvBuffer } = require("../api/src/utils/csv");
  const { segregate } = require("../api/src/services/segregateCsv");

  const buffer = fs.readFileSync(RAW_CSV);
  const rows = parseCsvBuffer(buffer);
  const result = segregate(rows);

  if (result.errors && result.errors.length > 0) {
    console.error("Segregation errors:", result.errors);
    process.exit(1);
  }

  const { products, inventory, sales } = result;

  fs.writeFileSync(
    path.join(SAMPLES2, "products.csv"),
    toCsv(
      [
        "sku",
        "name",
        "category",
        "supplier_id",
        "cost_price",
        "selling_price",
        "supplier_lead_time_days",
      ],
      products
    ),
    "utf8"
  );
  fs.writeFileSync(
    path.join(SAMPLES2, "inventory.csv"),
    toCsv(["sku", "current_stock", "snapshot_date"], inventory),
    "utf8"
  );
  fs.writeFileSync(
    path.join(SAMPLES2, "sales.csv"),
    toCsv(
      [
        "transaction_id",
        "sku",
        "quantity",
        "unit_price",
        "total_amount",
        "sale_date",
        "channel",
      ],
      sales
    ),
    "utf8"
  );

  console.log("Wrote samples2/ (format: %s):", result.format);
  console.log("  products.csv  (%d rows)", products.length);
  console.log("  inventory.csv (%d rows)", inventory.length);
  console.log("  sales.csv     (%d rows)", sales.length);
}

main();
