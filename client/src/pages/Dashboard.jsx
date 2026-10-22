import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import RouteMap, { MapLegend } from '../components/RouteMap.jsx';
import ForecastChart from '../components/ForecastChart.jsx';
import {
  BudgetBar, ChartTooltip, ErrorBox, Kpi, Legend, Loading, MODES, MODE_LABEL, ModeChip, RiskBadge,
  date, fmt, inrShort, kg, monthLabel, pct, tonnes, useApi, useChartColors,
} from '../components/ui.jsx';

const PERIODS = [['6', '6 months'], ['12', '12 months'], ['24', '24 months'], ['', 'All time']];

export default function Dashboard() {
  const [months, setMonths] = useState('12');
  const [mode, setMode] = useState('');
  const c = useChartColors();
  const { data, error, loading } = useApi(`/analytics/summary?months=${months}${mode ? `&mode=${mode}` : ''}`, [months, mode]);
  const forecast = useApi('/ml/forecast');
  const risky = useApi('/shipments?status=in_transit&limit=6&risk=red');

  if (error) return <ErrorBox error={error} />;
  if (!data) return <Loading />;
  const t = data.totals;
  const prev = data.monthly.at(-2);
  const prevPrev = data.monthly.at(-3);
  const change = prev && prevPrev ? (prev.co2Kg - prevPrev.co2Kg) / prevPrev.co2Kg : null;
  const modeTotal = data.byMode.reduce((s, m) => s + m.co2Kg, 0) || 1;

  return (
    <>
      <div className="page-head">
        <div>
          <h1>Emissions dashboard</h1>
          <p>Where your transport CO2 comes from, by mode, vendor and route.</p>
        </div>
        <div className="row" role="group" aria-label="Filters">
          <select value={months} onChange={(e) => setMonths(e.target.value)} aria-label="Period">
            {PERIODS.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
          <select value={mode} onChange={(e) => setMode(e.target.value)} aria-label="Transport mode">
            <option value="">All modes</option>
            {MODES.map((m) => <option key={m} value={m}>{MODE_LABEL[m]}</option>)}
          </select>
          {loading && <span className="spinner" />}
        </div>
      </div>

      <div className="grid g-5">
        <Kpi label="Total CO2e" value={tonnes(t.co2Kg)} sub={change == null ? null : `${change > 0 ? '▲' : '▼'} ${pct(Math.abs(change))} last month vs month before`} tone={change == null ? null : change > 0 ? 'bad' : 'good'} />
        <Kpi label="Shipments" value={fmt(t.shipments)} sub={`${fmt(t.inTransit)} in transit`} />
        <Kpi label="Carbon intensity" value={`${fmt(t.co2PerTonneKm * 1000, 1)} g`} sub="CO2e per tonne-km" />
        <Kpi label="Freight cost" value={inrShort(t.cost)} sub={`${inrShort(t.cost / (t.shipments || 1))} per shipment`} />
        <Kpi label="On-time delivery" value={pct(t.onTimeRate)} sub={`${fmt(t.late)} late deliveries`} tone={t.onTimeRate < 0.8 ? 'bad' : 'good'} />
      </div>

      <div className="grid g-3 mt">
        <div className="card span-2">
          <div className="card-head">
            <h2>Monthly emissions by mode</h2>
            <Legend items={MODES.map((m) => ({ label: MODE_LABEL[m], color: c[m] }))} />
          </div>
          <ResponsiveContainer width="100%" height={270}>
            <AreaChart data={data.monthly} margin={{ top: 6, right: 8, left: 0, bottom: 0 }}>
              <CartesianGrid stroke={c.grid} vertical={false} />
              <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} minTickGap={16} />
              <YAxis tickFormatter={tonnes} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
              <Tooltip content={<ChartTooltip labelFormatter={monthLabel} valueFormatter={kg} />} />
              {MODES.map((m) => (
                <Area key={m} type="monotone" dataKey={m} name={MODE_LABEL[m]} stackId="1" stroke={c.surface} strokeWidth={1} fill={c[m]} fillOpacity={0.9} isAnimationActive={false} />
              ))}
            </AreaChart>
          </ResponsiveContainer>
        </div>
        <div className="card">
          <div className="card-head"><h2>This month's carbon budget</h2></div>
          <BudgetBar used={data.budget.usedKg} budget={data.budget.budgetKg} />
          <p className="muted mt" style={{ fontSize: '0.85rem' }}>
            {monthLabel(data.budget.month)} so far. Alerts are emailed at 80% and 100%.
          </p>
          <h3 className="mt">Share by mode</h3>
          <div className="stack" style={{ gap: 8 }}>
            {data.byMode.map((m) => (
              <div key={m.mode}>
                <div className="row" style={{ justifyContent: 'space-between', fontSize: '0.85rem' }}>
                  <ModeChip mode={m.mode} />
                  <span className="num">{tonnes(m.co2Kg)} · <b>{pct(m.co2Kg / modeTotal)}</b></span>
                </div>
                <div className="progress" style={{ height: 6, marginTop: 3 }}>
                  <div style={{ width: `${(m.co2Kg / modeTotal) * 100}%`, background: c[m.mode] }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="grid g-2 mt">
        <div className="card">
          <div className="card-head">
            <h2>Emission forecast, next 3 months</h2>
            <Link to="/app/insights">Model details →</Link>
          </div>
          {forecast.data ? <ForecastChart data={forecast.data} /> : <Loading text="Running forecast…" />}
          {forecast.data && <small>Model: {forecast.data.model}</small>}
        </div>
        <div className="card">
          <div className="card-head">
            <h2>Top vendors by CO2e</h2>
            <Link to="/app/vendors">All vendors →</Link>
          </div>
          <ResponsiveContainer width="100%" height={290}>
            <BarChart data={data.byVendor.slice(0, 8)} layout="vertical" margin={{ top: 0, right: 16, left: 0, bottom: 0 }} barCategoryGap={4}>
              <CartesianGrid stroke={c.grid} horizontal={false} />
              <XAxis type="number" tickFormatter={tonnes} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} />
              <YAxis type="category" dataKey="name" width={150} tick={{ fill: c.text, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} />
              <Tooltip cursor={{ fill: c.grid }} content={<ChartTooltip valueFormatter={kg} />} />
              <Bar dataKey="co2Kg" name="CO2e" radius={[0, 4, 4, 0]} maxBarSize={22} isAnimationActive={false}>
                {data.byVendor.slice(0, 8).map((v) => <Cell key={v.vendorId} fill={c.brand} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      <div className="grid g-3 mt">
        <div className="card span-2">
          <div className="card-head">
            <h2>Route map</h2>
            <MapLegend />
          </div>
          <RouteMap routes={data.byRoute} />
        </div>
        <div className="card">
          <div className="card-head">
            <h2>High delay risk</h2>
            <Link to="/app/shipments?status=in_transit">In transit →</Link>
          </div>
          {risky.data?.items?.length ? (
            <div className="stack" style={{ gap: 10 }}>
              {risky.data.items.map((s) => (
                <div key={s._id} style={{ borderBottom: '1px solid var(--grid)', paddingBottom: 8 }}>
                  <div className="row" style={{ justifyContent: 'space-between' }}>
                    <b style={{ fontSize: '0.88rem' }}>{s.origin.city} → {s.destination.city}</b>
                    <RiskBadge risk={s.risk} />
                  </div>
                  <div className="muted" style={{ fontSize: '0.8rem' }}>{s.origin.name} · shipped {date(s.shipDate)} · <ModeChip mode={s.mode} /></div>
                  <div style={{ fontSize: '0.8rem', color: 'var(--text-2)' }}>{s.risk.reasons?.join(' · ')}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="empty">No high-risk shipments in transit</div>
          )}
          <h3 className="mt">Top routes</h3>
          <table>
            <tbody>
              {data.byRoute.slice(0, 5).map((r) => (
                <tr key={`${r.from}-${r.to}`}>
                  <td style={{ fontSize: '0.82rem' }}>{r.fromCity} → {r.toCity}</td>
                  <td className="r">{tonnes(r.co2Kg)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
