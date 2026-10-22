import cron from 'node-cron';
import { Company, Forecast, User } from '../models/index.js';
import { ml } from '../services/ml.js';
import { buildMonthlyReport } from '../services/report.js';
import { sendMail } from '../services/mailer.js';
import { checkBudget, createAlert } from '../services/alerts.js';
import { addMonths } from '../services/ml.js';

export function startJobs() {
  // Weekly model retraining on new shipments: Sunday 02:00
  cron.schedule('0 2 * * 0', async () => {
    for (const c of await Company.find().lean()) {
      try {
        await ml.train(c._id);
        await Forecast.deleteMany({ company: c._id });
        console.log(`[cron] retrained models for ${c.name}`);
      } catch (err) {
        console.warn(`[cron] retrain failed for ${c.name}:`, err.message);
      }
    }
  });

  // Monthly sustainability report: 1st of the month 08:00
  cron.schedule('0 8 1 * *', async () => {
    const month = addMonths(new Date().toISOString().slice(0, 7), -1);
    for (const c of await Company.find().lean()) {
      try {
        const pdf = await buildMonthlyReport(c._id, month);
        const owner = await User.findOne({ company: c._id, role: 'owner' }).lean();
        await sendMail({ to: c.alertEmail || owner?.email, subject: `[EcoTrace] Sustainability report ${month} - ${c.name}`, text: `Your monthly EcoTrace report for ${month} is attached.`, attachments: [{ filename: `ecotrace-report-${month}.pdf`, content: pdf }] });
        await createAlert(c._id, { type: 'report', level: 'info', message: `Monthly report for ${month} is ready.`, month });
      } catch (err) {
        console.warn(`[cron] report failed for ${c.name}:`, err.message);
      }
    }
  });

  // Daily carbon-budget check: 09:00
  cron.schedule('0 9 * * *', async () => {
    for (const c of await Company.find().lean()) await checkBudget(c._id).catch(() => {});
  });
}
