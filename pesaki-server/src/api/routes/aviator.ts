import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { placeOrder } from '../../games/aviator/engine';
import { verifyAuth } from '../../middleware/auth';

const betSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['real', 'demo']),
});

export const aviatorRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/bet', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = betSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    try {
      const result = await placeOrder(request.user!.id, parsed.data.amount, parsed.data.mode);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message, code: 'AVIATOR_ERROR' });
    }
  });

  // CASHOUT is handled natively via Socket IO directly to reduce latency.
  // We don't expose it here to avoid duplication unless specifically requested.
};
