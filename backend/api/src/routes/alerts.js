const express = require("express");
const { query } = require("../db");

const router = express.Router();

router.get("/", async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT alert_id, alert_type, severity, sku, estimated_impact, urgency_days, recommended_action, details, created_at, status
      FROM alerts
      ORDER BY created_at DESC
      `
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

router.get("/priority", async (req, res, next) => {
  try {
    const result = await query(
      `
      SELECT
        alert_id,
        alert_type,
        severity,
        sku,
        estimated_impact,
        urgency_days,
        recommended_action,
        details,
        created_at,
        (estimated_impact * (1.0 / GREATEST(urgency_days, 1))) AS priority_score
      FROM alerts
      ORDER BY priority_score DESC, created_at DESC
      LIMIT 5
      `
    );
    return res.json(result.rows);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
