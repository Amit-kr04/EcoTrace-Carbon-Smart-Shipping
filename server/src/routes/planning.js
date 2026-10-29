import { Router } from 'express';
import mongoose from 'mongoose';
import { Company, Location, Shipment, Vendor } from '../models/index.js';
import { asyncHandler } from '../middleware/auth.js';
import { estimateLeg, getFactors } from '../services/emissions.js';
import { modeDistances, pointOf } from '../services/routing.js';
import { summary } from '../services/analytics.js';
import { addMonths, ml } from '../services/ml.js';

// Green Option Comparator and the carbon-budget optimizer.
const router = Router();

// Possible sources for a destination: vendors for inbound (factory/warehouse),
// the company's own factory/warehouses for outbound (customers).
async function candidateSources(companyId, dest, material) {
  if (dest.type === 'customer') {
    const own = await Location.find({ company: companyId, type: { $in: ['factory', 'warehouse'] } }).lean();
    return own.map((l) => ({ kind: 'location', doc: l, price: 0, capacityKg: null }));
  }
  const filter = { company: companyId };
  if (material) filter.materials = material.toLowerCase();
  const vendors = await Vendor.find(filter).lean();
  return vendors.map((v) => ({ kind: 'vendor', doc: v, price: v.pricePerKg || 0, capacityKg: v.monthlyCapacityKg || null }));
}

async function vendorReliability(companyId) {
  const s = await summary(companyId);
  return Object.fromEntries(s.byVendor.map((v) => [String(v.vendorId), v.onTimeRate]));
}

async function buildOptions(companyId, dest, material, weightKg, reliability) {
  const [sources, factors] = await Promise.all([candidateSources(companyId, dest, material), getFactors(companyId)]);
  const b = pointOf(dest);
  const options = [];
  for (const src of sources) {
    if (src.kind === 'location' && String(src.doc._id) === String(dest._id)) continue;
    const distances = await modeDistances(pointOf(src.doc), b);
    for (const [mode, km] of Object.entries(distances)) {
      if (!km) continue;
      const leg = estimateLeg(km, weightKg, factors[mode]);
      const goodsCost = Math.round(src.price * weightKg);
      options.push({
        sourceId: String(src.doc._id),
        sourceKind: src.kind,
        sourceName: src.doc.name,
        sourceCity: src.doc.city,
        cluster: src.doc.cluster?.label,
        capacityKg: src.capacityKg,
        onTimeRate: src.kind === 'vendor' ? reliability[String(src.doc._id)] ?? null : null,
        ...leg,
        freightCost: leg.cost,
        goodsCost,
        totalCost: goodsCost + leg.cost,
        // Linear per-kg coefficients for the optimizer (min charges ignored).
        costPerKg: src.price + (km * factors[mode].costPerTonneKm) / 1000,
        co2PerKg: (km * factors[mode].kgCo2PerTonneKm) / 1000,
      });
    }
  }
  return options;
}

// Weighted score: 0..100, higher is better. Each metric is min-max normalised.
function score(options, weights) {
  const w = { carbon: Number(weights?.carbon ?? 50), cost: Number(weights?.cost ?? 30), time: Number(weights?.time ?? 20) };
  const sum = w.carbon + w.cost + w.time || 1;
  const metric = { carbon: 'co2Kg', cost: 'totalCost', time: 'days' };
  const bounds = Object.fromEntries(Object.entries(metric).map(([k, f]) => {
    const vals = options.map((o) => o[f]);
    return [k, [Math.min(...vals), Math.max(...vals)]];
  }));
  return options
    .map((o) => {
      const parts = Object.fromEntries(Object.entries(metric).map(([k, f]) => {
        const [lo, hi] = bounds[k];
        return [k, hi === lo ? 1 : 1 - (o[f] - lo) / (hi - lo)];
      }));
      const s = (w.carbon * parts.carbon + w.cost * parts.cost + w.time * parts.time) / sum;
      return { ...o, score: Math.round(s * 1000) / 10, parts };
    })
    .sort((a, b) => b.score - a.score)
    .map((o, i) => ({ ...o, rank: i + 1 }));
}

router.post('/compare', asyncHandler(async (req, res) => {
  const { toLocationId, material, weights } = req.body;
  const weightKg = Number(req.body.weightKg);
  if (!toLocationId || !(weightKg > 0)) return res.status(400).json({ message: 'Choose a destination and a weight' });
  const dest = await Location.findOne({ _id: toLocationId, company: req.companyId }).lean();
  if (!dest) return res.status(404).json({ message: 'Destination not found' });
  const options = await buildOptions(req.companyId, dest, material, weightKg, await vendorReliability(req.companyId));
  if (!options.length) return res.json({ options: [], message: material ? `No vendor supplies "${material}". Add one on the Vendors page.` : 'No sources available' });
  const ranked = score(options, weights);
  const greenest = Math.min(...ranked.map((o) => o.co2Kg));
  const cheapest = Math.min(...ranked.map((o) => o.totalCost));
  const fastest = Math.min(...ranked.map((o) => o.days));
  res.json({ destination: dest, options: ranked, best: { greenest, cheapest, fastest } });
}));

