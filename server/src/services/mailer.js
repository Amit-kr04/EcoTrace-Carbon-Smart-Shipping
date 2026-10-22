import nodemailer from 'nodemailer';
import { config } from '../config.js';

let transporter;

function getTransporter() {
  if (transporter) return transporter;
  transporter = config.smtp.host
    ? nodemailer.createTransport({
        host: config.smtp.host,
        port: config.smtp.port,
        secure: config.smtp.port === 465,
        auth: config.smtp.user ? { user: config.smtp.user, pass: config.smtp.pass } : undefined,
      })
    : nodemailer.createTransport({ jsonTransport: true });
  return transporter;
}

// Sends an email; without SMTP settings the message is only logged.
export async function sendMail({ to, subject, text, attachments }) {
  if (!to) return { skipped: true };
  const info = await getTransporter().sendMail({ from: config.smtp.from, to, subject, text, attachments });
  if (!config.smtp.host) console.log(`[mail] (not sent, SMTP not configured) to=${to} subject="${subject}"`);
  return info;
}
