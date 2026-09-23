import { FastifyInstance } from 'fastify';

export const healthRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/health', async (_, reply) => {
    return reply.send({
      status: 'ok',
      uptime: process.uptime(),
      timestamp: Date.now(),
    });
  });
};
