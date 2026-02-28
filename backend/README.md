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
- `GET /api/alerts/priority`

## 3) CSV Headers

### Products

`sku,name,category,supplier_id,cost_price,selling_price,supplier_lead_time_days`

### Inventory

`sku,current_stock,snapshot_date`

### Sales

`transaction_id,sku,quantity,unit_price,total_amount,sale_date,channel`

## 4) Example Flow

```bash
# 1) Upload products
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
