import axios from 'axios';
import mongoose from 'mongoose';
import { config } from '../config.js';
import { Shipment } from '../models/index.js';

// Internal REST client for the Python FastAPI service, secured with a shared API key.
const client = axios.create({
  baseURL: config.mlUrl,
  timeout: 120000,
  headers: { 'x-api-key': config.mlApiKey },
});

export class MlUnavailableError extends Error {
  constructor(message) {
    super(message);
    this.status = 503;
  }
}

async function call(method, url, data) {
  try {
    const res = await client.request({ method, url, data });
    return res.data;
  } catch (err) {
    if (err.response) {
      const e = new Error(err.response.data?.detail || 'ML service error');
      e.status = err.response.status >= 500 ? 502 : err.response.status;
      throw e;
    }
    throw new MlUnavailableError('ML service is not reachable. Start it with: cd ml && uvicorn app.main:app --port 8000');
  }
}

export const ml = {
  health: () => call('get', '/health'),
  train: (companyId) => call('post', '/train', { company_id: String(companyId) }),
  metrics: (companyId) => call('get', `/metrics/${companyId}`),
  forecast: (companyId, horizon = 3) => call('post', '/forecast', { company_id: String(companyId), horizon }),
  delayRisk: (companyId, shipments) => call('post', '/delay-risk', { company_id: String(companyId), shipments }),
  anomalies: (companyId) => call('post', '/anomalies', { company_id: String(companyId) }),
  vendorClusters: (companyId) => call('post', '/vendor-clusters', { company_id: String(companyId) }),
  optimize: (payload) => call('post', '/optimize', payload),
};

export function toRiskFeatures(s) {
  return {
    id: s._id ? String(s._id) : 'draft',
    vendor_id: s.vendor ? String(s.vendor._id || s.vendor) : null,
    mode: s.mode,
    distance_km: s.distanceKm,
    weight_kg: s.weightKg,
    ship_date: new Date(s.shipDate).toISOString(),
    expected_days: s.expectedDays,
    direction: s.direction,
  };
}

export function riskLevel(p) {
  return p >= 0.5 ? 'red' : p >= 0.25 ? 'amber' : 'green';
}

// Rule-based fallback used when the ML service is down, so the UI still shows a badge.
async function heuristicRisk(companyId, s) {
  const month = new Date(s.shipDate).getMonth() + 1;
  let p = 0.08;
  const reasons = [];
  if (month >= 6 && month <= 9) {
    const add = s.mode === 'road' ? 0.2 : 0.08;
    p += add;
    reasons.push(`Monsoon month +${Math.round(add * 100)}%`);
  }
  if (month === 10 || month === 11) {
    p += 0.06;
    reasons.push('Festival season +6%');
  }
  if (s.vendor) {
    const [stats] = await Shipment.aggregate([
      { $match: { company: new mongoose.Types.ObjectId(String(companyId)), vendor: new mongoose.Types.ObjectId(String(s.vendor._id || s.vendor)), status: 'delivered' } },
      { $sort: { shipDate: -1 } },
      { $limit: 10 },
      { $group: { _id: null, late: { $sum: { $cond: ['$delayed', 1, 0] } }, n: { $sum: 1 } } },
    ]);
    if (stats?.n) {
      const add = (stats.late / stats.n) * 0.6;
      p += add;
      if (stats.late) reasons.push(`Vendor late ${stats.late}/${stats.n} times +${Math.round(add * 100)}%`);
    }
  }
  if (s.distanceKm > 1200) {
    p += 0.05;
    reasons.push('Long route +5%');
  }
  p = Math.min(0.95, p);
  return { probability: Math.round(p * 100) / 100, level: riskLevel(p), reasons, model: 'rule-based fallback' };
}

// Risk for a list of shipments: ML model when available, rules otherwise.
export async function assessRisk(companyId, shipments) {
  try {
    const res = await ml.delayRisk(companyId, shipments.map(toRiskFeatures));
    return res.predictions.map((p) => ({
      probability: p.probability,
      level: p.level,
      reasons: p.reasons,
      model: res.model,
    }));
  } catch (err) {
    if (!(err instanceof MlUnavailableError)) console.warn('[ml] risk failed:', err.message);
    return Promise.all(shipments.map((s) => heuristicRisk(companyId, s)));
  }
}

// Seasonal-naive fallback forecast: same month last year scaled by recent growth.
export function fallbackForecast(history, horizon = 3) {
  const values = history.map((h) => h.co2Kg);
  const n = values.length;
  if (n === 0) return [];
  const last = history[n - 1].month;
  const recent = avg(values.slice(-3));
  const yearAgo = n >= 15 ? avg(values.slice(n - 15, n - 12)) : recent;
  const growth = yearAgo > 0 ? recent / yearAgo : 1;
  const out = [];
  for (let i = 1; i <= horizon; i++) {
    const month = addMonths(last, i);
    const base = n - 12 + i - 1 >= 0 ? values[n - 12 + i - 1] * growth : recent;
    out.push({ month, yhat: Math.round(base), lower: Math.round(base * 0.85), upper: Math.round(base * 1.15) });
  }
  return out;
}

const avg = (a) => (a.length ? a.reduce((s, v) => s + v, 0) / a.length : 0);

export function addMonths(ym, k) {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + k, 1));
  return d.toISOString().slice(0, 7);
}
