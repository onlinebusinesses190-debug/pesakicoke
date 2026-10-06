import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyAuth } from '../middleware/auth';
import { logger } from '../utils/logger';
import { BFX } from '../services/binaryFx/config';
import {
  openTrade,
  settleTrade,
  listOpen,
  listSettled,
  entryPrice,
} from '../services/binaryFx/service';

const openSchema = z.object({
  mode: z.enum(['demo', 'real']),
  asset: z.string().min(1),
  direction: z.enum(['up', 'down']),
  stake: z.number().positive(),
  expiry: z.number().int().positive(),
});

const settleSchema = z.object({
  expiryPrice: z.number().optional(),
});

export const bfxRoutes = async (fastify: FastifyInstance) => {
  // ─── GET /games/bfx/config ──────────────────────────────────────────────
  fastify.get('/config', async (_request, reply) => {
    return reply.send({
      success: true,
      assets: BFX.ASSETS,
      expiries: BFX.EXPIRIES,
      payout: BFX.PAYOUT,
      minStake: BFX.MIN_STAKE,
      maxStake: BFX.MAX_STAKE,
      maxOpen: BFX.MAX_OPEN,
      tie: BFX.TIE,
      demoStart: BFX.DEMO_START,
    });
  });

  // ─── GET /games/bfx/price?asset= ────────────────────────────────────────
  fastify.get('/price', async (request, reply) => {
    const { asset } = request.query as { asset?: string };
    if (!asset) return reply.code(400).send({ success: false, error: 'asset required' });
    try {
      return reply.send({ success: true, price: entryPrice(asset as any) });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message || 'Unknown asset' });
    }
  });

  // ─── POST /games/bfx/trade ──────────────────────────────────────────────
  fastify.post('/trade', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = openSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }
    const userId = request.user!.id;
    const { mode, asset, direction, stake, expiry } = parsed.data;

    try {
      const result = await openTrade(userId, mode, asset as any, direction as any, stake, expiry);
      if (!result.success) {
        const status = result.error.includes('Insufficient') ? 400 : 400;
        return reply.code(status).send({ success: false, error: result.error, code: 'TRADE_FAILED' });
      }
      return reply.send({
        success: true,
        trade: result.trade,
        entry_price: result.entry_price,
        expires_at: result.expires_at,
        new_balance: result.new_balance,
      });
    } catch (err: any) {
      logger.error(err, 'BFX trade placement error');
      return reply.code(500).send({ success: false, error: err.message || 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // ─── POST /games/bfx/trade/:id/settle ───────────────────────────────────
  fastify.post('/trade/:id/settle', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = settleSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }

    try {
      const result = await settleTrade(id, parsed.data.expiryPrice);
      if (!result.success) {
        return reply.code(400).send({ success: false, error: result.error, code: 'SETTLE_FAILED' });
      }
      return reply.send({
        success: true,
        status: result.status,
        profit: result.profit,
        total_return: result.total_return,
        new_balance: result.new_balance,
      });
    } catch (err: any) {
      logger.error(err, 'BFX settle error');
      return reply.code(500).send({ success: false, error: err.message || 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // ─── GET /games/bfx/trades/open ─────────────────────────────────────────
  fastify.get('/trades/open', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    try {
      const trades = await listOpen(userId);
      return reply.send({ success: true, data: trades });
    } catch (err: any) {
      logger.error(err, 'BFX list open error');
      return reply.code(500).send({ success: false, error: err.message || 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });

  // ─── GET /games/bfx/trades/settled ──────────────────────────────────────
  fastify.get('/trades/settled', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    const { limit } = request.query as { limit?: number };
    try {
      const trades = await listSettled(userId, Math.min(Number(limit) || 100, 200));
      return reply.send({ success: true, data: trades });
    } catch (err: any) {
      logger.error(err, 'BFX list settled error');
      return reply.code(500).send({ success: false, error: err.message || 'Internal server error', code: 'INTERNAL_ERROR' });
    }
  });
};