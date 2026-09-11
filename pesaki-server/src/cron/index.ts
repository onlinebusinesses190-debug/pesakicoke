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

  // Fire once on startup to warm up cache
  fetchMarketData();
};
