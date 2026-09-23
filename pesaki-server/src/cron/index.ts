import cron from 'node-cron';
import { fetchMarketData } from './fetchMarketData';
import { runSettlePredictions } from './settlePredictions';
import { logger } from '../utils/logger';

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
  
  // Fire once on startup to warm up cache
  fetchMarketData();
};
