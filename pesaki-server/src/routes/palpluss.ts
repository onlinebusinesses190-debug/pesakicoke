import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import { env } from '../config/env';
import { getBalance, reserveLockedFunds, releaseLockedFunds } from '../wallet/service';
import { calculateWithdrawalFee, MIN_WITHDRAWAL } from '../utils/fees';
import { finoqWithdrawToMobile, networkCodeForPhone, buildFinoqCallbackUrl } from '../finoq/service';

const MIN_WITHDRAWAL_AMOUNT = MIN_WITHDRAWAL;

const normalizePhone = (value: string) => {
  const digits = value.replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  return digits;
};

// ── Palpluss Webhook ──
export const palplussRoutes = async (fastify: FastifyInstance) => {
  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Webhook Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
  fastify.post(
    '/api/webhooks/palpluss',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body: any = request.body;
        logger.info({ body }, 'Palpluss webhook received');

        const transaction = body?.transaction || body?.data?.transaction || body?.data || body;
        const externalReference = String(
          transaction?.external_reference ||
          transaction?.reference ||
          body?.reference ||
          body?.data?.reference ||
          ''
        ).trim();

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

          await releaseLockedFunds(withdrawal.user_id, withdrawalAmount, true);

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

        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('locked')
          .eq('user_id', withdrawal.user_id)
          .maybeSingle();

        if (!walletError && wallet) {
          const currentLocked = Number(wallet.locked) || 0;
          const newLocked = Math.max(0, currentLocked - withdrawalAmount);

          await supabase
            .from('wallets')
            .update({ locked: newLocked })
            .eq('user_id', withdrawal.user_id);

          await supabase
            .from('wallet_ledger')
            .insert({
              user_id: withdrawal.user_id,
              type: 'debit',
              mode: 'debit',
              amount: withdrawalAmount,
              description: `Withdrawal: ${externalReference}`,
            });
        }

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

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Initiate B2C withdrawal Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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
          return reply.status(400).send({ success: false, error: 'Invalid amount' });
        }

        if (amount < MIN_WITHDRAWAL_AMOUNT) {
          return reply.status(400).send({
            success: false,
            error: `Minimum withdrawal amount is KSh ${MIN_WITHDRAWAL_AMOUNT}`,
            minimumAmount: MIN_WITHDRAWAL_AMOUNT,
            requestedAmount: amount,
          });
        }

        const cleanPhone = normalizePhone(phone);
        if (!cleanPhone || cleanPhone.length !== 12) {
          return reply.status(400).send({ success: false, error: 'Phone must be a valid Kenyan number (e.g. 0712345678, 254712345678)' });
        }

        const reference = `WD-${user.id.slice(0, 8)}-${Date.now()}`;

        logger.info(
          { reference, userId: user.id, amount, phone: cleanPhone },
          'WITHDRAWAL_REQUESTED | INIT'
        );

        const balance = await getBalance(user.id, 'real');
        if (balance === null || balance < amount) {
          logger.warn(
            { userId: user.id, amount, balance },
            'WITHDRAWAL_REQUESTED | INSUFFICIENT_BALANCE'
          );
          return reply.status(400).send({
            success: false,
            error: 'Insufficient balance',
            requestedAmount: amount,
            availableBalance: balance,
          });
        }

        const { data: withdrawal, error: insertError } = await supabase
          .from('b2c_withdrawals')
          .insert({
            user_id: user.id,
            amount,
            phone: cleanPhone,
            reference,
            status: 'pending',
          })
          .select('id')
          .single();

        if (insertError || !withdrawal) {
          logger.error({ insertError, userId: user.id }, 'Failed to create pending withdrawal');
          return reply.status(500).send({
            success: false,
            error: 'Failed to initialize withdrawal',
          });
        }

        const reserveResult = await reserveLockedFunds(user.id, amount);
        if (!reserveResult.success) {
          await supabase
            .from('b2c_withdrawals')
            .delete()
            .eq('id', withdrawal.id);

          logger.warn(
            { userId: user.id, amount, error: reserveResult.error },
            'WITHDRAWAL_REQUESTED | RESERVE_FAILED'
          );

          return reply.status(400).send({
            success: false,
            error: reserveResult.error || 'Insufficient balance',
            requestedAmount: amount,
          });
        }

        const fee = calculateWithdrawalFee(amount);
        const payoutAmount = Math.max(0, amount - fee);

        logger.info(
          { reference, userId: user.id, amount, fee, payoutAmount, phone: cleanPhone },
          'WITHDRAWAL_REQUESTED | FUNDS_RESERVED'
        );

        const callbackBase = env.USE_FINOQ_FOR_WITHDRAWALS && !!env.FINOQ_KEY && !!env.FINOQ_SECRET && !!env.FINOQ_BASE_URL
          ? (env.FINOQ_CALLBACK_URL || env.MPESA_CALLBACK_URL || 'https://pesaki-server.onrender.com')
          : (env.MPESA_CALLBACK_URL || 'https://pesaki-server.onrender.com');
        const providerPath = env.USE_FINOQ_FOR_WITHDRAWALS && !!env.FINOQ_KEY && !!env.FINOQ_SECRET && !!env.FINOQ_BASE_URL ? 'finoq' : 'palpluss';
        const callbackUrl = env.USE_FINOQ_FOR_WITHDRAWALS && !!env.FINOQ_KEY && !!env.FINOQ_SECRET && !!env.FINOQ_BASE_URL
          ? buildFinoqCallbackUrl(callbackBase)
          : `${callbackBase.replace(/\/+$/, '')}/api/webhooks/${providerPath}`;

        let providerResponse: any;
        let providerTransactionId: string | null = null;
        let providerCheckoutId: string | null = null;
        let providerMetadataKey: string;

        try {
          if (!env.USE_FINOQ_FOR_WITHDRAWALS || !env.FINOQ_KEY || !env.FINOQ_SECRET || !env.FINOQ_BASE_URL) {
            return reply.status(500).send({
              success: false,
              error: 'Finoq withdrawal provider is not configured',
              message: 'Set FINOQ_KEY, FINOQ_SECRET, FINOQ_BASE_URL on Render and redeploy',
            });
          }

          const networkCode = networkCodeForPhone(cleanPhone);
          providerResponse = await finoqWithdrawToMobile(
            payoutAmount,
            cleanPhone,
            reference,
            callbackUrl
          );
          providerTransactionId = providerResponse?.transactionId || providerResponse?.transaction_id || null;
          providerCheckoutId = providerResponse?.providerCheckoutId || providerResponse?.provider_checkout_id || null;
          providerMetadataKey = 'finoq_response';

          logger.info(
            { reference, userId: user.id, networkCode, transactionId: providerTransactionId, response: providerResponse },
            'WITHDRAWAL_REQUESTED | FINOQ_RESPONSE'
          );
        } catch (apiError: any) {
          await releaseLockedFunds(user.id, amount, true);

          const isNetworkError = apiError?.isNetworkError === true;
          const withdrawalStatus = isNetworkError ? 'PENDING_VERIFICATION' : 'failed';

          await supabase
            .from('b2c_withdrawals')
            .update({
              status: withdrawalStatus,
              provider_transaction_id: apiError.providerTransactionId || null,
              provider_checkout_id: apiError.providerCheckoutId || null,
              metadata: {
                error: apiError.message,
                provider_code: apiError.providerCode,
                provider_message: apiError.providerMessage,
                http_status: apiError.status,
                response_body: apiError.responseBody,
                error_info: apiError.errorInfo || null,
                is_network_error: isNetworkError,
              },
            })
            .eq('id', withdrawal.id);

          logger.error(
            {
              reference,
              error: apiError.message,
              providerCode: apiError.providerCode,
              providerMessage: apiError.providerMessage,
              status: apiError.status,
              responseBody: apiError.responseBody,
              errorInfo: apiError.errorInfo,
              isNetworkError: isNetworkError,
            },
            isNetworkError
              ? 'WITHDRAWAL_PENDING_VERIFICATION | FINOQ_CONNECTION_TERMINATED'
              : 'WITHDRAWAL_FAILED | WITHDRAWAL_PROVIDER_REQUEST_FAILED'
          );

          return reply.status(500).send({
            success: false,
            error: isNetworkError
              ? 'Withdrawal connection terminated without provider response - pending verification'
              : 'Withdrawal provider rejected the payout',
            status: apiError.status,
            providerCode: apiError.providerCode,
            providerMessage: apiError.providerMessage,
            responseBody: apiError.responseBody,
            requiresVerification: isNetworkError,
          });
        }

        const { data: wallet, error: walletError } = await supabase
          .from('wallets')
          .select('locked')
          .eq('user_id', user.id)
          .maybeSingle();

        if (!walletError && wallet) {
          const currentLocked = Number(wallet.locked) || 0;
          const newLocked = Math.max(0, currentLocked - amount);

          await supabase
            .from('wallets')
            .update({ locked: newLocked })
            .eq('user_id', user.id);

          await supabase
            .from('wallet_ledger')
            .insert({
              user_id: user.id,
              type: 'withdrawal',
              mode: 'debit',
              amount,
              description: `Withdrawal: ${reference} (Fee: ${fee}, Payout: ${payoutAmount})`,
            });
        }

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'completed',
            provider_transaction_id: providerTransactionId,
            provider_checkout_id: providerCheckoutId,
            metadata: {
              [providerMetadataKey]: providerResponse,
              fee,
              payout_amount: payoutAmount,
            },
            completed_at: new Date().toISOString(),
          })
          .eq('id', withdrawal.id);

        logger.info(
          { reference, userId: user.id, amount, fee, payoutAmount, transactionId: providerTransactionId },
          'WITHDRAWAL_COMPLETED'
        );

        return reply.send({
          success: true,
          data: {
            reference,
            status: 'completed',
            message: 'Withdrawal successful.',
            fee,
            payoutAmount,
          },
        });
      } catch (error) {
        logger.error(error, 'Error in /wallet/withdraw/b2c');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );

  // Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬ Get withdrawal status Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬Ã¢â€â‚¬
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

        let { data: withdrawal, error: withdrawalError } = await supabase
          .from('b2c_withdrawals')
          .select('status, amount, phone, created_at, completed_at, provider_transaction_id, metadata')
          .eq('reference', reference)
          .eq('user_id', user.id)
          .maybeSingle();

        if (withdrawalError || !withdrawal) {
          logger.warn(
            { reference, userId: user.id, withdrawalError },
            'Withdrawal status: exact reference match failed, trying fallbacks'
          );

          const last8 = reference.slice(-8);

          const { data: byProviderTx, error: providerTxError } = await supabase
            .from('b2c_withdrawals')
            .select('status, amount, phone, created_at, completed_at, provider_transaction_id, metadata')
            .eq('provider_transaction_id', reference)
            .eq('user_id', user.id)
            .maybeSingle();

          if (byProviderTx) {
            withdrawal = byProviderTx;
            withdrawalError = providerTxError;
          } else {
            const { data: bySuffix, error: suffixError } = await supabase
              .from('b2c_withdrawals')
              .select('status, amount, phone, created_at, completed_at, provider_transaction_id, metadata')
              .ilike('reference', `%-${last8}`)
              .eq('user_id', user.id)
              .maybeSingle();

            if (bySuffix) {
              withdrawal = bySuffix;
              withdrawalError = suffixError;
            }
          }
        }

        if (withdrawalError || !withdrawal) {
          logger.warn(
            { reference, userId: user.id, withdrawalError },
            'Withdrawal status: not found after all fallbacks'
          );
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
