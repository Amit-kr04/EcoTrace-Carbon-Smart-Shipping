import http from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import express from 'express';
import cors from 'cors';
import { Server } from 'socket.io';
import { config } from './config.js';
import { connectDb } from './db.js';
import { User } from './models/index.js';
import { requireAuth, verifyToken } from './middleware/auth.js';
import { ensureFactors } from './services/emissions.js';
import { setIo } from './services/alerts.js';
import { seedDemo } from './seed.js';
import { startJobs } from './jobs/cron.js';
import authRoutes from './routes/auth.js';
import directoryRoutes from './routes/directory.js';
import shipmentRoutes from './routes/shipments.js';
import analyticsRoutes from './routes/analytics.js';
import planningRoutes from './routes/planning.js';
import insightRoutes from './routes/insights.js';
import adminRoutes from './routes/admin.js';

const app = express();
app.use(cors({ origin: config.clientUrl.split(','), credentials: true }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (_req, res) => res.json({ ok: true, service: 'ecotrace-api' }));
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth); // everything below needs a signed-in user
app.use('/api', directoryRoutes);
app.use('/api/shipments', shipmentRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api', planningRoutes);
app.use('/api/ml', insightRoutes);
app.use('/api', adminRoutes);

// Serve the built React app when it exists (single-server deployment).
const clientDist = path.resolve('../client/dist');
if (fs.existsSync(clientDist)) {
  app.use(express.static(clientDist));
  app.get(/^\/(?!api|socket\.io).*/, (_req, res) => res.sendFile(path.join(clientDist, 'index.html')));
}

app.use('/api', (_req, res) => res.status(404).json({ message: 'Not found' }));
app.use((err, _req, res, _next) => {
  const status = err.status || (err.name === 'ValidationError' || err.name === 'CastError' ? 400 : 500);
  if (status >= 500) console.error(err);
  res.status(status).json({ message: status >= 500 && !err.status ? 'Something went wrong on the server' : err.message });
});

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: config.clientUrl.split(',') } });
io.use(async (socket, next) => {
  try {
    const payload = verifyToken(socket.handshake.auth?.token);
    const user = await User.findById(payload.sub).lean();
    if (!user) throw new Error('unknown user');
    socket.data.user = user;
    next();
  } catch {
    next(new Error('unauthorized'));
  }
});
io.on('connection', (socket) => socket.join(`company:${socket.data.user.company}`));
setIo(io);

await connectDb();
await ensureFactors();
if (config.seedDemo && !(await User.estimatedDocumentCount())) await seedDemo();
startJobs();
server.listen(config.port, () => console.log(`[api] EcoTrace API on http://localhost:${config.port}`));
