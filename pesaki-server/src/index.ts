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

    // Register old routes from api/routes (does not include wallet now)
    registerRoutes(server);

    // Register new routes explicitly (these override if there's a conflict)
    server.register(walletRoutes);
    server.register(kaziRoutes);
    server.register(mpesaRoutes);

    // Add dummy endpoints for missing ones
    server.get('/user/stats', async (_request, reply) => {
      return reply.send({ totalReferrals: 0, totalEarnings: 0, activeReferrals: 0 });
    });
    server.get('/trading/opportunities', async (_request, reply) => {
      return reply.send([]);
    });

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
