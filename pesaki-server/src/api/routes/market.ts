import { FastifyInstance } from 'fastify';
import { redis } from '../../lib/redis';

export const marketRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/price', async (request, reply) => {
    const { pair } = request.query as { pair: string };
    if (!pair) return reply.code(400).send({ error: 'Pair required' });

    const price = await redis.get(`market:${pair}`);
    if (!price) return reply.code(404).send({ error: 'Price not found' });

    const parsedPrice = parseFloat(String(price));
    if (Number.isNaN(parsedPrice)) {
      return reply.code(500).send({ error: 'Invalid price format' });
    }

    // Add a tiny random jitter to simulate real-time market ticks
    // For standard forex (like ~1.00), a pip is 0.0001, so a jitter of ~0.0002 is natural.
    // For JPY and KES (like ~130.00), jitter should be ~0.02
    const variance = parsedPrice > 50 ? 0.04 : 0.0002;
    const jitter = (Math.random() - 0.5) * variance;
    const finalPrice = parsedPrice + jitter;

    return reply.send({ price: finalPrice });
  });
};
