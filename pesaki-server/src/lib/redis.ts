import { Redis } from '@upstash/redis';
import { env } from '../config/env';
import { logger } from '../utils/logger';

export const redis = new Redis({
  url: env.UPSTASH_REDIS_URL,
  token: env.UPSTASH_REDIS_TOKEN,
});

logger.info('Upstash Redis (REST) initialized');
