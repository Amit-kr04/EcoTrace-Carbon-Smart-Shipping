import { Router } from 'express';
import multer from 'multer';
import csv from 'csv-parser';
import { Readable } from 'node:stream';
import { Location, Shipment, Vendor } from '../models/index.js';
import { asyncHandler, requireRole } from '../middleware/auth.js';
import { buildShipment, InputError } from '../services/shipmentBuilder.js';
import { assessRisk } from '../services/ml.js';
import { checkBudget, emitToCompany } from '../services/alerts.js';
import { geocodeCity } from '../services/routing.js';
import { currentMonth } from '../services/analytics.js';

const router = Router();
const editors = requireRole('owner', 'manager', 'admin');
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });

router.get('/', asyncHandler(async (req, res) => {
  const { q, mode, status, vendor, direction, flagged, risk, from, to } = req.query;
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(200, Number(req.query.limit) || 25);
  const filter = { company: req.companyId };
  if (mode) filter.mode = mode;
  if (status) filter.status = status;
  if (vendor) filter.vendor = vendor;
  if (direction) filter.direction = direction;
  if (flagged === 'true') filter['anomaly.flag'] = true;
  if (risk) filter['risk.level'] = risk;
  if (from || to) filter.shipDate = { ...(from && { $gte: new Date(from) }), ...(to && { $lte: new Date(to) }) };
  if (q) {
    const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
    filter.$or = [{ 'origin.name': rx }, { 'destination.name': rx }, { 'origin.city': rx }, { 'destination.city': rx }, { material: rx }];
  }
  const sortField = ['shipDate', 'co2Kg', 'weightKg', 'cost', 'distanceKm'].includes(req.query.sort) ? req.query.sort : 'shipDate';
  const [items, total] = await Promise.all([
    Shipment.find(filter).sort({ [sortField]: req.query.order === 'asc' ? 1 : -1 }).skip((page - 1) * limit).limit(limit).lean(),
    Shipment.countDocuments(filter),
  ]);
  res.json({ items, total, page, pages: Math.ceil(total / limit) });
}));

// Live estimate for the "new shipment" form, nothing saved.
router.post('/preview', asyncHandler(async (req, res) => {
  const draft = await buildShipment(req.companyId, req.body);
  const [risk] = await assessRisk(req.companyId, [draft]);
  res.json({ ...draft, risk });
}));

router.post('/', editors, asyncHandler(async (req, res) => {
  const draft = await buildShipment(req.companyId, req.body);
  if (draft.status === 'in_transit') [draft.risk] = await assessRisk(req.companyId, [draft]);
  const shipment = await Shipment.create({ ...draft, source: 'manual', createdBy: req.user._id });
  emitToCompany(req.companyId, 'shipment:created', { id: shipment._id, by: req.user.name, co2Kg: shipment.co2Kg, route: `${shipment.origin.city} to ${shipment.destination.city}` });
  await checkBudget(req.companyId, currentMonth(shipment.shipDate));
  res.status(201).json(shipment);
}));

// Mark delivered / edit actual days.
router.patch('/:id', editors, asyncHandler(async (req, res) => {
  const s = await Shipment.findOne({ _id: req.params.id, company: req.companyId });
  if (!s) return res.status(404).json({ message: 'Shipment not found' });
  if (req.body.actualDays !== undefined) {
    s.actualDays = Number(req.body.actualDays);
    s.status = 'delivered';
    s.delayed = s.actualDays > s.expectedDays;
  }
  if (req.body.anomalyDismissed) s.anomaly = { flag: false, reason: 'Reviewed by user' };
  await s.save();
  emitToCompany(req.companyId, 'shipment:updated', { id: s._id });
  res.json(s);
}));

router.delete('/:id', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  await Shipment.deleteOne({ _id: req.params.id, company: req.companyId });
  emitToCompany(req.companyId, 'shipment:deleted', { id: req.params.id });
  res.json({ ok: true });
}));

// Re-score every in-transit shipment with the delay-risk model.
router.post('/rescore', editors, asyncHandler(async (req, res) => {
  const open = await Shipment.find({ company: req.companyId, status: 'in_transit' });
  const risks = await assessRisk(req.companyId, open);
  await Promise.all(open.map((s, i) => Shipment.updateOne({ _id: s._id }, { risk: risks[i] })));
  res.json({ updated: open.length });
}));

