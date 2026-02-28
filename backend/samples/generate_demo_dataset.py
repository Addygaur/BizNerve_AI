from __future__ import annotations

import csv
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


random.seed(42)


@dataclass
class Product:
    sku: str
    name: str
    category: str
    supplier_id: str
    cost_price: float
    selling_price: float
    lead_time_days: int


PRODUCTS = [
    Product("GRC-001", "Milk 1L", "Grocery", "SUP-G1", 38, 54, 2),
    Product("GRC-002", "Rice 5kg", "Grocery", "SUP-G2", 245, 320, 5),
    Product("GRC-003", "Eggs 12 Pack", "Grocery", "SUP-G3", 52, 78, 2),
    Product("GRC-004", "Potato Chips 150g", "Grocery", "SUP-G4", 18, 35, 4),  # velocity anomaly
    Product("CLT-001", "Basic Cotton T-Shirt", "Clothing", "SUP-C1", 140, 299, 7),
    Product("CLT-002", "Slim Fit Denim Jeans", "Clothing", "SUP-C2", 620, 1199, 10),  # stock-out risk
    Product("CLT-003", "Unisex Hoodie", "Clothing", "SUP-C3", 480, 899, 8),
    Product("CLT-004", "Ankle Socks (Pack of 3)", "Clothing", "SUP-C4", 55, 129, 6),
    Product("GRC-005", "Organic Honey 500g", "Grocery", "SUP-G5", 165, 299, 9),  # dead stock
    Product("CLT-005", "Kids Winter Jacket", "Clothing", "SUP-C5", 780, 1499, 12),
]


def weekday_multiplier(day: date) -> float:
    # Weekend uplift common in retail.
    return 1.25 if day.weekday() >= 5 else 1.0


def seasonal_qty(base: float, day: date, weekend_boost: float, noise: float = 0.15) -> int:
    mult = weekend_boost if day.weekday() >= 5 else 1.0
    raw = base * mult * (1 + random.uniform(-noise, noise))
    return max(1, round(raw))


def generate_sales_rows(start_day: date, days: int):
    rows = []
    tx_counter = 1
    end_day = start_day + timedelta(days=days - 1)

    for i in range(days):
        d = start_day + timedelta(days=i)
        day_idx = i + 1

        for p in PRODUCTS:
            qty = 0

            if p.sku == "GRC-001":
                qty = max(1, round(13 * weekday_multiplier(d) * (1 + random.uniform(-0.18, 0.18))))

            elif p.sku == "GRC-002":
                # Weekly seasonality SKU #1.
                qty = seasonal_qty(base=6.5, day=d, weekend_boost=1.9, noise=0.2)

            elif p.sku == "GRC-003":
                qty = max(1, round(8.5 * weekday_multiplier(d) * (1 + random.uniform(-0.2, 0.2))))

            elif p.sku == "GRC-004":
                # Velocity anomaly SKU: steady baseline then sharp surge in last 5 days.
                if d < end_day - timedelta(days=4):
                    qty = max(1, round(2.0 * (1 + random.uniform(-0.2, 0.2))))
                elif d < end_day:
                    # Four-day buildup.
                    ramp = [12, 13, 14, 15]
                    qty = ramp[(d - (end_day - timedelta(days=4))).days]
                else:
                    # Final-day extreme spike guarantees |z| > 2 for today's anomaly check.
                    qty = 60

            elif p.sku == "CLT-001":
                # Weekly seasonality SKU #2.
                qty = seasonal_qty(base=4.2, day=d, weekend_boost=2.1, noise=0.2)

            elif p.sku == "CLT-002":
                # Increasing trend SKU for stock-out risk.
                trend = 2.2 + (day_idx / days) * 5.2  # ~2 to ~7+ over 90 days
                qty = max(1, round(trend * (1 + random.uniform(-0.15, 0.15))))

            elif p.sku == "CLT-003":
                qty = max(1, round(2.8 * weekday_multiplier(d) * (1 + random.uniform(-0.2, 0.2))))

            elif p.sku == "CLT-004":
                qty = max(1, round(3.5 * (1 + random.uniform(-0.18, 0.18))))

            elif p.sku == "GRC-005":
                # Dead stock SKU: no sales in last 35 days.
                if d <= end_day - timedelta(days=35):
                    qty = max(1, round(1.8 * (1 + random.uniform(-0.2, 0.2))))
                else:
                    qty = 0

            elif p.sku == "CLT-005":
                # Weekly seasonality SKU #3.
                qty = seasonal_qty(base=1.8, day=d, weekend_boost=2.4, noise=0.22)

            if qty <= 0:
                continue

            channel = "offline" if random.random() < 0.7 else "online"
            tx_id = f"TX-{tx_counter:05d}"
            tx_counter += 1
            total = round(qty * p.selling_price, 2)

            rows.append(
                {
                    "transaction_id": tx_id,
                    "sku": p.sku,
                    "quantity": qty,
                    "unit_price": f"{p.selling_price:.2f}",
                    "total_amount": f"{total:.2f}",
                    "sale_date": d.isoformat(),
                    "channel": channel,
                }
            )
    return rows


