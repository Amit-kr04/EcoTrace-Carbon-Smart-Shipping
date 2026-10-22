import fs from 'node:fs';
import path from 'node:path';
import mongoose from 'mongoose';
import { config } from './config.js';

let memoryServer = null;

// Connects to MONGO_URI (e.g. Atlas). Without one, starts a local MongoDB
// via mongodb-memory-server that persists to server/.data so data survives restarts.
export async function connectDb() {
  let uri = config.mongoUri;
  if (!uri) {
    // Reuse the local MongoDB if another process (e.g. the running API) already started it.
    const local = `mongodb://127.0.0.1:${config.memoryDbPort}/ecotrace`;
    try {
      await mongoose.connect(local, { serverSelectionTimeoutMS: 1500 });
      console.log(`[db] connected to running local MongoDB at ${local}`);
      return local;
    } catch {
      await mongoose.disconnect();
    }
    const { MongoMemoryServer } = await import('mongodb-memory-server');
    const dbPath = path.resolve('.data/db');
    fs.mkdirSync(dbPath, { recursive: true });
    memoryServer = await MongoMemoryServer.create({
      instance: { port: config.memoryDbPort, dbPath, storageEngine: 'wiredTiger' },
    });
    uri = memoryServer.getUri('ecotrace');
    console.log(`[db] MONGO_URI not set, started local MongoDB at ${uri}`);
  }
  await mongoose.connect(uri);
  console.log('[db] connected');
  return uri;
}

export async function disconnectDb() {
  await mongoose.disconnect();
  if (memoryServer) await memoryServer.stop({ doCleanup: false });
}
