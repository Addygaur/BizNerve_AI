const path = require("path");
const fs = require("fs");
const express = require("express");
const multer = require("multer");
const archiver = require("archiver");
const { randomUUID } = require("crypto");
const { query, withTransaction } = require("../db");
const { parseCsvBuffer, toNumber } = require("../utils/csv");
const { segregate } = require("../services/segregateCsv");

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
      // Replace-all semantics: uploading products = new dataset. Clear all data so this run uses only current uploads.
      await client.query("DELETE FROM alerts");
      await client.query("DELETE FROM forecasts");
      await client.query("DELETE FROM sales");
      await client.query("DELETE FROM inventory");
      await client.query("DELETE FROM products");
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

/** Single-file upload: analyze CSV and segregate into products, inventory, sales; replace DB with result. */
router.post("/upload-combined", upload.single("file"), async (req, res, next) => {
  try {
    if (!req.file) return res.status(400).json({ error: "CSV file is required" });
    const rows = parseCsvBuffer(req.file.buffer);
    const result = segregate(rows);
    if (result.errors && result.errors.length > 0) {
      return res.status(400).json({
        error: "Could not interpret CSV",
        details: result.errors,
        hint: "Supported: (1) Supermarket-style: Product line, Unit price, Quantity, Date, Total, Cost of goods sold, Invoice ID. (2) Sales with columns: sku, quantity, sale_date (and optional unit_price, total_amount, transaction_id).",
      });
    }
    const { products: productsList, inventory: inventoryList, sales: salesList } = result;
    if (!productsList.length || !salesList.length) {
      return res.status(400).json({
        error: "Segregation produced no products or no sales",
        details: result.errors,
      });
    }

    await withTransaction(async (client) => {
      await client.query("DELETE FROM alerts");
      await client.query("DELETE FROM forecasts");
      await client.query("DELETE FROM sales");
      await client.query("DELETE FROM inventory");
      await client.query("DELETE FROM products");

      for (const p of productsList) {
        await client.query(
          `INSERT INTO products (sku, name, category, supplier_id, cost_price, selling_price, supplier_lead_time_days)
           VALUES ($1, $2, $3, $4, $5, $6, $7)
           ON CONFLICT (sku) DO UPDATE SET name = EXCLUDED.name, category = EXCLUDED.category,
             supplier_id = EXCLUDED.supplier_id, cost_price = EXCLUDED.cost_price,
             selling_price = EXCLUDED.selling_price, supplier_lead_time_days = EXCLUDED.supplier_lead_time_days`,
          [
            p.sku,
            p.name,
            p.category,
            p.supplier_id || "UNKNOWN",
            p.cost_price,
            p.selling_price,
            p.supplier_lead_time_days ?? 7,
          ]
        );
      }
      for (const inv of inventoryList) {
        await client.query(
          `INSERT INTO inventory (sku, current_stock, snapshot_date) VALUES ($1, $2, $3)
           ON CONFLICT (sku, snapshot_date) DO UPDATE SET current_stock = EXCLUDED.current_stock`,
          [inv.sku, inv.current_stock, inv.snapshot_date]
        );
      }
      for (const s of salesList) {
        await client.query(
          `INSERT INTO sales (transaction_id, sku, quantity, unit_price, total_amount, sale_date, channel)
           VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT (transaction_id) DO NOTHING`,
          [
            s.transaction_id,
            s.sku,
            s.quantity,
            s.unit_price,
            s.total_amount,
            s.sale_date,
            s.channel || "offline",
          ]
        );
      }
    });

    return res.json({
      ok: true,
      format: result.format,
      products: { totalRows: productsList.length, processedRows: productsList.length },
      inventory: { totalRows: inventoryList.length, processedRows: inventoryList.length },
      sales: { totalRows: salesList.length, processedRows: salesList.length },
      message: `Segregated into ${productsList.length} products, ${inventoryList.length} inventory rows, ${salesList.length} sales. You can run analysis now.`,
    });
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

// Demo dataset: zip of samples folder (Shop A, Shop B, Shop C, etc.)
const SAMPLES_DIR = process.env.SAMPLES_DIR || path.resolve(__dirname, "..", "..", "..", "..", "samples");
router.get("/demo-samples", (req, res, next) => {
  try {
    if (!fs.existsSync(SAMPLES_DIR) || !fs.statSync(SAMPLES_DIR).isDirectory()) {
      return res.status(404).json({ error: "Demo samples folder not found" });
    }
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", 'attachment; filename="samples.zip"');
    const archive = archiver("zip", { zlib: { level: 6 } });
    archive.on("error", (err) => next(err));
    archive.pipe(res);
    archive.directory(SAMPLES_DIR, "samples");
    archive.finalize();
  } catch (error) {
    next(error);
  }
});

module.exports = router;
