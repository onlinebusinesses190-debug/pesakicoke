import crypto from 'crypto';
import { supabase } from '../../lib/supabase';
import { debit, credit } from '../../wallet/service';
import { logger } from '../../utils/logger';
import { redis } from '../../lib/redis';
import { AllocationOutcome } from './types';

const OUTCOMES_CACHE_KEY = 'growth:outcomes';
const OUTCOMES_CACHE_TTL = 300; // 5 minutes in seconds

export const getOutcomes = async (): Promise<AllocationOutcome[]> => {
  // Try cache first
  const cached = await redis.get(OUTCOMES_CACHE_KEY);
  if (cached) {
    logger.info('Growth outcomes loaded from Redis cache');
    return (typeof cached === 'string' ? JSON.parse(cached) : cached) as AllocationOutcome[];
  }

  // Fall back to DB, ordered consistently so index always matches
  const { data: outcomes, error } = await supabase
    .from('spin_prizes')
    .select('*')
    .order('id', { ascending: true });

  if (error || !outcomes || outcomes.length === 0) {
    throw new Error('No outcomes configured');
  }

  // Cache for 5 minutes
  await redis.set(OUTCOMES_CACHE_KEY, JSON.stringify(outcomes), { ex: OUTCOMES_CACHE_TTL });
  logger.info({ count: outcomes.length }, 'Growth outcomes fetched from DB and cached');

  return outcomes as AllocationOutcome[];
};

export const executeAllocation = async (userId: string, allocation: number, mode: 'real' | 'demo') => {
  if (allocation <= 0) throw new Error('Allocation amount must be positive');

  // Deduct from wallet first (fail fast before any RNG)
  const debitRes = await debit(userId, allocation, mode, 'Market Allocation');
  if (!debitRes.success) {
    throw new Error(debitRes.error || 'Failed to process allocation');
  }

  // Fetch outcomes (cached)
  const outcomes = await getOutcomes();

  // Weighted random selection
  const totalWeight = outcomes.reduce((sum, p) => sum + p.weight, 0);
  const randomValue = crypto.randomInt(0, totalWeight);
  
  let currentWeight = 0;
  let selectedOutcome = outcomes[0] as AllocationOutcome;
  let outcomeIndex = 0;

  for (let i = 0; i < outcomes.length; i++) {
    const p = outcomes[i];
    currentWeight += p.weight;
    if (randomValue < currentWeight) {
      selectedOutcome = p;
      outcomeIndex = i;
      break;
    }
  }

  // Payout: outcome.value is a multiplier of the allocation
  // e.g. 0 = adjustment, 0.5 = half back, 1.0 = break even, 2.0 = double, 10.0 = growth
  const returnAmount = Number((allocation * selectedOutcome.value).toFixed(2));

  // Log result to DB (non-blocking failure; don't block user on insert errors)
  const { error: insertErr } = await supabase.from('spin_results').insert([
    {
      user_id: userId,
      bet_amount: allocation,
      prize_id: selectedOutcome.id,
      prize_value: returnAmount,
      mode
    }
  ]);
  if (insertErr) {
    logger.error(insertErr, 'Failed to log allocation result');
  }

  // Credit returns if any
  let finalBalance = debitRes.newBalance;
  if (returnAmount > 0) {
    const creditRes = await credit(userId, returnAmount, mode, `Market Growth - ${selectedOutcome.name} (${selectedOutcome.value}x)`);
    if (creditRes.success) {
      finalBalance = creditRes.newBalance;
    }
  }

  return { 
    prizeIndex: outcomeIndex,
    prizeName: selectedOutcome.name,
    prizeMultiplier: selectedOutcome.value,
    winAmount: returnAmount,
    prizes: outcomes, // Return full list so frontend wheel is always in sync with DB
    newBalance: finalBalance,
  };
};
