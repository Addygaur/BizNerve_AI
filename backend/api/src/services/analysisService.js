const dayjs = require("dayjs");
const { randomUUID } = require("crypto");
const { query, withTransaction } = require("../db");
const { forecastBatch, forecastSeries } = require("./forecastClient");
const { mean, zScore, clampMin } = require("../utils/math");
const { config } = require("../config");

async function enqueueAnalysisJob(type = "FULL_ANALYSIS") {
  const existing = await query(
    "SELECT id FROM analysis_jobs WHERE status IN ('PENDING', 'RUNNING') ORDER BY created_at DESC LIMIT 1"
  );
  if (existing.rows.length) {
    return { jobId: existing.rows[0].id, reused: true };
  }

  const result = await query(
    "INSERT INTO analysis_jobs(type, status, attempts, max_attempts) VALUES ($1, 'PENDING', 0, 2) RETURNING id",
    [type]
  );
  return { jobId: result.rows[0].id, reused: false };
}

async function getJobStatus(jobId) {
  const result = await query(
    "SELECT id, status, attempts, error, started_at, finished_at, created_at FROM analysis_jobs WHERE id = $1",
    [jobId]
  );
  return result.rows[0] || null;
}

async function claimPendingJob() {
  return withTransaction(async (client) => {
    const pick = await client.query(
      "SELECT id, attempts, max_attempts FROM analysis_jobs WHERE status = 'PENDING' ORDER BY created_at ASC LIMIT 1 FOR UPDATE SKIP LOCKED"
    );
    if (!pick.rows.length) return null;
    const row = pick.rows[0];
    if (row.attempts >= row.max_attempts) {
      await client.query(
        "UPDATE analysis_jobs SET status = 'FAILED', error = 'Max attempts reached', finished_at = NOW() WHERE id = $1",
        [row.id]
      );
      return null;
    }
    await client.query(
      "UPDATE analysis_jobs SET status = 'RUNNING', attempts = attempts + 1, started_at = NOW(), error = NULL WHERE id = $1",
      [row.id]
    );
    return row.id;
  });
}

async function markJobCompleted(jobId) {
  await query(
    "UPDATE analysis_jobs SET status = 'COMPLETED', finished_at = NOW() WHERE id = $1",
    [jobId]
  );
}

async function markJobFailed(jobId, errorMessage) {
  const result = await query(
    "UPDATE analysis_jobs SET status = CASE WHEN attempts >= max_attempts THEN 'FAILED' ELSE 'PENDING' END, error = $2, finished_at = NOW() WHERE id = $1 RETURNING status",
    [jobId, String(errorMessage).slice(0, 1000)]
  );
  return result.rows[0]?.status;
}

function daterangeMap(rows, startDate, days, valueField) {
  const map = new Map(rows.map((row) => [dayjs(row.day).format("YYYY-MM-DD"), Number(row[valueField])]));
  const values = [];
  for (let i = 0; i < days; i += 1) {
    const day = dayjs(startDate).add(i, "day").format("YYYY-MM-DD");
    values.push(map.get(day) ?? 0);
  }
  return values;
}

async function collectSkuSeries(refDate) {
  const skuRows = await query("SELECT sku FROM products ORDER BY sku ASC");
  const startDate = refDate.subtract(90, "day").startOf("day");
  const endDate = refDate.endOf("day");
  const series = [];

  for (const row of skuRows.rows) {
    const sales = await query(
      `
      SELECT sale_date::date AS day, SUM(quantity)::float AS qty
      FROM sales
      WHERE sku = $1 AND sale_date BETWEEN $2 AND $3
      GROUP BY sale_date::date
      ORDER BY day ASC
      `,
      [row.sku, startDate.format("YYYY-MM-DD"), endDate.format("YYYY-MM-DD")]
    );
    const values = daterangeMap(sales.rows, startDate, 91, "qty");
    series.push({ sku: row.sku, values });
  }
  return series;
}

