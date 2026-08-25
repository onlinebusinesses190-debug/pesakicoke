import { FastifyInstance } from 'fastify';
import rateLimit from '@fastify/rate-limit';

export const setupRateLimit = async (fastify: FastifyInstance) => {
  await fastify.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
    errorResponseBuilder: () => ({
      success: false,
      error: 'Too many requests, please try again later.',
      code: 'RATE_LIMIT_EXCEEDED'
    })
  });
};
