import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import { env } from '../config/env';

const MIN_WITHDRAWAL_AMOUNT = 10;

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

// ─── Helper: release locked funds idempotently ──────────────────────────────
const releaseLockedFunds = async (
  userId: string,
  amount: number
): Promise<void> => {
  try {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('locked, balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError || !wallet) {
      logger.error(
        { userId, amount, walletError },
        'Failed to fetch wallet for locked funds release'
      );
      return;
    }

    const currentLocked = Number(wallet.locked) || 0;
    if (currentLocked <= 0) {
      return;
    }

    const newLocked = Math.max(0, currentLocked - amount);

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        locked: newLocked,
        balance: Number(wallet.balance) + amount,
      })
      .eq('user_id', userId);

    if (updateError) {
      logger.error(
        { userId, amount, updateError },
        'Failed to release locked funds'
      );
    }
  } catch (error) {
    logger.error(error, 'Exception releasing locked funds');
  }
};

// ─── Helper: call Palpluss B2C API ──────────────────────────────────────────
const callPalplussB2C = async (
  amount: number,
  phone: string,
  reference: string,
  callbackUrl: string
) => {
  const apiKey = env.PALPLUSS_API_KEY;
  const apiUrl = env.PALPLUSS_API_URL || 'https://api.palpluss.com/v1';

  if (!apiKey) {
    throw new Error('PALPLUSS_API_KEY environment variable is not set');
  }

  const payload = {
    amount,
    phone,
    currency: 'KES',
    reference,
    description: 'PESAKI withdrawal',
    callback_url: callbackUrl,
  };

  const response = await fetch(`${apiUrl}/b2c/payouts`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
      'Idempotency-Key': reference,
    },
    body: JSON.stringify(payload),
  });

  const text = await response.text();
  let data: any;

  try {
    data = JSON.parse(text);
  } catch {
    logger.error(
      { status: response.status, responseText: text, reference },
      'Invalid JSON from Palpluss B2C'
    );
    throw new Error('Invalid response from Palpluss');
  }

  if (!response.ok || !data.success) {
    const providerCode = data?.code || data?.error_code;
    const providerMessage = data?.message || data?.error_description || data?.description;
    logger.error(
      { status: response.status, reference, providerCode, providerMessage, data },
      'Palpluss B2C request failed'
    );
    const err = new Error(providerMessage || 'Palpluss B2C request failed');
    (err as any).providerCode = providerCode;
    (err as any).providerMessage = providerMessage;
    throw err;
  }

  return data.data;
};

