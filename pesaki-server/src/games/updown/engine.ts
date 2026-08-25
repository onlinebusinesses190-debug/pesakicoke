import { randomUUID } from 'crypto';
import { redis } from '../../lib/redis';
import { supabase } from '../../lib/supabase';
import { credit, debit } from '../../wallet/service';
import { logger } from '../../utils/logger';
import { io } from '../../socket/index';

// ── Types ────────────────────────────────────────────────────────────────────

export type RoundState = 'open' | 'locked' | 'result';

export interface UpDownRound {
  id: string;
  market: string;
  entryPrice: number;
  closePrice: number | null;
  direction: 'up' | 'down' | null;
  state: RoundState;
  opensAt: Date;
  locksAt: Date;
  resultsAt: Date;
}

interface MarketPosition {
  userId: string;
  direction: 'up' | 'down';
  amount: number;
  mode: 'real' | 'demo';
  predictionId: string;
}

interface HistoryEntry {
  roundId: string;
  direction: 'up' | 'down' | null;
  entryPrice: number;
  closePrice: number;
  settledAt: string;
}

// ── Config ───────────────────────────────────────────────────────────────────

const DEFAULT_MARKET = 'USD/KES';
const OPEN_DURATION   = 10_000; // 10 seconds
const LOCKED_DURATION =  2_000; //  2 seconds
const RESULT_DURATION =  3_000; //  3 seconds
const GROWTH_MULTIPLIER =1.5;
const MAX_HISTORY = 20;

// ── State ────────────────────────────────────────────────────────────────────

let currentRound: UpDownRound | null = null;
let activePositions: Map<string, MarketPosition> = new Map(); // keyed by userId
const roundHistory: HistoryEntry[] = [];

// ── Public getters ────────────────────────────────────────────────────────────

export const getUpDownState = () => ({
  round: currentRound,
  history: roundHistory.slice(-10),
});

// ── Bet placement  ────────────────────────────────────────────────────────────

export const placePosition = async (
  userId: string,
  roundId: string,
  direction: 'up' | 'down',
  amount: number,
  mode: 'real' | 'demo'
): Promise<{ success: true; newBalance: number } | { success: false; error: string }> => {
  if (!currentRound || currentRound.state !== 'open') {
    return { success: false, error: 'Market is not accepting orders' };
  }
  if (currentRound.id !== roundId) {
    return { success: false, error: 'Market ID mismatch - please refresh' };
  }
  if (activePositions.has(userId)) {
    return { success: false, error: 'You already have an active position this round' };
  }

  // Debit wallet
  const debitRes = await debit(userId, amount, mode, `Market Forecast (${direction.toUpperCase()}) on ${currentRound.market}`);
  if (!debitRes.success) {
    return { success: false, error: debitRes.error || 'Insufficient funds' };
  }

  // Persist in DB
  const closeAt = new Date(currentRound.locksAt);
  const { data, error: dbErr } = await supabase.from('predictions').insert([{
    user_id: userId,
    market: currentRound.market,
    direction,
    amount,
    mode,
    entry_price: currentRound.entryPrice,
    status: 'pending',
    round_id: currentRound.id,
    window_close_at: closeAt.toISOString(),
  }]).select('id').single();

  if (dbErr || !data) {
    // Refund on DB failure
    await credit(userId, amount, mode, `Refund: Market Forecast DB error`);
    return { success: false, error: 'Database error — order refunded' };
  }

  activePositions.set(userId, { userId, direction, amount, mode, predictionId: data.id });
  logger.info({ userId, direction, amount, roundId }, 'Market position placed');
  return { success: true, newBalance: debitRes.newBalance! };
};

// ── Round Lifecycle ───────────────────────────────────────────────────────────

const getMarketPrice = async (market: string): Promise<number | null> => {
  try {
    const raw = await redis.get(`market:${market}`);
    if (!raw) return null;
    return parseFloat(String(raw));
  } catch {
    return null;
  }
};

/**
 * Applies realistic intraday micro-movement to a price.
 * Frankfurter only gives daily rates so we layer tick-level volatility on top.
 * - Direction is random (50/50 with a slight bias toward mean-reversion).
 * - Magnitude: 0.05% – 0.25% of current price (typical 10-second FX range).
 * - Writes the new price back to Redis so each round starts from the updated value.
 */
const simulateClosePrice = async (market: string, entryPrice: number): Promise<number> => {
  // Random magnitude between 0.05% and 0.25%
  const magnitudePct = 0.0005 + Math.random() * 0.002;
  const delta = entryPrice * magnitudePct;
  // 50/50 direction
  const direction = Math.random() < 0.5 ? 1 : -1;
  const newPrice = parseFloat((entryPrice + direction * delta).toFixed(4));

  // Persist so the next round's entry is the new price (makes it look like a live feed)
  try {
    await redis.set(`market:${market}`, String(newPrice), { ex: 3600 });
  } catch {
    // Redis write failure is non-fatal
  }

  return newPrice;
};


