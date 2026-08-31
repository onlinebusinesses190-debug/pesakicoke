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

// Only import new routes NOT in api/routes
import kaziRoutes from './routes/kazi';
import { mpesaRoutes } from './routes/mpesa';

const startServer = async () => {
  try {
    const server = fastify({ logger: true });

    await server.register(cors, {
      origin: (_origin, cb) => cb(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await setupRateLimit(server);

    // Registers all old routes (including wallet)
    registerRoutes(server);

    // Register new routes (NO prefix for mpesaRoutes)
    server.register(kaziRoutes);
    server.register(mpesaRoutes); // <-- removed prefix

    initSocket(server.server);
    startNewRound();
    startUpDownRounds();
    initCronJobs();

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
