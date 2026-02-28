const { parse } = require("csv-parse/sync");

function parseCsvBuffer(buffer) {
  const records = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
  });
  return records;
}

function toNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

module.exports = { parseCsvBuffer, toNumber };
