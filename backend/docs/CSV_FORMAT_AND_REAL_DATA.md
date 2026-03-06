# CSV Format and Real-World Data

## Our expected format (BizNerve)

Real shops and businesses often use different column names, date formats, and structures. This doc explains our format and what to do when yours does not match.

### Products

| Our column | Required | Description |
|------------|----------|-------------|
| `sku` | Yes | Unique product ID |
| `name` | Yes | Product name |
| `category` | Yes | Category (e.g. Electronics, Grocery) |
| `supplier_id` | No | Defaults to UNKNOWN |
| `cost_price` | Yes | Cost per unit (number) |
| `selling_price` | Yes | Selling price per unit (number) |
| `supplier_lead_time_days` | No | Defaults to 7 |

### Inventory

| Our column | Required | Description |
|------------|----------|-------------|
| `sku` | Yes | Must exist in products |
| `current_stock` | Yes | Integer ≥ 0 |
| `snapshot_date` | No | YYYY-MM-DD; defaults to today |

### Sales

| Our column | Required | Description |
|------------|----------|-------------|
| `transaction_id` | No | Unique per row; we generate if missing |
| `sku` | Yes | Must exist in products (or we create a minimal product) |
| `quantity` | Yes | Integer > 0 |
| `unit_price` | Yes | Price per unit (number) |
| `total_amount` | No | quantity × unit_price if missing |
| `sale_date` | Yes | Date (YYYY-MM-DD preferred) |
| `channel` | No | Defaults to "offline" |

---

## When your format is different

Real-time or exported data from a real shop may have:

- **Different column names** (e.g. `Product ID` instead of `sku`, `Invoice ID` instead of `transaction_id`)
- **Different date formats** (e.g. `1/5/2019`, `05-Jan-2019`, `2019-01-05`)
- **One big transactions file** with no separate products/inventory files
- **Extra columns** we don’t use (we ignore them)
- **Missing columns** (e.g. no cost_price; we may infer or use a default)

### Options

1. **Adapter script (recommended for testing)**  
   Use a small script that reads your CSV, maps columns, normalizes dates, and writes three files in our format. We provide an example that converts the [Plotly Supermarket Sales](https://raw.githubusercontent.com/plotly/datasets/master/supermarket_Sales.csv) dataset into our products, inventory, and sales CSVs. Run it once, then upload the generated files.

2. **Column mapping in your ETL**  
   In your own ETL or export job, map your columns to ours (e.g. `your_product_id` → `sku`, `your_date` → `sale_date` in YYYY-MM-DD) and output CSVs that match the tables above.

3. **Future API enhancement**  
   The API could later accept an optional column map (e.g. `{"sku": "Product ID", "sale_date": "Date"}`) so you upload your file as-is and we normalize on the server. For the current MVP, use an adapter script or ETL.

---

## Using real-world data: Plotly Supermarket dataset

We provide a script that fetches a public supermarket sales CSV and converts it to our format so you can test the project with real-style data.

```bash
cd backend
node scripts/adapt_supermarket_sales.js   # fetches CSV and writes samples/realworld/*.csv
```

This downloads the CSV (or uses a local copy if present), derives products and sales in our format, generates a synthetic inventory, and writes:

- `samples/realworld/products.csv`
- `samples/realworld/inventory.csv`
- `samples/realworld/sales.csv`

Then run the demo using that folder:

```bash
# From backend directory: start services
docker compose up -d

# From backend/api: run demo with real-world data
cd api && DEMO_DATASET=../samples/realworld node scripts/demo.js
```

Or upload manually:

```bash
curl -X POST http://localhost:8080/api/data/products   -F "file=@./samples/realworld/products.csv"
curl -X POST http://localhost:8080/api/data/inventory" -F "file=@./samples/realworld/inventory.csv"
curl -X POST http://localhost:8080/api/data/sales"     -F "file=@./samples/realworld/sales.csv"
curl -X POST http://localhost:8080/api/analyze/run
curl http://localhost:8080/api/alerts/priority
```

The source dataset has no SKU column; the adapter creates synthetic SKUs from product line and unit price so every transaction maps to a product.

**Note:** If you already ran the demo with the built-in dataset, the DB will contain both old and new data. For a clean test with only real-world data, reset the DB (e.g. `docker compose down -v && docker compose up -d`) before uploading the realworld CSVs.
