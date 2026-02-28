const express = require("express");
const dataRoutes = require("./routes/data");
const analysisRoutes = require("./routes/analysis");
const forecastRoutes = require("./routes/forecast");
const alertsRoutes = require("./routes/alerts");
const healthRoutes = require("./routes/health");

const app = express();

app.use(express.json({ limit: "1mb" }));

app.use("/health", healthRoutes);
app.use("/api/data", dataRoutes);
app.use("/api/analyze", analysisRoutes);
app.use("/api/forecast", forecastRoutes);
app.use("/api/alerts", alertsRoutes);

app.use((err, req, res, next) => {
  const message = err.message || "Unexpected error";
  res.status(500).json({ error: message });
});

module.exports = { app };
