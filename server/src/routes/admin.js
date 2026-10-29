import { Router } from 'express';
import { Alert, Company, EmissionFactor, MODES, User } from '../models/index.js';
import { asyncHandler, requireRole } from '../middleware/auth.js';
import { buildMonthlyReport } from '../services/report.js';
import { sendMail } from '../services/mailer.js';
import { clearFactorCache, FACTOR_FIELDS, getFactors } from '../services/emissions.js';
import { checkBudget } from '../services/alerts.js';
import { addMonths } from '../services/ml.js';

// Reports, alerts and settings.
const router = Router();
const lastMonth = () => addMonths(new Date().toISOString().slice(0, 7), -1);

router.get('/reports/monthly', asyncHandler(async (req, res) => {
  const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : lastMonth();
  const pdf = await buildMonthlyReport(req.companyId, month);
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename="ecotrace-report-${month}.pdf"`);
  res.send(pdf);
}));

router.post('/reports/email', asyncHandler(async (req, res) => {
  const month = req.body.month || lastMonth();
  const company = await Company.findById(req.companyId);
  const pdf = await buildMonthlyReport(req.companyId, month);
  const to = req.body.to || company.alertEmail || req.user.email;
  await sendMail({ to, subject: `[EcoTrace] Sustainability report ${month} - ${company.name}`, text: `Attached is the EcoTrace sustainability report for ${month}.`, attachments: [{ filename: `ecotrace-report-${month}.pdf`, content: pdf }] });
  res.json({ sent: true, to });
}));

router.get('/alerts', asyncHandler(async (req, res) => {
  res.json(await Alert.find({ company: req.companyId }).sort({ createdAt: -1 }).limit(50).lean());
}));

router.post('/alerts/read-all', asyncHandler(async (req, res) => {
  await Alert.updateMany({ company: req.companyId, read: false }, { read: true });
  res.json({ ok: true });
}));

router.get('/settings/company', asyncHandler(async (req, res) => {
  res.json(await Company.findById(req.companyId));
}));

router.put('/settings/company', requireRole('owner', 'admin'), asyncHandler(async (req, res) => {
  const { name, industry, city, monthlyCo2BudgetKg, alertEmail } = req.body;
  const company = await Company.findByIdAndUpdate(req.companyId, { name, industry, city, monthlyCo2BudgetKg, alertEmail, lastBudgetAlert: null }, { new: true });
  await checkBudget(req.companyId);
  res.json(company);
}));

router.get('/settings/factors', asyncHandler(async (req, res) => {
  const factors = await getFactors(req.companyId);
  res.json(Object.values(factors).sort((a, b) => a.kgCo2PerTonneKm - b.kgCo2PerTonneKm));
}));

// Edits are saved as this company's own row; other companies keep their factors.
router.put('/settings/factors/:mode', requireRole('admin', 'owner'), asyncHandler(async (req, res) => {
  const { mode } = req.params;
  if (!MODES.includes(mode)) return res.status(404).json({ message: `Unknown mode "${mode}"` });
  const update = {};
  for (const f of FACTOR_FIELDS.filter((f) => req.body[f] !== undefined && req.body[f] !== '')) {
    const n = Number(req.body[f]);
    if (!Number.isFinite(n) || n < 0 || (f === 'speedKmPerDay' && n === 0)) return res.status(400).json({ message: `${f} must be a ${f === 'speedKmPerDay' ? 'positive' : 'non-negative'} number` });
    update[f] = n;
  }
  const current = (await getFactors(req.companyId))[mode];
  const base = Object.fromEntries(['source', ...FACTOR_FIELDS].map((f) => [f, current[f]]));
  await EmissionFactor.updateOne({ company: req.companyId, mode }, { $set: { ...base, ...update, company: req.companyId, mode } }, { upsert: true });
  clearFactorCache(req.companyId);
  res.json((await getFactors(req.companyId))[mode]);
}));

router.get('/team', asyncHandler(async (req, res) => {
  res.json(await User.find({ company: req.companyId }).lean().then((us) => us.map(({ passwordHash, ...u }) => u)));
}));

export default router;