export const palplussRoutes = async (fastify: FastifyInstance) => {
  // ─── Webhook ──────────────────────────────────────────────────────────
  fastify.post(
    '/api/webhooks/palpluss',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body: any = request.body;
        logger.info({ body }, 'Palpluss webhook received');

        const transaction = body?.transaction || body?.data?.transaction || body?.data || body;
        const externalReference = transaction?.external_reference || transaction?.reference || body?.reference;
        const status = String(transaction?.status || body?.status || '').toLowerCase();
        const providerTransactionId = transaction?.id || transaction?.transactionId || body?.transactionId;
        const providerCheckoutId = transaction?.provider_checkout_id || transaction?.providerCheckoutId;
        const amount = transaction?.amount || body?.amount;
        const resultCode = transaction?.result_code;
        const resultDesc = transaction?.result_desc || transaction?.description;

        if (!externalReference) {
          logger.warn('Palpluss webhook missing reference');
          return reply.code(200).send({ received: true });
        }

        const { data: withdrawal, error: withdrawalError } = await supabase
          .from('b2c_withdrawals')
          .select('*')
          .eq('reference', externalReference)
          .maybeSingle();

        if (withdrawalError || !withdrawal) {
          logger.warn(
            { externalReference, withdrawalError },
            'Palpluss webhook: withdrawal not found'
          );
          return reply.code(200).send({ received: true });
        }

        const currentStatus = String(withdrawal.status).toLowerCase();
        const terminalStatuses = ['completed', 'failed', 'cancelled', 'expired', 'reversed'];
        if (terminalStatuses.includes(currentStatus)) {
          logger.info(
            { externalReference, status: currentStatus },
            'Palpluss webhook: withdrawal already in terminal state, ignoring duplicate'
          );
          return reply.code(200).send({ received: true });
        }

        const isSuccess = ['success', 'completed', 'paid', 'successful'].includes(status);
        const isFailed = ['failed', 'cancelled', 'expired', 'reversed', 'timeout', 'failed'].includes(status);

        if (!isSuccess && !isFailed) {
          logger.info(
            { externalReference, status },
            'Palpluss webhook: intermediate status, updating record'
          );
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: status,
              provider_transaction_id: providerTransactionId || withdrawal.provider_transaction_id,
              provider_checkout_id: providerCheckoutId || withdrawal.provider_checkout_id,
              metadata: { ...withdrawal.metadata, webhook: body, result_code: resultCode, result_desc: resultDesc },
            })
            .eq('id', withdrawal.id);

          return reply.code(200).send({ received: true });
        }

        const withdrawalAmount = Number(amount) || Number(withdrawal.amount);

        if (isFailed) {
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',
              provider_transaction_id: providerTransactionId,
              provider_checkout_id: providerCheckoutId,
              completed_at: new Date().toISOString(),
              metadata: { ...withdrawal.metadata, webhook: body, result_code: resultCode, result_desc: resultDesc },
            })
            .eq('id', withdrawal.id);

          await releaseLockedFunds(withdrawal.user_id, withdrawalAmount);

          logger.info(
            { externalReference, userId: withdrawal.user_id, amount: withdrawalAmount, resultCode, resultDesc },
            'WITHDRAWAL_FAILED | FUNDS_REFUNDED'
          );

          return reply.code(200).send({ received: true });
        }

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'completed',
            provider_transaction_id: providerTransactionId,
            provider_checkout_id: providerCheckoutId,
            completed_at: new Date().toISOString(),
            metadata: { ...withdrawal.metadata, webhook: body, result_code: resultCode, result_desc: resultDesc },
          })
          .eq('id', withdrawal.id);

        await releaseLockedFunds(withdrawal.user_id, withdrawalAmount);

        logger.info(
          {
            externalReference,
            userId: withdrawal.user_id,
            amount: withdrawalAmount,
            providerTransactionId,
          },
          'WITHDRAWAL_COMPLETED'
        );

        return reply.code(200).send({ received: true });
      } catch (error) {
        logger.error(error, 'Error processing Palpluss webhook');
        return reply.code(200).send({ received: true });
      }
    }
  );

  // ─── Initiate B2C withdrawal ──────────────────────────────────────────
  fastify.post(
    '/wallet/withdraw/b2c',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          return reply.status(401).send({ error: 'Invalid token' });
        }

        const { amount, phone } = request.body as { amount: number; phone: string };

        if (!amount || amount <= 0) {
          return reply.status(400).send({ error: 'Invalid amount' });
        }

        if (amount < MIN_WITHDRAWAL_AMOUNT) {
          return reply.status(400).send({
            error: `Minimum withdrawal amount is KSh ${MIN_WITHDRAWAL_AMOUNT}`,
            minimumAmount: MIN_WITHDRAWAL_AMOUNT,
            requestedAmount: amount,
          });
        }

        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone || cleanPhone.length !== 12) {
          return reply.status(400).send({ error: 'Phone must be a valid Kenyan number (e.g. 0712345678, 254712345678)' });
        }

        const reference = `PESAKI-WD-${Date.now()}-${user.id.slice(0, 8)}`;
        const idempotencyKey = reference;

        const { data: withdrawalResult, error: rpcError } = await supabase.rpc(
          'create_b2c_withdrawal',
          {
            p_user_id: user.id,
            p_amount: amount,
            p_phone: cleanPhone,
            p_reference: reference,
            p_idempotency_key: idempotencyKey,
          }
        );

        if (rpcError || !withdrawalResult?.success) {
          const errorMsg = withdrawalResult?.error || rpcError?.message || 'Failed to reserve funds';
          logger.error(
            { userId: user.id, amount, rpcError: JSON.parse(JSON.stringify(rpcError)), withdrawalResult: JSON.parse(JSON.stringify(withdrawalResult)) },
            'RPC FULL ERROR'
          );
          return reply.status(500).send({
            error: errorMsg,
            requestedAmount: amount,
            details: rpcError || withdrawalResult,
          });
        }

        logger.info(
          { reference, userId: user.id, amount, phone: cleanPhone },
          'WITHDRAWAL_REQUESTED | FUNDS_RESERVED'
        );

        const callbackUrl = `${env.PALPLUSS_API_URL || 'https://api.palpluss.com/v1'}/webhooks/palpluss`;

        let palplussResponse: any;
        try {
          palplussResponse = await callPalplussB2C(amount, cleanPhone, reference, callbackUrl);
        } catch (apiError: any) {
          logger.error(
            { reference, error: apiError.message, providerCode: apiError.providerCode, providerMessage: apiError.providerMessage },
            'WITHDRAWAL_FAILED | PALPLUSS_REQUEST_FAILED'
          );

          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',
              metadata: {
                error: apiError.message,
                provider_code: apiError.providerCode,
                provider_message: apiError.providerMessage,
              },
            })
            .eq('id', withdrawalResult.withdrawal_id);

          await releaseLockedFunds(user.id, amount);

          return reply.status(500).send({
            error: 'Withdrawal provider rejected the payout',
            providerCode: apiError.providerCode,
            providerMessage: apiError.providerMessage,
          });
        }

        logger.info(
          { reference, transactionId: palplussResponse?.transactionId, status: palplussResponse?.status },
          'PALPLUSS_RESPONSE_RECEIVED'
        );

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'processing',
            provider_transaction_id: palplussResponse?.transactionId,
            provider_checkout_id: palplussResponse?.providerCheckoutId || null,
            metadata: { palpluss_response: palplussResponse },
          })
          .eq('id', withdrawalResult.withdrawal_id);

        return reply.send({
          success: true,
          data: {
            reference,
            status: 'processing',
            message: 'Withdrawal initiated. Check status via polling.',
          },
        });
      } catch (error) {
        logger.error(error, 'Error in /wallet/withdraw/b2c');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // ─── Get withdrawal status ────────────────────────────────────────────
  fastify.get(
    '/wallet/withdrawals/status/:reference',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          return reply.status(401).send({ error: 'Invalid token' });
        }

        const { reference } = request.params as { reference: string };

        const { data: withdrawal, error: withdrawalError } = await supabase
          .from('b2c_withdrawals')
          .select('status, amount, phone, created_at, completed_at, provider_transaction_id, metadata')
          .eq('reference', reference)
          .eq('user_id', user.id)
          .maybeSingle();

        if (withdrawalError || !withdrawal) {
          return reply.status(404).send({ error: 'Withdrawal not found' });
        }

        return reply.send({
          success: true,
          data: {
            reference,
            status: withdrawal.status,
            amount: withdrawal.amount,
            phone: withdrawal.phone,
            created_at: withdrawal.created_at,
            completed_at: withdrawal.completed_at,
            provider_transaction_id: withdrawal.provider_transaction_id,
            metadata: withdrawal.metadata,
          },
        });
      } catch (error) {
        logger.error(error, 'Error in /wallet/withdrawals/status/:reference');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};