async function persistForecasts(forecasts, refDate) {
  for (const item of forecasts) {
    for (let i = 0; i < item.predictions.length; i += 1) {
      const date = refDate.add(i + 1, "day").format("YYYY-MM-DD");
      await query(
        `
        INSERT INTO forecasts (sku, forecast_date, predicted_sales, lower_bound, upper_bound, trend_direction, generated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW())
        ON CONFLICT (sku, forecast_date)
        DO UPDATE SET
          predicted_sales = EXCLUDED.predicted_sales,
          lower_bound = EXCLUDED.lower_bound,
          upper_bound = EXCLUDED.upper_bound,
          trend_direction = EXCLUDED.trend_direction,
          generated_at = NOW()
        `,
        [
          item.sku,
          date,
          Number(item.predictions[i] || 0).toFixed(2),
          Number(item.lower[i] || 0).toFixed(2),
          Number(item.upper[i] || 0).toFixed(2),
          item.trendDirection || "STABLE",
        ]
      );
    }
  }
}

function getSeverityFromDays(daysUntilStockOut) {
  if (daysUntilStockOut <= 7) return "HIGH";
  if (daysUntilStockOut <= 14) return "MEDIUM";
  return "LOW";
}

/** Percentile of sorted ascending array (p 0–100). */
function percentile(sortedArr, p) {
  if (!sortedArr.length) return 0;
  const idx = (p / 100) * (sortedArr.length - 1);
  const i = Math.floor(idx);
  const frac = idx - i;
  if (i >= sortedArr.length - 1) return sortedArr[sortedArr.length - 1];
  return sortedArr[i] + frac * (sortedArr[i + 1] - sortedArr[i]);
}

function getShopSizeTier(numSkus) {
  if (numSkus < config.shopSizeSmallMaxSkus) return "small";
  if (numSkus < config.shopSizeMediumMaxSkus) return "medium";
  return "large";
}

function formatCurrency(value) {
  return Number(value || 0).toFixed(2);
}

function formatRupeesShort(value) {
  const n = Number(value || 0);
  if (!Number.isFinite(n)) return String(value);
  const abs = Math.abs(n);
  if (abs >= 100000) {
    return `₹${(n / 100000).toFixed(1)} lakh`;
  }
  if (abs >= 1000) {
    return `₹${(n / 1000).toFixed(1)}k`;
  }
  return `₹${n.toFixed(0)}`;
}

async function createAlert({
  type,
  severity,
  sku = null,
  estimatedImpact = 0,
  urgencyDays = 30,
  action,
  details = {},
}) {
  await query(
    `
    INSERT INTO alerts(alert_id, alert_type, severity, sku, estimated_impact, urgency_days, recommended_action, details, status)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, 'OPEN')
    `,
    [
      randomUUID(),
      type,
      severity,
      sku,
      estimatedImpact,
      clampMin(urgencyDays, 1),
      action,
      JSON.stringify(details),
    ]
  );
}

