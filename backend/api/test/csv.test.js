const test = require("node:test");
const assert = require("node:assert/strict");
const { parseCsvBuffer } = require("../src/utils/csv");

test("csv parser reads one data row", () => {
  const csv = "sku,name,category,cost_price,selling_price\nSKU1,Item,A,10,20\n";
  const rows = parseCsvBuffer(Buffer.from(csv, "utf-8"));
  assert.equal(rows.length, 1);
  assert.equal(rows[0].sku, "SKU1");
});
