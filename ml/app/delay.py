"""Delay-risk prediction (XGBoost vs Random Forest) with SHAP explanations."""
from typing import Dict, List, Optional

import numpy as np
import pandas as pd
from sklearn.ensemble import RandomForestClassifier
from sklearn.metrics import f1_score, precision_score, recall_score, roc_auc_score
from sklearn.model_selection import train_test_split

from .data import add_time_features

try:
    from xgboost import XGBClassifier
except Exception:  # pragma: no cover - xgboost needs libomp on macOS
    XGBClassifier = None

try:
    import shap
except Exception:  # pragma: no cover
    shap = None

FEATURES = [
    "distance_km", "log_weight", "expected_days", "is_monsoon", "is_festival", "inbound",
    "mode_road", "mode_rail", "mode_sea", "mode_air", "vendor_late_rate",
]
PRIOR_WEIGHT = 5  # smoothing: a new vendor starts at the global late rate


def risk_level(p: float) -> str:
    return "red" if p >= 0.5 else "amber" if p >= 0.25 else "green"


def _prior_late_rate(df: pd.DataFrame, global_rate: float) -> pd.Series:
    """Each vendor's late rate using only shipments *before* this one (no target leakage)."""
    late = df["delayed"].astype(float)
    grp = df["vendor_id"].fillna("__own__")
    prev_late = late.groupby(grp).cumsum() - late
    prev_n = df.groupby(grp).cumcount()
    return (prev_late + PRIOR_WEIGHT * global_rate) / (prev_n + PRIOR_WEIGHT)


def _candidates():
    models = {
        "Random Forest": RandomForestClassifier(
            n_estimators=300, max_depth=8, min_samples_leaf=10, class_weight="balanced", random_state=42, n_jobs=-1
        )
    }
    if XGBClassifier is not None:
        models["XGBoost"] = XGBClassifier(
            n_estimators=300, max_depth=4, learning_rate=0.05, subsample=0.9, colsample_bytree=0.9,
            eval_metric="logloss", random_state=42, n_jobs=2,
        )
    return models


def _best_threshold(y, p) -> float:
    grid = np.linspace(0.1, 0.8, 71)
    return float(max(grid, key=lambda t: f1_score(y, p >= t, zero_division=0)))


def train(shipments: pd.DataFrame) -> Dict:
    df = shipments[shipments["status"] == "delivered"].copy()
    if len(df) < 200 or df["delayed"].nunique() < 2:
        raise ValueError("Need at least 200 delivered shipments with some delays to train the delay model")
    df = add_time_features(df).sort_values("ship_date").reset_index(drop=True)
    global_rate = float(df["delayed"].mean())
    df["vendor_late_rate"] = _prior_late_rate(df, global_rate)
    X, y = df[FEATURES], df["delayed"].astype(int)

    # Stratified 80/20 hold-out across all seasons (a purely time-based split would put
    # only monsoon months in the test set). The vendor feature only uses earlier shipments.
    idx_tr, idx_te = train_test_split(np.arange(len(df)), test_size=0.2, stratify=y, random_state=42)
    idx_fit, idx_val = train_test_split(idx_tr, test_size=0.2, stratify=y.iloc[idx_tr], random_state=42)
    X_tr, y_tr, X_te, y_te = X.iloc[idx_tr], y.iloc[idx_tr], X.iloc[idx_te], y.iloc[idx_te]
    cut = len(idx_tr)

    # Baseline: "road shipment in the monsoon will be late".
    base_pred = ((X_te["is_monsoon"] == 1) & (X_te["mode_road"] == 1)).astype(int)
    results = {"baseline": {
        "name": "Rule: road + monsoon = late",
        "f1": round(f1_score(y_te, base_pred, zero_division=0), 3),
        "roc_auc": round(roc_auc_score(y_te, base_pred), 3),
    }}

    best_name, best_auc, best_threshold = None, -1, 0.5
    for name, model in _candidates().items():
        model.fit(X.iloc[idx_fit], y.iloc[idx_fit])
        threshold = _best_threshold(y.iloc[idx_val], model.predict_proba(X.iloc[idx_val])[:, 1])
        model.fit(X_tr, y_tr)
        p = model.predict_proba(X_te)[:, 1]
        pred = (p >= threshold).astype(int)
        auc = roc_auc_score(y_te, p)
        results[name] = {
            "roc_auc": round(auc, 3),
            "f1": round(f1_score(y_te, pred, zero_division=0), 3),
            "precision": round(precision_score(y_te, pred, zero_division=0), 3),
            "recall": round(recall_score(y_te, pred, zero_division=0), 3),
            "threshold": round(threshold, 2),
        }
        if auc > best_auc:
            best_name, best_auc, best_threshold = name, auc, threshold

    # Refit the winner on all data for serving.
    final = _candidates()[best_name]
    final.fit(X, y)

    vendor_stats = {}
    for vid, g in df.dropna(subset=["vendor_id"]).groupby("vendor_id"):
        last10 = g.tail(10)
        vendor_stats[vid] = {
            "rate": float((g["delayed"].sum() + PRIOR_WEIGHT * global_rate) / (len(g) + PRIOR_WEIGHT)),
            "late10": int(last10["delayed"].sum()),
            "n10": int(len(last10)),
        }
    background = X.sample(min(200, len(X)), random_state=1)
    return {
        "model": final,
        "name": best_name,
        "threshold": best_threshold,
        "global_rate": global_rate,
        "vendor_stats": vendor_stats,
        "background": background,
        "own_rate": float(df.loc[df["vendor_id"].isna(), "delayed"].mean()) if df["vendor_id"].isna().any() else global_rate,
        "metrics": {
            "selected": best_name,
            "train_rows": int(cut),
            "test_rows": int(len(df) - cut),
            "late_share": round(global_rate, 3),
            "models": results,
        },
    }


