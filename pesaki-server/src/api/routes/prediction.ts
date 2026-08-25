import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { placePrediction, settlePredictions, closePrediction } from '../../games/prediction/engine';
import { getUpDownState } from '../../games/updown/engine';
import { verifyAuth } from '../../middleware/auth';
import { logger } from '../../utils/logger';
import { supabase } from '../../lib/supabase';

const predictionSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['real', 'demo']),
  market: z.string(),
  direction: z.enum(['UP', 'DOWN']),
  windowMinutes: z.number().positive(),
});

export const predictionRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/place', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = predictionSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    try {
      const { amount, mode, market, direction, windowMinutes } = parsed.data;
      const result = await placePrediction(request.user!.id, market, direction, amount, mode, windowMinutes);
      return reply.send({ success: true, data: result.prediction, newBalance: result.newBalance });
    } catch (err: any) {
      logger.error(err, 'Prediction engine error');
      return reply.code(400).send({ success: false, error: err.message, code: 'PREDICTION_ERROR' });
    }
  });
  
  // Expose manual run settle route (could restrict heavily in production)
  fastify.post('/settle', { preHandler: [verifyAuth] }, async (_, reply) => {
     await settlePredictions();
     return reply.send({ success: true });
  });

  // Manual trade close route
  const closeSchema = z.object({
    predictionId: z.string().uuid(),
  });

  fastify.post('/close', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = closeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    
    try {
      const result = await closePrediction(request.user!.id, parsed.data.predictionId);
      return reply.send(result);
    } catch (err: any) {
      logger.error(err, 'Trade close error');
      return reply.code(400).send({ success: false, error: err.message, code: 'CLOSE_ERROR' });
    }
  });

  // Get pending predictions for user
  fastify.get('/pending', { preHandler: [verifyAuth] }, async (request, reply) => {
    try {
      const { data, error } = await supabase
        .from('predictions')
        .select('*')
        .eq('user_id', request.user!.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return reply.send({ success: true, data });
    } catch (err: any) {
      logger.error(err, 'Error fetching pending predictions');
      return reply.code(500).send({ success: false, error: 'Database error' });
    }
  });
  // Get current round state (for users who join mid-round)
  fastify.get('/current', async (_, reply) => {
    const state = getUpDownState();
    const round = state.round;
    const secondsLeft = round && round.state === 'open'
      ? Math.max(0, Math.ceil((new Date(round.locksAt).getTime() - Date.now()) / 1000))
      : 0;
    return reply.send({ success: true, data: { round, secondsLeft, history: state.history } });
  });

  // Get last 10 settled rounds
  fastify.get('/history', async (_, reply) => {
    const { history } = getUpDownState();
    return reply.send({ success: true, data: history });
  });
};
