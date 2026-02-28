const express = require("express");
const multer = require("multer");
const { randomUUID } = require("crypto");
const { query, withTransaction } = require("../db");
const { parseCsvBuffer, toNumber } = require("../utils/csv");

const router = express.Router();
const upload = multer({ storage: multer.memoryStorage() });

async function ensureProductExists(client, sku, fallbackPrice = 0) {
  await client.query(
    `
    INSERT INTO products (sku, name, category, supplier_id, cost_price, selling_price, supplier_lead_time_days)
    VALUES ($1, $2, 'UNCATEGORIZED', 'UNKNOWN', $3, $4, 7)
    ON CONFLICT (sku) DO NOTHING
    `,
    [sku, `Product ${sku}`, Math.max(0, fallbackPrice * 0.7), Math.max(0, fallbackPrice)]
  );
}

function buildSummary(name, total, success, failures) {
  return {
    dataset: name,
    totalRows: total,
    processedRows: success,
    failedRows: failures.length,
    failures,
  };
}

router.post("/products", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });
    const rows = parseCsvBuffer(req.file.buffer);
    const failures = [];
    let success = 0;
    await withTransaction(async (client) => {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const sku = String(row.sku || "").trim();
        const name = String(row.name || "").trim();
        const category = String(row.category || "").trim();
        const costPrice = toNumber(row.cost_price);
        const sellingPrice = toNumber(row.selling_price);
        const leadTime = Number(row.supplier_lead_time_days || 7);
        if (!sku || !name || !category || costPrice === null || sellingPrice === null) {
          failures.push({ row: i + 1, reason: "Missing required product fields" });
          continue;
        }
        await client.query(
          `
          INSERT INTO products (sku, name, category, supplier_id, cost_price, selling_price, supplier_lead_time_days)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (sku)
          DO UPDATE SET
            name = EXCLUDED.name,
            category = EXCLUDED.category,
            supplier_id = EXCLUDED.supplier_id,
            cost_price = EXCLUDED.cost_price,
            selling_price = EXCLUDED.selling_price,
            supplier_lead_time_days = EXCLUDED.supplier_lead_time_days
          `,
          [
            sku,
            name,
            category,
            row.supplier_id || "UNKNOWN",
            costPrice,
            sellingPrice,
            Number.isFinite(leadTime) ? leadTime : 7,
          ]
        );
        success += 1;
      }
    });

    return res.json(buildSummary("products", rows.length, success, failures));
  } catch (error) {
    return next(error);
  }
});

router.post("/inventory", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });
    const rows = parseCsvBuffer(req.file.buffer);
    const failures = [];
    let success = 0;
    await withTransaction(async (client) => {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const sku = String(row.sku || "").trim();
        const currentStock = Number(row.current_stock);
        const snapshotDate = row.snapshot_date || new Date().toISOString().slice(0, 10);
        if (!sku || !Number.isInteger(currentStock) || currentStock < 0) {
          failures.push({ row: i + 1, reason: "Invalid inventory fields" });
          continue;
        }
        await ensureProductExists(client, sku, 0);
        await client.query(
          `
          INSERT INTO inventory (sku, current_stock, snapshot_date)
          VALUES ($1, $2, $3)
          ON CONFLICT (sku, snapshot_date)
          DO UPDATE SET current_stock = EXCLUDED.current_stock
          `,
          [sku, currentStock, snapshotDate]
        );
        success += 1;
      }
    });
    return res.json(buildSummary("inventory", rows.length, success, failures));
  } catch (error) {
    return next(error);
  }
});

router.post("/sales", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });
    const rows = parseCsvBuffer(req.file.buffer);
    const failures = [];
    let success = 0;
    await withTransaction(async (client) => {
      for (let i = 0; i < rows.length; i += 1) {
        const row = rows[i];
        const sku = String(row.sku || "").trim();
        const quantity = Number(row.quantity);
        const unitPrice = toNumber(row.unit_price);
        const saleDate = row.sale_date;
        if (!sku || !Number.isInteger(quantity) || quantity <= 0 || unitPrice === null || !saleDate) {
          failures.push({ row: i + 1, reason: "Invalid sales fields" });
          continue;
        }
        await ensureProductExists(client, sku, unitPrice);
        const txId = row.transaction_id || randomUUID();
        await client.query(
          `
          INSERT INTO sales (transaction_id, sku, quantity, unit_price, total_amount, sale_date, channel)
          VALUES ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (transaction_id) DO NOTHING
          `,
          [
            txId,
            sku,
            quantity,
            unitPrice,
            Number(row.total_amount) || Number((quantity * unitPrice).toFixed(2)),
            saleDate,
            row.channel || "offline",
          ]
        );
        success += 1;
      }
    });
    return res.json(buildSummary("sales", rows.length, success, failures));
  } catch (error) {
    return next(error);
  }
});

router.get("/summary", async (req, res, next) => {
  try {
    const [products, inventory, sales] = await Promise.all([
      query("SELECT COUNT(*)::int AS count FROM products"),
      query("SELECT COUNT(*)::int AS count FROM inventory"),
      query("SELECT COUNT(*)::int AS count FROM sales"),
    ]);
    return res.json({
      products: products.rows[0].count,
      inventorySnapshots: inventory.rows[0].count,
      salesTransactions: sales.rows[0].count,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
