import { Alert, Company, User } from '../models/index.js';
import { currentMonth, monthCo2 } from './analytics.js';
import { sendMail } from './mailer.js';

let io = null;
export function setIo(instance) {
  io = instance;
}

export function emitToCompany(companyId, event, payload) {
  io?.to(`company:${companyId}`).emit(event, payload);
}

export async function createAlert(companyId, { type, level, message, month }) {
  const alert = await Alert.create({ company: companyId, type, level, message, month });
  emitToCompany(companyId, 'alert', alert);
  return alert;
}

async function recipients(company) {
  if (company.alertEmail) return company.alertEmail;
  const owners = await User.find({ company: company._id, role: { $in: ['owner', 'admin'] } }).lean();
  return owners.map((u) => u.email).join(',');
}

// Raises an alert (and email) the first time this month's CO2 crosses 80% and 100% of the budget.
export async function checkBudget(companyId, ym = currentMonth()) {
  const company = await Company.findById(companyId);
  if (!company?.monthlyCo2BudgetKg) return null;
  const used = await monthCo2(companyId, ym);
  const ratio = used / company.monthlyCo2BudgetKg;
  const level = ratio >= 1 ? 100 : ratio >= 0.8 ? 80 : 0;
  const last = company.lastBudgetAlert?.month === ym ? company.lastBudgetAlert.level : 0;
  if (!level || level <= last) return { used, ratio };

  const message =
    level === 100
      ? `Carbon budget exceeded for ${ym}: ${fmt(used)} kg CO2e used of ${fmt(company.monthlyCo2BudgetKg)} kg (${Math.round(ratio * 100)}%).`
      : `Carbon budget warning for ${ym}: ${Math.round(ratio * 100)}% used (${fmt(used)} of ${fmt(company.monthlyCo2BudgetKg)} kg CO2e).`;
  await createAlert(companyId, { type: 'budget', level: level === 100 ? 'critical' : 'warning', message, month: ym });
  company.lastBudgetAlert = { month: ym, level };
  await company.save();
  try {
    await sendMail({
      to: await recipients(company),
      subject: `[EcoTrace] ${level === 100 ? 'Carbon budget exceeded' : 'Carbon budget at 80%'} - ${company.name}`,
      text: `${message}\n\nOpen EcoTrace and use the Optimizer to find a lower-carbon shipping plan for the rest of the month.`,
    });
  } catch (err) {
    console.warn('[mail] budget alert failed:', err.message);
  }
  return { used, ratio, alerted: level };
}

const fmt = (n) => Math.round(n).toLocaleString('en-IN');
