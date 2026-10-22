"""Reads training data straight from MongoDB (the collections written by the Express API)."""
import os
from functools import lru_cache

import numpy as np
import pandas as pd
from bson import ObjectId
from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv()

MONGO_URI = os.getenv("MONGO_URI", "mongodb://127.0.0.1:27018/ecotrace")

MONSOON = {6, 7, 8, 9}
FESTIVAL = {10, 11}


@lru_cache(maxsize=1)
def _db():
    client = MongoClient(MONGO_URI, serverSelectionTimeoutMS=5000)
    return client.get_default_database(default="ecotrace")


def _oid(company_id: str) -> ObjectId:
    return ObjectId(company_id)


def load_shipments(company_id: str) -> pd.DataFrame:
    fields = {
        "_id": 1, "vendor": 1, "mode": 1, "weightKg": 1, "distanceKm": 1, "co2Kg": 1, "cost": 1,
        "shipDate": 1, "expectedDays": 1, "actualDays": 1, "delayed": 1, "status": 1, "direction": 1,
        "origin.name": 1, "destination.name": 1, "anomaly.reason": 1, "material": 1,
    }
    rows = list(_db().shipments.find({"company": _oid(company_id)}, fields))
    if not rows:
        return pd.DataFrame()
    df = pd.DataFrame(
        {
            "id": [str(r["_id"]) for r in rows],
            "vendor_id": [str(r["vendor"]) if r.get("vendor") else None for r in rows],
            "mode": [r["mode"] for r in rows],
            "weight_kg": [r["weightKg"] for r in rows],
            "distance_km": [r["distanceKm"] for r in rows],
            "co2_kg": [r["co2Kg"] for r in rows],
            "cost": [r.get("cost", 0) for r in rows],
            "ship_date": pd.to_datetime([r["shipDate"] for r in rows]),
            "expected_days": [r.get("expectedDays") for r in rows],
            "actual_days": [r.get("actualDays") for r in rows],
            "delayed": [bool(r.get("delayed")) for r in rows],
            "status": [r.get("status") for r in rows],
            "direction": [r.get("direction", "inbound") for r in rows],
            "origin": [r.get("origin", {}).get("name") for r in rows],
            "destination": [r.get("destination", {}).get("name") for r in rows],
            "material": [r.get("material") or "" for r in rows],
            "reviewed": [r.get("anomaly", {}).get("reason") == "Reviewed by user" for r in rows],
        }
    )
    return df.sort_values("ship_date").reset_index(drop=True)


def load_vendors(company_id: str) -> pd.DataFrame:
    rows = list(_db().vendors.find({"company": _oid(company_id)}))
    return pd.DataFrame(
        [{"id": str(v["_id"]), "name": v["name"], "city": v["city"], "price_per_kg": v.get("pricePerKg", 0)} for v in rows]
    )


def load_tariffs() -> dict:
    """Freight tariff per mode (cost per tonne-km and minimum charge) from the emission-factor table."""
    return {f["mode"]: f for f in _db().emissionfactors.find()}


def add_time_features(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    month = df["ship_date"].dt.month
    df["month"] = month
    df["is_monsoon"] = month.isin(MONSOON).astype(int)
    df["is_festival"] = month.isin(FESTIVAL).astype(int)
    df["log_weight"] = np.log1p(df["weight_kg"])
    df["inbound"] = (df["direction"] == "inbound").astype(int)
    for m in ("road", "rail", "sea", "air"):
        df[f"mode_{m}"] = (df["mode"] == m).astype(int)
    return df
