import { Router } from 'express';
import { Location, Shipment, Vendor } from '../models/index.js';
import { asyncHandler, requireRole } from '../middleware/auth.js';
import { geocodeCity } from '../services/routing.js';
import { summary } from '../services/analytics.js';

// Vendors and delivery locations (factory, warehouses, customers).
const router = Router();
const editors = requireRole('owner', 'manager', 'admin');

async function placeFields(body) {
  const place = await geocodeCity(body.city);
  if (!place) {
    const e = new Error(`Could not find the city "${body.city}". Try a nearby major city.`);
    e.status = 400;
    throw e;
  }
  return { city: place.name, coastal: body.coastal ?? place.coastal, geo: { type: 'Point', coordinates: [place.lng, place.lat] } };
}

function parseMaterials(m) {
  if (Array.isArray(m)) return m.map((s) => s.trim().toLowerCase()).filter(Boolean);
  return String(m || '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean);
}

// ---- Vendors ----
router.get('/vendors', asyncHandler(async (req, res) => {
  const [vendors, stats] = await Promise.all([
    Vendor.find({ company: req.companyId }).sort({ name: 1 }).lean(),
    summary(req.companyId),
  ]);
  const byId = Object.fromEntries(stats.byVendor.map((v) => [String(v.vendorId), v]));
  res.json(vendors.map((v) => {
    const s = byId[String(v._id)] || {};
    return { ...v, stats: { shipments: s.shipments || 0, co2Kg: s.co2Kg || 0, weightKg: s.weightKg || 0, onTimeRate: s.onTimeRate ?? null, co2PerTonne: s.weightKg ? s.co2Kg / (s.weightKg / 1000) : null } };
  }));
}));

router.post('/vendors', editors, asyncHandler(async (req, res) => {
  const { name, materials, pricePerKg, monthlyCapacityKg, contactEmail } = req.body;
  if (!name || !req.body.city) return res.status(400).json({ message: 'Name and city are required' });
  const vendor = await Vendor.create({
    company: req.companyId, name, materials: parseMaterials(materials), pricePerKg, monthlyCapacityKg, contactEmail, ...(await placeFields(req.body)),
  });
  res.status(201).json(vendor);
}));

router.put('/vendors/:id', editors, asyncHandler(async (req, res) => {
  const vendor = await Vendor.findOne({ _id: req.params.id, company: req.companyId });
  if (!vendor) return res.status(404).json({ message: 'Vendor not found' });
  const { name, materials, pricePerKg, monthlyCapacityKg, contactEmail, city } = req.body;
  Object.assign(vendor, { name, pricePerKg, monthlyCapacityKg, contactEmail, materials: parseMaterials(materials) });
  if (city && city !== vendor.city) Object.assign(vendor, await placeFields(req.body));
  await vendor.save();
  res.json(vendor);
}));

router.delete('/vendors/:id', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const used = await Shipment.countDocuments({ company: req.companyId, vendor: req.params.id });
  if (used) return res.status(409).json({ message: `This vendor has ${used} shipments and cannot be deleted` });
  await Vendor.deleteOne({ _id: req.params.id, company: req.companyId });
  res.json({ ok: true });
}));

// ---- Locations ----
router.get('/locations', asyncHandler(async (req, res) => {
  res.json(await Location.find({ company: req.companyId }).sort({ type: 1, name: 1 }).lean());
}));

router.post('/locations', editors, asyncHandler(async (req, res) => {
  const { name, type, address } = req.body;
  if (!name || !req.body.city) return res.status(400).json({ message: 'Name and city are required' });
  const loc = await Location.create({ company: req.companyId, name, type, address, ...(await placeFields(req.body)) });
  res.status(201).json(loc);
}));

router.put('/locations/:id', editors, asyncHandler(async (req, res) => {
  const loc = await Location.findOne({ _id: req.params.id, company: req.companyId });
  if (!loc) return res.status(404).json({ message: 'Location not found' });
  const { name, type, address, city } = req.body;
  Object.assign(loc, { name, type, address });
  if (city && city !== loc.city) Object.assign(loc, await placeFields(req.body));
  await loc.save();
  res.json(loc);
}));

router.delete('/locations/:id', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const used = await Shipment.countDocuments({ company: req.companyId, $or: [{ toLocation: req.params.id }, { fromLocation: req.params.id }] });
  if (used) return res.status(409).json({ message: `This location has ${used} shipments and cannot be deleted` });
  await Location.deleteOne({ _id: req.params.id, company: req.companyId });
  res.json({ ok: true });
}));

// Nearby vendors to a location (geospatial query), used by the compare page.
router.get('/locations/:id/nearby-vendors', asyncHandler(async (req, res) => {
  const loc = await Location.findOne({ _id: req.params.id, company: req.companyId });
  if (!loc) return res.status(404).json({ message: 'Location not found' });
  const km = Number(req.query.km) || 800;
  const vendors = await Vendor.find({
    company: req.companyId,
    geo: { $nearSphere: { $geometry: loc.geo, $maxDistance: km * 1000 } },
  }).lean();
  res.json(vendors);
}));

export default router;
