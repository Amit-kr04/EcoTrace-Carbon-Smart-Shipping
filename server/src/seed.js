import bcrypt from 'bcryptjs';
import { Alert, Company, Forecast, Location, Shipment, User, Vendor } from './models/index.js';
import { ensureFactors, estimateLeg, getFactors } from './services/emissions.js';
import { modeDistances, pointOf } from './services/routing.js';
import { lookupCity } from './services/cities.js';
import { assessRisk } from './services/ml.js';
import { checkBudget } from './services/alerts.js';

export const DEMO_EMAIL = 'owner@ecotrace.demo';

// Deterministic random numbers so every seed produces the same dataset.
function rng(seed) {
  return () => {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const VENDORS = [
  { name: 'Konkan Steel Supply', city: 'Mumbai', materials: ['steel'], pricePerKg: 64, monthlyCapacityKg: 300000, late: 0.05, weight: 3 },
  { name: 'Tata Steel Distributors', city: 'Jamshedpur', materials: ['steel'], pricePerKg: 59, monthlyCapacityKg: 400000, late: 0.08, weight: 2 },
  { name: 'Ludhiana Fasteners', city: 'Ludhiana', materials: ['steel', 'fasteners'], pricePerKg: 92, monthlyCapacityKg: 80000, late: 0.3, weight: 1.5 },
  { name: 'Coimbatore Castings', city: 'Coimbatore', materials: ['aluminium', 'steel'], pricePerKg: 138, monthlyCapacityKg: 150000, late: 0.1, weight: 1.5 },
  { name: 'Odisha Aluminium Works', city: 'Bhubaneswar', materials: ['aluminium'], pricePerKg: 205, monthlyCapacityKg: 150000, late: 0.09, weight: 1.2 },
  { name: 'Kerala Rubber Co-op', city: 'Kochi', materials: ['rubber'], pricePerKg: 168, monthlyCapacityKg: 120000, late: 0.11, weight: 1 },
  { name: 'Guwahati Rubber Traders', city: 'Guwahati', materials: ['rubber'], pricePerKg: 149, monthlyCapacityKg: 80000, late: 0.36, weight: 0.8 },
  { name: 'Gujarat Polymers', city: 'Ahmedabad', materials: ['plastics'], pricePerKg: 116, monthlyCapacityKg: 180000, late: 0.06, weight: 1.5 },
  { name: 'Indore Plastic Moulders', city: 'Indore', materials: ['plastics'], pricePerKg: 107, monthlyCapacityKg: 120000, late: 0.14, weight: 1 },
  { name: 'Surat Packaging House', city: 'Surat', materials: ['packaging'], pricePerKg: 38, monthlyCapacityKg: 200000, late: 0.04, weight: 1.6 },
  { name: 'Chennai Electro Parts', city: 'Chennai', materials: ['electronics'], pricePerKg: 860, monthlyCapacityKg: 30000, late: 0.09, weight: 0.9 },
];

const LOCATIONS = [
  { name: 'Sahyadri Plant (Chakan)', type: 'factory', city: 'Chakan', address: 'MIDC Phase II, Chakan, Pune' },
  { name: 'Mumbai Port Warehouse', type: 'warehouse', city: 'Mumbai', address: 'JNPT Logistics Park, Navi Mumbai' },
  { name: 'Gurugram OEM Assembly', type: 'customer', city: 'Gurugram', weight: 3 },
  { name: 'Chennai Auto Cluster', type: 'customer', city: 'Chennai', weight: 2.5 },
  { name: 'Sanand Assembly Plant', type: 'customer', city: 'Sanand', weight: 2 },
  { name: 'Hosur Two-Wheeler Plant', type: 'customer', city: 'Hosur', weight: 2 },
  { name: 'Kolkata Distributor', type: 'customer', city: 'Kolkata', weight: 1 },
  { name: 'Hyderabad Aftermarket Hub', type: 'customer', city: 'Hyderabad', weight: 1.2 },
  { name: 'Jaipur Dealer Network', type: 'customer', city: 'Jaipur', weight: 0.8 },
  { name: 'Lucknow Dealer', type: 'customer', city: 'Lucknow', weight: 0.7 },
];

const WEIGHT_RANGE = {
  steel: [3000, 16000], fasteners: [800, 4000], aluminium: [1500, 9000], rubber: [1000, 6000],
  plastics: [1000, 7000], packaging: [800, 5000], electronics: [80, 700], 'finished goods': [1500, 12000],
};

const geo = (city) => {
  const c = lookupCity(city);
  return { city: c.name, coastal: Boolean(c.coastal), geo: { type: 'Point', coordinates: [c.lng, c.lat] } };
};

export async function seedDemo({ log = console.log } = {}) {
  await ensureFactors();
  const existing = await User.findOne({ email: DEMO_EMAIL });
  if (existing) {
    const cid = existing.company;
    await Promise.all([Shipment, Vendor, Location, Alert, Forecast].map((M) => M.deleteMany({ company: cid })));
    await User.deleteMany({ company: cid });
    await Company.deleteOne({ _id: cid });
  }

  const company = await Company.create({ name: 'Sahyadri Auto Components Pvt Ltd', industry: 'Automotive parts', city: 'Pune', alertEmail: DEMO_EMAIL });
  const passwordHash = await bcrypt.hash('demo1234', 10);
  await User.insertMany([
    { name: 'Priya Deshmukh', email: DEMO_EMAIL, role: 'owner', passwordHash, company: company._id },
    { name: 'Arjun Nair', email: 'manager@ecotrace.demo', role: 'manager', passwordHash, company: company._id },
    { name: 'Sana Qureshi', email: 'admin@ecotrace.demo', role: 'admin', passwordHash, company: company._id },
  ]);
  const vendors = await Vendor.insertMany(VENDORS.map(({ late, weight, ...v }) => ({ ...v, ...geo(v.city), company: company._id })));
  const locations = await Location.insertMany(LOCATIONS.map(({ weight, ...l }) => ({ ...l, ...geo(l.city), company: company._id })));
  const factory = locations[0];
  const warehouse = locations[1];
  const customers = locations.slice(2);

  const rand = rng(42);
  const pick = (items, weights) => {
    const total = weights.reduce((a, b) => a + b, 0);
    let r = rand() * total;
    for (let i = 0; i < items.length; i++) if ((r -= weights[i]) <= 0) return items[i];
    return items[items.length - 1];
  };
  const between = (lo, hi) => lo + rand() * (hi - lo);
  const poisson = (lambda) => {
    const L = Math.exp(-lambda);
    let k = 0;
    let p = 1;
    do { k++; p *= rand(); } while (p > L);
    return k - 1;
  };

  const factors = await getFactors();
  const distCache = new Map();
  const distances = async (from, to) => {
    const key = `${from._id}|${to._id}`;
    if (!distCache.has(key)) distCache.set(key, await modeDistances(pointOf(from), pointOf(to)));
    return distCache.get(key);
  };

  const today = new Date();
  today.setUTCHours(12, 0, 0, 0);
  const start = new Date(Date.UTC(today.getUTCFullYear() - 2, today.getUTCMonth(), 1, 12));
  const totalDays = Math.round((today - start) / 86400000);
  const docs = [];

  for (let day = 0; day <= totalDays; day++) {
    const date = new Date(start.getTime() + day * 86400000);
    const month = date.getUTCMonth() + 1;
    const growth = 1 + 0.18 * (day / 730);
    const season = month >= 9 && month <= 11 ? 1.35 : month === 1 ? 0.9 : month === 6 || month === 7 ? 0.88 : 1;
    const weekday = date.getUTCDay() === 0 ? 0.25 : 1;
    const n = poisson(6.2 * growth * season * weekday);
    const monsoon = month >= 6 && month <= 9;
    const festival = month === 10 || month === 11;

    for (let k = 0; k < n; k++) {
      const inbound = rand() < 0.56;
      let origin, dest, vendorDef = null, vendor = null, material;
      if (inbound) {
        const idx = pick(VENDORS.map((_, i) => i), VENDORS.map((v) => v.weight));
        vendorDef = VENDORS[idx];
        vendor = vendors[idx];
        origin = vendor;
        dest = vendor.coastal && rand() < 0.35 ? warehouse : factory;
        material = vendorDef.materials[Math.floor(rand() * vendorDef.materials.length)];
      } else {
        origin = rand() < 0.85 ? factory : warehouse;
        dest = pick(customers, LOCATIONS.slice(2).map((l) => l.weight));
        material = 'finished goods';
      }
      const d = await distances(origin, dest);
      const airShare = material === 'electronics' ? 0.18 : 0.025;
      const mode = pick(['road', 'rail', 'sea', 'air'], [0.78, d.rail ? 0.13 : 0, d.sea ? 0.12 : 0, d.air ? airShare : 0]);
      const [lo, hi] = WEIGHT_RANGE[material];
      const weightKg = Math.round(between(lo, hi) * (mode === 'air' ? 0.25 : 1) / 10) * 10;
      const leg = estimateLeg(d[mode], weightKg, factors[mode]);

      let p = 0.02 + (vendorDef ? vendorDef.late * 1.3 : 0.04);
      if (monsoon) p += mode === 'road' ? 0.32 : mode === 'air' ? 0.03 : 0.12;
      if (festival) p += 0.1;
      if (leg.distanceKm > 1200) p += 0.1;
      if (mode === 'air') p -= 0.03;
      const delayed = rand() < p;
      const actualDays = leg.days + (delayed ? 1 + Math.floor(rand() * 3) + (monsoon ? 1 : 0) : 0);
      const arrives = new Date(date.getTime() + leg.days * 86400000);
      const delivered = arrives < today;

      docs.push({
        company: company._id,
        direction: inbound ? 'inbound' : 'outbound',
        vendor: vendor?._id,
        fromLocation: inbound ? undefined : origin._id,
        toLocation: dest._id,
        origin: { name: origin.name, city: origin.city, lat: origin.geo.coordinates[1], lng: origin.geo.coordinates[0] },
        destination: { name: dest.name, city: dest.city, lat: dest.geo.coordinates[1], lng: dest.geo.coordinates[0] },
        material,
        mode,
        weightKg,
        distanceKm: leg.distanceKm,
        emissionFactor: leg.emissionFactor,
        co2Kg: leg.co2Kg,
        cost: Math.round(leg.cost * between(0.92, 1.12)),
        shipDate: new Date(date.getTime() + Math.floor(rand() * 10) * 3600000),
        expectedDays: leg.days,
        actualDays: delivered ? actualDays : undefined,
        status: delivered ? 'delivered' : 'in_transit',
        delayed: delivered ? delayed : false,
        source: 'seed',
      });
    }
  }

  // A few deliberately wrong entries for the anomaly detector to find.
  const candidates = docs.slice(0, -50).filter((s) => s.mode === 'road' || s.mode === 'rail');
  for (let i = 0; i < 14; i++) {
    const s = candidates[Math.floor(rand() * candidates.length)];
    const kind = i % 3;
    if (kind === 0) s.weightKg *= 10; // extra zero in the weight
    if (kind === 1) s.cost = Math.round(s.cost * 12); // extra zero in the invoice
    if (kind === 2) s.distanceKm = Math.round(s.distanceKm * 8); // wrong destination
    s.co2Kg = Math.round(s.distanceKm * (s.weightKg / 1000) * s.emissionFactor * 100) / 100;
  }

  await Shipment.insertMany(docs, { ordered: false });

  // Budget set just under the recent average so the alerts and optimizer have something to do.
  const recent = docs.filter((s) => s.shipDate >= new Date(today.getTime() - 92 * 86400000));
  const avgMonth = recent.reduce((a, s) => a + s.co2Kg, 0) / 3;
  company.monthlyCo2BudgetKg = Math.round((avgMonth * 1.1) / 1000) * 1000;
  await company.save();

  const open = await Shipment.find({ company: company._id, status: 'in_transit' });
  const risks = await assessRisk(company._id, open);
  await Promise.all(open.map((s, i) => Shipment.updateOne({ _id: s._id }, { risk: risks[i] })));
  await checkBudget(company._id);

  log(`[seed] demo company created: ${docs.length} shipments, ${vendors.length} vendors, ${locations.length} locations`);
  log(`[seed] sign in with ${DEMO_EMAIL} / demo1234 (also manager@ecotrace.demo, admin@ecotrace.demo)`);
  return company;
}
