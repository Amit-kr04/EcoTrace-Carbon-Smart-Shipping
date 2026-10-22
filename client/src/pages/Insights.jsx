import { useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api.js';
import { useAuth } from '../context/AuthContext.jsx';
import ForecastChart from '../components/ForecastChart.jsx';
import { ErrorBox, Loading, ModeChip, date, fmt, kg, monthLabel, pct, tonnes, useApi } from '../components/ui.jsx';

export default function Insights() {
  const { can, toast } = useAuth();
  const status = useApi('/ml/status');
  const forecast = useApi('/ml/forecast');
  const metrics = useApi('/ml/metrics');
  const anomalies = useApi('/ml/anomalies');
  const vendors = useApi('/vendors');
  const [busy, setBusy] = useState('');

  const act = async (key, fn) => {
    setBusy(key);
    try {
      await fn();
    } catch (e) {
      toast(errorMessage(e));
    } finally {
      setBusy('');
    }
  };

  const retrain = () => act('train', async () => {
    const { data } = await api.post('/ml/retrain');
    toast(`Models retrained in ${data.metrics.train_seconds}s, using ${data.metrics.selected}`);
    await api.post('/shipments/rescore');
    metrics.reload();
    forecast.reload();
  });
  const scan = () => act('scan', async () => {
    const { data } = await api.post('/ml/anomalies/run');
    toast(`Checked ${fmt(data.checked)} shipments: ${data.flagged} flagged`);
    anomalies.reload();
  });
  const cluster = () => act('cluster', async () => {
    await api.post('/ml/vendor-clusters');
    vendors.reload();
  });
  const dismiss = (id) => act('dismiss', async () => {
    await api.patch(`/shipments/${id}`, { anomalyDismissed: true });
    anomalies.reload();
  });

  const online = status.data?.online;
  const d = metrics.data?.delay;
  const f = forecast.data?.metrics;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Machine-learning insights</h1>
          <p>Forecasts, delay risk, anomaly detection and vendor segmentation from the Python ML service.</p>
        </div>
        <div className="row">
          <span className={`badge ${online ? 'green' : 'red'}`}><span className="dot" />ML service {online ? 'online' : 'offline'}</span>
          {online && <small>{status.data.forecaster} · XGBoost {status.data.xgboost ? 'yes' : 'no'} · SHAP {status.data.shap ? 'yes' : 'no'}</small>}
          {can('owner', 'admin') && <button className="btn" onClick={retrain} disabled={!online || busy}>{busy === 'train' ? 'Retraining…' : 'Retrain models'}</button>}
        </div>
      </div>
      {status.data && !online && <div className="alert warn" style={{ marginBottom: 16 }}>The ML service is not running, so EcoTrace is using simple fallbacks (seasonal-naive forecast, rule-based risk). Start it with <code>cd ml && .venv/bin/uvicorn app.main:app --port 8000</code>.</div>}

      <div className="grid g-3">
        <div className="card span-2">
          <div className="card-head">
            <h2>Emission forecast</h2>
            <button className="btn sm" onClick={() => api.get('/ml/forecast?refresh=true').then((r) => forecast.setData(r.data))}>Refresh</button>
          </div>
          {forecast.data ? <ForecastChart data={forecast.data} height={300} months={24} /> : <Loading />}
        </div>
        <div className="card">
          <h2>Next 3 months</h2>
          {forecast.data && (
            <>
              <table className="mt">
                <thead><tr><th>Month</th><th className="r">Forecast</th><th className="r">80% range</th></tr></thead>
                <tbody>
                  {forecast.data.forecast.map((r) => (
                    <tr key={r.month}><td>{monthLabel(r.month)}</td><td className="r"><b>{tonnes(r.yhat)}</b></td><td className="r muted">{tonnes(r.lower)}–{tonnes(r.upper)}</td></tr>
                  ))}
                </tbody>
              </table>
              <p className="mt" style={{ fontSize: '0.85rem' }}>Model: <b>{forecast.data.model}</b></p>
              {f && (
                <>
                  <h3 className="mt">Backtest ({f.backtest_months.map(monthLabel).join(', ')})</h3>
                  <table>
                    <thead><tr><th /><th className="r">MAE</th><th className="r">MAPE</th></tr></thead>
                    <tbody>
                      <tr><td>Model</td><td className="r">{kg(f.model.mae)}</td><td className="r">{fmt(f.model.mape, 1)}%</td></tr>
                      <tr><td>Naive "same as last month"</td><td className="r">{kg(f.naive_last_month.mae)}</td><td className="r">{fmt(f.naive_last_month.mape, 1)}%</td></tr>
                    </tbody>
                  </table>
                  <span className={`badge mt ${f.beats_baseline ? 'green' : 'amber'}`}><span className="dot" />{f.beats_baseline ? 'Beats the naive baseline' : 'Does not beat the baseline'}</span>
                </>
              )}
            </>
          )}
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head">
            <h2>Delay-risk model</h2>
            <Link to="/app/shipments?status=in_transit">Scored shipments →</Link>
          </div>
          {metrics.error && <ErrorBox error={metrics.error} />}
          {!d ? (!metrics.error && <Loading />) : (
            <>
              <p style={{ fontSize: '0.9rem' }}>
                Trained on {fmt(d.train_rows)} delivered shipments and tested on {fmt(d.test_rows)} held-out ones ({pct(d.late_share)} arrived late). Selected: <b>{d.selected}</b>, by ROC-AUC.
              </p>
              <table>
                <thead><tr><th>Model</th><th className="r">F1</th><th className="r">ROC-AUC</th><th className="r">Precision</th><th className="r">Recall</th></tr></thead>
                <tbody>
                  {Object.entries(d.models).map(([name, m]) => (
                    <tr key={name} style={name === d.selected ? { fontWeight: 700 } : undefined}>
                      <td>{name === 'baseline' ? m.name : name}</td>
                      <td className="r">{m.f1.toFixed(3)}</td>
                      <td className="r">{m.roc_auc.toFixed(3)}</td>
                      <td className="r">{m.precision?.toFixed(3) ?? '-'}</td>
                      <td className="r">{m.recall?.toFixed(3) ?? '-'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <small>Features: route distance, load, transit days, monsoon and festival season, direction, mode and the vendor's past late rate. Each prediction is explained with SHAP. Last trained {d.trained_at?.replace('T', ' ')}.</small>
            </>
          )}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Vendor segments (K-Means)</h2>
            <button className="btn sm" onClick={cluster} disabled={!online || busy}>{busy === 'cluster' ? 'Running…' : 'Re-run'}</button>
          </div>
          {!vendors.data ? <Loading /> : (
            <div className="table-wrap">
              <table>
                <thead><tr><th>Vendor</th><th>Segment</th><th className="r">kg CO2e/t</th><th className="r">On-time</th></tr></thead>
                <tbody>
                  {[...vendors.data].sort((a, b) => (a.cluster?.label || '').localeCompare(b.cluster?.label || '')).map((v) => (
                    <tr key={v._id}>
                      <td>{v.name}</td>
                      <td>{v.cluster?.label ? <span className="badge brand">{v.cluster.label}</span> : <span className="muted">not segmented</span>}</td>
                      <td className="r">{fmt(v.stats.co2PerTonne, 1)}</td>
                      <td className="r">{pct(v.stats.onTimeRate)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      <div className="card mt">
        <div className="card-head">
          <h2>Anomaly detection (Isolation Forest)</h2>
          <button className="btn" onClick={scan} disabled={!online || busy}>{busy === 'scan' ? 'Scanning…' : 'Scan all shipments'}</button>
        </div>
        <p className="muted" style={{ fontSize: '0.88rem' }}>Catches unusual or wrongly entered shipments, such as an extra zero in the weight, an invoice far from the tariff, or a distance that doesn't match the route. Flagged rows are left out of the forecast.</p>
        {!anomalies.data ? <Loading /> : anomalies.data.length === 0 ? <div className="empty">No flagged shipments. Run a scan.</div> : (
          <div className="table-wrap">
            <table>
              <thead><tr><th>Date</th><th>Route</th><th>Mode</th><th className="r">Weight</th><th className="r">Distance</th><th className="r">CO2e</th><th>Why it was flagged</th><th /></tr></thead>
              <tbody>
                {anomalies.data.map((s) => (
                  <tr key={s._id}>
                    <td>{date(s.shipDate)}</td>
                    <td>{s.origin.name} → {s.destination.name}</td>
                    <td><ModeChip mode={s.mode} /></td>
                    <td className="r">{fmt(s.weightKg)} kg</td>
                    <td className="r">{fmt(s.distanceKm)} km</td>
                    <td className="r">{kg(s.co2Kg)}</td>
                    <td><span className="badge red"><span className="dot" />Flagged</span> {s.anomaly.reason}</td>
                    <td><button className="btn sm" onClick={() => dismiss(s._id)}>Mark OK</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </>
  );
}
