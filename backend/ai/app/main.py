from typing import List

import numpy as np
import pandas as pd
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field
from prophet import Prophet

app = FastAPI(title="BizNerve AI Service", version="1.0.0")


class SeriesPayload(BaseModel):
    values: List[float] = Field(default_factory=list)
    horizon: int = 30


class BatchItem(BaseModel):
    sku: str
    values: List[float] = Field(default_factory=list)


class BatchPayload(BaseModel):
    series: List[BatchItem] = Field(default_factory=list)
    horizon: int = 30


def infer_trend(predictions: List[float]) -> str:
    if len(predictions) < 2:
        return "STABLE"
    first = float(predictions[0])
    last = float(predictions[-1])
    if last > first * 1.05:
        return "INCREASING"
    if last < first * 0.95:
        return "DECREASING"
    return "STABLE"


def fallback_forecast(values: List[float], horizon: int):
    window = values[-30:] if values else [0]
    baseline = float(np.mean(window))
    predictions = [max(0.0, baseline) for _ in range(horizon)]
    lower = [max(0.0, baseline * 0.85) for _ in range(horizon)]
    upper = [max(0.0, baseline * 1.15) for _ in range(horizon)]
    return {
        "predictions": predictions,
        "lower": lower,
        "upper": upper,
        "trendDirection": infer_trend(predictions),
    }


def prophet_forecast(values: List[float], horizon: int):
    if len(values) < 60:
        return fallback_forecast(values, horizon)

    try:
        dates = pd.date_range(end=pd.Timestamp.today().normalize(), periods=len(values), freq="D")
        frame = pd.DataFrame({"ds": dates, "y": values})
        model = Prophet(
            daily_seasonality=False,
            weekly_seasonality=True,
            yearly_seasonality=False,
            seasonality_mode="additive",
        )
        model.fit(frame)
        future = model.make_future_dataframe(periods=horizon, freq="D")
        forecast = model.predict(future).tail(horizon)

        predictions = [max(0.0, float(x)) for x in forecast["yhat"].tolist()]
        lower = [max(0.0, float(x)) for x in forecast["yhat_lower"].tolist()]
        upper = [max(0.0, float(x)) for x in forecast["yhat_upper"].tolist()]
        return {
            "predictions": predictions,
            "lower": lower,
            "upper": upper,
            "trendDirection": infer_trend(predictions),
        }
    except Exception:
        # Keep the pipeline running even when Prophet fitting fails on sparse/noisy series.
        return fallback_forecast(values, horizon)


@app.get("/health")
def health():
    return {"status": "ok"}


@app.post("/forecast/series")
def forecast_series(payload: SeriesPayload):
    if payload.horizon <= 0:
        raise HTTPException(status_code=400, detail="horizon must be positive")
    return prophet_forecast(payload.values, payload.horizon)


@app.post("/forecast/batch")
def forecast_batch(payload: BatchPayload):
    if payload.horizon <= 0:
        raise HTTPException(status_code=400, detail="horizon must be positive")
    results = []
    for item in payload.series:
        forecast = prophet_forecast(item.values, payload.horizon)
        results.append(
            {
                "sku": item.sku,
                "predictions": forecast["predictions"],
                "lower": forecast["lower"],
                "upper": forecast["upper"],
                "trendDirection": forecast["trendDirection"],
            }
        )
    return {"results": results}
