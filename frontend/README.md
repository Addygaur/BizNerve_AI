# BizNerve AI — Frontend

React app for uploading CSVs, running analysis, and viewing priority alerts.

## Run locally

1. **Start the backend** (from repo root):

   ```bash
   cd backend && docker compose up -d
   ```

2. **Start the frontend** (from repo root):

   ```bash
   cd frontend && npm install && npm run dev
   ```

3. Open **http://localhost:5173**. The app proxies `/api` and `/health` to the backend at `http://localhost:8080`.

## Flow

1. **Upload** — Choose products, inventory, and sales CSV files. Required CSV formats are in `backend/README.md`.
2. **Run analysis** — Click “Run analysis”; the app polls until the job completes or fails.
3. **Alerts** — View top priority alerts (HIGH first, then MEDIUM/LOW by score). Optionally “Upload new data” to start again.

## Build

```bash
cd frontend && npm run build
```

Static output is in `frontend/dist/`. Serve it with any static host or point your backend at it. For production, set the API base URL (e.g. via `import.meta.env.VITE_API_BASE`) if the backend is not on the same origin.
