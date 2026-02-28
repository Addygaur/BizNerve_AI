const path = require("path");
const dotenv = require("dotenv");

dotenv.config({ path: path.resolve(__dirname, "../../.env") });

const config = {
  nodeEnv: process.env.NODE_ENV || "development",
  port: Number(process.env.API_PORT || 8080),
  aiServiceUrl: process.env.AI_SERVICE_URL || "http://localhost:8000",
  dbUrl:
    process.env.DATABASE_URL ||
    "postgresql://postgres:postgres@localhost:5432/biznerve",
  uploadLimitMb: Number(process.env.UPLOAD_LIMIT_MB || 10),
  monthlyRevenueTarget: Number(process.env.MONTHLY_REVENUE_TARGET || 1500000),
};

module.exports = { config };
