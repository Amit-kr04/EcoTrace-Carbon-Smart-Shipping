import mongoose from 'mongoose';

const { Schema, model } = mongoose;
const ObjectId = Schema.Types.ObjectId;

const pointSchema = new Schema(
  {
    type: { type: String, enum: ['Point'], default: 'Point' },
    coordinates: { type: [Number], default: [0, 0] }, // [lng, lat]
  },
  { _id: false }
);

const placeSnapshot = new Schema(
  { name: String, city: String, lat: Number, lng: Number },
  { _id: false }
);

export const ROLES = ['owner', 'manager', 'admin'];
export const MODES = ['road', 'rail', 'sea', 'air'];

const companySchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    industry: { type: String, default: 'Manufacturing' },
    city: String,
    monthlyCo2BudgetKg: { type: Number, default: 60000 },
    alertEmail: String,
    lastBudgetAlert: { month: String, level: Number },
  },
  { timestamps: true }
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true },
    role: { type: String, enum: ROLES, default: 'manager' },
    company: { type: ObjectId, ref: 'Company', required: true },
  },
  { timestamps: true }
);
userSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.passwordHash;
    return ret;
  },
});

const locationSchema = new Schema(
  {
    company: { type: ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    type: { type: String, enum: ['factory', 'warehouse', 'customer'], default: 'customer' },
    city: { type: String, required: true },
    address: String,
    coastal: { type: Boolean, default: false },
    geo: { type: pointSchema, required: true },
  },
  { timestamps: true }
);
locationSchema.index({ geo: '2dsphere' });

const vendorSchema = new Schema(
  {
    company: { type: ObjectId, ref: 'Company', required: true, index: true },
    name: { type: String, required: true, trim: true },
    city: { type: String, required: true },
    coastal: { type: Boolean, default: false },
    geo: { type: pointSchema, required: true },
    materials: [{ type: String, lowercase: true, trim: true }],
    pricePerKg: { type: Number, default: 0 },
    monthlyCapacityKg: { type: Number, default: 20000 },
    contactEmail: String,
    cluster: { id: Number, label: String },
  },
  { timestamps: true }
);
vendorSchema.index({ geo: '2dsphere' });

const shipmentSchema = new Schema(
  {
    company: { type: ObjectId, ref: 'Company', required: true },
    direction: { type: String, enum: ['inbound', 'outbound'], default: 'inbound' },
    vendor: { type: ObjectId, ref: 'Vendor' },
    fromLocation: { type: ObjectId, ref: 'Location' },
    toLocation: { type: ObjectId, ref: 'Location', required: true },
    origin: placeSnapshot,
    destination: placeSnapshot,
    material: { type: String, lowercase: true, trim: true },
    mode: { type: String, enum: MODES, required: true },
    weightKg: { type: Number, required: true, min: 0 },
    distanceKm: { type: Number, required: true },
    emissionFactor: Number,
    co2Kg: { type: Number, required: true },
    cost: { type: Number, default: 0 },
    shipDate: { type: Date, required: true },
    expectedDays: Number,
    actualDays: Number,
    status: { type: String, enum: ['in_transit', 'delivered'], default: 'in_transit' },
    delayed: { type: Boolean, default: false },
    risk: { probability: Number, level: String, reasons: [String], model: String },
    anomaly: { flag: { type: Boolean, default: false }, score: Number, reason: String },
    source: { type: String, enum: ['manual', 'csv', 'seed'], default: 'manual' },
    createdBy: { type: ObjectId, ref: 'User' },
  },
  { timestamps: true }
);
shipmentSchema.index({ company: 1, shipDate: -1 });
shipmentSchema.index({ company: 1, mode: 1 });

const emissionFactorSchema = new Schema({
  mode: { type: String, enum: MODES, unique: true },
  kgCo2PerTonneKm: Number,
  costPerTonneKm: Number,
  minCharge: Number,
  speedKmPerDay: Number,
  handlingDays: Number,
  source: String,
});

const forecastSchema = new Schema(
  {
    company: { type: ObjectId, ref: 'Company', index: true },
    model: String,
    history: [{ month: String, co2Kg: Number, _id: false }],
    forecast: [{ month: String, yhat: Number, lower: Number, upper: Number, _id: false }],
    metrics: Schema.Types.Mixed,
  },
  { timestamps: true }
);

const alertSchema = new Schema(
  {
    company: { type: ObjectId, ref: 'Company', index: true },
    type: { type: String, enum: ['budget', 'anomaly', 'risk', 'report'], default: 'budget' },
    level: { type: String, enum: ['info', 'warning', 'critical'], default: 'info' },
    message: String,
    month: String,
    read: { type: Boolean, default: false },
  },
  { timestamps: true }
);

const distanceCacheSchema = new Schema({
  key: { type: String, unique: true },
  km: Number,
  source: String,
});

export const Company = model('Company', companySchema);
export const User = model('User', userSchema);
export const Location = model('Location', locationSchema);
export const Vendor = model('Vendor', vendorSchema);
export const Shipment = model('Shipment', shipmentSchema);
export const EmissionFactor = model('EmissionFactor', emissionFactorSchema);
export const Forecast = model('Forecast', forecastSchema);
export const Alert = model('Alert', alertSchema);
export const DistanceCache = model('DistanceCache', distanceCacheSchema);
