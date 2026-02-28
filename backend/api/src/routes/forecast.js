const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/reorder", async (req, res, next) => {
  try {
    const rows = await query(
      `
      WITH next_30 AS (
        SELECT f.sku, SUM(f.predicted_sales)::float AS demand_30
        FROM forecasts f
        WHERE f.forecast_date BETWEEN CURRENT_DATE + INTERVAL '1 day' AND CURRENT_DATE + INTERVAL '30 day'
        GROUP BY f.sku
      ),
      latest_inventory AS (
        SELECT DISTINCT ON (sku) sku, current_stock
        FROM inventory
        ORDER BY sku, snapshot_date DESC
      )
      SELECT
        p.sku,
        li.current_stock,
        COALESCE(n.demand_30, 0) AS demand_30,
        p.supplier_lead_time_days
      FROM products p
      LEFT JOIN latest_inventory li ON li.sku = p.sku
      LEFT JOIN next_30 n ON n.sku = p.sku
      ORDER BY p.sku ASC
      `
    );
    const recommendations = rows.rows.map((r) => {
      const demand = Number(r.demand_30 || 0);
      const stock = Number(r.current_stock || 0);
      const recommendedOrderQuantity = Math.max(0, Math.ceil(demand * 1.2 - stock));
      return {
        sku: r.sku,
        currentStock: stock,
        predictedDemand30Days: demand,
        recommendedOrderQuantity,
        supplierLeadTimeDays: Number(r.supplier_lead_time_days || 7),
      };
    });
    return res.json(recommendations);
  } catch (error) {
    return next(error);
  }
});

router.get("/:sku", async (req, res, next) => {
  try {
    const sku = req.params.sku;
    const rows = await query(
      `
      SELECT forecast_date, predicted_sales, lower_bound, upper_bound, trend_direction, generated_at
      FROM forecasts
      WHERE sku = $1
      ORDER BY forecast_date ASC
      `,
      [sku]
    );
    if (!rows.rows.length) return res.status(404).json({ error: "No forecast available" });
    return res.json({
      sku,
      forecastPeriod: rows.rows.length,
      predictedDailySales: rows.rows.map((r) => Number(r.predicted_sales)),
      confidenceInterval: {
        lower: rows.rows.map((r) => Number(r.lower_bound)),
        upper: rows.rows.map((r) => Number(r.upper_bound)),
      },
      trendDirection: rows.rows[0].trend_direction,
      generatedAt: rows.rows[0].generated_at,
    });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
