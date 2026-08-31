import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { startNewRound } from './games/aviator/engine';
import { startUpDownRounds } from './games/updown/engine';
import { initCronJobs } from './cron';
import { registerRoutes } from './api';
import { setupRateLimit } from './middleware/rateLimit';

import walletRoutes from './routes/wallet';
import kaziRoutes from './routes/kazi';
import { mpesaRoutes } from './routes/mpesa'; // ✅ NEW

const startServer = async () => {
  try {
    const server = fastify({ logger: true });

    await server.register(cors, {
      origin: (_origin, cb) => cb(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await setupRateLimit(server);

    registerRoutes(server);

    // Register new routes
    server.register(walletRoutes);
    server.register(kaziRoutes);
    server.register(mpesaRoutes, { prefix: '/api/p' }); // ✅ NEW

    server.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    initSocket(server.server);
    startNewRound();
    startUpDownRounds();
    initCronJobs();

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
    logger.info(`📌 Registered routes: /wallet/*, /kazi/*, /api/p/*, /health`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
