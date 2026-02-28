const test = require("node:test");
const assert = require("node:assert/strict");
const { mean, zScore } = require("../src/utils/math");

test("mean computes average", () => {
  assert.equal(mean([1, 2, 3, 4]), 2.5);
});

test("z-score detects anomaly threshold", () => {
  const baseline = [10, 11, 12, 9, 10, 11, 10, 9, 10, 11];
  const score = zScore(30, baseline);
  assert.equal(score > 2, true);
});
