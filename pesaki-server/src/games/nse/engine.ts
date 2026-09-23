import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import { debit } from '../../wallet/service';

/**
 * Calculates the next NSE market close (15:00 EAT)
 * NSE is open Mon-Fri, 09:00 - 15:00 EAT.
 */
export const getNextNseClose = (): Date => {
  const now = new Date();
  // Get EAT time (UTC+3)
  const eatTime = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  
  const close = new Date(eatTime);
  close.setUTCHours(12, 0, 0, 0); // 12:00 UTC is 15:00 EAT

  // If it's already past 15:00 EAT or it's a weekend, move to next weekday
  if (eatTime.getUTCHours() >= 15 || eatTime.getUTCDay() === 0 || eatTime.getUTCDay() === 6) {
    close.setUTCDate(close.getUTCDate() + 1);
    while (close.getUTCDay() === 0 || close.getUTCDay() === 6) {
      close.setUTCDate(close.getUTCDate() + 1);
    }
  }

  // Convert back to UTC for the database
  return new Date(close.getTime() - 3 * 60 * 60 * 1000);
};

export const placeNsePrediction = async (
  userId: string,
  symbol: string,
  direction: 'UP' | 'DOWN',
  amount: number,
  mode: 'real' | 'demo',
  entryPrice: number
) => {
  // 1. Debit wallet
  const debitRes = await debit(userId, amount, mode, `NSE Predict: ${symbol} ${direction}`);
  if (!debitRes.success) {
    throw new Error(debitRes.error || 'Insufficient funds');
  }

  // 2. Set settlement time to next market close
  const windowCloseAt = getNextNseClose();

  // 3. Save prediction
  const { data, error } = await supabase.from('predictions').insert([
    {
      user_id: userId,
      market: symbol,
      direction: direction.toLowerCase(),
      entry_price: entryPrice,
      amount: amount,
      mode: mode,
      status: 'pending',
      window_close_at: windowCloseAt.toISOString()
    }
  ]).select('*').single();

  if (error || !data) {
    logger.error(error, `NSE prediction failed for ${symbol}`);
    // Optional: Refund if DB fails
    throw new Error('Failed to record prediction');
  }

  return { success: true, prediction: data, newBalance: debitRes.newBalance };
};
