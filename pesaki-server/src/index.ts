import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { env } from './config/env';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { startNewRound } from './games/aviator/engine';
import { startUpDownRounds } from './games/updown/engine';
import { initCronJobs } from './cron';
import { registerRoutes } from './api';
import { setupRateLimit } from './middleware/rateLimit';
import { getEngine } from './services/forex/marketEngine';
import { hydrateAndAttach } from './services/forex/persistence';
import { startPositionMonitor } from './services/forex/positionMonitor';
import { startBinaryFxExpiryWorker, stopBinaryFxExpiryWorker } from './services/binaryFx/expiryWorker';

import walletRoutes from './routes/wallet';
import kaziRoutes from './routes/kazi';
import { mpesaRoutes } from './routes/mpesa';
import { palplussRoutes } from './routes/palpluss';
import { bankingRoutes } from './routes/banking';
import referralRoutes from './routes/referrals';
import adminRoutes from './routes/admin';
import userRoutes from './routes/user';
import { bfxRoutes } from './routes/binaryFx';

const startServer = async () => {
  try {
    const server = fastify({ logger: true });

    await server.register(cors, {
      origin: (_origin, cb) => cb(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await server.register(multipart);
    await setupRateLimit(server);

    // Register old routes from api/routes (does not include wallet now)
    registerRoutes(server);

    // Register new routes explicitly (these override if there's a conflict)
    server.register(walletRoutes);
    server.register(kaziRoutes);
    server.register(mpesaRoutes);
    server.register(palplussRoutes);
    server.register(bankingRoutes);
    server.register(referralRoutes);
    server.register(adminRoutes);
    server.register(userRoutes);
    // Binary FX: isolated from /games/fx and /forex. Own routes, own table.
    server.register(bfxRoutes, { prefix: '/games/bfx' });

    // Add dummy endpoints for missing ones
    server.get('/user/stats', async (_request, reply) => {
      return reply.send({
        activeTrades: 0,
        tradesChange: 0,
        jobsCompleted: 0,
        jobsChange: 0,
        investmentGrowth: '0%',
        growthChange: 0,
        businessesFunded: 0,
        activeBusinesses: 0,
      });
    });
    server.get('/trading/opportunities', async (_request, reply) => {
      return reply.send([]);
    });

    initSocket(server.server);
    startNewRound();
    startUpDownRounds();
    initCronJobs();

    // PESAKI Forex: the market engine and the SL/TP monitor must run
    // independently of the browser. Prices keep advancing and stops keep
    // triggering while nobody has a tab open.
    //
    // Hydrate from persistence first so the price walk and candle history
    // continue from where they left off, then attach the persistence hooks
    // before starting so the first live tick already gets archived.
    const stopPersistence = await hydrateAndAttach(getEngine());
    getEngine().start();
    startPositionMonitor();
    // Binary FX expiry worker: settles trades whose expires_at has passed,
    // regardless of whether the user has the app open.
    startBinaryFxExpiryWorker();

    const shutdown = () => {
      logger.info('Shutting down PESAKI Forex engine');
      stopBinaryFxExpiryWorker();
      getEngine().stop();
      if (stopPersistence) stopPersistence();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
