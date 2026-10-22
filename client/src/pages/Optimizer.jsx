import { useEffect, useMemo, useState } from 'react';
import { api, errorMessage } from '../api.js';
import { ErrorBox, Kpi, Loading, MODES, ModeChip, fmt, inr, inrShort, kg, monthLabel, pct, tonnes, useApi, useChartColors } from '../components/ui.jsx';

export default function Optimizer() {
  const { data: base, error: baseError } = useApi('/optimize/baseline');
  const [demands, setDemands] = useState([]);
  const [budget, setBudget] = useState(0);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [busy, setBusy] = useState(false);
  const c = useChartColors();

  useEffect(() => {
    if (!base) return;
    setDemands(base.demands);
    setBudget(Math.round(Math.min(base.co2BudgetKg, base.current.co2Kg * 0.6) / 1000) * 1000);
  }, [base]);

  const run = async () => {
    setBusy(true);
    setError(null);
    try {
      const { data } = await api.post('/optimize', { demands, co2BudgetKg: budget });
      setResult(data);
    } catch (e) {
      setError(errorMessage(e));
      setResult(null);
    } finally {
      setBusy(false);
    }
  };

  const byMode = useMemo(() => {
    if (!result?.plan) return [];
    const total = result.plan.reduce((s, p) => s + p.weightKg, 0) || 1;
    return MODES.map((m) => ({ mode: m, share: result.plan.filter((p) => p.mode === m).reduce((s, p) => s + p.weightKg, 0) / total })).filter((m) => m.share > 0);
  }, [result]);

  if (baseError) return <ErrorBox error={baseError} />;
  if (!base) return <Loading />;
  const savingCost = result?.status === 'optimal' ? base.current.cost - result.total_cost : 0;
  const savingCo2 = result?.status === 'optimal' ? base.current.co2Kg - result.total_co2_kg : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Carbon-budget optimizer</h1>
          <p>Finds the cheapest mix of vendors and transport modes that meets demand, respects vendor capacity and deadlines, and stays within a CO2 budget (linear programming with PuLP).</p>
        </div>
      </div>

      <div className="grid g-3">
        <div className="card span-2">
          <div className="card-head">
            <h2>Demand to plan</h2>
            <small>Based on {monthLabel(base.month)}'s actual shipments. Edit the quantities or deadlines.</small>
          </div>
          <div className="table-wrap" style={{ maxHeight: 360, overflowY: 'auto' }}>
            <table>
              <thead><tr><th>Destination</th><th>Material</th><th className="r">Weight (kg)</th><th className="r">Deadline (days)</th><th /></tr></thead>
              <tbody>
                {demands.map((d, i) => (
                  <tr key={`${d.toLocationId}-${d.material}`}>
                    <td><b>{d.destination}</b><div className="muted" style={{ fontSize: '0.78rem' }}>{d.city}</div></td>
                    <td style={{ textTransform: 'capitalize' }}>{d.material || 'finished goods (outbound)'}</td>
                    <td className="r"><input type="number" min="0" value={d.weightKg} onChange={(e) => setDemands(demands.map((x, j) => (j === i ? { ...x, weightKg: Number(e.target.value) } : x)))} style={{ width: 110, textAlign: 'right' }} aria-label="Weight" /></td>
                    <td className="r"><input type="number" min="1" value={d.deadlineDays} onChange={(e) => setDemands(demands.map((x, j) => (j === i ? { ...x, deadlineDays: Number(e.target.value) } : x)))} style={{ width: 70, textAlign: 'right' }} aria-label="Deadline" /></td>
                    <td><button className="btn sm ghost" onClick={() => setDemands(demands.filter((_, j) => j !== i))} aria-label="Remove row">✕</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
        <div className="card">
          <h2>Monthly CO2 budget</h2>
          <div className="value num" style={{ fontSize: '1.8rem', fontWeight: 700, margin: '8px 0' }}>{tonnes(budget)}</div>
          <input type="range" min={0} max={Math.round(base.current.co2Kg * 1.2)} step={500} value={budget} onChange={(e) => setBudget(Number(e.target.value))} style={{ width: '100%' }} aria-label="CO2 budget" />
          <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.8rem' }} >
            <span className="muted">0</span><span className="muted">{tonnes(base.current.co2Kg * 1.2)}</span>
          </div>
          <div className="stack mt" style={{ gap: 6, fontSize: '0.88rem' }}>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Current mix ({monthLabel(base.month)})</span><b className="num">{tonnes(base.current.co2Kg)}</b></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Company budget</span><b className="num">{tonnes(base.co2BudgetKg)}</b></div>
            <div className="row" style={{ justifyContent: 'space-between' }}><span className="muted">Current cost (goods + freight)</span><b className="num">{inrShort(base.current.cost)}</b></div>
          </div>
          <button className="btn primary lg mt" style={{ width: '100%' }} onClick={run} disabled={busy || !demands.length}>{busy ? 'Optimizing…' : 'Find cheapest plan'}</button>
        </div>
      </div>

      <div className="mt"><ErrorBox error={error} /></div>
      {result?.status === 'infeasible' && <div className="alert warn mt">{result.message}</div>}
      {result?.status === 'optimal' && (
        <>
          <div className="grid g-4 mt">
            <Kpi label="Plan cost" value={inrShort(result.total_cost)} sub={savingCost >= 0 ? `${inrShort(savingCost)} cheaper than current (${pct(savingCost / base.current.cost)})` : `${inrShort(-savingCost)} more than current`} tone={savingCost >= 0 ? 'good' : 'bad'} />
            <Kpi label="Plan CO2e" value={tonnes(result.total_co2_kg)} sub={`${tonnes(savingCo2)} less than current (${pct(savingCo2 / base.current.co2Kg)})`} tone={savingCo2 >= 0 ? 'good' : 'bad'} />
            <Kpi label="Budget used" value={pct(result.total_co2_kg / budget)} sub={`of ${tonnes(budget)}`} />
            <Kpi label="Carbon shadow price" value={`₹${fmt(result.carbon_shadow_price, 2)}`} sub={result.carbon_shadow_price > 0 ? 'extra cost per kg CO2 cut further' : 'budget is not binding'} />
          </div>
          <div className="card mt">
            <div className="card-head">
              <h2>Recommended allocation</h2>
              <div className="row" style={{ gap: 4, minWidth: 260, flex: '0 1 360px' }}>
                {byMode.map((m) => (
                  <div key={m.mode} title={`${m.mode} ${pct(m.share)}`} style={{ flex: m.share, background: c[m.mode], height: 12, borderRadius: 3 }} />
                ))}
              </div>
            </div>
            <div className="legend" style={{ marginBottom: 10 }}>{byMode.map((m) => <span key={m.mode}><i style={{ background: c[m.mode] }} />{m.mode} {pct(m.share)} of tonnage</span>)}</div>
            <div className="table-wrap">
              <table>
                <thead><tr><th>Destination</th><th>Material</th><th>Source</th><th>Mode</th><th className="r">Weight</th><th className="r">Days</th><th className="r">CO2e</th><th className="r">Cost</th></tr></thead>
                <tbody>
                  {result.plan.map((p, i) => (
                    <tr key={i}>
                      <td>{p.destination}</td>
                      <td style={{ textTransform: 'capitalize' }}>{p.material || 'finished goods'}</td>
                      <td>{p.source} <span className="muted">({p.sourceCity})</span></td>
                      <td><ModeChip mode={p.mode} /></td>
                      <td className="r">{tonnes(p.weightKg)}</td>
                      <td className="r">{p.days}</td>
                      <td className="r">{kg(p.co2Kg)}</td>
                      <td className="r">{inr(p.cost)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <small>Solver: {result.solver}. Costs are linear (vendor price + tariff per tonne-km); minimum charges are not modelled.</small>
          </div>
        </>
      )}
    </>
  );
}
