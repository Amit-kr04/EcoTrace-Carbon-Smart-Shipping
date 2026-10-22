import { EmissionFactor } from '../models/index.js';

// Freight emission factors (kg CO2e per tonne-km), approximated from the
// UK Government GHG Conversion Factors (freighting goods). Costs (INR per
// tonne-km), speeds and handling times are indicative Indian freight averages.
export const DEFAULT_FACTORS = [
  { mode: 'road', kgCo2PerTonneKm: 0.107, costPerTonneKm: 3.2, minCharge: 1500, speedKmPerDay: 450, handlingDays: 0.5, source: 'UK GHG Conversion Factors - HGV (all diesel), average laden' },
  { mode: 'rail', kgCo2PerTonneKm: 0.028, costPerTonneKm: 1.6, minCharge: 4000, speedKmPerDay: 350, handlingDays: 2, source: 'UK GHG Conversion Factors - Freight train' },
  { mode: 'sea', kgCo2PerTonneKm: 0.016, costPerTonneKm: 1.1, minCharge: 6000, speedKmPerDay: 420, handlingDays: 3, source: 'UK GHG Conversion Factors - Container ship, average' },
  { mode: 'air', kgCo2PerTonneKm: 1.13, costPerTonneKm: 28, minCharge: 3000, speedKmPerDay: 6000, handlingDays: 1, source: 'UK GHG Conversion Factors - Air freight, short-haul' },
];

let cache = null;

export async function ensureFactors() {
  for (const f of DEFAULT_FACTORS) {
    await EmissionFactor.updateOne({ mode: f.mode }, { $setOnInsert: f }, { upsert: true });
  }
  cache = null;
}

export async function getFactors() {
  if (!cache) {
    const rows = await EmissionFactor.find().lean();
    cache = Object.fromEntries((rows.length ? rows : DEFAULT_FACTORS).map((r) => [r.mode, r]));
  }
  return cache;
}

export function clearFactorCache() {
  cache = null;
}

// CO2 = distance x weight x emission factor
export function calcCo2(distanceKm, weightKg, factor) {
  return round(distanceKm * (weightKg / 1000) * factor.kgCo2PerTonneKm, 2);
}

export function calcFreightCost(distanceKm, weightKg, factor) {
  return Math.round(Math.max(factor.minCharge, distanceKm * (weightKg / 1000) * factor.costPerTonneKm));
}

export function calcTransitDays(distanceKm, factor) {
  return Math.max(1, Math.ceil(factor.handlingDays + distanceKm / factor.speedKmPerDay));
}

// Full estimate for one leg and mode.
export function estimateLeg(distanceKm, weightKg, factor) {
  return {
    mode: factor.mode,
    distanceKm: round(distanceKm, 1),
    emissionFactor: factor.kgCo2PerTonneKm,
    co2Kg: calcCo2(distanceKm, weightKg, factor),
    cost: calcFreightCost(distanceKm, weightKg, factor),
    days: calcTransitDays(distanceKm, factor),
  };
}

export function round(n, d = 0) {
  const p = 10 ** d;
  return Math.round(n * p) / p;
}
