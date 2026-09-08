import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

export const palplussRoutes = async (fastify: FastifyInstance) => {
  fastify.post(
    '/api/webhooks/palpluss',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body: any = request.body;
        logger.info({ body }, 'Palpluss webhook received');

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

          logger.info(
            { reference, userId: withdrawal.user_id, amount: withdrawalAmount },
            'Palpluss B2C withdrawal failed, locked funds returned to balance'
          );

          return reply.code(200).send({ received: true });
        }

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'completed',
            provider_transaction_id: providerTransactionId,
            provider_checkout_id: providerCheckoutId,
            metadata: { ...withdrawal.metadata, webhook: body },
          })
          .eq('id', withdrawal.id);

        await releaseLockedFunds(withdrawal.user_id, withdrawalAmount, false);

        logger.info(
          {
            reference,
            userId: withdrawal.user_id,
            amount: withdrawalAmount,
            providerTransactionId,
          },
          'Palpluss B2C withdrawal completed, lock cleared'
        );

        return reply.code(200).send({ received: true });
      } catch (error) {
        logger.error(error, 'Error processing Palpluss webhook');
        return reply.code(200).send({ received: true });
      }
    }
  );
};

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
