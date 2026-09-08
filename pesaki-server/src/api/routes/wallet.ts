import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { supabase } from '../../lib/supabase';
import { getBalance, getAvailableBalance, reserveLockedFunds, releaseLockedFunds, credit, debit, transfer } from '../../wallet/service';
import { verifyAuth } from '../../middleware/auth';
import { initiateB2CPayout } from '../../b2c/service';
import { logger } from '../../utils/logger';

const transferSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(['real', 'demo']),
});

const transferUserSchema = z.object({
  amount: z.coerce.number().positive(),
  mode: z.enum(['real', 'demo']),
  recipient: z.string().trim().min(1),
});

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254')) return digits;
  if (digits.startsWith('0')) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

const resolveRecipientUserId = async (recipient: string) => {
  const trimmed = recipient.trim();

  if (!trimmed) {
    return null;
  }

  const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed);
  if (isUuid) {
    return trimmed;
  }

  const normalizedPhone = normalizePhone(trimmed);
  const phoneLookup = normalizedPhone
    ? await supabase.from('profiles').select('id').eq('phone', normalizedPhone).maybeSingle()
    : { data: null, error: null };

  if (!phoneLookup.error && phoneLookup.data?.id) {
    return phoneLookup.data.id;
  }

  const emailLookup = trimmed.includes('@')
    ? await supabase.from('profiles').select('id').ilike('email', trimmed).maybeSingle()
    : { data: null, error: null };

  if (!emailLookup.error && emailLookup.data?.id) {
    return emailLookup.data.id;
  }

  return null;
};

export const walletRoutes = async (fastify: FastifyInstance) => {
  fastify.get('/balance', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { mode } = request.query as { mode: 'real' | 'demo' };
    if (!mode || (mode !== 'real' && mode !== 'demo')) {
        return reply.code(400).send({ success: false, error: 'Valid mode required', code: 'BAD_REQUEST' });
    }
    
    const balance = await getBalance(request.user!.id, mode);
    return reply.send({ success: true, data: { balance } });
  });

  fastify.get('/available-balance', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { mode } = request.query as { mode: 'real' | 'demo' };
    if (!mode || (mode !== 'real' && mode !== 'demo')) {
      return reply.code(400).send({ success: false, error: 'Valid mode required', code: 'BAD_REQUEST' });
    }

    const available = await getAvailableBalance(request.user!.id, mode);
    return reply.send({ success: true, data: { available: available ?? 0 } });
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

  const b2cWithdrawSchema = z.object({
    amount: z.coerce.number().positive(),
    phone: z.string().min(10),
  });

  fastify.post('/withdraw/b2c', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = b2cWithdrawSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', code: 'BAD_REQUEST' });
    }

    const userId = request.user!.id;
    const { amount, phone } = parsed.data;
    const cleanPhone = normalizePhone(phone);

    if (!cleanPhone) {
      return reply.code(400).send({ success: false, error: 'Invalid phone number', code: 'BAD_REQUEST' });
    }

    const available = await getAvailableBalance(userId, 'real');
    if (available === null || available < amount) {
      return reply.code(400).send({ success: false, error: 'Insufficient available balance', code: 'INSUFFICIENT_FUNDS' });
    }

    const reserved = await reserveLockedFunds(userId, amount);
    if (!reserved.success) {
      return reply.code(400).send({ success: false, error: reserved.error || 'Failed to reserve funds', code: 'RESERVE_FAILED' });
    }

    const reference = `PESAKI-WD-${Date.now()}-${userId.slice(0, 8)}`;

    const { data: withdrawalRecord, error: insertError } = await supabase
      .from('b2c_withdrawals')
      .insert({
        user_id: userId,
        amount,
        phone: cleanPhone,
        reference,
        status: 'pending',
      })
      .select('id, reference, status')
      .single();

    if (insertError || !withdrawalRecord) {
      await releaseLockedFunds(userId, amount, true);
      logger.error({ insertError, userId }, 'Failed to create B2C withdrawal record');
      return reply.code(500).send({ success: false, error: 'Failed to initialize withdrawal', code: 'DB_ERROR' });
    }

    const payoutResult = await initiateB2CPayout({
      amount,
      phone: cleanPhone,
      reference,
      description: 'PESAKI withdrawal',
    });

    if (!payoutResult) {
      await supabase
        .from('b2c_withdrawals')
        .update({ status: 'failed', metadata: { error: 'Payout initiation failed' } })
        .eq('id', withdrawalRecord.id);

      await releaseLockedFunds(userId, amount, true);
      return reply.code(500).send({ success: false, error: 'Failed to initiate B2C payout', code: 'PAYOUT_FAILED' });
    }

    await supabase
      .from('b2c_withdrawals')
      .update({
        provider_transaction_id: payoutResult.data.transactionId,
        provider_checkout_id: payoutResult.data.providerCheckoutId,
        metadata: { ...payoutResult.data },
      })
      .eq('id', withdrawalRecord.id);

    return reply.send({
      success: true,
      data: {
        reference,
        status: payoutResult.data.status,
        transactionId: payoutResult.data.transactionId,
        providerCheckoutId: payoutResult.data.providerCheckoutId,
        amount,
        phone: cleanPhone,
      },
    });
  });

  fastify.get('/withdrawals/status/:reference', { preHandler: [verifyAuth] }, async (request, reply) => {
    const { reference } = request.params as { reference: string };

    const { data: withdrawal, error } = await supabase
      .from('b2c_withdrawals')
      .select('id, amount, phone, status, provider_transaction_id, provider_checkout_id, created_at, updated_at')
      .eq('reference', reference)
      .eq('user_id', request.user!.id)
      .maybeSingle();

    if (error || !withdrawal) {
      return reply.code(404).send({ success: false, error: 'Withdrawal not found', code: 'NOT_FOUND' });
    }

    return reply.send({ success: true, data: withdrawal });
  });

  fastify.post('/transfer', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = transferUserSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid transfer payload', code: 'BAD_REQUEST' });
    }

    const recipientId = await resolveRecipientUserId(parsed.data.recipient);
    if (!recipientId) {
      return reply.code(404).send({ success: false, error: 'Recipient user not found', code: 'USER_NOT_FOUND' });
    }

    if (recipientId === request.user!.id) {
      return reply.code(400).send({ success: false, error: 'You cannot transfer to yourself', code: 'INVALID_TRANSFER' });
    }

    const result = await transfer(
      request.user!.id,
      recipientId,
      parsed.data.amount,
      parsed.data.mode,
      `Transfer to ${parsed.data.recipient}`
    );

    if (!result.success) {
      return reply.code(400).send({ success: false, error: result.error, code: 'TRANSFER_FAILED' });
    }

    return reply.send({
      success: true,
      message: 'Transfer successful',
      senderBalance: result.senderBalance,
      recipientBalance: result.recipientBalance,
    });
  });
};
