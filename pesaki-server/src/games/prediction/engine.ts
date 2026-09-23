import { supabase } from '../../lib/supabase';
import { logger } from '../../utils/logger';
import { redis } from '../../lib/redis';
import { debit, credit } from '../../wallet/service';
import { fetchNsePrice, isNseSymbol } from '../../utils/nse';

export const closePrediction = async (userId: string, predictionId: string) => {
  // Fetch prediction
  const { data: prediction, error: fetchErr } = await supabase
    .from('predictions')
    .select('*')
    .eq('id', predictionId)
    .eq('user_id', userId)
    .eq('status', 'pending')
    .single();

  if (fetchErr || !prediction) {
    throw new Error('Prediction not found or already closed');
  }

  const { market, direction, entry_price, amount, mode } = prediction;

  // Get current price
  let closePrice: number | undefined;
  if (isNseSymbol(market)) {
    closePrice = (await fetchNsePrice(market)) ?? undefined;
  } else {
    const pStr = await redis.get(`market:${market}`);
    if (pStr) closePrice = parseFloat(String(pStr));
  }

  if (closePrice === undefined) {
    throw new Error('Current market price unavailable');
  }

  // Calculate profit/loss
  // Hardcoded gamified logic: +20% win, -100% loss
  const isUp = direction === 'up' || direction === 'UP';
  const won = isUp ? closePrice > entry_price : closePrice < entry_price;
  
  let returnAmount = 0;
  let profit = 0;
  
  if (won) {
    profit = amount * 0.20; // 20% profit
    returnAmount = amount + profit;
  } else {
    profit = -amount; // 100% loss
    returnAmount = 0;
  }
  
  if (returnAmount < 0) returnAmount = 0; // Can't lose more than margin

  // Credit wallet
  if (returnAmount > 0) {
    await credit(userId, Number(returnAmount.toFixed(2)), mode, `Trade Closed: ${market}`);
  }

  // Update DB
  await supabase.from('predictions').update({ 
    status: 'settled', 
    close_price: closePrice 
  }).eq('id', predictionId);

  return { success: true, closePrice, returnAmount, profit };
};

export const placePrediction = async (
  userId: string, 
  market: string, 
  direction: 'UP' | 'DOWN', 
  amount: number, 
  mode: 'real' | 'demo', 
  windowMinutes: number
) => {
  // Check market price
  const cachedPriceStr = await redis.get(`market:${market}`);
  if (!cachedPriceStr) {
    throw new Error('Market price currently unavailable');
  }
  const entryPrice = parseFloat(String(cachedPriceStr));

  // Debit funds
  const debitRes = await debit(userId, amount, mode, `Prediction on ${market}`);
  if (!debitRes.success) {
    throw new Error(debitRes.error || 'Failed to process bet');
  }

  const closeDate = new Date();
  closeDate.setMinutes(closeDate.getMinutes() + windowMinutes);
  
  const { data, error } = await supabase.from('predictions').insert([
    {
      user_id: userId,
      market: market,
      direction: direction.toLowerCase(),
      entry_price: entryPrice,
      amount: amount,
      mode: mode,
      status: 'pending',
      // For forex trades, window_close_at is set far in the future
      window_close_at: windowMinutes === 1440 ? closeDate.toISOString() : new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString()
    }
  ]).select('*').single();

  if (error || !data) {
     logger.error(error, 'Prediction insertion failed');
     await credit(userId, amount, mode, `Refund: Prediction on ${market} failed`);
     throw new Error('Database error saving prediction');
  }

  return { success: true, prediction: data, newBalance: debitRes.newBalance };
};

export const settlePredictions = async () => {
    logger.info('Running prediction settlement job...');
    
    const now = new Date().toISOString();
    const { data: pending, error } = await supabase
      .from('predictions')
      .select('*')
      .eq('status', 'pending')
      .lte('window_close_at', now);
      
    if (error || !pending || pending.length === 0) {
      return; 
    }
    
    // Group by market for batching (though NSE is per stock)
    const markets = new Set<string>();
    pending.forEach((p) => markets.add(p.market));
    
    const closePrices = new Map<string, number>();
    for (const m of Array.from(markets)) {
        if (isNseSymbol(m)) {
          // NSE Stock – Fetch via scraper
          const price = await fetchNsePrice(m);
          if (price) closePrices.set(m, price);
        } else {
          // Real-time market (Crypto/FX) – Fetch via Redis
          const pStr = await redis.get(`market:${m}`);
          if (pStr) closePrices.set(m, parseFloat(String(pStr)));
        }
    }
    
    for (const prediction of pending) {
        const { id, user_id, market, direction, entry_price, amount, mode } = prediction;
        
        const closePrice = closePrices.get(market);
        if (closePrice === undefined) {
          logger.warn(`No closing price found for ${market}. Skipping settlement for prediction ${id}.`);
          continue; // Wait until next tick to try again
        }
        
        const won = (direction === 'up' && closePrice > entry_price) || 
                    (direction === 'down' && closePrice < entry_price);
                    
        if (won) {
            // Invest (NSE) pays out 30% profit (1.3x). Other markets use default1.5x payout.
            const payoutMultiplier = isNseSymbol(market) ? 1.3 :1.5;
            const winAmount = Number((amount * payoutMultiplier).toFixed(2)); 
            await credit(user_id, winAmount, mode, `Prediction Won on ${market}`);
        }
        
        await supabase.from('predictions').update({ status: 'settled', close_price: closePrice }).eq('id', id);
    }
    logger.info(`Settled ${pending.length} predictions`);
};
