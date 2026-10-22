"""Prints the success-criteria metrics for one company (or the first company in the database).

    python -m scripts.evaluate [company_id]
"""
import sys
import warnings

warnings.filterwarnings("ignore")

from app import anomaly, delay, forecast  # noqa: E402
from app.data import _db, load_shipments  # noqa: E402

company_id = sys.argv[1] if len(sys.argv) > 1 else str(_db().companies.find_one()["_id"])
df = load_shipments(company_id)
print(f"Company {company_id}: {len(df):,} shipments\n")

flags = anomaly.detect(df)
print(f"Anomaly detection (Isolation Forest): {len(flags['anomalies'])} flagged of {flags['checked']:,}")
for a in flags["anomalies"][:5]:
    print("  -", a["reason"])

fc = forecast.forecast(df, 3, [a["id"] for a in flags["anomalies"]])
m = fc["metrics"]
print(f"\nForecast model: {fc['model']}")
print(f"  backtest {m['backtest_months']}: MAE {m['model']['mae']:,.0f} (MAPE {m['model']['mape']}%)"
      f" vs naive last-month MAE {m['naive_last_month']['mae']:,.0f} (MAPE {m['naive_last_month']['mape']}%)"
      f" -> {'PASS' if m['beats_baseline'] else 'FAIL'}")

b = delay.train(df)
res = b["metrics"]["models"]
base = res["baseline"]
best = res[b["name"]]
print(f"\nDelay risk ({b['name']} selected; {b['metrics']['test_rows']} held-out shipments)")
for name, r in res.items():
    print(f"  {name:<28} F1 {r['f1']:.3f}  ROC-AUC {r['roc_auc']:.3f}")
ok = best["f1"] > base["f1"] and best["roc_auc"] > base["roc_auc"]
print(f"  beats baseline on F1 and ROC-AUC -> {'PASS' if ok else 'FAIL'}")
