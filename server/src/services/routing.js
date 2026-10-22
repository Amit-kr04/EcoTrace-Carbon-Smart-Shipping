import axios from 'axios';
import { config } from '../config.js';
import { DistanceCache } from '../models/index.js';
import { lookupCity } from './cities.js';

const ORS = 'https://api.openrouteservice.org';
const memo = new Map();

export function haversineKm(a, b) {
  const R = 6371;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(h));
}

// City name -> { name, lat, lng, coastal }. Local table first, then ORS geocoding.
export async function geocodeCity(city) {
  const local = lookupCity(city);
  if (local) return { ...local, coastal: Boolean(local.coastal) };
  if (!config.orsKey) return null;
  try {
    const { data } = await axios.get(`${ORS}/geocode/search`, {
      params: { api_key: config.orsKey, text: city, 'boundary.country': 'IN', size: 1 },
      timeout: 8000,
    });
    const f = data.features?.[0];
    if (!f) return null;
    const [lng, lat] = f.geometry.coordinates;
    return { name: f.properties.locality || f.properties.name || city, lat, lng, coastal: false };
  } catch (err) {
    console.warn('[ors] geocode failed:', err.message);
    return null;
  }
}

// Road distance between two points: ORS driving-hgv (truck profile), cached in MongoDB.
// Falls back to straight-line x 1.25 when there is no key or the API is unavailable.
export async function roadDistanceKm(a, b) {
  const key = [a.lat, a.lng, b.lat, b.lng].map((n) => n.toFixed(3)).join('|');
  if (memo.has(key)) return memo.get(key);
  const cached = await DistanceCache.findOne({ key }).lean();
  if (cached) {
    memo.set(key, cached.km);
    return cached.km;
  }
  let km = null;
  let source = 'haversine';
  if (config.orsKey) {
    try {
      const { data } = await axios.post(
        `${ORS}/v2/directions/driving-hgv`,
        { coordinates: [[a.lng, a.lat], [b.lng, b.lat]] },
        { headers: { Authorization: config.orsKey }, timeout: 10000 }
      );
      km = data.routes[0].summary.distance / 1000;
      source = 'openrouteservice';
    } catch (err) {
      console.warn('[ors] directions failed, using haversine:', err.message);
    }
  }
  if (km == null) km = haversineKm(a, b) * 1.25;
  km = Math.round(km * 10) / 10;
  memo.set(key, km);
  await DistanceCache.updateOne({ key }, { key, km, source }, { upsert: true });
  return km;
}

// Distance per transport mode. Rail and sea routes are longer than the road path;
// air uses great-circle distance. Returns null for infeasible modes.
export async function modeDistances(a, b) {
  const road = Math.max(5, await roadDistanceKm(a, b));
  const straight = haversineKm(a, b);
  return {
    road,
    rail: road >= 250 ? round1(road * 1.1) : null,
    sea: a.coastal && b.coastal && road >= 500 ? round1(road * 1.4) : null,
    air: straight >= 300 ? round1(straight * 1.05) : null,
  };
}

const round1 = (n) => Math.round(n * 10) / 10;

export function pointOf(doc) {
  const [lng, lat] = doc.geo.coordinates;
  return { lat, lng, coastal: Boolean(doc.coastal) };
}
