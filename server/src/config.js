import 'dotenv/config';

export const config = {
  port: Number(process.env.PORT) || 5050,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',
  mongoUri: process.env.MONGO_URI || '',
  memoryDbPort: Number(process.env.MEMORY_DB_PORT) || 27018,
  jwtSecret: process.env.JWT_SECRET || 'dev-secret-change-me',
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