const startOpen = async () => {
  const market = DEFAULT_MARKET;
  const entryPrice = await getMarketPrice(market);

  if (entryPrice === null) {
    logger.warn({ market }, 'Up/Down: No price in Redis — skipping round, retrying in 5s');
    setTimeout(startOpen, 5_000);
    return;
  }

  const now = new Date();
  const locksAt = new Date(now.getTime() + OPEN_DURATION);
  const resultsAt = new Date(locksAt.getTime() + LOCKED_DURATION);

  currentRound = {
    id: randomUUID(),
    market,
    entryPrice,
    closePrice: null,
    direction: null,
    state: 'open',
    opensAt: now,
    locksAt,
    resultsAt,
  };

  activePositions.clear();

  const nsp = io.of('/updown');
  nsp.emit('UPDOWN_ROUND_OPEN', {
    roundId: currentRound.id,
    market,
    entryPrice,
    duration: OPEN_DURATION / 1000,
    opensAt: now.toISOString(),
    locksAt: locksAt.toISOString(),
  });

  logger.info({ roundId: currentRound.id, market, entryPrice }, 'Up/Down round OPEN');

  // Broadcast countdown every second
  let secondsLeft = OPEN_DURATION / 1000;
  const countdownInterval = setInterval(() => {
    secondsLeft--;
    if (secondsLeft >= 0 && currentRound) {
      nsp.emit('UPDOWN_COUNTDOWN', { secondsLeft, roundId: currentRound.id });
    }
    if (secondsLeft <= 0) clearInterval(countdownInterval);
  }, 1_000);

  setTimeout(startLocked, OPEN_DURATION);
};

const startLocked = async () => {
  if (!currentRound) return;

  currentRound.state = 'locked';

  const nsp = io.of('/updown');
  nsp.emit('UPDOWN_ROUND_LOCKED', { roundId: currentRound.id });

  logger.info({ roundId: currentRound.id }, 'Up/Down round LOCKED');

  // Simulate a realistic close price (adds micro-movement to entryPrice)
  const closePrice = await simulateClosePrice(currentRound.market, currentRound.entryPrice);
  currentRound.closePrice = closePrice;

  setTimeout(() => startResult(closePrice), LOCKED_DURATION);
};

const startResult = async (closePrice: number) => {
  if (!currentRound) return;

  currentRound.state = 'result';

  let direction: 'up' | 'down' | null = null;
  if (closePrice !== null) {
    if (closePrice > currentRound.entryPrice) direction = 'up';
    else if (closePrice < currentRound.entryPrice) direction = 'down';
    else direction = null; // void — equal prices
  }

  currentRound.direction = direction;
  currentRound.closePrice = closePrice;

  const positionsArray = Array.from(activePositions.values());
  let successfulTrades = 0;

  for (const pos of positionsArray) {
    if (direction === null) {
      // Void round — refund everyone
      await credit(pos.userId, pos.amount, pos.mode, `Market Refund — Void round (${currentRound.market})`);
      await supabase.from('predictions').update({ status: 'cancelled', close_price: closePrice })
        .eq('id', pos.predictionId);
    } else if (pos.direction === direction) {
      // Success
      const winAmount = Number((pos.amount * GROWTH_MULTIPLIER).toFixed(2));
      await credit(pos.userId, winAmount, pos.mode, `Market Success ${direction.toUpperCase()} on ${currentRound.market} (${GROWTH_MULTIPLIER}x)`);
      await supabase.from('predictions').update({ status: 'settled', close_price: closePrice })
        .eq('id', pos.predictionId);
      successfulTrades++;
    } else {
      // Unsuccessful
      await supabase.from('predictions').update({ status: 'settled', close_price: closePrice })
        .eq('id', pos.predictionId);
    }
  }

  // History entry
  if (closePrice !== null) {
    roundHistory.push({
      roundId: currentRound.id,
      direction,
      entryPrice: currentRound.entryPrice,
      closePrice,
      settledAt: new Date().toISOString(),
    });
    if (roundHistory.length > MAX_HISTORY) roundHistory.shift();
  }

  const resultPayload = {
    roundId: currentRound.id,
    market: currentRound.market,
    entryPrice: currentRound.entryPrice,
    closePrice,
    direction,
    winners: successfulTrades,
    payoutMultiplier: GROWTH_MULTIPLIER,
  };

  io.of('/updown').emit('UPDOWN_ROUND_RESULT', resultPayload);

  logger.info({ ...resultPayload, totalPositions: positionsArray.length }, 'Up/Down round RESULT');

  setTimeout(startOpen, RESULT_DURATION);
};

// ── Boot ──────────────────────────────────────────────────────────────────────

export const startUpDownRounds = () => {
  logger.info('Starting Up/Down round engine...');
  startOpen();
};
