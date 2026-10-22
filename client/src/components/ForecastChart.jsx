import { Area, CartesianGrid, ComposedChart, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { ChartTooltip, Legend, monthLabel, tonnes, useChartColors } from './ui.jsx';

// Actual monthly CO2 (solid) + forecast (dashed) with an 80% confidence band.
export default function ForecastChart({ data, height = 260, months = 15 }) {
  const c = useChartColors();
  if (!data?.history?.length) return null;
  const hist = data.history.slice(-months);
  const last = hist[hist.length - 1];
  const rows = [
    ...hist.map((h) => ({ month: h.month, actual: h.co2Kg })),
    ...data.forecast.map((f) => ({ month: f.month, forecast: f.yhat, band: [f.lower, f.upper] })),
  ];
  // Connect the forecast line to the last actual point.
  rows[hist.length - 1] = { ...rows[hist.length - 1], forecast: last.co2Kg, band: [last.co2Kg, last.co2Kg] };
  return (
    <>
      <Legend items={[{ label: 'Actual', color: c.brand }, { label: 'Forecast', color: c.accent, dashed: true }, { label: '80% confidence band', color: `${c.accent}33` }]} />
      <ResponsiveContainer width="100%" height={height}>
        <ComposedChart data={rows} margin={{ top: 10, right: 8, left: 0, bottom: 0 }}>
          <CartesianGrid stroke={c.grid} vertical={false} />
          <XAxis dataKey="month" tickFormatter={monthLabel} tick={{ fill: c.muted, fontSize: 11 }} axisLine={{ stroke: c.axis }} tickLine={false} minTickGap={16} />
          <YAxis tickFormatter={tonnes} tick={{ fill: c.muted, fontSize: 11 }} axisLine={false} tickLine={false} width={56} />
          <Tooltip content={<ChartTooltip labelFormatter={monthLabel} valueFormatter={tonnes} />} />
          <Area dataKey="band" name="80% band" stroke="none" fill={c.accent} fillOpacity={0.18} isAnimationActive={false} />
          <Line dataKey="actual" name="Actual" stroke={c.brand} strokeWidth={2} dot={false} activeDot={{ r: 4 }} isAnimationActive={false} />
          <Line dataKey="forecast" name="Forecast" stroke={c.accent} strokeWidth={2} strokeDasharray="5 4" dot={{ r: 3 }} isAnimationActive={false} />
        </ComposedChart>
      </ResponsiveContainer>
    </>
  );
}
