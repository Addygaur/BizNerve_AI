/**
 * Analyzes a single CSV (e.g. real-world sales export) and segregates it into
 * products, inventory, and sales in BizNerve format.
 * Supports: supermarket-style (Product line, Unit price, Quantity, Date, Total, etc.)
 * and similar transaction-level CSVs.
 */

function normalizeKey(str) {
  return String(str || "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ")
    .replace(/\s/g, "_");
}

function getHeaderMap(row) {
  const map = new Map();
  for (const key of Object.keys(row)) {
    map.set(normalizeKey(key), key);
  }
  return map;
}

function slug(str) {
  return String(str)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9-]/g, "");
}

function parseDate(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  // Try ISO first
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // m/d/y or d/m/y
  const parts = s.split(/[/\-.]/).map((x) => parseInt(x, 10));
  if (parts.length >= 3) {
    let y = parts.find((p) => p > 31);
    const rest = parts.filter((p) => p !== y);
    if (y != null && rest.length >= 2) {
      const year = y < 100 ? 2000 + y : y;
      const month = String(rest[0]).padStart(2, "0");
      const day = String(rest[1]).padStart(2, "0");
      return `${year}-${month}-${day}`;
    }
  }
  return null;
}

/**
 * Detect format and segregate rows into { products, inventory, sales }.
 * @param {Array<Object>} rows - Parsed CSV rows (objects with column names as keys)
 * @returns {{ format: string, products: Array<Object>, inventory: Array<Object>, sales: Array<Object>, errors: string[] }}
 */
function segregate(rows) {
  const errors = [];
  if (!rows || rows.length === 0) {
    return { format: "unknown", products: [], inventory: [], sales: [], errors: ["No rows in file"] };
  }

  const first = rows[0];
  const h = getHeaderMap(first);

  // Supermarket-style: Product line, Unit price, Quantity, Date, Total, Cost of goods sold, Invoice ID
  const productLineCol = h.get("product_line") || h.get("productline") || "Product line";
  const unitPriceCol = h.get("unit_price") || h.get("unitprice") || "Unit price";
  const quantityCol = h.get("quantity") || h.get("qty") || "Quantity";
  const dateCol = h.get("date") || h.get("sale_date") || h.get("saledate") || "Date";
  const totalCol = h.get("total") || h.get("total_amount") || "Total";
  const costCol = h.get("cost_of_goods_sold") || h.get("cost_of_goods") || h.get("cogs") || "Cost of goods sold";
  const invoiceCol = h.get("invoice_id") || h.get("invoiceid") || h.get("transaction_id") || "Invoice ID";
  const paymentCol = h.get("payment") || h.get("channel") || "Payment";

  const hasSupermarket =
    first[productLineCol] != null &&
    (first[unitPriceCol] != null || first["Unit price"] != null) &&
    (first[quantityCol] != null || first["Quantity"] != null) &&
    (first[dateCol] != null || first["Date"] != null);

  if (hasSupermarket) {
    return segregateSupermarket(rows, {
      productLine: productLineCol,
      unitPrice: unitPriceCol,
      quantity: quantityCol,
      date: dateCol,
      total: totalCol,
      cost: costCol,
      invoice: invoiceCol,
      payment: paymentCol,
    });
  }

  // UK Online Retail (UCI/IBM): InvoiceNo, StockCode, Description, Quantity, InvoiceDate, UnitPrice, CustomerID, Country
  const stockCodeCol = h.get("stockcode") || h.get("stock_code") || "StockCode";
  const descCol = h.get("description") || "Description";
  const invDateCol = h.get("invoicedate") || h.get("invoice_date") || "InvoiceDate";
  const invNoCol = h.get("invoiceno") || h.get("invoice_no") || "InvoiceNo";
  const hasOnlineRetail =
    first[stockCodeCol] != null &&
    first[descCol] != null &&
    (first[quantityCol] != null || first["Quantity"] != null) &&
    first[invDateCol] != null &&
    (first[unitPriceCol] != null || first["UnitPrice"] != null);

  if (hasOnlineRetail) {
    return segregateOnlineRetail(rows, {
      stockCode: stockCodeCol,
      description: descCol,
      quantity: quantityCol || "Quantity",
      invoiceDate: invDateCol,
      unitPrice: unitPriceCol || "UnitPrice",
      invoiceNo: invNoCol,
    });
  }

  // Already has sku + quantity + sale_date? Treat as sales-only and derive products
  const hasSku = h.has("sku");
  const hasSaleDate = h.has("sale_date") || h.has("saledate") || h.has("date");
  const hasQty = h.has("quantity") || h.has("qty");
  if (hasSku && hasSaleDate && hasQty) {
    return segregateSalesOnly(rows, getHeaderMap(first));
  }

  errors.push("Could not detect CSV format. Expected: supermarket-style (Product line, Unit price, Quantity, Date, Total) or UK Online Retail (StockCode, Description, Quantity, InvoiceDate, UnitPrice) or sales with sku, quantity, sale_date.");
  return { format: "unknown", products: [], inventory: [], sales: [], errors };
}

