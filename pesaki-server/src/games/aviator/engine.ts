import { sha256 } from '../../utils/hash';
import { generateRoundOutcome } from './rng';
import { logger } from '../../utils/logger';
import { io } from '../../socket/index';
import { randomUUID } from 'crypto';
import { AviatorRound, AviatorBet } from './types';
import { credit, debit } from '../../wallet/service';

let currentRound: AviatorRound | null = null;
let activeOrders: Map<string, AviatorBet> = new Map();
let currentMultiplier = 1.0;
let flightInterval: NodeJS.Timeout | null = null;
const TICK_RATE = 100; // 100ms
const WAITING_TIME = 5000; // 5s wait between rounds

export const getAviatorState = () => ({
  round: currentRound,
  multiplier: currentMultiplier,
  activeOrders: Array.from(activeOrders.entries()),
});

export const placeOrder = async (userId: string, amount: number, mode: 'real' | 'demo') => {
  if (currentRound?.status !== 'WAITING') {
    throw new Error('Market is already in progress');
  }
  if (activeOrders.has(userId)) {
    throw new Error('You already have an active allocation this round');
  }

  // Deduct from wallet first
  const debitRes = await debit(userId, amount, mode, 'Market Allocation');
  if (!debitRes.success) {
    throw new Error(debitRes.error || 'Insufficient funds');
  }
  
  const order: AviatorBet = { userId, amount, mode, cashedOut: false };
  activeOrders.set(userId, order);
  return { order, newBalance: debitRes.newBalance };
};

export const realizeGain = async (userId: string) => {
  if (currentRound?.status !== 'FLYING') {
    throw new Error('Can only realize gain while growing');
  }

  const order = activeOrders.get(userId);
  if (!order || order.cashedOut) {
    throw new Error('No active allocation found or already realized');
  }

  // Calculate returns based on CURRENT multiplier to avoid spoofing
  const realizedMultiplier = currentMultiplier;
  const gainAmount = Number((order.amount * realizedMultiplier).toFixed(2));
  
  order.cashedOut = true;
  order.cashoutMultiplier = realizedMultiplier;
  order.cashoutAmount = gainAmount;

  // Credit user wallet
  const result = await credit(userId, gainAmount, order.mode, `Market Gain (x${realizedMultiplier})`);
  
  if (!result.success) {
    logger.error({ userId, gainAmount }, 'Failed to credit player gain!');
  }

  return { multiplier: realizedMultiplier, winAmount: gainAmount, newBalance: result.newBalance };
};

const tickFlight = () => {
  if (!currentRound || currentRound.status !== 'FLYING') return;

  const elapsedTime = Date.now() - currentRound.startTime;
  // Multiplier formula: grows exponentially over time. 
  // Formula: multiplier = e^(0.06 * timeInSeconds)
  currentMultiplier = Math.pow(Math.E, 0.06 * (elapsedTime / 1000));

  if (currentMultiplier >= currentRound.crashPoint) {
    closeMarket();
  } else {
    io.of('/aviator').emit('MULTIPLIER_TICK', { multiplier: currentMultiplier.toFixed(2) });
  }
};

const startGrowing = () => {
  if (!currentRound) return;
  
  currentRound.status = 'FLYING';
  currentRound.startTime = Date.now();
  currentMultiplier = 1.0;
  
  io.of('/aviator').emit('ROUND_START', { 
    roundId: currentRound.id, 
    hash: currentRound.hash 
  });
  
  flightInterval = setInterval(tickFlight, TICK_RATE);
};

const closeMarket = () => {
  if (flightInterval) clearInterval(flightInterval);
  if (!currentRound) return;

  currentRound.status = 'CRASHED';
  
  io.of('/aviator').emit('ROUND_CRASHED', {
    multiplier: currentRound.crashPoint,
    serverSeed: currentRound.serverSeed, // Reveal server seed for verification
  });
  
  // Clean up lost allocations here
  const unsuccessful = Array.from(activeOrders.values()).filter(b => !b.cashedOut);
  logger.info({ closedAt: currentRound.crashPoint, unsuccessful: unsuccessful.length }, 'Market closed');
  
  setTimeout(startNewRound, WAITING_TIME);
};

export const startNewRound = () => {
  const { serverSeed, clientSeed, crashPoint } = generateRoundOutcome();

  currentRound = {
    id: randomUUID(),
    serverSeed,
    clientSeed,
    hash: sha256(serverSeed),
    crashPoint,
    startTime: 0,
    status: 'WAITING',
  };

  currentMultiplier = 1.0;
  activeOrders.clear();

  io.of('/aviator').emit('ROUND_WAITING', {
    roundId: currentRound.id,
    hash: currentRound.hash,
    waitTime: WAITING_TIME
  });

  logger.info({ roundId: currentRound.id, crashPoint: currentRound.crashPoint }, 'New market session opening');

  setTimeout(startGrowing, WAITING_TIME);
};
