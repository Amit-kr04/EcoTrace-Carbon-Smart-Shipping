import { Router } from 'express';
import { Company, Location, Vendor } from '../models/index.js';
import { asyncHandler } from '../middleware/auth.js';
import { currentMonth, monthCo2, summary } from '../services/analytics.js';
import { getFactors } from '../services/emissions.js';

const router = Router();

function range(q) {
  if (q.from || q.to) return { from: q.from, to: q.to };
  const months = Number(q.months) || 0;
  if (!months) return {};
  // Start at the first day of the month so the first month in a chart is complete.
  const d = new Date();
  return { from: new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - months + 1, 1)) };
}

router.get('/summary', asyncHandler(async (req, res) => {
  const filters = { ...range(req.query), mode: req.query.mode || undefined, vendor: req.query.vendor || undefined };
  const [data, company] = await Promise.all([summary(req.companyId, filters), Company.findById(req.companyId).lean()]);
  const month = currentMonth();
  res.json({
    ...data,
    byVendor: data.byVendor.slice(0, 12),
    byRoute: data.byRoute.slice(0, 40),
    budget: { month, usedKg: await monthCo2(req.companyId, month), budgetKg: company.monthlyCo2BudgetKg },
  });
}));

// Vendors -> factory/warehouse -> customers, edges weighted by CO2.
router.get('/supply-chain', asyncHandler(async (req, res) => {
  const [data, vendors, locations] = await Promise.all([
    summary(req.companyId, range({ months: req.query.months || 12 })),
    Vendor.find({ company: req.companyId }).lean(),
    Location.find({ company: req.companyId }).lean(),
  ]);
  const types = new Map();
  vendors.forEach((v) => types.set(v.name, { type: 'vendor', city: v.city, label: v.cluster?.label }));
  locations.forEach((l) => types.set(l.name, { type: l.type, city: l.city }));
  const nodes = new Map();
  const edges = data.byRoute.map((r) => {
    for (const [name, city] of [[r.from, r.fromCity], [r.to, r.toCity]]) {
      if (!nodes.has(name)) nodes.set(name, { id: name, city, ...(types.get(name) || { type: 'customer' }), co2In: 0, co2Out: 0 });
    }
    nodes.get(r.from).co2Out += r.co2Kg;
    nodes.get(r.to).co2In += r.co2Kg;
    return { source: r.from, target: r.to, co2Kg: r.co2Kg, shipments: r.shipments, modes: r.modes };
  });
  res.json({ nodes: [...nodes.values()], edges });
}));

// Totals per mode for the what-if simulator.
router.get('/mode-totals', asyncHandler(async (req, res) => {
  const [data, factors] = await Promise.all([summary(req.companyId, range({ months: req.query.months || 12 })), getFactors(req.companyId)]);
  res.json({ byMode: data.byMode, totals: data.totals, factors });
}));

export default router;
