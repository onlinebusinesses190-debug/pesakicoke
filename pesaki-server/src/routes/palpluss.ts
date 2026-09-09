import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

// ─── Helper: release locked funds ───────────────────────────────────────
const releaseLockedFunds = async (
  userId: string,
  amount: number,
  returnToBalance: boolean
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
    const newLocked = Math.max(0, currentLocked - amount);
    const balanceAdjustment = returnToBalance ? amount : 0;

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        locked: newLocked,
        balance: Number(wallet.balance) + balanceAdjustment,
      })
      .eq('user_id', userId);

    if (updateError) {
      logger.error(
        { userId, amount, returnToBalance, updateError },
        'Failed to release locked funds'
      );
    }
  } catch (error) {
    logger.error(error, 'Exception releasing locked funds');
  }
};

// ─── Helper: Add ledger entry ───────────────────────────────────────────
const addLedgerEntry = async (
  userId: string,
  amount: number,
  type: string,
  mode: string,
  description: string
) => {
  try {
    const { error } = await supabase.from('wallet_ledger').insert({
      user_id: userId,
      amount,
      type,
      mode,
      description,
    });
    if (error) {
      logger.error({ userId, amount, type, description, error }, 'Failed to add ledger entry');
    }
  } catch (error) {
    logger.error(error, 'Exception adding ledger entry');
  }
};

