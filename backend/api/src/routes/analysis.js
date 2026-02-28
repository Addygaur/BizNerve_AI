const express = require("express");
const { enqueueAnalysisJob, getJobStatus } = require("../services/analysisService");

const router = express.Router();

router.post("/run", async (req, res, next) => {
  try {
    const result = await enqueueAnalysisJob("FULL_ANALYSIS");
    res.status(result.reused ? 200 : 202).json(result);
  } catch (error) {
    next(error);
  }
});

router.get("/status/:jobId", async (req, res, next) => {
  try {
    const job = await getJobStatus(req.params.jobId);
    if (!job) return res.status(404).json({ error: "Job not found" });
    return res.json(job);
  } catch (error) {
    return next(error);
  }
});

module.exports = router;
