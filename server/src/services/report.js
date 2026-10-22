import PDFDocument from 'pdfkit';
import { Company } from '../models/index.js';
import { monthRange, summary } from './analytics.js';
import { addMonths } from './ml.js';

const GREEN = '#1d6b4c';
const INK = '#1f2a24';
const MUTED = '#6b7570';
const MODE_COLORS = { road: '#2a78d6', rail: '#eb6834', sea: '#1baf7a', air: '#eda100' };

const kg = (n) => `${Math.round(n).toLocaleString('en-IN')} kg`;
const inr = (n) => `Rs ${Math.round(n).toLocaleString('en-IN')}`;
const pct = (n) => (n == null ? '-' : `${Math.round(n * 100)}%`);

// Builds the monthly sustainability report as a PDF buffer.
export async function buildMonthlyReport(companyId, ym) {
  const company = await Company.findById(companyId).lean();
  const { from, to } = monthRange(ym);
  const prev = monthRange(addMonths(ym, -1));
  const [cur, last] = await Promise.all([summary(companyId, { from, to }), summary(companyId, prev)]);

  const doc = new PDFDocument({ size: 'A4', margin: 50 });
  const chunks = [];
  doc.on('data', (c) => chunks.push(c));
  const done = new Promise((resolve) => doc.on('end', () => resolve(Buffer.concat(chunks))));

  // Header
  doc.rect(0, 0, doc.page.width, 90).fill(GREEN);
  doc.fillColor('#ffffff').fontSize(22).font('Helvetica-Bold').text('EcoTrace', 50, 28);
  doc.fontSize(11).font('Helvetica').text(`Monthly Sustainability Report  |  ${monthLabel(ym)}`, 50, 56);
  doc.fillColor(INK).fontSize(14).font('Helvetica-Bold').text(company.name, 50, 110);
  doc.fontSize(9).font('Helvetica').fillColor(MUTED).text(`Transport (Scope 3, upstream and downstream) emissions. Generated ${new Date().toLocaleDateString('en-IN')}.`);
  doc.moveDown(1);

  // KPI row
  const t = cur.totals;
  const change = last.totals.co2Kg ? (t.co2Kg - last.totals.co2Kg) / last.totals.co2Kg : null;
  const kpis = [
    ['Total CO2e', kg(t.co2Kg)],
    ['vs last month', change == null ? '-' : `${change > 0 ? '+' : ''}${Math.round(change * 100)}%`],
    ['Shipments', String(t.shipments)],
    ['Freight cost', inr(t.cost)],
    ['On-time rate', pct(t.onTimeRate)],
  ];
  const y0 = doc.y;
  const w = (doc.page.width - 100) / kpis.length;
  kpis.forEach(([label, value], i) => {
    const x = 50 + i * w;
    doc.roundedRect(x, y0, w - 8, 48, 4).strokeColor('#d5ded9').stroke();
    doc.fillColor(MUTED).fontSize(8).text(label, x + 8, y0 + 8, { width: w - 20 });
    doc.fillColor(INK).fontSize(12).font('Helvetica-Bold').text(value, x + 8, y0 + 24, { width: w - 20 });
    doc.font('Helvetica');
  });
  doc.y = y0 + 64;

  // Budget bar
  const budget = company.monthlyCo2BudgetKg || 0;
  if (budget) {
    const ratio = t.co2Kg / budget;
    section(doc, 'Carbon budget');
    doc.fontSize(9).fillColor(INK).text(`${kg(t.co2Kg)} of ${kg(budget)} budget used (${pct(ratio)}).`);
    const by = doc.y + 6;
    const bw = doc.page.width - 100;
    doc.rect(50, by, bw, 10).fill('#e6ece9');
    doc.rect(50, by, Math.min(1, ratio) * bw, 10).fill(ratio >= 1 ? '#d03b3b' : ratio >= 0.8 ? '#fab219' : '#0ca30c');
    doc.y = by + 22;
  }

  // Emissions by mode, horizontal bars
  section(doc, 'Emissions by transport mode');
  const maxMode = Math.max(1, ...cur.byMode.map((m) => m.co2Kg));
  cur.byMode.forEach((m) => {
    const y = doc.y;
    doc.fillColor(INK).fontSize(9).text(cap(m.mode), 50, y, { width: 50 });
    doc.roundedRect(105, y, (m.co2Kg / maxMode) * 280, 10, 2).fill(MODE_COLORS[m.mode]);
    doc.fillColor(INK).text(`${kg(m.co2Kg)}  (${pct(m.co2Kg / (t.co2Kg || 1))}, ${m.shipments} shipments)`, 395, y);
    doc.y = y + 16;
  });

  // Vendors table
  section(doc, 'Top vendors by emissions');
  table(doc, ['Vendor', 'City', 'Shipments', 'CO2e', 'On-time'], [150, 90, 70, 100, 70],
    cur.byVendor.slice(0, 8).map((v) => [v.name, v.city, String(v.shipments), kg(v.co2Kg), pct(v.onTimeRate)]));

  // Routes table
  section(doc, 'Highest-emission routes');
  table(doc, ['Route', 'Avg distance', 'Shipments', 'CO2e'], [230, 90, 70, 100],
    cur.byRoute.slice(0, 6).map((r) => [`${r.fromCity} to ${r.toCity}`, `${Math.round(r.distanceKm)} km`, String(r.shipments), kg(r.co2Kg)]));

  // Recommendations
  section(doc, 'Recommendations');
  const road = cur.byMode.find((m) => m.mode === 'road');
  const air = cur.byMode.find((m) => m.mode === 'air');
  const recs = [];
  if (road) recs.push(`Road freight produced ${pct(road.co2Kg / (t.co2Kg || 1))} of emissions. Moving 30% of long-haul road tonne-km to rail would save about ${kg(road.tonneKm * 0.3 * (0.107 - 0.028))} CO2e per month.`);
  if (air?.co2Kg) recs.push(`Air freight emitted ${kg(air.co2Kg)} from ${air.shipments} shipments. Plan these earlier to use road or rail.`);
  const lateVendor = cur.byVendor.filter((v) => v.delivered >= 5).sort((a, b) => a.onTimeRate - b.onTimeRate)[0];
  if (lateVendor && lateVendor.onTimeRate < 0.8) recs.push(`${lateVendor.name} delivered on time only ${pct(lateVendor.onTimeRate)} of the time. Consider an alternative vendor during the monsoon.`);
  recs.forEach((r) => doc.fontSize(9).fillColor(INK).text(`-  ${r}`, { width: doc.page.width - 100 }).moveDown(0.3));

  doc.moveDown(1);
  doc.fontSize(7.5).fillColor(MUTED).text('Emission factors: UK Government GHG Conversion Factors (freighting goods). Figures are estimates, not certified carbon accounting.', 50, doc.page.height - 70, { width: doc.page.width - 100 });
  doc.end();
  return done;
}

function section(doc, title) {
  if (doc.y > doc.page.height - 160) doc.addPage();
  doc.moveDown(0.8);
  doc.fillColor(GREEN).fontSize(12).font('Helvetica-Bold').text(title, 50);
  doc.font('Helvetica').moveDown(0.4);
}

function table(doc, headers, widths, rows) {
  let y = doc.y;
  const drawRow = (cells, bold, fill) => {
    if (fill) doc.rect(50, y - 3, widths.reduce((a, b) => a + b, 0), 16).fill(fill);
    let x = 50;
    doc.font(bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(8.5).fillColor(bold ? '#ffffff' : INK);
    cells.forEach((c, i) => {
      doc.text(c, x + 4, y, { width: widths[i] - 8, lineBreak: false, ellipsis: true });
      x += widths[i];
    });
    y += 16;
  };
  drawRow(headers, true, GREEN);
  rows.forEach((r, i) => drawRow(r, false, i % 2 ? '#f3f7f5' : null));
  doc.font('Helvetica');
  doc.y = y + 4;
}

const cap = (s) => s[0].toUpperCase() + s.slice(1);
function monthLabel(ym) {
  const [y, m] = ym.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, 1)).toLocaleDateString('en-IN', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}
