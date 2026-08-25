import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { getBalance, credit, debit } from '../../wallet/service';
import { verifyAuth } from '../../middleware/auth';

const transferSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['real', 'demo']),
});

export const walletRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/balance', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { mode } = request.query as { mode: 'real' | 'demo' };
    if (!mode || (mode !== 'real' && mode !== 'demo')) {
        return reply.code(400).send({ success: false, error: 'Valid mode required', code: 'BAD_REQUEST' });
    }
    
    const balance = await getBalance(request.user!.id, mode);
    return reply.send({ success: true, data: { balance } });
  });

  fastify.post('/deposit', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    const result = await credit(request.user!.id, parsed.data.amount, parsed.data.mode, 'User Deposit');
    return reply.send(result);
  });

  fastify.post('/withdraw', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = transferSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    const result = await debit(request.user!.id, parsed.data.amount, parsed.data.mode, 'User Withdrawal');
    return reply.send(result);
  });
};
