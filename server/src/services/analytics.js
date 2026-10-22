import mongoose from 'mongoose';
import { Shipment } from '../models/index.js';

const oid = (id) => new mongoose.Types.ObjectId(String(id));

export function monthRange(ym) {
  const [y, m] = ym.split('-').map(Number);
  return { from: new Date(Date.UTC(y, m - 1, 1)), to: new Date(Date.UTC(y, m, 1)) };
}

export function currentMonth(d = new Date()) {
  return d.toISOString().slice(0, 7);
}

function matchStage(companyId, { from, to, mode, vendor } = {}) {
  const match = { company: oid(companyId) };
  if (from || to) {
    match.shipDate = {};
    if (from) match.shipDate.$gte = new Date(from);
    if (to) match.shipDate.$lt = new Date(to);
  }
  if (mode) match.mode = mode;
  if (vendor) match.vendor = oid(vendor);
  return match;
}

const tonneKm = { $multiply: ['$distanceKm', { $divide: ['$weightKg', 1000] }] };

// One aggregation with $facet producing every dashboard block.
export async function summary(companyId, filters = {}) {
  const [res] = await Shipment.aggregate([
    { $match: matchStage(companyId, filters) },
    {
      $facet: {
        totals: [
          {
            $group: {
              _id: null,
              co2Kg: { $sum: '$co2Kg' },
              cost: { $sum: '$cost' },
              shipments: { $sum: 1 },
              weightKg: { $sum: '$weightKg' },
              tonneKm: { $sum: tonneKm },
              delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
              late: { $sum: { $cond: ['$delayed', 1, 0] } },
              inTransit: { $sum: { $cond: [{ $eq: ['$status', 'in_transit'] }, 1, 0] } },
              flagged: { $sum: { $cond: ['$anomaly.flag', 1, 0] } },
            },
          },
        ],
        monthly: [
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$shipDate' } },
              co2Kg: { $sum: '$co2Kg' },
              cost: { $sum: '$cost' },
              shipments: { $sum: 1 },
              road: { $sum: { $cond: [{ $eq: ['$mode', 'road'] }, '$co2Kg', 0] } },
              rail: { $sum: { $cond: [{ $eq: ['$mode', 'rail'] }, '$co2Kg', 0] } },
              sea: { $sum: { $cond: [{ $eq: ['$mode', 'sea'] }, '$co2Kg', 0] } },
              air: { $sum: { $cond: [{ $eq: ['$mode', 'air'] }, '$co2Kg', 0] } },
            },
          },
          { $sort: { _id: 1 } },
        ],
        byMode: [
          {
            $group: {
              _id: '$mode',
              co2Kg: { $sum: '$co2Kg' },
              cost: { $sum: '$cost' },
              shipments: { $sum: 1 },
              tonneKm: { $sum: tonneKm },
              late: { $sum: { $cond: ['$delayed', 1, 0] } },
            },
          },
          { $sort: { co2Kg: -1 } },
        ],
        byVendor: [
          { $match: { vendor: { $ne: null } } },
          {
            $group: {
              _id: '$vendor',
              name: { $first: '$origin.name' },
              city: { $first: '$origin.city' },
              co2Kg: { $sum: '$co2Kg' },
              cost: { $sum: '$cost' },
              shipments: { $sum: 1 },
              weightKg: { $sum: '$weightKg' },
              delivered: { $sum: { $cond: [{ $eq: ['$status', 'delivered'] }, 1, 0] } },
              late: { $sum: { $cond: ['$delayed', 1, 0] } },
            },
          },
          { $sort: { co2Kg: -1 } },
        ],
        byRoute: [
          {
            $group: {
              _id: { from: '$origin.name', to: '$destination.name' },
              fromCity: { $first: '$origin.city' },
              toCity: { $first: '$destination.city' },
              from: { $first: { lat: '$origin.lat', lng: '$origin.lng' } },
              to: { $first: { lat: '$destination.lat', lng: '$destination.lng' } },
              co2Kg: { $sum: '$co2Kg' },
              shipments: { $sum: 1 },
              distanceKm: { $avg: '$distanceKm' },
              modes: { $addToSet: '$mode' },
            },
          },
          { $sort: { co2Kg: -1 } },
        ],
      },
    },
  ]);

  const t = res.totals[0] || { co2Kg: 0, cost: 0, shipments: 0, weightKg: 0, tonneKm: 0, delivered: 0, late: 0, inTransit: 0, flagged: 0 };
  return {
    totals: {
      ...t,
      _id: undefined,
      co2PerTonneKm: t.tonneKm ? t.co2Kg / t.tonneKm : 0,
      onTimeRate: t.delivered ? 1 - t.late / t.delivered : null,
    },
    monthly: res.monthly.map((m) => ({ month: m._id, ...m, _id: undefined })),
    byMode: res.byMode.map((m) => ({ mode: m._id, ...m, _id: undefined })),
    byVendor: res.byVendor.map((v) => ({ vendorId: v._id, ...v, _id: undefined, onTimeRate: v.delivered ? 1 - v.late / v.delivered : null })),
    byRoute: res.byRoute.map((r) => ({ from: r._id.from, to: r._id.to, fromCity: r.fromCity, toCity: r.toCity, fromPt: r.from, toPt: r.to, co2Kg: r.co2Kg, shipments: r.shipments, distanceKm: r.distanceKm, modes: r.modes })),
  };
}

export async function monthCo2(companyId, ym) {
  const { from, to } = monthRange(ym);
  const [r] = await Shipment.aggregate([
    { $match: { company: oid(companyId), shipDate: { $gte: from, $lt: to } } },
    { $group: { _id: null, co2Kg: { $sum: '$co2Kg' } } },
  ]);
  return r?.co2Kg || 0;
}

// Complete calendar months of CO2, for forecasting.
export async function monthlyHistory(companyId) {
  const start = new Date(Date.UTC(new Date().getUTCFullYear(), new Date().getUTCMonth(), 1));
  const rows = await Shipment.aggregate([
    { $match: { company: oid(companyId), shipDate: { $lt: start } } },
    { $group: { _id: { $dateToString: { format: '%Y-%m', date: '$shipDate' } }, co2Kg: { $sum: '$co2Kg' } } },
    { $sort: { _id: 1 } },
  ]);
  return rows.map((r) => ({ month: r._id, co2Kg: Math.round(r.co2Kg) }));
}
