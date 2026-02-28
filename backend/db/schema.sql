CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS products (
  sku VARCHAR(50) PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  category VARCHAR(100) NOT NULL,
  supplier_id VARCHAR(50),
  cost_price DECIMAL(10, 2) NOT NULL,
  selling_price DECIMAL(10, 2) NOT NULL,
  supplier_lead_time_days INTEGER DEFAULT 7,
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS inventory (
  sku VARCHAR(50) NOT NULL REFERENCES products(sku),
  current_stock INTEGER NOT NULL CHECK (current_stock >= 0),
  snapshot_date DATE NOT NULL,
  created_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (sku, snapshot_date)
);

CREATE TABLE IF NOT EXISTS sales (
  transaction_id VARCHAR(50) PRIMARY KEY,
  sku VARCHAR(50) NOT NULL REFERENCES products(sku),
  quantity INTEGER NOT NULL CHECK (quantity > 0),
  unit_price DECIMAL(10, 2) NOT NULL,
  total_amount DECIMAL(10, 2) NOT NULL,
  sale_date DATE NOT NULL,
  channel VARCHAR(50) DEFAULT 'offline',
  created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS forecasts (
  sku VARCHAR(50) NOT NULL REFERENCES products(sku),
  forecast_date DATE NOT NULL,
  predicted_sales DECIMAL(12, 2) NOT NULL,
  lower_bound DECIMAL(12, 2) NOT NULL,
  upper_bound DECIMAL(12, 2) NOT NULL,
  trend_direction VARCHAR(20) NOT NULL,
  generated_at TIMESTAMP DEFAULT NOW(),
  PRIMARY KEY (sku, forecast_date)
);

CREATE TABLE IF NOT EXISTS alerts (
  alert_id VARCHAR(50) PRIMARY KEY,
  alert_type VARCHAR(50) NOT NULL,
  severity VARCHAR(20) NOT NULL,
  sku VARCHAR(50),
  estimated_impact DECIMAL(12, 2) NOT NULL DEFAULT 0,
  urgency_days INTEGER NOT NULL DEFAULT 30,
  recommended_action TEXT NOT NULL,
  details JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMP DEFAULT NOW(),
  status VARCHAR(20) NOT NULL DEFAULT 'OPEN'
);

CREATE TABLE IF NOT EXISTS analysis_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  status VARCHAR(20) NOT NULL DEFAULT 'PENDING',
  type VARCHAR(50) NOT NULL DEFAULT 'FULL_ANALYSIS',
  attempts INTEGER NOT NULL DEFAULT 0,
  max_attempts INTEGER NOT NULL DEFAULT 2,
  started_at TIMESTAMP,
  finished_at TIMESTAMP,
  error TEXT,
  created_at TIMESTAMP DEFAULT NOW()
);
