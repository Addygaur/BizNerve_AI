# BizNerve Backend Prototype

This backend implements a practical 7-day MVP with:

- Node.js + Express API
- Python FastAPI Prophet forecasting service
- PostgreSQL storage
- DB-backed analysis job execution

## 1) Start with Docker

```bash
cd backend
cp .env.example .env
docker compose up --build
```

Services:

- API: `http://localhost:8080`
- AI: `http://localhost:8000`
- Postgres: `localhost:5432`

## 2) Key Endpoints

- `GET /health`
- `POST /api/data/products` (multipart form-data, `file`)
- `POST /api/data/inventory` (multipart form-data, `file`)
- `POST /api/data/sales` (multipart form-data, `file`)
- `POST /api/analyze/run`
- `GET /api/analyze/status/:jobId`
- `GET /api/forecast/:sku`
- `GET /api/forecast/reorder`
- `GET /api/alerts`
- `GET /api/alerts/priority` — returns `{ alerts, priority_explanation }`; each alert includes `product_name` when `sku` is set.

## 2b) How alert priority is decided

- **Order:** HIGH severity first, then MEDIUM, then LOW. Within the same severity, alerts are sorted by **priority score** (higher first).
- **Priority score** = `estimated_impact × (1 / urgency_days)`. So higher financial impact and sooner urgency produce a higher score. The API returns a short `priority_explanation` with this.

## 2c) Inventory velocity vs stock-out

- **Stock-out alert:** “You will run out in X days” — based on current stock and 30-day demand forecast. Tells you to reorder now.
- **Inventory velocity alert:** “Today’s demand is unusually high or low vs the last 30 days” (Z-score > 2). It’s a **leading signal**: you can adjust safety stock or next order size *before* it turns into a stock-out or overstock. So both are useful: velocity = early warning; stock-out = critical.

## 2d) When revenue vs margin alerts run (timeline)

- **Revenue projection alert:** Runs from the **10th of the month** onward. Each analysis uses revenue to date and forecasts to month-end; if the gap to target is ≥ 20%, an alert is created. So it can appear any time after the 10th when you run analysis.
- **Margin erosion alert:** Runs **only from a set day of month** (default **25th**) to end of month. It compares this month vs last month: gross margin and revenue growth. Alert only if margin drops by ≥ 10 percentage points *and* revenue did not grow by ≥ 5% (margin drop not compensated by growth). Message is business-intelligence style: e.g. "Gross margin declined from 28% to 17% this month while revenue increased only 2%. Review supplier pricing or optimize promotional strategy."

## 3) CSV Headers

### Products

`sku,name,category,supplier_id,cost_price,selling_price,supplier_lead_time_days`

### Inventory

`sku,current_stock,snapshot_date`

### Sales

`transaction_id,sku,quantity,unit_price,total_amount,sale_date,channel`

## 3b) Real-world data (different CSV format)

Real shops often use different column names and formats. Options:

- **Use our adapter script** to convert a public supermarket dataset into our format, then upload:
  ```bash
  cd backend && node scripts/adapt_supermarket_sales.js
  cd api && DEMO_DATASET=../samples/realworld node scripts/demo.js
  ```
- **See [docs/CSV_FORMAT_AND_REAL_DATA.md](docs/CSV_FORMAT_AND_REAL_DATA.md)** for our expected columns, how to handle format differences, and how to test with the Plotly Supermarket Sales dataset.

## 4) Example Flow

**Important:** Upload **products first**. Doing so clears all existing data (alerts, forecasts, sales, inventory, products) so that analysis uses only the dataset you upload in this run. Then upload inventory and sales for that catalog.

```bash
# 1) Upload products (this resets the DB to this dataset only)
curl -X POST http://localhost:8080/api/data/products \
  -F "file=@./samples/products.csv"

# 2) Upload inventory
curl -X POST http://localhost:8080/api/data/inventory \
  -F "file=@./samples/inventory.csv"

# 3) Upload sales
curl -X POST http://localhost:8080/api/data/sales \
  -F "file=@./samples/sales.csv"

# 4) Start analysis
curl -X POST http://localhost:8080/api/analyze/run

# 5) Fetch prioritized alerts
curl http://localhost:8080/api/alerts/priority
```

## 5) Local API-only dev

```bash
cd backend/api
npm install
npm run dev
```

Set `.env` in `backend/.env` with `DATABASE_URL` and `AI_SERVICE_URL`.

---

## 6) Where configs live (change as needed)

All business/alert configs are driven by **environment variables** and read in code from **`api/src/config.js`**. You can change them in any of these places:

| What to change | Env variable | Default | Where it's used |
|----------------|--------------|---------|------------------|
| **Monthly revenue target** (₹) | `MONTHLY_REVENUE_TARGET` | 1500000 | Revenue projection alert (gap vs target) |
| **Revenue alert timeline** | `REVENUE_ALERT_ONLY_FROM_DAY` | 10 | Revenue check runs only from this day of month (e.g. 10 = after 10th) |
| **Velocity Z-score threshold** | `VELOCITY_ZSCORE_THRESHOLD` | 2.5 | Inventory velocity alert only when \|Z\| > this (higher = fewer alerts) |
| **Margin erosion: min drop** | `MARGIN_EROSION_MIN_DROP_PCT` | 10 | Alert when margin drops ≥ this many percentage points vs last month |
| **Margin erosion: max revenue growth** | `MARGIN_EROSION_MAX_REVENUE_GROWTH_PCT` | 5 | Alert only when revenue growth is below this % (margin drop not compensated) |
| **Margin alert timeline** | `MARGIN_ALERT_ONLY_FROM_DAY` | 25 | Margin erosion check runs only from this day of month (e.g. 25 = end-of-month) |
| **Upload size limit (MB)** | `UPLOAD_LIMIT_MB` | 10 | Max CSV upload size |

**Where to set them:**

1. **`backend/.env`** – Copy from `backend/.env.example`, edit values. Used when you run the API (locally or via Docker).
2. **`backend/docker-compose.yml`** – The `api` service passes these env vars into the container (with defaults). Override by setting them in `.env` or when running: `REVENUE_ALERT_ONLY_FROM_DAY=5 docker compose up -d`.
3. **`backend/api/src/config.js`** – Source of truth: reads `process.env.*` and applies defaults. Change defaults here if you don’t use env.

So: **edit `.env`** (or pass env when starting) to change behaviour; **`config.js`** is where the app reads them.
