"""Monthly emission forecasting: Prophet (with Indian holidays) when installed, else SARIMA."""
import warnings
from typing import Dict, List, Tuple

import numpy as np
import pandas as pd

try:
    from prophet import Prophet
except Exception:
    Prophet = None

from statsmodels.tsa.statespace.sarimax import SARIMAX


def monthly_series(shipments: pd.DataFrame) -> pd.Series:
    """CO2 per complete calendar month (the running month is excluded)."""
    s = shipments.set_index("ship_date")["co2_kg"].resample("MS").sum()
    this_month = pd.Timestamp.now(tz=s.index.tz).to_period("M").to_timestamp()
    if s.index.tz is not None:
        this_month = this_month.tz_localize(s.index.tz)
    return s[s.index < this_month]


# Candidate SARIMA(X) specs on log(CO2): (order, seasonal_order, trend, use_calendar_regressors).
# The one with the lowest rolling backtest error is used.
SARIMA_SPECS = [
    ((0, 0, 0), (0, 0, 0, 0), "ct", True),   # trend + Indian season effects (festival, monsoon, January)
    ((1, 0, 0), (0, 0, 0, 0), "c", True),    # AR(1) + season effects
    ((0, 1, 1), (0, 1, 0, 12), "n", False),  # seasonal random walk with MA term
    ((1, 0, 0), (1, 0, 0, 12), "ct", False), # seasonal AR with linear trend
]


def calendar_regressors(index: pd.DatetimeIndex) -> np.ndarray:
    """Known Indian demand drivers: festival season (Sep-Nov), monsoon (Jun-Aug), post-holiday January."""
    m = index.month
    return np.column_stack([np.isin(m, [9, 10, 11]), np.isin(m, [6, 7, 8]), m == 1]).astype(float)


def _future_index(series: pd.Series, horizon: int) -> pd.DatetimeIndex:
    return pd.date_range(series.index[-1] + pd.offsets.MonthBegin(1), periods=horizon, freq="MS")


def _sarima(series: pd.Series, horizon: int, spec=None) -> Tuple[np.ndarray, np.ndarray, np.ndarray, str]:
    order, seasonal_order, trend, use_exog = spec or SARIMA_SPECS[0]
    if seasonal_order[1] and len(series) < 20:
        order, seasonal_order, trend, use_exog = SARIMA_SPECS[0]
    exog = calendar_regressors(series.index) if use_exog else None
    future_exog = calendar_regressors(_future_index(series, horizon)) if use_exog else None
    with warnings.catch_warnings():
        warnings.simplefilter("ignore")
        fit = SARIMAX(
            np.log(series.values), exog=exog, order=order, seasonal_order=seasonal_order, trend=trend,
            enforce_stationarity=False, enforce_invertibility=False,
        ).fit(disp=False)
        fc = fit.get_forecast(horizon, exog=future_exog)
        mean = np.exp(fc.predicted_mean)
        ci = np.exp(fc.conf_int(alpha=0.2))
    name = f"SARIMAX{order}{'x' + str(seasonal_order) if seasonal_order[3] else ''}{' + Indian season regressors' if use_exog else ''}"
    return mean, ci[:, 0], ci[:, 1], name


def _select_spec(series: pd.Series, horizon: int):
    """Rolling-origin backtest over the last two windows; returns the spec with the lowest MAE."""
    best, best_err = SARIMA_SPECS[0], float("inf")
    for spec in SARIMA_SPECS:
        errs = []
        for cut in (horizon, 2 * horizon):
            if len(series) - cut < 12:
                continue
            train, test = series[:-cut], series[-cut:][:horizon]
            if spec[1][1] and len(train) < 20:
                continue
            pred = _sarima(train, horizon, spec)[0][: len(test)]
            errs.append(np.mean(np.abs(test.values - pred)))
        if errs and np.mean(errs) < best_err:
            best, best_err = spec, np.mean(errs)
    return best


def _prophet(series: pd.Series, horizon: int):
    df = pd.DataFrame({"ds": series.index.tz_localize(None) if series.index.tz else series.index, "y": series.values})
    m = Prophet(yearly_seasonality=True, weekly_seasonality=False, daily_seasonality=False, interval_width=0.8)
    m.add_country_holidays(country_name="IN")
    m.fit(df)
    future = m.make_future_dataframe(periods=horizon, freq="MS")
    fc = m.predict(future).tail(horizon)
    return fc["yhat"].values, fc["yhat_lower"].values, fc["yhat_upper"].values, "Prophet (Indian holidays)"


def _fit_predict(series: pd.Series, horizon: int, spec=None):
    if Prophet is not None:
        try:
            return _prophet(series, horizon)
        except Exception:
            pass
    return _sarima(series, horizon, spec)


def _errors(actual: np.ndarray, pred: np.ndarray) -> Dict[str, float]:
    return {
        "mae": round(float(np.mean(np.abs(actual - pred))), 1),
        "mape": round(float(np.mean(np.abs(actual - pred) / actual) * 100), 2),
    }


def forecast(shipments: pd.DataFrame, horizon: int = 3, exclude_ids=()) -> Dict:
    """Forecast monthly CO2. Shipments flagged as anomalies (likely data-entry errors) are left out."""
    if len(exclude_ids):
        shipments = shipments[~shipments["id"].isin(set(exclude_ids))]
    series = monthly_series(shipments)
    if len(series) < 9:
        raise ValueError("Need at least 9 months of shipments to forecast")
    spec = _select_spec(series[:-horizon], horizon) if len(series) >= 15 else None

    # Backtest: hide the last `horizon` months, forecast them, compare with the naive baseline.
    metrics = None
    if len(series) >= 15:
        train, test = series[:-horizon], series[-horizon:]
        pred, _, _, _ = _fit_predict(train, horizon, spec)
        naive = np.repeat(train.values[-1], horizon)  # "same as last month"
        metrics = {
            "backtest_months": [d.strftime("%Y-%m") for d in test.index],
            "model": _errors(test.values, pred),
            "naive_last_month": _errors(test.values, naive),
        }
        metrics["beats_baseline"] = metrics["model"]["mae"] < metrics["naive_last_month"]["mae"]

    mean, lower, upper, name = _fit_predict(series, horizon, spec)
    start = series.index[-1] + pd.offsets.MonthBegin(1)
    months = pd.date_range(start, periods=horizon, freq="MS")
    return {
        "model": name,
        "history": [{"month": d.strftime("%Y-%m"), "co2Kg": round(float(v))} for d, v in series.items()],
        "forecast": [
            {"month": d.strftime("%Y-%m"), "yhat": round(float(m)), "lower": round(float(lo)), "upper": round(float(hi))}
            for d, m, lo, hi in zip(months, mean, lower, upper)
        ],
        "metrics": metrics,
        "excluded_anomalies": int(len(exclude_ids)),
    }
