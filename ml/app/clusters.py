"""K-Means vendor segmentation on carbon intensity, price and reliability."""
from typing import Dict

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler


def segment(shipments: pd.DataFrame, vendors: pd.DataFrame) -> Dict:
    inbound = shipments.dropna(subset=["vendor_id"])
    delivered = inbound[inbound["status"] == "delivered"]
    stats = inbound.groupby("vendor_id").agg(co2=("co2_kg", "sum"), weight=("weight_kg", "sum"), n=("id", "count"))
    stats["co2_per_tonne"] = stats["co2"] / (stats["weight"] / 1000)
    stats["on_time"] = 1 - delivered.groupby("vendor_id")["delayed"].mean()
    df = vendors.set_index("id").join(stats, how="inner").dropna(subset=["co2_per_tonne", "on_time"])
    if len(df) < 3:
        raise ValueError("Need shipment history for at least 3 vendors")

    feats = ["co2_per_tonne", "price_per_kg", "on_time"]
    X = df[feats].copy()
    X["price_per_kg"] = np.log1p(X["price_per_kg"])
    Xs = StandardScaler().fit_transform(X)
    k = 4 if len(df) >= 10 else 3
    km = KMeans(n_clusters=k, n_init=20, random_state=42).fit(Xs)
    df["cluster"] = km.labels_

    # Name each cluster from its centroid compared with the vendor medians.
    med = df[feats].median()
    names = {}
    for c, g in df.groupby("cluster"):
        centre = g[feats].mean()
        carbon = "Green" if centre["co2_per_tonne"] <= med["co2_per_tonne"] else "Carbon-heavy"
        reliable = "Reliable" if centre["on_time"] >= med["on_time"] else "Late-prone"
        names[c] = f"{carbon} and {reliable}"
    seen = {}
    for c in sorted(names, key=lambda c: df.loc[df["cluster"] == c, "price_per_kg"].mean()):
        label = names[c]
        if label in seen.values():
            label += ", premium" if df.loc[df["cluster"] == c, "price_per_kg"].mean() > med["price_per_kg"] else ", low-cost"
        seen[c] = label
    return {
        "k": k,
        "silhouette": round(float(silhouette_score(Xs, km.labels_)), 3),
        "vendors": [
            {
                "id": vid, "name": r["name"], "cluster": int(r["cluster"]), "label": seen[r["cluster"]],
                "co2_per_tonne": round(float(r["co2_per_tonne"]), 1), "price_per_kg": float(r["price_per_kg"]),
                "on_time": round(float(r["on_time"]), 3), "shipments": int(r["n"]),
            }
            for vid, r in df.iterrows()
        ],
    }
