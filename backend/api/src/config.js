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
  /** Revenue projection alert only runs from this day of month onward (e.g. 10 = after 10th). */
  revenueAlertOnlyFromDay: Number(process.env.REVENUE_ALERT_ONLY_FROM_DAY || 10),
  /** Z-score threshold for inventory velocity alerts (only alert when |Z| > this). Default 2.5 = clearly unusual. */
  velocityZScoreThreshold: Number(process.env.VELOCITY_ZSCORE_THRESHOLD || 2.5),
  /** Margin erosion: alert only when margin drops by at least this many percentage points vs last month. */
  marginErosionMinDropPct: Number(process.env.MARGIN_EROSION_MIN_DROP_PCT || 10),
  /** Margin erosion: alert only when revenue growth is below this % (margin drop not compensated by growth). */
  marginErosionMaxRevenueGrowthPct: Number(process.env.MARGIN_EROSION_MAX_REVENUE_GROWTH_PCT || 5),
  /** Margin erosion alert only runs from this day of month onward (e.g. 25 = end-of-month only). */
  marginAlertOnlyFromDay: Number(process.env.MARGIN_ALERT_ONLY_FROM_DAY || 25),

  // Dead-stock: override to use static values (no dynamic logic)
  deadStockMinInventoryValue: process.env.DEAD_STOCK_MIN_INVENTORY_VALUE != null ? Number(process.env.DEAD_STOCK_MIN_INVENTORY_VALUE) : null,
  deadStockMaxAlerts: process.env.DEAD_STOCK_MAX_ALERTS != null ? Number(process.env.DEAD_STOCK_MAX_ALERTS) : null,
  // Guardrails when using dynamic logic
  deadStockMinValueFloor: Number(process.env.DEAD_STOCK_MIN_VALUE_FLOOR || 2000),
  deadStockMinValueCap: Number(process.env.DEAD_STOCK_MIN_VALUE_CAP || 25000),
  deadStockMaxAlertsCap: Number(process.env.DEAD_STOCK_MAX_ALERTS_CAP || 100),
  // Shop size tiers (by SKU count)
  shopSizeSmallMaxSkus: Number(process.env.SHOP_SIZE_SMALL_MAX_SKUS || 200),
  shopSizeMediumMaxSkus: Number(process.env.SHOP_SIZE_MEDIUM_MAX_SKUS || 2000),
  // Percentile of per-SKU inventory value for dynamic min (small/medium/large)
  deadStockPercentileSmall: Number(process.env.DEAD_STOCK_PERCENTILE_SMALL || 40),
  deadStockPercentileMedium: Number(process.env.DEAD_STOCK_PERCENTILE_MEDIUM || 60),
  deadStockPercentileLarge: Number(process.env.DEAD_STOCK_PERCENTILE_LARGE || 75),
  // Max dead-stock alerts to return per tier when dynamic
  deadStockMaxAlertsSmall: Number(process.env.DEAD_STOCK_MAX_ALERTS_SMALL || 20),
  deadStockMaxAlertsMedium: Number(process.env.DEAD_STOCK_MAX_ALERTS_MEDIUM || 50),
  deadStockMaxAlertsLarge: Number(process.env.DEAD_STOCK_MAX_ALERTS_LARGE || 100),
};

module.exports = { config };
