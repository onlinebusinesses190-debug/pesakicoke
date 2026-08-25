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

const startServer = async () => {
  try {
    const server = fastify({ logger: true }); 
    
    // Fastify CORS
    await server.register(cors, {
      origin: (_origin, cb) => {
        // Allow all origins for dev, or specify a list for prod
        cb(null, true);
      },
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS']
    });
    
    await setupRateLimit(server);

    // Register REST API Routes
    registerRoutes(server);

    // Start Socket.io Engine
    initSocket(server.server);
    
    // Initialize Game loops
    startNewRound();
    startUpDownRounds();
    
    // Initialize Schedule Jobs
    initCronJobs();

    // Boot Fastify
    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
    
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
