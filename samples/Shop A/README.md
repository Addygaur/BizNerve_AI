# samples2 — UK Online Retail (IBM) dataset

This folder contains a **real-world SMB-style dataset** derived from the [IBM Online Retail Sample](https://github.com/IBM/customer_pos_analytics/blob/master/data/Online%20Retail%20Sample.csv) (UK-based online gift-ware transactions).

## Source

- **Raw file:** `online_retail_raw.csv`  
- **Origin:** IBM Customer POS Analytics — [Online Retail Sample](https://raw.githubusercontent.com/IBM/customer_pos_analytics/master/data/Online%20Retail%20Sample.csv)  
- **Format:** InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice, CustomerID, Country  

This is a different domain from the Plotly Supermarket Sales data in `samples/realworld` (in-store supermarket vs online gift-ware).

## Files

| File | Description |
|------|-------------|
| `online_retail_raw.csv` | Original transaction-level export (IBM Online Retail columns) |
| `products.csv` | BizNerve products (sku = StockCode, name = Description, category = Giftware, cost/selling_price, supplier_lead_time_days) |
| `inventory.csv` | BizNerve inventory (sku, current_stock, snapshot_date) — estimated from sales |
| `sales.csv` | BizNerve sales (transaction_id, sku, quantity, unit_price, total_amount, sale_date, channel = online) |

## Regenerating the three CSVs

From the project root:

```bash
cd backend && node scripts/export_samples2.js
```

The script reads `samples2/online_retail_raw.csv`, uses the API’s `segregateCsv` (format `online_retail`), and overwrites `products.csv`, `inventory.csv`, and `sales.csv`.

## Using in the app

1. Start the backend and frontend (see main README).
2. In the UI, upload **Products** → **Inventory** → **Sales** using `samples2/products.csv`, `samples2/inventory.csv`, and `samples2/sales.csv`.
3. Run analysis to see alerts and financial impact.
