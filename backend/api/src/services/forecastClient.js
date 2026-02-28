const axios = require("axios");
const { config } = require("../config");

const client = axios.create({
  baseURL: config.aiServiceUrl,
  timeout: 20000,
});

async function getHealth() {
  const response = await client.get("/health");
  return response.data;
}

async function forecastBatch(series, horizon = 30) {
  const response = await client.post("/forecast/batch", {
    horizon,
    series,
  });
  return response.data;
}

async function forecastSeries(values, horizon = 30) {
  const response = await client.post("/forecast/series", {
    horizon,
    values,
  });
  return response.data;
}

module.exports = { getHealth, forecastBatch, forecastSeries };