// Baseline for the optimizer: last month's real demand and what the current mix cost.
router.get('/optimize/baseline', asyncHandler(async (req, res) => {
  const month = req.query.month || addMonths(new Date().toISOString().slice(0, 7), -1);
  const [y, m] = month.split('-').map(Number);
  const from = new Date(Date.UTC(y, m - 1, 1));
  const to = new Date(Date.UTC(y, m, 1));
  const companyId = new mongoose.Types.ObjectId(String(req.companyId));
  const [company, factors, vendors] = await Promise.all([Company.findById(companyId).lean(), getFactors(companyId), Vendor.find({ company: companyId }).lean()]);
  const price = Object.fromEntries(vendors.map((v) => [String(v._id), v.pricePerKg || 0]));
  const shipments = await Shipment.find({ company: companyId, shipDate: { $gte: from, $lt: to } }).lean();

  const groups = new Map();
  let co2 = 0;
  let cost = 0;
  for (const s of shipments) {
    co2 += s.co2Kg;
    cost += (s.vendor ? price[String(s.vendor)] || 0 : 0) * s.weightKg + (s.distanceKm * s.weightKg / 1000) * factors[s.mode].costPerTonneKm;
    const key = `${s.toLocation}|${s.direction === 'inbound' ? s.material : ''}`;
    const g = groups.get(key) || { toLocationId: String(s.toLocation), destination: s.destination.name, city: s.destination.city, material: s.direction === 'inbound' ? s.material : '', weightKg: 0, shipments: 0, days: [] };
    g.weightKg += s.weightKg;
    g.shipments += 1;
    if (s.mode !== 'air') g.days.push(s.expectedDays);
    groups.set(key, g);
  }
  const demands = [...groups.values()]
    .map(({ days, ...g }) => ({ ...g, weightKg: Math.round(g.weightKg), deadlineDays: days.length ? Math.max(...days) + 1 : 7 }))
    .sort((a, b) => b.weightKg - a.weightKg);
  res.json({ month, demands, current: { co2Kg: Math.round(co2), cost: Math.round(cost), shipments: shipments.length }, co2BudgetKg: company.monthlyCo2BudgetKg });
}));

router.post('/optimize', asyncHandler(async (req, res) => {
  const { demands, co2BudgetKg } = req.body;
  if (!Array.isArray(demands) || !demands.length) return res.status(400).json({ message: 'Add at least one demand row' });
  const reliability = await vendorReliability(req.companyId);
  const options = [];
  const capacities = {};
  for (const [i, d] of demands.entries()) {
    const dest = await Location.findOne({ _id: d.toLocationId, company: req.companyId }).lean();
    if (!dest) return res.status(400).json({ message: `Row ${i + 1}: destination not found` });
    const opts = await buildOptions(req.companyId, dest, d.material, Number(d.weightKg), reliability);
    for (const o of opts) {
      if (o.days > Number(d.deadlineDays || 99)) continue;
      if (o.capacityKg) capacities[o.sourceId] = o.capacityKg;
      options.push({ ...o, demand: i, destination: dest.name, material: d.material });
    }
    if (!options.some((o) => o.demand === i)) return res.status(400).json({ message: `Row ${i + 1} (${dest.name}${d.material ? `, ${d.material}` : ''}): no source can deliver within ${d.deadlineDays} days` });
  }
  const result = await ml.optimize({
    demands: demands.map((d) => ({ weight_kg: Number(d.weightKg) })),
    options: options.map((o, id) => ({ id, demand: o.demand, source: o.sourceId, cost_per_kg: o.costPerKg, co2_per_kg: o.co2PerKg })),
    capacities,
    co2_budget_kg: Number(co2BudgetKg) || null,
  });
  const plan = result.allocations.map((a) => {
    const o = options[a.id];
    return {
      demand: o.demand, destination: o.destination, material: o.material, source: o.sourceName, sourceCity: o.sourceCity, mode: o.mode, days: o.days,
      weightKg: Math.round(a.weight_kg), co2Kg: Math.round(a.weight_kg * o.co2PerKg), cost: Math.round(a.weight_kg * o.costPerKg),
    };
  });
  res.json({ ...result, allocations: undefined, plan });
}));

export default router;
