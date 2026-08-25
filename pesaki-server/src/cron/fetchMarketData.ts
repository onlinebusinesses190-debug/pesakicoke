import axios from 'axios';
import { redis } from '../lib/redis';
import { logger } from '../utils/logger';

export const fetchMarketData = async () => {
  logger.info('Fetching live market data...');

  try {
    // 1. Fetch Forex Rates (Free Frankfurter API)
    // Use stable endpoint with explicit from base currency and target symbols
    const res = await axios.get('https://api.frankfurter.app/latest', {
      params: {
        from: 'EUR',
        to: 'KES,USD,GBP,JPY',
      },
      timeout: 15000,
      validateStatus: (status) => status >= 200 && status < 500,
    });

    if (res.status === 404 || res.status === 422) {
      throw new Error(`Frankfurter endpoint returned ${res.status}`);
    }

    const data = res.data;

    if (data && data.rates) {
      const rates = data.rates;
      // EUR based (since Frankfurter default is EUR)
      const eurUsd = rates.USD || 1.08;
      const eurGbp = rates.GBP || 0.85;
      const eurKes = rates.KES || 142.00;
      const eurJpy = rates.JPY || 163.00;

      // Derived pairs
      const usdKes = eurKes / eurUsd;
      const gbpUsd = eurUsd / eurGbp;
      const gbpKes = eurKes / eurGbp;

      // Save to Redis
      await redis.set('market:EUR/USD', eurUsd.toFixed(4), { ex: 360 });
      await redis.set('market:EUR/GBP', eurGbp.toFixed(4), { ex: 360 });
      await redis.set('market:EUR/KES', eurKes.toFixed(2), { ex: 360 });
      await redis.set('market:USD/KES', usdKes.toFixed(2), { ex: 360 });
      await redis.set('market:GBP/USD', gbpUsd.toFixed(4), { ex: 360 });
      await redis.set('market:GBP/KES', gbpKes.toFixed(2), { ex: 360 });
      await redis.set('market:USD/JPY', (eurJpy / eurUsd).toFixed(2), { ex: 360 });
      
      // Mock some for missing ones in basic API (XAU/USD - Gold)
      await redis.set('market:XAU/USD', (2150.00 + Math.random() * 10).toFixed(2), { ex: 360 });

      logger.info('Market Data Updated successfully');
    }

  } catch (err: any) {
    logger.error({ error: err.message }, 'Error fetching live market data - using fallbacks');
    
    // Provide some minimal fallbacks so the app isn't broken
    try {
      await redis.set('market:EUR/USD', '1.0850', { ex: 360 });
      await redis.set('market:USD/KES', '132.50', { ex: 360 });
      await redis.set('market:GBP/USD', '1.2640', { ex: 360 });
      await redis.set('market:XAU/USD', '2165.40', { ex: 360 });
    } catch (redisErr: any) {
      logger.error({ error: redisErr.message }, 'Failed to set fallback market data in Redis');
    }
  }

  // 2. Fetch NSE Data (Mocked)
  try {
    const nseSafaricomStr = await redis.get('market:NSE/SCOM');
    const baseScom = nseSafaricomStr ? parseFloat(String(nseSafaricomStr)) : 15.00;
    const newScom = baseScom + (Math.random() * 0.4 - 0.2); 
    await redis.set('market:NSE/SCOM', newScom.toFixed(2), { ex: 360 });
  } catch (e) {
      logger.error('NSE Update failed');
  }
};

