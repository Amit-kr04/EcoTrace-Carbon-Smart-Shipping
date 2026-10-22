import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { ErrorBox, Loading, ModeChip, fmt, inr, kg, pct, useApi } from '../components/ui.jsx';

const SLIDERS = [['carbon', 'Carbon', 'var(--brand)'], ['cost', 'Cost', 'var(--accent)'], ['time', 'Delivery time', 'var(--mode-road)']];

export default function Compare() {
  const locations = useApi('/locations');
  const vendors = useApi('/vendors');
  const [form, setForm] = useState({ toLocationId: '', weightKg: 5000, material: '' });
  const [weights, setWeights] = useState({ carbon: 50, cost: 30, time: 20 });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);

  const dest = locations.data?.find((l) => l._id === form.toLocationId);
  const materials = useMemo(() => [...new Set((vendors.data || []).flatMap((v) => v.materials))].sort(), [vendors.data]);

  useEffect(() => {
    if (!locations.data?.length || form.toLocationId) return;
    const factory = locations.data.find((l) => l.type === 'factory') || locations.data[0];
    setForm((f) => ({ ...f, toLocationId: factory._id, material: 'steel' }));
  }, [locations.data, form.toLocationId]);

  useEffect(() => {
    if (!form.toLocationId || !(form.weightKg > 0)) return;
    setBusy(true);
    const t = setTimeout(() => {
      api.post('/compare', { ...form, material: dest?.type === 'customer' ? '' : form.material, weights })
        .then((r) => { setResult(r.data); setError(null); })
        .catch((e) => setError(errorMessage(e)))
        .finally(() => setBusy(false));
    }, 300);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.toLocationId, form.weightKg, form.material]);

  // Re-rank instantly in the browser when the priority sliders move.
  const ranked = useMemo(() => {
    if (!result?.options) return [];
    const sum = weights.carbon + weights.cost + weights.time || 1;
    return result.options
      .map((o) => ({ ...o, score: ((weights.carbon * o.parts.carbon + weights.cost * o.parts.cost + weights.time * o.parts.time) / sum) * 100 }))
      .sort((a, b) => b.score - a.score);
  }, [result, weights]);

  const best = ranked[0];
  const worstCo2 = Math.max(...ranked.map((o) => o.co2Kg), 0);

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Green option comparator</h1>
          <p>Every vendor and transport mode for a planned shipment, ranked by your priorities for carbon, cost and delivery time.</p>
        </div>
      </div>
      <div className="grid g-3">
        <div className="card">
          <h2>Planned shipment</h2>
          <div className="stack mt">
            <label className="field">Deliver to
              <select value={form.toLocationId} onChange={(e) => setForm({ ...form, toLocationId: e.target.value })}>
                {locations.data?.map((l) => <option key={l._id} value={l._id}>{l.name} ({l.city}, {l.type})</option>)}
              </select>
            </label>
            {dest?.type !== 'customer' ? (
              <label className="field">Material to buy
                <select value={form.material} onChange={(e) => setForm({ ...form, material: e.target.value })}>
                  <option value="">Any</option>
                  {materials.map((m) => <option key={m} value={m}>{m}</option>)}
                </select>
              </label>
            ) : <small>Outbound: options are your own factory and warehouses.</small>}
            <label className="field">Weight (kg)<input type="number" min="1" value={form.weightKg} onChange={(e) => setForm({ ...form, weightKg: Number(e.target.value) })} /></label>
          </div>
          <h2 className="mt">Your priorities</h2>
          <div className="stack mt">
            {SLIDERS.map(([k, label, color]) => (
              <label key={k} className="field">
                <span className="row" style={{ justifyContent: 'space-between' }}>{label}<span className="num" style={{ color }}>{pct(weights[k] / (weights.carbon + weights.cost + weights.time || 1))}</span></span>
                <input type="range" min="0" max="100" value={weights[k]} onChange={(e) => setWeights({ ...weights, [k]: Number(e.target.value) })} style={{ accentColor: color }} />
              </label>
            ))}
            <div className="row">
              <button className="btn sm" onClick={() => setWeights({ carbon: 80, cost: 10, time: 10 })}>Greenest</button>
              <button className="btn sm" onClick={() => setWeights({ carbon: 10, cost: 80, time: 10 })}>Cheapest</button>
              <button className="btn sm" onClick={() => setWeights({ carbon: 10, cost: 10, time: 80 })}>Fastest</button>
              <button className="btn sm" onClick={() => setWeights({ carbon: 34, cost: 33, time: 33 })}>Balanced</button>
            </div>
          </div>
        </div>
        <div className="card span-2">
          <div className="card-head">
            <h2>Ranked options {busy && <span className="spinner" />}</h2>
            <small>Score 0–100, higher is better</small>
          </div>
          <ErrorBox error={error} />
          {result?.message && <div className="alert warn">{result.message}</div>}
          {!result && !error ? <Loading /> : best && (
            <>
              <div className="alert ok" style={{ marginBottom: 12 }}>
                <b>Recommended:</b> {best.sourceName} ({best.sourceCity}) by <ModeChip mode={best.mode} />: {kg(best.co2Kg)} CO2e, {inr(best.totalCost)}, {best.days} days.
                {worstCo2 > best.co2Kg && <> Saves <b>{kg(worstCo2 - best.co2Kg)}</b> CO2e ({pct(1 - best.co2Kg / worstCo2)}) vs the most carbon-heavy option.</>}
              </div>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr><th>#</th><th>Source</th><th>Mode</th><th className="r">Distance</th><th className="r">CO2e</th><th className="r">Goods</th><th className="r">Freight</th><th className="r">Total cost</th><th className="r">Days</th><th className="r">On-time</th><th style={{ minWidth: 130 }}>Score</th></tr>
                  </thead>
                  <tbody>
                    {ranked.map((o, i) => (
                      <tr key={`${o.sourceId}-${o.mode}`}>
                        <td>{i + 1}</td>
                        <td><b>{o.sourceName}</b><div className="muted" style={{ fontSize: '0.78rem' }}>{o.sourceCity}{o.cluster ? ` · ${o.cluster}` : ''}</div></td>
                        <td><ModeChip mode={o.mode} /></td>
                        <td className="r">{fmt(o.distanceKm)} km</td>
                        <td className="r" style={{ fontWeight: o.co2Kg === result.best.greenest ? 700 : 400, color: o.co2Kg === result.best.greenest ? 'var(--good-text)' : undefined }}>{kg(o.co2Kg)}</td>
                        <td className="r">{inr(o.goodsCost)}</td>
                        <td className="r">{inr(o.freightCost)}</td>
                        <td className="r" style={{ fontWeight: o.totalCost === result.best.cheapest ? 700 : 400 }}>{inr(o.totalCost)}</td>
                        <td className="r" style={{ fontWeight: o.days === result.best.fastest ? 700 : 400 }}>{o.days}</td>
                        <td className="r">{o.onTimeRate == null ? '-' : pct(o.onTimeRate)}</td>
                        <td>
                          <div className="row" style={{ gap: 6, flexWrap: 'nowrap' }}>
                            <div className="progress" style={{ flex: 1, height: 8 }}><div style={{ width: `${o.score}%`, background: 'var(--brand)' }} /></div>
                            <b className="num" style={{ width: 30, textAlign: 'right' }}>{fmt(o.score)}</b>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <small>Bold marks the greenest, cheapest and fastest values. Total cost = vendor price × weight + freight.</small>
            </>
          )}
        </div>
      </div>
    </>
  );
}