function parseDateTime(dateStr) {
  if (!dateStr) return null;
  const s = String(dateStr).trim();
  const datePart = s.split(/\s+/)[0] || s;
  return parseDate(datePart);
}

function segregateOnlineRetail(rows, cols) {
  const productBySku = new Map();
  const sales = [];

  for (let idx = 0; idx < rows.length; idx += 1) {
    const row = rows[idx];
    const sku = String(row[cols.stockCode] || "").trim();
    const description = String(row[cols.description] || "").trim();
    const quantity = parseInt(row[cols.quantity], 10);
    const unitPrice = parseFloat(row[cols.unitPrice]) || 0;
    const invoiceNo = String(row[cols.invoiceNo] || "").trim();
    const date = parseDateTime(row[cols.invoiceDate]);
    if (!sku || !description || !quantity || quantity <= 0 || unitPrice <= 0 || !date) continue;

    if (!productBySku.has(sku)) {
      productBySku.set(sku, {
        sku,
        name: description,
        category: "Giftware",
        supplier_id: "SUP-1",
        cost_price: Number((unitPrice * 0.7).toFixed(2)),
        selling_price: Number(unitPrice.toFixed(2)),
        supplier_lead_time_days: 7,
      });
    }

    const total = quantity * unitPrice;
    sales.push({
      transaction_id: invoiceNo ? `${invoiceNo}-${idx}` : `tx-${idx + 1}`,
      sku,
      quantity,
      unit_price: unitPrice,
      total_amount: Number(total.toFixed(2)),
      sale_date: date,
      channel: "online",
    });
  }

  const products = Array.from(productBySku.values());
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const qtyBySku = new Map();
  for (const s of sales) {
    qtyBySku.set(s.sku, (qtyBySku.get(s.sku) || 0) + s.quantity);
  }
  const inventory = products.map((p) => ({
    sku: p.sku,
    current_stock: Math.max(0, Math.min(200, Math.floor((qtyBySku.get(p.sku) || 0) * 0.25) + 15)),
    snapshot_date: snapshotDate,
  }));

  return {
    format: "online_retail",
    products,
    inventory,
    sales,
    errors: [],
  };
}

