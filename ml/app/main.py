"""EcoTrace ML microservice. Called only by the Express API (shared API key)."""
import os
import time
from pathlib import Path
from typing import Dict, List, Optional

import joblib
from dotenv import load_dotenv
from fastapi import Depends, FastAPI, Header, HTTPException
from pydantic import BaseModel

from . import anomaly, clusters, delay, forecast, optimizer
from .data import load_shipments, load_vendors

load_dotenv()
API_KEY = os.getenv("ML_API_KEY", "dev-ml-key")
MODEL_DIR = Path(os.getenv("MODEL_DIR", "models"))
MODEL_DIR.mkdir(parents=True, exist_ok=True)


def check_key(x_api_key: Optional[str] = Header(default=None)):
    if x_api_key != API_KEY:
        raise HTTPException(status_code=401, detail="Invalid API key")


app = FastAPI(title="EcoTrace ML", version="1.0.0", dependencies=[Depends(check_key)])
_bundles: Dict[str, Dict] = {}


class CompanyReq(BaseModel):
    company_id: str


class ForecastReq(CompanyReq):
    horizon: int = 3


class RiskItem(BaseModel):
    id: Optional[str] = None
    vendor_id: Optional[str] = None
    mode: str
    distance_km: float
    weight_kg: float
    ship_date: str
    expected_days: Optional[float] = None
    direction: str = "inbound"


class RiskReq(CompanyReq):
    shipments: List[RiskItem]


class Demand(BaseModel):
    weight_kg: float


class Option(BaseModel):
    id: int
    demand: int
    source: str
    cost_per_kg: float
    co2_per_kg: float


class OptimizeReq(BaseModel):
    demands: List[Demand]
    options: List[Option]
    capacities: Dict[str, float] = {}
    co2_budget_kg: Optional[float] = None


def _shipments(company_id: str):
    df = load_shipments(company_id)
    if df.empty:
        raise HTTPException(status_code=404, detail="No shipments for this company yet")
    return df


def _train(company_id: str) -> Dict:
    started = time.time()
    df = _shipments(company_id)
    try:
        bundle = delay.train(df)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))
    bundle["trained_at"] = time.strftime("%Y-%m-%dT%H:%M:%S")
    bundle["metrics"]["train_seconds"] = round(time.time() - started, 2)
    joblib.dump({k: v for k, v in bundle.items() if not k.startswith("_")}, MODEL_DIR / f"{company_id}_delay.joblib")
    _bundles[company_id] = bundle
    return bundle


def _bundle(company_id: str) -> Dict:
    if company_id in _bundles:
        return _bundles[company_id]
    path = MODEL_DIR / f"{company_id}_delay.joblib"
    if path.exists():
        _bundles[company_id] = joblib.load(path)
        return _bundles[company_id]
    return _train(company_id)


@app.get("/health")
def health():
    return {"status": "ok", "forecaster": "Prophet" if forecast.Prophet else "SARIMA", "xgboost": delay.XGBClassifier is not None, "shap": delay.shap is not None}


@app.post("/train")
def train(req: CompanyReq):
    bundle = _train(req.company_id)
    return {"trained_at": bundle["trained_at"], "metrics": bundle["metrics"]}


@app.get("/metrics/{company_id}")
def metrics(company_id: str):
    b = _bundle(company_id)
    fc = None
    try:
        fc = _forecast(company_id, 3)
    except ValueError:
        pass
    return {
        "delay": {**b["metrics"], "trained_at": b.get("trained_at")},
        "forecast": {"model": fc["model"], **(fc["metrics"] or {})} if fc else None,
    }


def _forecast(company_id: str, horizon: int):
    df = _shipments(company_id)
    flagged = [a["id"] for a in anomaly.detect(df)["anomalies"]]
    return forecast.forecast(df, horizon, flagged)


@app.post("/forecast")
def forecast_route(req: ForecastReq):
    try:
        return _forecast(req.company_id, req.horizon)
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/delay-risk")
def delay_risk(req: RiskReq):
    b = _bundle(req.company_id)
    if not req.shipments:
        return {"model": b["name"], "predictions": []}
    preds = delay.predict(b, [s.dict() for s in req.shipments])
    return {"model": f"{b['name']} + SHAP" if delay.shap else b["name"], "predictions": preds}


@app.post("/anomalies")
def anomalies(req: CompanyReq):
    return anomaly.detect(_shipments(req.company_id))


@app.post("/vendor-clusters")
def vendor_clusters(req: CompanyReq):
    try:
        return clusters.segment(_shipments(req.company_id), load_vendors(req.company_id))
    except ValueError as e:
        raise HTTPException(status_code=422, detail=str(e))


@app.post("/optimize")
def optimize(req: OptimizeReq):
    return optimizer.optimize(
        [d.dict() for d in req.demands], [o.dict() for o in req.options], req.capacities, req.co2_budget_kg
    )
