🧠 BizNerve AI

AI-powered retail risk monitoring system designed for small and medium retail businesses.

BizNerve AI helps shop owners:

🔮 Predict product demand 

📊 Detect mid-month revenue risk 

💰 Monitor monthly margin decline

💡 Take clear, actionable business decisions

Proposed architecture uses AWS cloud infrastructure and Prophet time-series forecasting.

📁 Documentation

requirements.md – Functional requirements & product scope

design.md – System design & architecture

[architecture/biznerve-ai-architecture-clean.png](architecture/biznerve-ai-architecture-clean.png) – AWS architecture diagram

**Run the app (local)**

- **Backend:** `cd backend && docker compose up -d` (API at http://localhost:8080)
- **Frontend:** `cd frontend && npm install && npm run dev` (UI at http://localhost:5173). Upload products/inventory/sales CSVs, run analysis, view priority alerts.

**Deploy to production (e.g. AWS)**

- The frontend talks to the backend via `/api` and `/health`. When the UI is served from a different origin than the API (e.g. frontend on port 4173, backend on 8080), set the backend URL at **build time** so the download and other API calls work:
  ```bash
  cd frontend && VITE_API_ORIGIN=http://YOUR_API_URL npm run build
  ```
  Example: if your backend is at `http://44.200.47.3:8080`, run `VITE_API_ORIGIN=http://44.200.47.3:8080 npm run build`, then serve the `dist` folder (e.g. with `npm run preview` or a static server). Ensure port 8080 is reachable from the browser (security group / firewall).
