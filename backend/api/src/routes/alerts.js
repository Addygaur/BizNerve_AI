const express = require("express");
const { query } = require("../db");
const { config } = require("../config");

const router = express.Router();

function getShopSizeTier(numSkus) {
  if (numSkus < config.shopSizeSmallMaxSkus) return "small";
  if (numSkus < config.shopSizeMediumMaxSkus) return "medium";
  return "large";
}

function getDeadStockMaxAlerts(numSkus) {
  if (config.deadStockMaxAlerts != null && Number.isFinite(config.deadStockMaxAlerts)) {
    return config.deadStockMaxAlerts;
  }
  const tier = getShopSizeTier(numSkus);
  const cap =
    tier === "small"
      ? config.deadStockMaxAlertsSmall
      : tier === "medium"
        ? config.deadStockMaxAlertsMedium
        : config.deadStockMaxAlertsLarge;
  return Math.min(cap, config.deadStockMaxAlertsCap);
}

/** Returns alerts with dead-stock capped to top N by estimated_impact. */
function applyDeadStockCap(alerts, numSkus) {
  const dead = alerts.filter((r) => r.alert_type === "INVENTORY_DEAD_STOCK");
  const other = alerts.filter((r) => r.alert_type !== "INVENTORY_DEAD_STOCK");
  const n = getDeadStockMaxAlerts(numSkus);
  const topDead = [...dead].sort((a, b) => (Number(b.estimated_impact) || 0) - (Number(a.estimated_impact) || 0)).slice(0, n);
  return [...other, ...topDead];
}

router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT
        a.alert_id, a.alert_type, a.severity, a.sku,
        p.name AS product_name,
        a.estimated_impact, a.urgency_days, a.recommended_action, a.details, a.created_at, a.status
      FROM alerts a
      LEFT JOIN products p ON p.sku = a.sku
      ORDER BY created_at DESC
      `
    );
    const countResult = await query("SELECT COUNT(*)::int AS n FROM products");
    const numSkus = countResult.rows[0]?.n ?? 0;
    const capped = applyDeadStockCap(result.rows, numSkus);
    capped.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    return res.json(capped);
  } catch (error) {
    return next(error);
  }
});

router.get("/priority", async (req, res, next) => {
  try {
    const result = await query(
      `
      WITH scored AS (
        SELECT
          a.alert_id, a.alert_type, a.severity, a.sku,
          p.name AS product_name,
          a.estimated_impact, a.urgency_days, a.recommended_action, a.details, a.created_at,
          (a.estimated_impact * (1.0 / GREATEST(a.urgency_days, 1))) AS priority_score,
          CASE a.severity WHEN 'HIGH' THEN 1 WHEN 'MEDIUM' THEN 2 WHEN 'LOW' THEN 3 ELSE 4 END AS severity_order
        FROM alerts a
        LEFT JOIN products p ON p.sku = a.sku
      )
      SELECT alert_id, alert_type, severity, sku, product_name, estimated_impact, urgency_days,
             recommended_action, details, created_at, priority_score, severity_order
      FROM scored
      ORDER BY severity_order ASC, priority_score DESC, created_at DESC
      `
    );
    const countResult = await query("SELECT COUNT(*)::int AS n FROM products");
    const numSkus = countResult.rows[0]?.n ?? 0;
    const all = applyDeadStockCap(result.rows, numSkus);
    all.sort((a, b) => {
      if (a.severity_order !== b.severity_order) return a.severity_order - b.severity_order;
      return (b.priority_score || 0) - (a.priority_score || 0);
    });
    const high = all.filter((r) => r.severity === "HIGH");
    const rest = all.filter((r) => r.severity !== "HIGH");
    const need = Math.max(0, 5 - high.length);
    const rows = need === 0 ? high : [...high, ...rest.slice(0, need)];

    const explanation =
      "Priority: all HIGH alerts first; if fewer than 5 HIGH, top MEDIUM/LOW by score fill up to 5 total. Score = estimated_impact × (1 / urgency_days).";
    return res.json({ alerts: rows, priority_explanation: explanation });
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