const TEMPLATE = [
  'date,vendor,vendor_city,origin,destination,destination_city,mode,weight_kg,material,cost,expected_days,actual_days',
  '2026-09-03,Konkan Steel Supply,Mumbai,,Sahyadri Plant (Chakan),Pune,road,8200,steel,,2,3',
  '2026-09-05,,,Sahyadri Plant (Chakan),Chennai Auto Cluster,Chennai,rail,6400,finished goods,,,',
].join('\n');

router.get('/import/template', (_req, res) => {
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename="ecotrace-shipments-template.csv"');
  res.send(TEMPLATE);
});

// Bulk import from CSV. Unknown vendors / destinations are created when a city is given.
router.post('/import', editors, upload.single('file'), asyncHandler(async (req, res) => {
  if (!req.file) return res.status(400).json({ message: 'Upload a .csv file in the "file" field' });
  const rows = await parseCsv(req.file.buffer);
  if (!rows.length) return res.status(400).json({ message: 'The file has no data rows' });
  if (rows.length > 5000) return res.status(400).json({ message: 'Import at most 5,000 rows at a time' });

  const vendors = new Map((await Vendor.find({ company: req.companyId })).map((v) => [v.name.toLowerCase(), v]));
  const locations = new Map((await Location.find({ company: req.companyId })).map((l) => [l.name.toLowerCase(), l]));
  const docs = [];
  const errors = [];

  for (const [i, raw] of rows.entries()) {
    const row = Object.fromEntries(Object.entries(raw).map(([k, v]) => [k.trim().toLowerCase(), String(v ?? '').trim()]));
    try {
      const input = {
        mode: row.mode?.toLowerCase(),
        weightKg: row.weight_kg,
        material: row.material,
        cost: row.cost,
        shipDate: row.date,
        expectedDays: row.expected_days,
        actualDays: row.actual_days,
      };
      if (!row.date || isNaN(new Date(row.date))) throw new InputError('Invalid or missing date');
      if (row.vendor) {
        let v = vendors.get(row.vendor.toLowerCase());
        if (!v) {
          v = await createPlace(Vendor, req.companyId, row.vendor, row.vendor_city, { materials: row.material ? [row.material.toLowerCase()] : [] });
          vendors.set(v.name.toLowerCase(), v);
        }
        input.vendorId = v._id;
      } else if (row.origin) {
        const o = locations.get(row.origin.toLowerCase());
        if (!o) throw new InputError(`Origin location "${row.origin}" not found`);
        input.fromLocationId = o._id;
      } else throw new InputError('Each row needs a vendor or an origin');
      let d = locations.get((row.destination || '').toLowerCase());
      if (!d) {
        d = await createPlace(Location, req.companyId, row.destination, row.destination_city, { type: 'customer' });
        locations.set(d.name.toLowerCase(), d);
      }
      input.toLocationId = d._id;
      const doc = await buildShipment(req.companyId, input);
      docs.push({ ...doc, source: 'csv', createdBy: req.user._id });
    } catch (err) {
      errors.push({ row: i + 2, message: err.message });
    }
  }

  const open = docs.filter((d) => d.status === 'in_transit');
  if (open.length) {
    const risks = await assessRisk(req.companyId, open);
    open.forEach((d, i) => (d.risk = risks[i]));
  }
  if (docs.length) await Shipment.insertMany(docs);
  emitToCompany(req.companyId, 'shipment:imported', { count: docs.length, by: req.user.name });
  await checkBudget(req.companyId);
  res.json({ imported: docs.length, failed: errors.length, errors: errors.slice(0, 50) });
}));

async function createPlace(Model, companyId, name, city, extra) {
  if (!name) throw new InputError('Missing name');
  if (!city) throw new InputError(`"${name}" is new; add its city in the *_city column`);
  const place = await geocodeCity(city);
  if (!place) throw new InputError(`Unknown city "${city}"`);
  return Model.create({ company: companyId, name, city: place.name, coastal: place.coastal, geo: { type: 'Point', coordinates: [place.lng, place.lat] }, ...extra });
}

function parseCsv(buffer) {
  return new Promise((resolve, reject) => {
    const rows = [];
    Readable.from(buffer)
      .pipe(csv({ mapHeaders: ({ header }) => header.replace(/^﻿/, '') }))
      .on('data', (r) => rows.push(r))
      .on('end', () => resolve(rows))
      .on('error', reject);
  });
}

export default router;
