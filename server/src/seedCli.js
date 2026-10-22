import { connectDb, disconnectDb } from './db.js';
import { seedDemo } from './seed.js';

// npm run seed  -> (re)creates the demo company with 2 years of synthetic shipments.
await connectDb();
await seedDemo();
await disconnectDb();
process.exit(0);
