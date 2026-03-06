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

architecture/biznerve-ai-architecture-clean.png.png – AWS architecture diagram

**Run the app**

- **Backend:** `cd backend && docker compose up -d` (API at http://localhost:8080)
- **Frontend:** `cd frontend && npm install && npm run dev` (UI at http://localhost:5173). Upload products/inventory/sales CSVs, run analysis, view priority alerts.
