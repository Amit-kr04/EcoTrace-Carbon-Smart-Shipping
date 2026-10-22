"""Isolation Forest to catch unusual or wrongly entered shipments, with a readable reason."""
from typing import Dict

import numpy as np
import pandas as pd
from sklearn.ensemble import IsolationForest

from .data import load_tariffs

FEATURES = ["z_weight", "z_cost", "z_distance"]


def _robust_z(col: pd.Series) -> pd.Series:
    mad = (col - col.median()).abs().median() * 1.4826
    return (col - col.median()) / (mad if mad > 1e-9 else (col.std() or 1))


def detect(shipments: pd.DataFrame, contamination: float = 0.003) -> Dict:
    df = shipments[~shipments["reviewed"]].copy()
    if len(df) < 50:
        return {"checked": len(df), "anomalies": [], "model": "Isolation Forest"}
    tariffs = load_tariffs()
    tkm = df["distance_km"] * df["weight_kg"] / 1000
    rate = df["mode"].map(lambda m: tariffs.get(m, {}).get("costPerTonneKm", 3))
    min_charge = df["mode"].map(lambda m: tariffs.get(m, {}).get("minCharge", 0))
    df["tariff_cost"] = np.maximum(min_charge, tkm * rate)
    df["route_km"] = df.groupby(["origin", "destination", "mode"])["distance_km"].transform("median")

    # Each feature is compared with similar shipments: weight within the same mode and
    # material, invoiced cost against the tariff, distance against the same route.
    # Only unusually *heavy* loads are suspicious (an extra zero); light loads are normal.
    df["z_weight"] = df.groupby(["mode", "material"])["weight_kg"].transform(lambda c: _robust_z(np.log1p(c))).clip(lower=0)
    df["z_cost"] = _robust_z(np.log(df["cost"].clip(lower=1) / df["tariff_cost"]))
    df["z_distance"] = _robust_z(np.log(df["distance_km"] / df["route_km"].clip(lower=1)))
    # Soft-threshold: deviations within 3 robust SDs are normal variation and count as 0,
    # so the forest isolates genuine outliers instead of the ordinary spread of the data.
    Z = df[FEATURES].fillna(0).clip(-50, 50)
    Z = np.sign(Z) * (Z.abs() - 3).clip(lower=0)

    model = IsolationForest(n_estimators=300, contamination=contamination, random_state=42)
    labels = model.fit_predict(Z)
    scores = model.score_samples(Z)
    weight_median = df.groupby(["mode", "material"])["weight_kg"].transform("median")

    out = []
    for idx in np.where(labels == -1)[0]:
        row = df.iloc[idx]
        worst = Z.iloc[idx].abs().idxmax()
        if worst == "z_weight":
            ratio = row["weight_kg"] / weight_median.iloc[idx]
            reason = f"Weight {row['weight_kg']:,.0f} kg is {_times(ratio)} the usual for {row['material'] or 'this'} by {row['mode']}"
        elif worst == "z_cost":
            ratio = row["cost"] / row["tariff_cost"]
            reason = f"Invoiced cost Rs {row['cost']:,.0f} is {_times(ratio)} the tariff estimate"
        else:
            ratio = row["distance_km"] / row["route_km"]
            reason = f"Distance {row['distance_km']:,.0f} km is {_times(ratio)} the usual for {row['origin']} to {row['destination']}"
        out.append({"id": row["id"], "score": round(float(scores[idx]), 4), "reason": reason})
    return {"checked": int(len(df)), "anomalies": out, "model": "Isolation Forest"}


def _times(ratio: float) -> str:
    return f"{ratio:.1f}x" if ratio >= 1 else f"1/{1 / ratio:.0f} of"
