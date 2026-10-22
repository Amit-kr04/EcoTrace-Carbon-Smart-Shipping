import { useMemo, useState } from 'react';
import { Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, ErrorBox, Kpi, Legend, Loading, MODES, MODE_LABEL, inrShort, pct, tonnes, useApi, useChartColors } from '../components/ui.jsx';

const SHIFTS = [
  ['road', 'rail', 'Move road freight to rail'],
  ['road', 'sea', 'Move road freight to coastal shipping'],
  ['air', 'road', 'Move air freight to road'],
];

export default function WhatIf() {
  const [months, setMonths] = useState(12);
  const { data, error } = useApi(`/analytics/mode-totals?months=${months}`, [months]);
  const [shift, setShift] = useState({ 'road-rail': 30, 'road-sea': 0, 'air-road': 0 });
  const c = useChartColors();

  // Re-allocates tonne-km between modes and re-prices CO2 and cost with each mode's factor.
  const sim = useMemo(() => {
    if (!data) return null;
    const f = data.factors;
    const tkm = Object.fromEntries(MODES.map((m) => [m, data.byMode.find((x) => x.mode === m)?.tonneKm || 0]));
    const before = { ...tkm };
    for (const [from, to] of SHIFTS) {
      const moved = before[from] * (shift[`${from}-${to}`] / 100);
      tkm[from] -= moved;
      tkm[to] += moved;
    }
    const rows = MODES.map((m) => ({
      mode: MODE_LABEL[m],
      key: m,
      before: before[m] * f[m].kgCo2PerTonneKm,
      after: tkm[m] * f[m].kgCo2PerTonneKm,
      costBefore: before[m] * f[m].costPerTonneKm,
      costAfter: tkm[m] * f[m].costPerTonneKm,
      hoursBefore: before[m] / f[m].speedKmPerDay,
      hoursAfter: tkm[m] / f[m].speedKmPerDay,
    }));
    const sum = (k) => rows.reduce((s, r) => s + r[k], 0);
    return { rows, co2Before: sum('before'), co2After: sum('after'), costBefore: sum('costBefore'), costAfter: sum('costAfter'), timeBefore: sum('hoursBefore'), timeAfter: sum('hoursAfter') };
  }, [data, shift]);

  if (error) return <ErrorBox error={error} />;
  if (!sim) return <Loading />;
  const dCo2 = sim.co2After - sim.co2Before;
  const dCost = sim.costAfter - sim.costBefore;
  const dTime = sim.timeBefore ? sim.timeAfter / sim.timeBefore - 1 : 0;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>What-if simulator</h1>
          <p>Move a share of freight between transport modes and see the effect on emissions and cost immediately.</p>
        </div>
        <select value={months} onChange={(e) => setMonths(Number(e.target.value))} aria-label="Based on">
          <option value={3}>Based on last 3 months</option>
          <option value={12}>Based on last 12 months</option>
          <option value={24}>Based on last 24 months</option>
        </select>
      </div>
      <div className="grid g-3">
        <div className="card">
          <h2>Scenario</h2>
          <div className="stack mt">
            {SHIFTS.map(([from, to, label]) => (
              <label key={`${from}-${to}`} className="field">
                <span className="row" style={{ justifyContent: 'space-between' }}>{label}<b className="num">{shift[`${from}-${to}`]}%</b></span>
                <input type="range" min="0" max="100" step="5" value={shift[`${from}-${to}`]} onChange={(e) => setShift({ ...shift, [`${from}-${to}`]: Number(e.target.value) })} />
              </label>
            ))}
            <button className="btn sm" onClick={() => setShift({ 'road-rail': 0, 'road-sea': 0, 'air-road': 0 })}>Reset</button>
          </div>
          <small className="mt" style={{ display: 'block' }}>Shares are of each mode's tonne-km. Sea is only possible between port cities, so keep that share realistic.</small>
        </div>
        <div className="span-2 stack">
          <div className="grid g-3">
            <Kpi label="CO2e change" value={`${dCo2 <= 0 ? '−' : '+'}${tonnes(Math.abs(dCo2))}`} sub={`${pct(Math.abs(dCo2) / sim.co2Before)} ${dCo2 <= 0 ? 'lower' : 'higher'}: ${tonnes(sim.co2After)} total`} tone={dCo2 <= 0 ? 'good' : 'bad'} />
            <Kpi label="Freight cost change" value={`${dCost <= 0 ? '−' : '+'}${inrShort(Math.abs(dCost))}`} sub={`${pct(Math.abs(dCost) / sim.costBefore)} ${dCost <= 0 ? 'lower' : 'higher'}`} tone={dCost <= 0 ? 'good' : 'bad'} />
            <Kpi label="Transit time" value={`${dTime >= 0 ? '+' : '−'}${pct(Math.abs(dTime))}`} sub="change in tonne-days spent in transit" tone={dTime > 0.05 ? 'bad' : null} />
          </div>
          <div className="card">
            <div className="card-head">
              <h2>CO2e by mode, before and after</h2>
              <Legend items={[{ label: 'Current', color: c.axis }, { label: 'Scenario', color: c.brand }]} />
            </div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={sim.rows} margin={{ top: 6, right: 8, left: 0, bottom: 0 }} barGap={2}>
                <CartesianGrid stroke={c.grid} vertical={false} />
                <XAxis dataKey="mode" tick={{ fill: c.text, fontSize: 12 }} axisLine={{ stroke: c.axis }} tickLine={false} />
                <YAxis tickFormatter={tonnes} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={60} />
                <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip valueFormatter={tonnes} />} />
                <Bar dataKey="before" name="Current" fill={c.axis} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
                <Bar dataKey="after" name="Scenario" fill={c.brand} radius={[4, 4, 0, 0]} maxBarSize={44} isAnimationActive={false} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </>
  );
}