def _features_for(bundle: Dict, items: List[Dict]) -> pd.DataFrame:
    df = pd.DataFrame(items)
    df["ship_date"] = pd.to_datetime(df["ship_date"])
    df["weight_kg"] = df["weight_kg"].astype(float)
    df = add_time_features(df)
    stats = bundle["vendor_stats"]
    df["vendor_late_rate"] = [
        stats[v]["rate"] if v in stats else (bundle["own_rate"] if not v else bundle["global_rate"])
        for v in df["vendor_id"]
    ]
    return df


def _contributions(bundle: Dict, X: pd.DataFrame) -> np.ndarray:
    """Per-feature contribution to the late probability (SHAP, else occlusion)."""
    model = bundle["model"]
    if shap is not None:
        try:
            explainer = bundle.get("_explainer")
            if explainer is None:
                explainer = shap.TreeExplainer(
                    model, data=bundle["background"], feature_perturbation="interventional", model_output="probability"
                )
                bundle["_explainer"] = explainer
            values = explainer.shap_values(X)
            if isinstance(values, list):
                values = values[1]
            values = np.asarray(values)
            if values.ndim == 3:
                values = values[:, :, 1]
            return values
        except Exception:
            pass
    base = model.predict_proba(X)[:, 1]
    reference = bundle["background"].median()
    out = np.zeros((len(X), len(FEATURES)))
    for j, f in enumerate(FEATURES):
        Xr = X.copy()
        Xr[f] = reference[f]
        out[:, j] = base - model.predict_proba(Xr)[:, 1]
    return out


def _reason(feature: str, row: pd.Series, item: Dict, bundle: Dict) -> Optional[str]:
    if feature == "is_monsoon":
        return "Monsoon month" if row["is_monsoon"] else "Outside monsoon"
    if feature == "is_festival":
        return "Festival season" if row["is_festival"] else "Normal season"
    if feature == "vendor_late_rate":
        s = bundle["vendor_stats"].get(item.get("vendor_id") or "")
        if s:
            return f"Vendor late {s['late10']}/{s['n10']} times"
        return "Own dispatch history" if not item.get("vendor_id") else "New vendor"
    if feature == "distance_km":
        return f"Route {row['distance_km']:,.0f} km"
    if feature.startswith("mode_"):
        return f"{item['mode'].capitalize()} transport"
    if feature == "log_weight":
        return f"Load {row['weight_kg']:,.0f} kg"
    if feature == "expected_days":
        return f"{int(row['expected_days'])}-day transit"
    if feature == "inbound":
        return "Inbound from vendor" if row["inbound"] else "Outbound to customer"
    return None


def predict(bundle: Dict, items: List[Dict]) -> List[Dict]:
    df = _features_for(bundle, items)
    X = df[FEATURES]
    probs = bundle["model"].predict_proba(X)[:, 1]
    contrib = _contributions(bundle, X)
    out = []
    for i, item in enumerate(items):
        row = df.iloc[i]
        # Merge the four one-hot mode columns into one "mode" contribution.
        merged = {}
        for j, f in enumerate(FEATURES):
            key = "mode_road" if f.startswith("mode_") else f
            merged[key] = merged.get(key, 0.0) + float(contrib[i, j])
        # Factors that raise the risk first, then the ones that lower it.
        top = sorted(merged.items(), key=lambda kv: (kv[1] <= 0, -abs(kv[1])))[:3]
        reasons = []
        for f, v in top:
            if abs(v) < 0.01:
                continue
            label = _reason(f, row, item, bundle)
            if label:
                reasons.append(f"{label} {'+' if v > 0 else '-'}{abs(v) * 100:.0f}%")
        p = float(probs[i])
        out.append({"id": item.get("id"), "probability": round(p, 3), "level": risk_level(p), "reasons": reasons})
    return out
