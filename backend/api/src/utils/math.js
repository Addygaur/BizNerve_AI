function mean(values) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function stdDev(values) {
  if (values.length < 2) return 0;
  const avg = mean(values);
  const variance =
    values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / values.length;
  return Math.sqrt(variance);
}

function zScore(value, values) {
  const avg = mean(values);
  const std = stdDev(values);
  if (!std) return 0;
  return (value - avg) / std;
}

function clampMin(value, min) {
  return value < min ? min : value;
}

module.exports = { mean, stdDev, zScore, clampMin };
