"""Synthetic shipment generator (pandas + NumPy).

Produces ~2 years of shipments in EcoTrace's CSV import format, with deliberate patterns:
monsoon delays (June-September), festival-season volume peaks (September-November),
steady growth, and two chronically late vendors.

    python scripts/generate_synthetic.py --years 2 --out data/synthetic_shipments.csv

Import the file on the Shipments page (Import CSV). The Express API seeds an equivalent
dataset automatically for the demo company.
"""
import argparse
from pathlib import Path

import numpy as np
import pandas as pd

FACTORY = ("Sahyadri Plant (Chakan)", "Pune")
VENDORS = [  # name, city, material, weight range kg, late rate
    ("Konkan Steel Supply", "Mumbai", "steel", (3000, 16000), 0.05),
    ("Tata Steel Distributors", "Jamshedpur", "steel", (3000, 16000), 0.08),
    ("Ludhiana Fasteners", "Ludhiana", "fasteners", (800, 4000), 0.30),
    ("Coimbatore Castings", "Coimbatore", "aluminium", (1500, 9000), 0.10),
    ("Kerala Rubber Co-op", "Kochi", "rubber", (1000, 6000), 0.11),
    ("Guwahati Rubber Traders", "Guwahati", "rubber", (1000, 6000), 0.36),
    ("Gujarat Polymers", "Ahmedabad", "plastics", (1000, 7000), 0.06),
    ("Surat Packaging House", "Surat", "packaging", (800, 5000), 0.04),
    ("Chennai Electro Parts", "Chennai", "electronics", (80, 700), 0.09),
]
CUSTOMERS = [
    ("Gurugram OEM Assembly", "Gurugram"), ("Chennai Auto Cluster", "Chennai"), ("Sanand Assembly Plant", "Sanand"),
    ("Hosur Two-Wheeler Plant", "Hosur"), ("Kolkata Distributor", "Kolkata"), ("Hyderabad Aftermarket Hub", "Hyderabad"),
]
TRANSIT_DAYS = {"road": 3, "rail": 5, "air": 2}


def generate(years: int, seed: int) -> pd.DataFrame:
    rng = np.random.default_rng(seed)
    end = pd.Timestamp.today().normalize()
    days = pd.date_range(end - pd.DateOffset(years=years), end, freq="D")
    month = days.month.values
    growth = 1 + 0.18 * np.arange(len(days)) / 730
    season = np.where(np.isin(month, [9, 10, 11]), 1.35, np.where(np.isin(month, [6, 7]), 0.88, 1.0))
    weekday = np.where(days.dayofweek == 6, 0.25, 1.0)
    counts = rng.poisson(6.2 * growth * season * weekday)

    rows = []
    for day, n in zip(days, counts):
        monsoon = day.month in (6, 7, 8, 9)
        festival = day.month in (10, 11)
        for _ in range(n):
            mode = rng.choice(["road", "rail", "air"], p=[0.84, 0.13, 0.03])
            if rng.random() < 0.56:
                name, city, material, (lo, hi), late = VENDORS[rng.integers(len(VENDORS))]
                row = {"vendor": name, "vendor_city": city, "origin": "", "destination": FACTORY[0], "destination_city": FACTORY[1], "material": material}
            else:
                cust, ccity = CUSTOMERS[rng.integers(len(CUSTOMERS))]
                lo, hi, late, material = 1500, 12000, 0.05, "finished goods"
                row = {"vendor": "", "vendor_city": "", "origin": FACTORY[0], "destination": cust, "destination_city": ccity, "material": material}
            p = 0.02 + late * 1.3 + (0.32 if monsoon and mode == "road" else 0.12 if monsoon else 0) + (0.1 if festival else 0)
            expected = TRANSIT_DAYS[mode] + int(rng.integers(0, 3))
            delayed = rng.random() < p
            actual = expected + (int(rng.integers(1, 4)) + int(monsoon) if delayed else 0)
            in_transit = day + pd.Timedelta(days=expected) >= end
            weight = round(rng.uniform(lo, hi) * (0.25 if mode == "air" else 1), -1)
            rows.append({
                "date": day.date().isoformat(), **row, "mode": mode, "weight_kg": weight, "cost": "",
                "expected_days": expected, "actual_days": "" if in_transit else actual,
            })
    cols = ["date", "vendor", "vendor_city", "origin", "destination", "destination_city", "mode", "weight_kg", "material", "cost", "expected_days", "actual_days"]
    return pd.DataFrame(rows)[cols]


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--years", type=int, default=2)
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--out", default="data/synthetic_shipments.csv")
    args = ap.parse_args()
    df = generate(args.years, args.seed)
    Path(args.out).parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(args.out, index=False)
    late = (pd.to_numeric(df["actual_days"], errors="coerce") > df["expected_days"]).mean()
    print(f"Wrote {len(df):,} shipments to {args.out} (late share {late:.0%})")