function segregateSupermarket(rows, cols) {
  const productMap = new Map();
  const productCostSums = new Map();
  const productCostCounts = new Map();

  for (const row of rows) {
    const productLine = (row[cols.productLine] || "").trim();
    const unitPrice = parseFloat(row[cols.unitPrice]) || 0;
    const quantity = parseInt(row[cols.quantity], 10) || 0;
    const costOfGoods = parseFloat(row[cols.cost]) || 0;
    if (!productLine || unitPrice <= 0) continue;

    const key = `${productLine}|${unitPrice}`;
    const sku = `${slug(productLine)}-${unitPrice.toFixed(2).replace(".", "_")}`;

    if (!productMap.has(key)) {
      productMap.set(key, {
        sku,
        name: productLine,
        category: productLine,
        selling_price: unitPrice,
      });
      productCostSums.set(sku, 0);
      productCostCounts.set(sku, 0);
    }
    if (quantity > 0 && costOfGoods >= 0) {
      const unitCost = costOfGoods / quantity;
      productCostSums.set(sku, (productCostSums.get(sku) || 0) + unitCost * quantity);
      productCostCounts.set(sku, (productCostCounts.get(sku) || 0) + quantity);
    }
  }

  for (const [, p] of productMap) {
    const sku = p.sku;
    const sum = productCostSums.get(sku) || 0;
    const count = productCostCounts.get(sku) || 1;
    p.cost_price = count > 0 ? sum / count : p.selling_price * 0.7;
  }

  const products = Array.from(productMap.values()).map((p) => ({
    sku: p.sku,
    name: p.name,
    category: p.category,
    supplier_id: "SUP-1",
    cost_price: Number(p.cost_price.toFixed(2)),
    selling_price: Number(p.selling_price.toFixed(2)),
    supplier_lead_time_days: 7,
  }));

  const sales = [];
  for (const row of rows) {
    const productLine = (row[cols.productLine] || "").trim();
    const unitPrice = parseFloat(row[cols.unitPrice]) || 0;
    const quantity = parseInt(row[cols.quantity], 10);
    const total = parseFloat(row[cols.total]) || quantity * unitPrice;
    const date = parseDate(row[cols.date]);
    const invoiceId = (row[cols.invoice] || "").trim();
    const payment = (row[cols.payment] || "offline").trim();
    if (!productLine || unitPrice <= 0 || !quantity || quantity <= 0 || !date) continue;

    const key = `${productLine}|${unitPrice}`;
    const sku = productMap.get(key)?.sku;
    if (!sku) continue;

    sales.push({
      transaction_id: invoiceId || `tx-${sales.length + 1}`,
      sku,
      quantity,
      unit_price: unitPrice,
      total_amount: Number(total.toFixed(2)),
      sale_date: date,
      channel: payment.toLowerCase().includes("wallet") ? "online" : "offline",
    });
  }

  const snapshotDate = new Date().toISOString().slice(0, 10);
  const qtyBySku = new Map();
  for (const s of sales) {
    qtyBySku.set(s.sku, (qtyBySku.get(s.sku) || 0) + s.quantity);
  }
  const inventory = products.map((p) => ({
    sku: p.sku,
    current_stock: Math.max(0, Math.min(150, Math.floor((qtyBySku.get(p.sku) || 0) * 0.3) + 20)),
    snapshot_date: snapshotDate,
  }));

  return {
    format: "supermarket",
    products,
    inventory,
    sales,
    errors: [],
  };
}

function segregateSalesOnly(rows, headerMap) {
  const skuCol = headerMap.get("sku");
  const qtyCol = headerMap.get("quantity") || headerMap.get("qty");
  const dateCol = headerMap.get("sale_date") || headerMap.get("saledate") || headerMap.get("date");
  const unitPriceCol = headerMap.get("unit_price") || headerMap.get("unitprice");
  const totalCol = headerMap.get("total_amount") || headerMap.get("total");
  const txIdCol = headerMap.get("transaction_id") || headerMap.get("invoice_id");

  const productBySku = new Map();
  const sales = [];

  for (const row of rows) {
    const sku = String(row[skuCol] || "").trim();
    const quantity = parseInt(row[qtyCol], 10);
    const saleDate = parseDate(row[dateCol]) || row[dateCol];
    const unitPrice = parseFloat(row[unitPriceCol]);
    const total = parseFloat(row[totalCol]);
    if (!sku || !quantity || quantity <= 0 || !saleDate) continue;

    if (!productBySku.has(sku)) {
      productBySku.set(sku, {
        sku,
        name: `Product ${sku}`,
        category: "UNCATEGORIZED",
        supplier_id: "UNKNOWN",
        cost_price: Number.isFinite(unitPrice) ? unitPrice * 0.7 : 0,
        selling_price: Number.isFinite(unitPrice) ? unitPrice : 0,
        supplier_lead_time_days: 7,
      });
    }
    sales.push({
      transaction_id: row[txIdCol] || `tx-${sales.length + 1}`,
      sku,
      quantity,
      unit_price: Number.isFinite(unitPrice) ? unitPrice : 0,
      total_amount: Number.isFinite(total) ? total : quantity * (unitPrice || 0),
      sale_date: saleDate,
      channel: "offline",
    });
  }

  const products = Array.from(productBySku.values());
  const snapshotDate = new Date().toISOString().slice(0, 10);
  const qtyBySku = new Map();
  for (const s of sales) {
    qtyBySku.set(s.sku, (qtyBySku.get(s.sku) || 0) + s.quantity);
  }
  const inventory = products.map((p) => ({
    sku: p.sku,
    current_stock: Math.max(0, Math.min(150, Math.floor((qtyBySku.get(p.sku) || 0) * 0.3) + 20)),
    snapshot_date: snapshotDate,
  }));

  return {
    format: "sales_only",
    products,
    inventory,
    sales,
    errors: [],
  };
}

module.exports = { segregate, normalizeKey, getHeaderMap };