def write_csv(path: Path, fieldnames: list[str], rows: list[dict]):
    with path.open("w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)


def main():
    root = Path(__file__).resolve().parent / "demo"
    root.mkdir(parents=True, exist_ok=True)

    today = date.today()
    start_day = today - timedelta(days=89)
    snapshot_day = today.isoformat()

    products_rows = [
        {
            "sku": p.sku,
            "name": p.name,
            "category": p.category,
            "supplier_id": p.supplier_id,
            "cost_price": f"{p.cost_price:.2f}",
            "selling_price": f"{p.selling_price:.2f}",
            "supplier_lead_time_days": p.lead_time_days,
        }
        for p in PRODUCTS
    ]

    # Inventory tuned to guarantee demo alerts.
    inventory_rows = [
        {"sku": "GRC-001", "current_stock": 520, "snapshot_date": snapshot_day},
        {"sku": "GRC-002", "current_stock": 220, "snapshot_date": snapshot_day},   # reorder recommendation (not stockout)
        {"sku": "GRC-003", "current_stock": 460, "snapshot_date": snapshot_day},
        {"sku": "GRC-004", "current_stock": 420, "snapshot_date": snapshot_day},   # anomaly SKU, avoid stockout
        {"sku": "CLT-001", "current_stock": 260, "snapshot_date": snapshot_day},
        {"sku": "CLT-002", "current_stock": 12, "snapshot_date": snapshot_day},    # stock-out risk
        {"sku": "CLT-003", "current_stock": 240, "snapshot_date": snapshot_day},
        {"sku": "CLT-004", "current_stock": 230, "snapshot_date": snapshot_day},
        {"sku": "GRC-005", "current_stock": 180, "snapshot_date": snapshot_day},   # dead stock value at risk
        {"sku": "CLT-005", "current_stock": 260, "snapshot_date": snapshot_day},
    ]

    sales_rows = generate_sales_rows(start_day, 90)

    write_csv(
        root / "products_demo.csv",
        [
            "sku",
            "name",
            "category",
            "supplier_id",
            "cost_price",
            "selling_price",
            "supplier_lead_time_days",
        ],
        products_rows,
    )
    write_csv(root / "inventory_demo.csv", ["sku", "current_stock", "snapshot_date"], inventory_rows)
    write_csv(
        root / "sales_demo_90d.csv",
        ["transaction_id", "sku", "quantity", "unit_price", "total_amount", "sale_date", "channel"],
        sales_rows,
    )

    print(f"Wrote dataset to: {root}")
    print(f"Sales rows: {len(sales_rows)} (90-day history, 10 SKUs)")


if __name__ == "__main__":
    main()
