const express = require("express");
const { query } = require("../db");
const { getHealth } = require("../services/forecastClient");

const router = express.Router();

router.get("/", async (req, res) => {
  const status = {
    api: "ok",
    db: "unknown",
    ai: "unknown",
    timestamp: new Date().toISOString(),
  };

  try {
    await query("SELECT 1");
    status.db = "ok";
  } catch (error) {
    status.db = "error";
  }

  try {
    const ai = await getHealth();
    status.ai = ai.status || "ok";
  } catch (error) {
    status.ai = "error";
  }

  const code = status.db === "ok" && status.ai !== "error" ? 200 : 503;
  res.status(code).json(status);
});

module.exports = router;