// ─── Helper: call Palpluss B2C API with Basic Auth ──────────────────────
const callPalplussB2C = async (
  amount: number,
  phone: string,
  reference: string,
  callbackUrl: string
) => {
  const apiKey = process.env.PALPLUSS_API_KEY;
  const apiUrl = process.env.PALPLUSS_API_URL || 'https://api.palplus.com/v1';

  if (!apiKey) {
    throw new Error('PALPLUSS_API_KEY environment variable is not set');
  }

  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  const payload = {
    amount,
    phone,
    reference,
    description: 'PESAKI withdrawal',
    callbackUrl,
  };

  const url = `${apiUrl}/b2c/payouts`;

  logger.info({ url, amount, phone, reference, callbackUrl }, 'Calling Palpluss B2C API');

  const response = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Basic ${auth}`,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    logger.error({ status: response.status, responseText }, 'Palpluss returned non-JSON response');
    throw new Error(`Palpluss API error: ${response.status} - ${responseText}`);
  }

  logger.info({ status: response.status, body: data }, 'Palpluss B2C full response');

  if (!response.ok) {
    const errorMsg = data?.message || data?.error || data?.detail || JSON.stringify(data);
    throw new Error(`Palpluss B2C request failed (${response.status}): ${errorMsg}`);
  }

  const result = data?.data || data;
  if (!result?.transactionId) {
    if (data?.transactionId) return data;
    throw new Error('Palpluss response missing transactionId');
  }

  return result;
};

export const palplussRoutes = async (fastify: FastifyInstance) => {
  // ─── Webhook – logs EVERYTHING ──────────────────────────────────────
  fastify.post(
    '/api/webhooks/palpluss',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Log raw body and headers
        const rawBody = (request as any).rawBody || request.body;
        logger.info({
          headers: request.headers,
          rawBody,
          body: request.body,
        }, '‼️ Palpluss webhook received – RAW DATA ‼️');

        const body: any = request.body;

        const reference = body?.reference || body?.data?.reference;
        const status = body?.status || body?.data?.status;
        const providerTransactionId =
          body?.transactionId || body?.providerTransactionId || body?.data?.transactionId;
        const providerCheckoutId =
          body?.providerCheckoutId || body?.data?.providerCheckoutId;
        const amount = body?.amount || body?.data?.amount;

        if (!reference) {
          logger.warn('Palpluss webhook missing reference');
          return reply.code(200).send({ received: true });
        }

        const { data: withdrawal, error: withdrawalError } = await supabase
          .from('b2c_withdrawals')
          .select('*')
          .eq('reference', reference)
          .maybeSingle();

        if (withdrawalError || !withdrawal) {
          logger.warn(
            { reference, withdrawalError },
            'Palpluss webhook: withdrawal not found'
          );
          return reply.code(200).send({ received: true });
        }

        if (withdrawal.status !== 'pending') {
          logger.info(
            { reference, status: withdrawal.status },
            'Palpluss webhook: withdrawal already processed'
          );
          return reply.code(200).send({ received: true });
        }

        const normalizedStatus = String(status).toUpperCase();
        const isSuccess =
          normalizedStatus === 'SUCCESS' ||
          normalizedStatus === 'COMPLETED' ||
          normalizedStatus === 'PAID';
        const isFailed =
          normalizedStatus === 'FAILED' ||
          normalizedStatus === 'CANCELLED' ||
          normalizedStatus === 'REVERSED' ||
          normalizedStatus === 'TIMEOUT';

        if (!isSuccess && !isFailed) {
          logger.info(
            { reference, normalizedStatus },
            'Palpluss webhook: intermediate status, keeping pending'
          );
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: normalizedStatus.toLowerCase(),
              provider_transaction_id: providerTransactionId || withdrawal.provider_transaction_id,
              provider_checkout_id: providerCheckoutId || withdrawal.provider_checkout_id,
              metadata: { ...withdrawal.metadata, webhook: body },
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
              metadata: { ...withdrawal.metadata, webhook: body },
            })
            .eq('id', withdrawal.id);

          await releaseLockedFunds(withdrawal.user_id, withdrawalAmount, true);
          await addLedgerEntry(
            withdrawal.user_id,
            withdrawalAmount,
            'withdrawal',
            'debit',
            `Withdrawal failed (${reference})`
          );

          logger.info(
            { reference, userId: withdrawal.user_id, amount: withdrawalAmount },
            'Palpluss B2C withdrawal failed, locked funds returned to balance'
          );

          return reply.code(200).send({ received: true });
        }

        // ─── SUCCESS ─────────────────────────────────────────────────────
        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'completed',
            provider_transaction_id: providerTransactionId,
            provider_checkout_id: providerCheckoutId,
            metadata: { ...withdrawal.metadata, webhook: body },
            completed_at: new Date().toISOString(),
          })
          .eq('id', withdrawal.id);

        await releaseLockedFunds(withdrawal.user_id, withdrawalAmount, false);
        await addLedgerEntry(
          withdrawal.user_id,
          withdrawalAmount,
          'withdrawal',
          'debit',
          `Withdrawal to ${withdrawal.phone} (${reference})`
        );

        logger.info(
          {
            reference,
            userId: withdrawal.user_id,
            amount: withdrawalAmount,
            providerTransactionId,
          },
          '✅ Palpluss B2C withdrawal completed, lock cleared, ledger entry added ✅'
        );

        return reply.code(200).send({ received: true });
      } catch (error) {
        logger.error(error, 'Error processing Palpluss webhook');
        return reply.code(200).send({ received: true });
      }
    }
  );

  // ─── Manual fallback: check status with Palpluss ──────────────────────
  fastify.get(
    '/wallet/withdrawals/check/:reference',
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
          .select('*')
          .eq('reference', reference)
          .eq('user_id', user.id)
          .single();

        if (withdrawalError || !withdrawal) {
          return reply.status(404).send({ error: 'Withdrawal not found' });
        }

        if (withdrawal.status !== 'processing' && withdrawal.status !== 'pending') {
          return reply.send({
            success: true,
            data: {
              reference,
              status: withdrawal.status,
              amount: withdrawal.amount,
              phone: withdrawal.phone,
            },
          });
        }

        // Query Palpluss for status
        const apiKey = process.env.PALPLUSS_API_KEY;
        const apiUrl = process.env.PALPLUSS_API_URL || 'https://api.palplus.com/v1';

        if (!apiKey) {
          return reply.status(500).send({ error: 'API key missing' });
        }

        const auth = Buffer.from(`${apiKey}:`).toString('base64');
        const transactionId = withdrawal.provider_transaction_id;

        if (!transactionId) {
          return reply.status(400).send({ error: 'No transaction ID to query' });
        }

        const statusRes = await fetch(`${apiUrl}/b2c/payouts/${transactionId}`, {
          headers: { Authorization: `Basic ${auth}` },
        });

        const statusData = await statusRes.json();

        if (!statusRes.ok) {
          logger.error({ statusData }, 'Failed to query Palpluss status');
          return reply.status(500).send({ error: 'Failed to query status' });
        }

        const currentStatus = statusData?.data?.status || statusData?.status;
        if (!currentStatus) {
          return reply.status(500).send({ error: 'Invalid status response' });
        }

        // If status is success or failed, update locally
        const normalized = String(currentStatus).toUpperCase();
        if (normalized === 'SUCCESS' || normalized === 'COMPLETED' || normalized === 'PAID') {
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'completed',
              completed_at: new Date().toISOString(),
              metadata: { ...withdrawal.metadata, manual_check: statusData },
            })
            .eq('id', withdrawal.id);

          await releaseLockedFunds(withdrawal.user_id, Number(withdrawal.amount), false);
          await addLedgerEntry(
            withdrawal.user_id,
            Number(withdrawal.amount),
            'withdrawal',
            'debit',
            `Withdrawal to ${withdrawal.phone} (${reference}) [manual check]`
          );

          return reply.send({
            success: true,
            data: { reference, status: 'completed', amount: withdrawal.amount },
          });
        } else if (normalized === 'FAILED' || normalized === 'CANCELLED' || normalized === 'REVERSED') {
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',
              metadata: { ...withdrawal.metadata, manual_check: statusData },
            })
            .eq('id', withdrawal.id);

          await releaseLockedFunds(withdrawal.user_id, Number(withdrawal.amount), true);

          return reply.send({
            success: true,
            data: { reference, status: 'failed', amount: withdrawal.amount },
          });
        }

        return reply.send({
          success: true,
          data: { reference, status: withdrawal.status, amount: withdrawal.amount },
        });
      } catch (error) {
        logger.error(error, 'Manual check error');
        return reply.status(500).send({ error: 'Internal error' });
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
        if (!phone) {
          return reply.status(400).send({ error: 'Phone number is required' });
        }

        const cleanPhone = phone.replace(/\D/g, '');
        if (!cleanPhone.startsWith('254') || cleanPhone.length !== 12) {
          return reply.status(400).send({ error: 'Phone must be in format 2547XXXXXXXX' });
        }

        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('balance, locked')
          .eq('user_id', user.id)
          .single();

        if (walletError || !wallet) {
          return reply.status(400).send({ error: 'Wallet not found' });
        }

        const availableBalance = Number(wallet.balance) - Number(wallet.locked);
        if (availableBalance < amount) {
          return reply.status(400).send({ error: 'Insufficient balance' });
        }

        // Reserve funds
        const newBalance = Number(wallet.balance) - amount;
        const newLocked = Number(wallet.locked) + amount;

        const { error: updateError } = await supabase
          .from('wallets')
          .update({ balance: newBalance, locked: newLocked })
          .eq('user_id', user.id);

        if (updateError) {
          logger.error(updateError, 'Failed to reserve funds for withdrawal');
          return reply.status(500).send({ error: 'Failed to reserve funds' });
        }

        const reference = `WD-${user.id.slice(0, 8)}-${Date.now()}`;

        const { data: withdrawal, error: insertError } = await supabase
          .from('b2c_withdrawals')
          .insert({
            user_id: user.id,
            amount,
            phone: cleanPhone,
            reference,
            status: 'pending',
            idempotency_key: reference,
          })
          .select()
          .single();

        if (insertError) {
          logger.error(insertError, 'Failed to create withdrawal record');
          await supabase
            .from('wallets')
            .update({
              balance: Number(wallet.balance),
              locked: Number(wallet.locked),
            })
            .eq('user_id', user.id);
          return reply.status(500).send({ error: 'Failed to create withdrawal record' });
        }

        const callbackUrl =
          process.env.PALPLUSS_CALLBACK_URL ||
          'https://pesaki-server.onrender.com/api/webhooks/palpluss';

        let palplussResponse;
        try {
          palplussResponse = await callPalplussB2C(amount, cleanPhone, reference, callbackUrl);
        } catch (apiError: any) {
          logger.error(apiError, 'Palpluss API call failed');
          await releaseLockedFunds(user.id, amount, true);
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',
              metadata: { error: apiError.message },
            })
            .eq('id', withdrawal.id);
          return reply.status(500).send({ error: apiError.message || 'Palpluss API error' });
        }

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'processing',
            provider_transaction_id: palplussResponse.transactionId,
            provider_checkout_id: palplussResponse.providerCheckoutId || null,
            metadata: { palpluss_response: palplussResponse },
          })
          .eq('id', withdrawal.id);

        logger.info(
          {
            reference,
            userId: user.id,
            amount,
            transactionId: palplussResponse.transactionId,
          },
          'B2C withdrawal initiated successfully'
        );

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
