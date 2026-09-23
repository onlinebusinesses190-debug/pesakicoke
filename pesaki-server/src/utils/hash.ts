import crypto from 'crypto';

/**
 * Generates a SHA-256 hash
 */
export const sha256 = (data: string | Buffer): string => {
  return crypto.createHash('sha256').update(data).digest('hex');
};

/**
 * Generates a secure random server seed
 */
export const generateServerSeed = (): string => {
  return crypto.randomBytes(32).toString('hex');
};

/**
 * Computes crash point for Aviator using a Provably Fair algorithm
 */
export const computeCrashPoint = (serverSeed: string, clientSeed: string): number => {
  const hash = crypto.createHmac('sha256', serverSeed).update(clientSeed).digest('hex');
  const h = parseInt(hash.slice(0, 13), 16);
  const e = Math.pow(2, 52);

  // 1. House Edge: 3% chance to crash instantly at 1.00x
  if (h % 33 === 0) return 1.00;

  // 2. Calculate point (standard Aviator formula)
  let result = Math.floor((100 * e - h) / (e - h));
  
  // 3. Cap at 100.00x to prevent platform draining
  if (result > 10000) result = 10000;

  return Math.max(100, result) / 100; // Return multiplier like 1.05, 2.45, max 100.0
};
