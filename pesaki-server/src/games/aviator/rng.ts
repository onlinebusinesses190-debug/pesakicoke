import { computeCrashPoint, generateServerSeed } from '../../utils/hash';

/**
 * Aviator Provably Fair RNG
 * 
 * Uses SHA-256 HMAC of a server seed and client seed to generate a deterministic 
 * outcome that can be verified once the server seed is revealed.
 */

export const generateRoundOutcome = (clientSeed?: string) => {
  const serverSeed = generateServerSeed();
  // Using a default client seed if not provided, or it can be a hardcoded 
  // platform seed combined with the last BTC block hash.
  const cSeed = clientSeed || '0000000000000000000000000000000000000000000000000000000000000000';
  
  const crashPoint = computeCrashPoint(serverSeed, cSeed);
  
  return {
    serverSeed,
    clientSeed: cSeed,
    crashPoint
  };
};
