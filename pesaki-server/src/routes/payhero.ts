import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';
import { releaseLockedFunds } from '../wallet/service';

export const payheroRoutes = async (fastify: FastifyInstance) => {
  // ─── PayHero SasaPay webhook ────────────────────────────────────
  fastify.post(
    '/api/webhooks/payhero',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body: any = request.body;
        logger.info({ body }, 'PayHero webhook received');

        const transaction = body?.transaction || body?.data?.transaction || body?.data || body;
        const externalReference = String(
          transaction?.external_reference ||
            transaction?.reference ||
            body?.reference ||
            body?.externalReference ||
            ''
        ).trim();

        const status = String(transaction?.status || body?.status || '').toLowerCase();
        const providerTransactionId =
          transaction?.id ||
          transaction?.transaction_id ||
          transaction?.transactionId ||
          body?.transaction_id ||
          body?.transactionId;
        const amount = transaction?.amount || body?.amount;

        if (!externalReference) {
          logger.warn('PayHero webhook missing reference');
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
            'PayHero webhook: withdrawal not found'
          );
          return reply.code(200).send({ received: true });
        }

        const currentStatus = String(withdrawal.status).toLowerCase();
        const terminalStatuses = ['completed', 'failed', 'cancelled', 'expired', 'reversed'];
        if (terminalStatuses.includes(currentStatus)) {
          logger.info(
            { externalReference, status: currentStatus },
            'PayHero webhook: withdrawal already in terminal state, ignoring duplicate'
          );
          return reply.code(200).send({ received: true });
        }

        const isSuccess = ['success', 'completed', 'paid', 'successful'].includes(status);
        const isFailed = ['failed', 'cancelled', 'expired', 'reversed', 'timeout'].includes(status);

        if (!isSuccess && !isFailed) {
          logger.info(
            { externalReference, status },
            'PayHero webhook: intermediate status, updating record'
          );
          await supabase
            .from('b2c_withdrawals')
            .update({
              status,
              provider_transaction_id: providerTransactionId || withdrawal.provider_transaction_id,
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
              completed_at: new Date().toISOString(),
              metadata: { ...withdrawal.metadata, webhook: body },
            })
            .eq('id', withdrawal.id);

          await releaseLockedFunds(withdrawal.user_id, withdrawalAmount, true);

          logger.info(
            { externalReference, userId: withdrawal.user_id, amount: withdrawalAmount },
            'WITHDRAWAL_FAILED | FUNDS_REFUNDED'
          );

          return reply.code(200).send({ received: true });
        }

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'completed',
            provider_transaction_id: providerTransactionId,
            completed_at: new Date().toISOString(),
            metadata: { ...withdrawal.metadata, webhook: body },
          })
          .eq('id', withdrawal.id);

        const { data: wallet } = await supabase
          .from('wallets')
          .select('locked')
          .eq('user_id', withdrawal.user_id)
          .maybeSingle();

        if (wallet) {
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
        logger.error(error, 'Error processing PayHero webhook');
        return reply.code(200).send({ received: true });
      }
    }
  );
};
