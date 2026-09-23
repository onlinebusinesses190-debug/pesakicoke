import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { executeAllocation, getOutcomes } from '../../games/spin/engine';
import { verifyAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';

const allocationSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['real', 'demo']),
});

export const spinRoutes = async (fastify: FastifyInstance) => {
  // GET /games/spin/prizes — returns outcomes for the frontend selector
  fastify.get('/prizes', async (_, reply) => {
    try {
      const outcomes = await getOutcomes();
      return reply.send({ success: true, data: outcomes });
    } catch (err: any) {
      logger.error(err, 'Failed to fetch growth outcomes');
      return reply.code(500).send({ success: false, error: 'Could not load outcomes' });
    }
  });

  fastify.post('/play', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = allocationSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    try {
      const result = await executeAllocation(request.user!.id, parsed.data.amount, parsed.data.mode);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      logger.error(err, 'Allocation engine error');
      return reply.code(400).send({ success: false, error: err.message, code: 'ALLOCATION_ERROR' });
    }
  });
};
