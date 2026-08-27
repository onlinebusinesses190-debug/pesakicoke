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

// ✅ Import routes explicitly (so they are always registered)
import walletRoutes from './routes/wallet';
import kaziRoutes from './routes/kazi';

const startServer = async () => {
  try {
    const server = fastify({ logger: true });

    // CORS
    await server.register(cors, {
      origin: (_origin, cb) => {
        cb(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await setupRateLimit(server);

    // Register all routes from `api/routes` (existing ones)
    registerRoutes(server);

    // ✅ Explicitly register the new routes (after existing ones)
    server.register(walletRoutes);
    server.register(kaziRoutes);

    // Optional: health check to confirm routes are loaded
    server.get('/health', async () => {
      return { status: 'ok', timestamp: new Date().toISOString() };
    });

    // Socket.io
    initSocket(server.server);

    // Game loops
    startNewRound();
    startUpDownRounds();

    // Cron jobs
    initCronJobs();

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
    logger.info(`📌 Registered routes: /wallet/*, /kazi/*, /health`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
