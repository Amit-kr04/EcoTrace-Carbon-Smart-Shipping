import 'dotenv/config';
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const serverRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// A missing or placeholder JWT_SECRET would let anyone forge sign-in tokens, so in
// that case a random secret is generated once and kept in server/.data/jwt-secret.
const PLACEHOLDER_SECRETS = ['', 'dev-secret-change-me', 'change-me-to-a-long-random-string'];
function jwtSecret() {
  const fromEnv = (process.env.JWT_SECRET || '').trim();
  if (!PLACEHOLDER_SECRETS.includes(fromEnv)) return fromEnv;
  const file = path.join(serverRoot, '.data', 'jwt-secret');
  try {
    return fs.readFileSync(file, 'utf8').trim();
  } catch {
    const secret = crypto.randomBytes(48).toString('hex');
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, secret, { mode: 0o600 });
    console.log(`[config] JWT_SECRET not set, generated one in ${file}`);
    return secret;
  }
}

export const config = {
  port: Number(process.env.PORT) || 5050,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || '',
  memoryDbPort: Number(process.env.MEMORY_DB_PORT) || 27018,
  jwtSecret: jwtSecret(),
  mlUrl: process.env.ML_URL || 'http://127.0.0.1:8000',
  mlApiKey: process.env.ML_API_KEY || 'dev-ml-key',
  orsKey: process.env.ORS_API_KEY || '',
  smtp: {
    host: process.env.SMTP_HOST || '',
    port: Number(process.env.SMTP_PORT) || 587,
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'EcoTrace <alerts@ecotrace.local>',
  },
  seedDemo: process.env.SEED_DEMO !== 'false',
};