async function runInventoryRiskAnalysis(forecasts, refDate) {
  const reorderCandidates = [];

  // Dead-stock dynamic threshold: get per-SKU inventory values and shop size
  const invSnapshot = await query(
    `
    WITH latest_inv AS (
      SELECT DISTINCT ON (sku) sku, current_stock, snapshot_date
      FROM inventory
      ORDER BY sku, snapshot_date DESC
    )
    SELECT l.sku, l.current_stock, p.cost_price,
           (l.current_stock * p.cost_price)::float AS inv_value
    FROM latest_inv l
    JOIN products p ON p.sku = l.sku
    `
  );
  const inventoryValues = invSnapshot.rows.map((r) => Number(r.inv_value) || 0).filter((v) => v >= 0);
  const numSkus = inventoryValues.length;
  const totalInventoryValue = inventoryValues.reduce((s, v) => s + v, 0);
  const shopSizeTier = getShopSizeTier(numSkus);

  let effectiveDeadStockMinValue;
  if (config.deadStockMinInventoryValue != null && Number.isFinite(config.deadStockMinInventoryValue)) {
    effectiveDeadStockMinValue = config.deadStockMinInventoryValue;
  } else {
    const sorted = [...inventoryValues].sort((a, b) => a - b);
    const pct =
      shopSizeTier === "small"
        ? config.deadStockPercentileSmall
        : shopSizeTier === "medium"
          ? config.deadStockPercentileMedium
          : config.deadStockPercentileLarge;
    const raw = percentile(sorted, pct);
    effectiveDeadStockMinValue = Math.max(
      config.deadStockMinValueFloor,
      Math.min(config.deadStockMinValueCap, raw)
    );
  }

  for (const item of forecasts) {
    const inv = await query(
      "SELECT current_stock FROM inventory WHERE sku = $1 ORDER BY snapshot_date DESC LIMIT 1",
      [item.sku]
    );
    const product = await query(
      "SELECT supplier_lead_time_days, cost_price FROM products WHERE sku = $1 LIMIT 1",
      [item.sku]
    );
    if (!inv.rows.length || !product.rows.length) continue;
    const currentStock = Number(inv.rows[0].current_stock);
    const costPrice = Number(product.rows[0].cost_price);
    const leadTime = Number(product.rows[0].supplier_lead_time_days || 7);

    let stockLeft = currentStock;
    let daysUntilStockOut = 999;
    for (let i = 0; i < item.predictions.length; i += 1) {
      stockLeft -= Number(item.predictions[i] || 0);
      if (stockLeft <= 0) {
        daysUntilStockOut = i + 1;
        break;
      }
    }

    const demand30 = item.predictions.reduce((sum, value) => sum + Number(value || 0), 0);
    const recommendedQty = Math.max(0, Math.ceil(demand30 * 1.2 - currentStock));
    const severity = getSeverityFromDays(daysUntilStockOut);
    if (severity !== "LOW") {
      const potentialLoss = Math.max(0, demand30 - currentStock) * costPrice;
      const reorderByDays = Math.max(1, daysUntilStockOut - leadTime);
      await createAlert({
        type: "INVENTORY_STOCK_OUT",
        severity,
        sku: item.sku,
        estimatedImpact: potentialLoss,
        urgencyDays: daysUntilStockOut,
        action: `Stock is projected to run out in ${daysUntilStockOut} day(s). Place an order for ${recommendedQty} units within ${reorderByDays} day(s) to protect approximately ${formatRupeesShort(
          potentialLoss
        )} in potential lost sales.`,
        details: { currentStock, predictedDemand30: demand30, daysUntilStockOut, recommendedQty },
      });
    } else if (recommendedQty > 0) {
      reorderCandidates.push({
        sku: item.sku,
        currentStock,
        demand30,
        recommendedQty,
        leadTime,
        costPrice,
      });
    }

    const dead = await query(
      `
      SELECT MAX(sale_date) AS last_sale_date
      FROM sales
      WHERE sku = $1
      `,
      [item.sku]
    );
    const lastSale = dead.rows[0]?.last_sale_date;
    const daysSinceLastSale = lastSale ? refDate.diff(dayjs(lastSale), "day") : 999;
    if (daysSinceLastSale >= 30) {
      const inventoryValue = currentStock * costPrice;
      if (inventoryValue >= effectiveDeadStockMinValue) {
        const futureDemand = demand30;
        const outlook = futureDemand > 0 ? "SEASONAL_SLOW" : "DEAD";
        await createAlert({
          type: "INVENTORY_DEAD_STOCK",
          severity: outlook === "DEAD" ? "HIGH" : "MEDIUM",
          sku: item.sku,
          estimatedImpact: inventoryValue,
          urgencyDays: 20,
          action:
            outlook === "DEAD"
              ? `This SKU has had no sales for ${daysSinceLastSale} days and is tying up working capital. Launch a 10-15% clearance campaign this week.`
              : `Sales are temporarily slow. Run a focused in-store and online promotion over the next 7 days to avoid excess holding costs.`,
          details: { daysSinceLastSale, outlook, currentStock },
        });
      }
    }

    const velocityRows = await query(
      `
      SELECT sale_date::date AS day, SUM(quantity)::float AS qty
      FROM sales
      WHERE sku = $1 AND sale_date BETWEEN $2 AND $3
      GROUP BY sale_date::date
      ORDER BY day ASC
      `,
      [
        item.sku,
        refDate.subtract(31, "day").format("YYYY-MM-DD"),
        refDate.format("YYYY-MM-DD"),
      ]
    );
    const values = daterangeMap(velocityRows.rows, refDate.subtract(31, "day"), 32, "qty");
    const baseline = values.slice(0, 31);
    const todayValue = values[31];
    const score = zScore(todayValue, baseline);
    if (Math.abs(score) > config.velocityZScoreThreshold) {
      const anomalyType = score > 0 ? "SPIKE" : "DROP";
      await createAlert({
        type: "INVENTORY_VELOCITY",
        severity: "MEDIUM",
        sku: item.sku,
        estimatedImpact: Math.abs(todayValue - mean(baseline)) * costPrice,
        urgencyDays: 10,
        action:
          anomalyType === "SPIKE"
            ? `Demand spiked sharply versus normal velocity (Z-score ${score.toFixed(
                2
              )}). Increase safety stock and shelf allocation for the next 7-10 days to avoid missed sales.`
            : `Demand dropped below expected velocity (Z-score ${score.toFixed(
                2
              )}). Reduce replenishment volume for the next cycle to prevent overstock.`,
        details: { zScore: score, anomalyType, expected: mean(baseline), actual: todayValue },
      });
    }
  }

  // Keep demo output focused: one strong proactive reorder recommendation.
  if (reorderCandidates.length) {
    reorderCandidates.sort((a, b) => b.recommendedQty - a.recommendedQty);
    const best = reorderCandidates[0];
    await createAlert({
      type: "REORDER_RECOMMENDATION",
      severity: "LOW",
      sku: best.sku,
      estimatedImpact: best.recommendedQty * best.costPrice,
      urgencyDays: Math.max(3, best.leadTime),
      action: `Demand is healthy and inventory cover is tightening. Plan a proactive reorder of ${best.recommendedQty} units within ${best.leadTime} day(s) to maintain service levels and protect revenue continuity.`,
      details: {
        currentStock: best.currentStock,
        predictedDemand30: best.demand30,
        recommendedQty: best.recommendedQty,
      },
    });
  }
}

