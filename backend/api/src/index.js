const { app } = require("./app");
const { config } = require("./config");
const { runOnePendingJob } = require("./services/analysisService");

app.listen(config.port, () => {
  // eslint-disable-next-line no-console
  console.log(`API listening on port ${config.port}`);
});

setInterval(async () => {
  try {
    await runOnePendingJob();
  } catch (error) {
    // eslint-disable-next-line no-console
    console.error("Worker loop error:", error.message);
  }
}, 5000);
