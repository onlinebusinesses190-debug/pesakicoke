import cron from 'node-cron';
import { fetchMarketData } from './fetchMarketData';
import { runSettlePredictions } from './settlePredictions';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

const processMaturedItems = async (table: 'locked_savings' | 'investments') => {
  try {
    const { data: matured, error } = await supabase
      .from(table)
      .select('*')
      .eq('status', 'active')
      .lte('end_date', new Date().toISOString())
      .limit(100);

    if (error) {
      logger.error({ error, table }, 'Failed to fetch matured items');
      return;
    }

    if (!matured || matured.length === 0) return;

    const admin = require('@supabase/supabase-js').createClient(
      process.env.SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    for (const item of matured) {
      const interest = Number(item.interest_earned) || 0;
      const totalPayout = Number(item.amount) + interest;

      const { data: wallet, error: walletError } = await admin
        .from('banking_wallets')
        .select('balance, locked')
        .eq('user_id', item.user_id)
        .single();

      if (walletError || !wallet) {
        logger.error({ walletError, itemId: item.id, userId: item.user_id }, 'Failed to fetch banking wallet for matured item');
        continue;
      }

      const newBalance = Number(wallet.balance) + totalPayout;
      const newLocked = Math.max(0, Number(wallet.locked) - item.amount);

      const { error: updateWalletError } = await admin
        .from('banking_wallets')
        .update({ balance: newBalance, locked: newLocked })
        .eq('user_id', item.user_id);

      if (updateWalletError) {
        logger.error({ updateWalletError, itemId: item.id, userId: item.user_id }, 'Failed to update banking wallet for matured item');
        continue;
      }

      const { error: updateError } = await supabase
        .from(table)
        .update({ status: 'matured', updated_at: new Date().toISOString() })
        .eq('id', item.id);

      if (updateError) {
        logger.error({ updateError, itemId: item.id }, 'Failed to mark item as matured');
        continue;
      }

      await supabase.from('banking_ledger').insert({
        user_id: item.user_id,
        amount: totalPayout,
        type: table === 'locked_savings' ? 'savings_matured' : 'investment_matured',
        mode: 'credit',
        description: `${table === 'locked_savings' ? 'Savings' : 'Investment'} matured: ${item.duration_months} months lock`,
        status: 'completed',
        reference: item.id,
      });

      logger.info({ itemId: item.id, userId: item.user_id, totalPayout, table }, 'Matured item processed');
    }
  } catch (error) {
    logger.error(error, `Error processing matured ${table}`);
  }
};

const autoReleaseKaziDisputes = async () => {
  try {
    const now = new Date().toISOString();

    const { data: disputes, error } = await supabase
      .from('kazi_disputes')
      .select('*, kazi_escrow!inner (*)')
      .is('worker_responded_at', null)
      .lte('auto_release_at', now)
      .limit(100);

    if (error) {
      logger.error({ error }, 'Failed to fetch kazi disputes for auto-release');
      return;
    }

    if (!disputes || disputes.length === 0) return;

    for (const dispute of disputes) {
      const escrow = dispute.kazi_escrow;
      if (!escrow) continue;

      const employerAmount = Math.round(Number(escrow.amount) * (1 - 0.10));
      const feeAmount = Number(escrow.amount) - employerAmount;

      // Mark dispute as timed out
      await supabase
        .from('kazi_disputes')
        .update({ worker_response: 'timeout', worker_responded_at: now })
        .eq('id', dispute.id);

      // Release 90% to employer, keep 10% service fee
      await supabase
        .from('kazi_escrow')
        .update({
          status: 'refunded',
          released_amount: employerAmount,
          fee_amount: feeAmount,
          released_at: now,
          updated_at: now,
        })
        .eq('id', escrow.id);

      await supabase
        .from('jobs')
        .update({ status: 'cancelled' })
        .eq('id', dispute.job_id);

      logger.info(
        { disputeId: dispute.id, jobId: dispute.job_id, employerAmount },
        'KAZI dispute auto-released (7-day timeout)'
      );
    }
  } catch (error) {
    logger.error(error, 'Error auto-releasing KAZI disputes');
  }
};

const handleStuckKaziJobs = async () => {
  try {
    const cutoff = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: jobs, error } = await supabase
      .from('jobs')
      .select('id, title, employer_id, hired_worker_id, created_at')
      .eq('status', 'hired')
      .lte('created_at', cutoff)
      .limit(50);

    if (error) {
      logger.error({ error }, 'Failed to fetch stuck kazi jobs');
      return;
    }

    if (!jobs || jobs.length === 0) return;

    for (const job of jobs) {
      // Check if worker has accepted (contract exists with worker_accepted = true)
      const { data: contract } = await supabase
        .from('job_contracts')
        .select('worker_accepted')
        .eq('job_id', job.id)
        .single();

      if (contract?.worker_accepted) continue; // Worker already accepted, not stuck

      // Cancel the job and notify employer
      await supabase
        .from('jobs')
        .update({ status: 'cancelled', hired_worker_id: null })
        .eq('id', job.id);

      // Update applications back to Pending (so other workers can apply)
      await supabase
        .from('applications')
        .update({ status: 'Pending' })
        .eq('job_id', job.id)
        .eq('worker_id', job.hired_worker_id);

      // Notify employer
      await supabase.from('notifications').insert({
        user_id: job.employer_id,
        title: 'Job cancelled - no response',
        body: `Worker did not accept "${job.title}" within 24 hours. Job has been re-listed.`,
        related_job_id: job.id,
        read: false,
        kazi_type: 'cancelled_timeout',
        created_at: new Date().toISOString(),
      });

      logger.info({ jobId: job.id }, 'Stuck KAZI job cancelled (24h no acceptance)');
    }
  } catch (error) {
    logger.error(error, 'Error handling stuck KAZI jobs');
  }
};

export const initCronJobs = () => {
  logger.info('Initializing Node-Cron schedules...');

  // Every minute
  cron.schedule('* * * * *', () => {
    runSettlePredictions();
  });

  // Every 5 minutes
  cron.schedule('*/5 * * * *', () => {
    fetchMarketData();
  });

  // Hourly: process matured locked savings and investments
  cron.schedule('0 * * * *', () => {
    processMaturedItems('locked_savings');
    processMaturedItems('investments');
  });

  // Every 5 minutes: auto-release KAZI disputes after 7-day worker timeout
  cron.schedule('*/5 * * * *', () => {
    autoReleaseKaziDisputes();
  });

  // Hourly: cancel stuck KAZI jobs where worker hasn't accepted after 24 hours
  cron.schedule('0 * * * *', () => {
    handleStuckKaziJobs();
  });

  // Fire once on startup to warm up cache
  fetchMarketData();
};
