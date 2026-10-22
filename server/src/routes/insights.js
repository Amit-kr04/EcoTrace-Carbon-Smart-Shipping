import { Router } from 'express';
import { Forecast, Shipment, Vendor } from '../models/index.js';
import { asyncHandler, requireRole } from '../middleware/auth.js';
import { monthlyHistory } from '../services/analytics.js';
import { assessRisk, fallbackForecast, ml, MlUnavailableError } from '../services/ml.js';
import { createAlert } from '../services/alerts.js';

// Machine-learning features, proxied to the Python service.
const router = Router();

router.get('/status', asyncHandler(async (_req, res) => {
  try {
    res.json({ online: true, ...(await ml.health()) });
  } catch {
    res.json({ online: false });
  }
}));

router.get('/forecast', asyncHandler(async (req, res) => {
  const fresh = await Forecast.findOne({ company: req.companyId }).sort({ createdAt: -1 }).lean();
  if (fresh && req.query.refresh !== 'true' && Date.now() - fresh.createdAt < 12 * 3600 * 1000) return res.json(fresh);
  let result;
  try {
    const r = await ml.forecast(req.companyId, 3);
    result = { model: r.model, history: r.history, forecast: r.forecast, metrics: r.metrics };
  } catch (err) {
    if (!(err instanceof MlUnavailableError)) throw err;
    const history = await monthlyHistory(req.companyId);
    result = { model: 'seasonal-naive (ML service offline)', history, forecast: fallbackForecast(history, 3), metrics: null };
  }
  const saved = await Forecast.create({ company: req.companyId, ...result });
  res.json(saved);
}));

router.get('/metrics', asyncHandler(async (req, res) => {
  res.json(await ml.metrics(req.companyId));
}));

router.post('/retrain', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const r = await ml.train(req.companyId);
  await Forecast.deleteMany({ company: req.companyId });
  res.json(r);
}));

router.get('/anomalies', asyncHandler(async (req, res) => {
  res.json(await Shipment.find({ company: req.companyId, 'anomaly.flag': true }).sort({ 'anomaly.score': 1 }).limit(100).lean());
}));

// Run Isolation Forest over all shipments and store the flags.
router.post('/anomalies/run', asyncHandler(async (req, res) => {
  const r = await ml.anomalies(req.companyId);
  const before = await Shipment.countDocuments({ company: req.companyId, 'anomaly.flag': true });
  await Shipment.updateMany({ company: req.companyId, 'anomaly.reason': { $ne: 'Reviewed by user' } }, { $set: { anomaly: { flag: false } } });
  await Promise.all(r.anomalies.map((a) =>
    Shipment.updateOne({ _id: a.id, company: req.companyId, 'anomaly.reason': { $ne: 'Reviewed by user' } }, { anomaly: { flag: true, score: a.score, reason: a.reason } })
  ));
  const after = await Shipment.countDocuments({ company: req.companyId, 'anomaly.flag': true });
  if (after > before) await createAlert(req.companyId, { type: 'anomaly', level: 'warning', message: `${after} shipments look unusual or wrongly entered. Review them on the Insights page.` });
  res.json({ flagged: after, checked: r.checked, model: r.model });
}));

router.post('/vendor-clusters', asyncHandler(async (req, res) => {
  const r = await ml.vendorClusters(req.companyId);
  await Promise.all(r.vendors.map((v) => Vendor.updateOne({ _id: v.id, company: req.companyId }, { cluster: { id: v.cluster, label: v.label } })));
  res.json(r);
}));

// Delay-risk with explanation for a single shipment.
router.post('/risk/:id', asyncHandler(async (req, res) => {
  const s = await Shipment.findOne({ _id: req.params.id, company: req.companyId });
  if (!s) return res.status(404).json({ message: 'Shipment not found' });
  const [risk] = await assessRisk(req.companyId, [s]);
  if (s.status === 'in_transit') {
    s.risk = risk;
    await s.save();
  }
  res.json(risk);
}));

export default router;
