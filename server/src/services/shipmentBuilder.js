import { Location, Vendor } from '../models/index.js';
import { estimateLeg, getFactors } from './emissions.js';
import { modeDistances, pointOf } from './routing.js';

export class InputError extends Error {
  constructor(message) {
    super(message);
    this.status = 400;
  }
}

// Turns user input into a complete shipment document (distance, CO2, cost, transit days).
// Origin is either a vendor (inbound) or one of the company's own locations (outbound).
export async function buildShipment(companyId, input) {
  const { vendorId, fromLocationId, toLocationId, mode, material } = input;
  const weightKg = Number(input.weightKg);
  if (!toLocationId) throw new InputError('Destination is required');
  if (!['road', 'rail', 'sea', 'air'].includes(mode)) throw new InputError('Mode must be road, rail, sea or air');
  if (!(weightKg > 0)) throw new InputError('Weight must be a positive number');

  const to = await Location.findOne({ _id: toLocationId, company: companyId });
  if (!to) throw new InputError('Destination not found');

  let originDoc;
  let vendor = null;
  let fromLocation = null;
  if (vendorId) {
    vendor = await Vendor.findOne({ _id: vendorId, company: companyId });
    if (!vendor) throw new InputError('Vendor not found');
    originDoc = vendor;
  } else if (fromLocationId) {
    fromLocation = await Location.findOne({ _id: fromLocationId, company: companyId });
    if (!fromLocation) throw new InputError('Origin location not found');
    originDoc = fromLocation;
  } else {
    throw new InputError('Choose a vendor or an origin location');
  }

  const a = pointOf(originDoc);
  const b = pointOf(to);
  const distances = await modeDistances(a, b);
  const distanceKm = input.distanceKm ? Number(input.distanceKm) : distances[mode];
  if (!distanceKm) throw new InputError(`${mode} is not available on this route (${originDoc.city} to ${to.city})`);

  const factors = await getFactors(companyId);
  const leg = estimateLeg(distanceKm, weightKg, factors[mode]);
  const shipDate = input.shipDate ? new Date(input.shipDate) : new Date();
  const expectedDays = input.expectedDays ? Number(input.expectedDays) : leg.days;
  const actualDays = input.actualDays !== undefined && input.actualDays !== '' && input.actualDays !== null ? Number(input.actualDays) : undefined;

  return {
    company: companyId,
    direction: vendor ? 'inbound' : 'outbound',
    vendor: vendor?._id,
    fromLocation: fromLocation?._id,
    toLocation: to._id,
    origin: { name: originDoc.name, city: originDoc.city, lat: a.lat, lng: a.lng },
    destination: { name: to.name, city: to.city, lat: b.lat, lng: b.lng },
    material: material || vendor?.materials?.[0] || 'finished goods',
    mode,
    weightKg,
    distanceKm: leg.distanceKm,
    emissionFactor: leg.emissionFactor,
    co2Kg: leg.co2Kg,
    cost: input.cost ? Number(input.cost) : leg.cost,
    shipDate,
    expectedDays,
    actualDays,
    status: actualDays !== undefined ? 'delivered' : 'in_transit',
    delayed: actualDays !== undefined ? actualDays > expectedDays : false,
    availableModes: Object.entries(distances).filter(([, d]) => d).map(([m]) => m),
  };
}