async function runRevenueProjection(refDate) {
  const today = refDate;
  if (today.date() < config.revenueAlertOnlyFromDay) return;
  const startOfMonth = today.startOf("month");
  const endOfMonth = today.endOf("month");
  const daysInMonth = endOfMonth.date();
  const daysSoFar = today.date();
  const remainingDays = daysInMonth - daysSoFar;

  const daily = await query(
    `
    SELECT sale_date::date AS day, SUM(total_amount)::float AS revenue
    FROM sales
    WHERE sale_date BETWEEN $1 AND $2
    GROUP BY sale_date::date
    ORDER BY day ASC
    `,
    [startOfMonth.format("YYYY-MM-DD"), today.format("YYYY-MM-DD")]
  );
  const series = daterangeMap(daily.rows, startOfMonth, daysSoFar, "revenue");
  if (!series.length) return;
  const actualToDate = series.reduce((sum, value) => sum + value, 0);
  let projected = actualToDate;
  if (remainingDays > 0) {
    const forecast = await forecastSeries(series, remainingDays);
    projected = actualToDate + forecast.predictions.reduce((sum, value) => sum + value, 0);
  }

  const gapPct =
    projected < config.monthlyRevenueTarget
      ? ((config.monthlyRevenueTarget - projected) / config.monthlyRevenueTarget) * 100
      : 0;

  if (gapPct < 20) return;

  const severity = gapPct >= 30 ? "HIGH" : "MEDIUM";

  const categoryCurrent = await query(
    `
    SELECT p.category, SUM(s.total_amount)::float AS revenue
    FROM sales s
    JOIN products p ON p.sku = s.sku
    WHERE s.sale_date BETWEEN $1 AND $2
    GROUP BY p.category
    ORDER BY revenue ASC
    LIMIT 3
    `,
    [startOfMonth.format("YYYY-MM-DD"), today.format("YYYY-MM-DD")]
  );
  const droppingSkus = await query(
    `
    SELECT sku, SUM(total_amount)::float AS revenue
    FROM sales
    WHERE sale_date BETWEEN $1 AND $2
    GROUP BY sku
    ORDER BY revenue ASC
    LIMIT 5
    `,
    [startOfMonth.format("YYYY-MM-DD"), today.format("YYYY-MM-DD")]
  );

  const underCategories = categoryCurrent.rows.map((row) => row.category);
  const promoSkusRaw = underCategories.length
    ? await query(
        `
        SELECT p.category, s.sku, SUM(s.total_amount)::float AS revenue
        FROM sales s
        JOIN products p ON p.sku = s.sku
        WHERE s.sale_date BETWEEN $1 AND $2 AND p.category = ANY($3)
        GROUP BY p.category, s.sku
        ORDER BY p.category ASC, revenue DESC
        `,
        [startOfMonth.format("YYYY-MM-DD"), today.format("YYYY-MM-DD"), underCategories]
      )
    : { rows: [] };

  const promoByCategory = {};
  for (const row of promoSkusRaw.rows) {
    if (!promoByCategory[row.category]) promoByCategory[row.category] = [];
    if (promoByCategory[row.category].length < 3) {
      promoByCategory[row.category].push(row.sku);
    }
  }

  const categoryNamesList = underCategories.slice(0, 2);
  const promoSkusList = categoryNamesList.flatMap((cat) => promoByCategory[cat] || []).slice(0, 3);
  const slowMoverSkus = droppingSkus.rows.map((row) => row.sku).slice(0, 3);
  const allSkusForNames = [...new Set([...promoSkusList, ...slowMoverSkus])];
  const nameRows =
    allSkusForNames.length > 0
      ? await query(
          "SELECT sku, name FROM products WHERE sku = ANY($1)",
          [allSkusForNames]
        )
      : { rows: [] };
  const skuToName = new Map(nameRows.rows.map((r) => [r.sku, r.name]));

  const categoryPhrase =
    categoryNamesList.length >= 2
      ? `${categoryNamesList[0]} and ${categoryNamesList[1]}`
      : categoryNamesList[0] || "key categories";
  const promoExamples = promoSkusList
    .map((sku) => `${skuToName.get(sku) || sku} (${sku})`)
    .join(", ");
  const slowMoverExamples = slowMoverSkus
    .map((sku) => `${skuToName.get(sku) || sku} (${sku})`)
    .join(", ");

  await createAlert({
    type: "REVENUE_PROJECTION",
    severity,
    estimatedImpact: config.monthlyRevenueTarget - projected,
    urgencyDays: daysInMonth - today.date(),
    action: `Projected revenue is ${gapPct.toFixed(
      1
    )}% below target. ${categoryPhrase} are underperforming. Promote top 3 SKUs in these categories${
      promoExamples ? ` (for example: ${promoExamples})` : ""
    } and run a 10-15% short-term discount campaign to recover the gap before month-end.${
      slowMoverExamples ? ` If you need quick wins, discount slow-movers like ${slowMoverExamples}.` : ""
    }`,
    details: {
      actualDaysToDate: daysSoFar,
      actualRevenueToDate: actualToDate,
      projectedMonthEndRevenue: projected,
      monthlyTarget: config.monthlyRevenueTarget,
      gapPct,
      underperformingCategories: categoryCurrent.rows,
      promotionCandidatesByCategory: promoByCategory,
      droppingSkus: droppingSkus.rows,
    },
  });
}

