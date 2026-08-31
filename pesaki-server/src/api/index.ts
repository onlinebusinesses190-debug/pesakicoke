import { FastifyInstance } from 'fastify';
import { walletRoutes } from './routes/wallet';
import { aviatorRoutes } from './routes/aviator';
import { spinRoutes } from './routes/spin';
import { predictionRoutes } from './routes/prediction';
import { healthRoutes } from './routes/health';
import { marketRoutes } from './routes/market';
import { nseRoutes } from './routes/nse';

export const registerRoutes = (fastify: FastifyInstance) => {
  fastify.register(healthRoutes); // /health is global
  fastify.register(marketRoutes, { prefix: '/market' });
  fastify.register(walletRoutes, { prefix: '/wallet' });
  fastify.register(aviatorRoutes, { prefix: '/games/aviator' });
  fastify.register(spinRoutes, { prefix: '/games/spin' });
  fastify.register(predictionRoutes, { prefix: '/games/prediction' });
  fastify.register(nseRoutes, { prefix: '/games/nse' });
};