async function runMarginErosion(refDate) {
  const today = refDate;
  if (today.date() < config.marginAlertOnlyFromDay) return;

  const startThisMonth = today.startOf("month");
  const startLastMonth = today.subtract(1, "month").startOf("month");
  const endLastMonth = today.subtract(1, "month").endOf("month");

  const thisMonth = await query(
    `
    SELECT
      COALESCE(SUM(s.total_amount), 0)::float AS revenue,
      COALESCE(SUM(s.quantity * p.cost_price), 0)::float AS cost
    FROM sales s
    JOIN products p ON p.sku = s.sku
    WHERE s.sale_date BETWEEN $1 AND $2
    `,
    [startThisMonth.format("YYYY-MM-DD"), today.format("YYYY-MM-DD")]
  );
  const lastMonth = await query(
    `
    SELECT
      COALESCE(SUM(s.total_amount), 0)::float AS revenue,
      COALESCE(SUM(s.quantity * p.cost_price), 0)::float AS cost
    FROM sales s
    JOIN products p ON p.sku = s.sku
    WHERE s.sale_date BETWEEN $1 AND $2
    `,
    [startLastMonth.format("YYYY-MM-DD"), endLastMonth.format("YYYY-MM-DD")]
  );

  const revThis = Number(thisMonth.rows[0]?.revenue ?? 0);
  const costThis = Number(thisMonth.rows[0]?.cost ?? 0);
  const revLast = Number(lastMonth.rows[0]?.revenue ?? 0);
  const costLast = Number(lastMonth.rows[0]?.cost ?? 0);

  if (revThis <= 0 || revLast <= 0) return;

  const marginThisPct = ((revThis - costThis) / revThis) * 100;
  const marginLastPct = ((revLast - costLast) / revLast) * 100;
  const marginDropPpt = marginLastPct - marginThisPct;
  const revenueGrowthPct = ((revThis - revLast) / revLast) * 100;

  if (
    marginDropPpt < config.marginErosionMinDropPct ||
    revenueGrowthPct >= config.marginErosionMaxRevenueGrowthPct
  ) {
    return;
  }

  const estimatedImpact = (marginDropPpt / 100) * revThis;
  const severity = marginDropPpt >= 15 ? "HIGH" : "MEDIUM";
  const revenuePhrase =
    revenueGrowthPct >= 0
      ? `revenue increased only ${revenueGrowthPct.toFixed(1)}%`
      : `revenue decreased ${Math.abs(revenueGrowthPct).toFixed(1)}%`;
  const action =
    `Gross margin declined from ${marginLastPct.toFixed(0)}% to ${marginThisPct.toFixed(0)}% this month while ${revenuePhrase}. ` +
    "This suggests cost pressure or ineffective discounting. Review supplier pricing or optimize promotional strategy.";

  await createAlert({
    type: "MARGIN_EROSION",
    severity,
    sku: null,
    estimatedImpact,
    urgencyDays: 7,
    action,
    details: {
      marginThisPct,
      marginLastPct,
      marginDropPpt,
      revenueGrowthPct,
      revenueThisMonth: revThis,
      revenueLastMonth: revLast,
    },
  });
}

async function runAnalysisCore() {
  await query("DELETE FROM alerts WHERE status = 'OPEN'");

  const refResult = await query("SELECT MAX(sale_date)::date AS ref FROM sales");
  const refDate = refResult.rows[0]?.ref
    ? dayjs(refResult.rows[0].ref)
    : dayjs();

  const skuSeries = await collectSkuSeries(refDate);
  if (!skuSeries.length) return;

  const forecastResponse = await forecastBatch(skuSeries, 30);
  const forecasts = forecastResponse.results || [];
  await persistForecasts(forecasts, refDate);
  await runInventoryRiskAnalysis(forecasts, refDate);
  await runRevenueProjection(refDate);
  await runMarginErosion(refDate);
}

async function runOnePendingJob() {
  const jobId = await claimPendingJob();
  if (!jobId) return null;
  try {
    await runAnalysisCore();
    await markJobCompleted(jobId);
  } catch (error) {
    await markJobFailed(jobId, error.message || "Unknown analysis error");
  }
  return jobId;
}

module.exports = {
  enqueueAnalysisJob,
  getJobStatus,
  runOnePendingJob,
};
