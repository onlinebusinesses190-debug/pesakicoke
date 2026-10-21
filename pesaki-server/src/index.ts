import 'dotenv/config';
import fastify from 'fastify';
import cors from '@fastify/cors';
import multipart from '@fastify/multipart';
import { createClient } from '@supabase/supabase-js'; // 👈 Added Supabase for backend queries
import { env } from './config/env';
import { logger } from './utils/logger';
import { initSocket } from './socket';
import { startNewRound } from './games/aviator/engine';
import { startUpDownRounds } from './games/updown/engine';
import { initCronJobs } from './cron';
import { registerRoutes } from './api';
import { setupRateLimit } from './middleware/rateLimit';
import { getEngine } from './services/forex/marketEngine';
import { hydrateAndAttach } from './services/forex/persistence';
import { startPositionMonitor } from './services/forex/positionMonitor';
import { startBinaryFxExpiryWorker, stopBinaryFxExpiryWorker } from './services/binaryFx/expiryWorker';

import walletRoutes from './routes/wallet';
import kaziRoutes from './routes/kazi';
import { mpesaRoutes } from './routes/mpesa';
import { palplussRoutes } from './routes/palpluss';
import { bankingRoutes } from './routes/banking';
import referralRoutes from './routes/referrals';
import adminRoutes from './routes/admin';
import userRoutes from './routes/user';
import { bfxRoutes } from './routes/binaryFx';

// ─── SUPABASE BACKEND CLIENT ───
// Make sure you have SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file
const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseKey);

// ─── HOUSE RISK CACHE (Prevents DB Spam) ───
const houseRiskCache: Record<string, { netLots: number; totalProfit: number }> = {};

async function updateHouseRiskCache() {
  try {
    // 1. Fetch all open forex trades from the database
    const { data: openTrades, error } = await supabase
      .from('forex_trades') // ⚠️ Change this if your table is named differently (e.g., 'positions' or 'trades')
      .select('symbol, side, lots, entry_price')
      .eq('status', 'open');

    if (error) {
      logger.error({ err: error.message }, "Failed to fetch open trades for risk cache");
      return;
    }

    if (!openTrades || openTrades.length === 0) return;

    // Reset cache
    for (const symbol of Object.keys(houseRiskCache)) {
      houseRiskCache[symbol] = { netLots: 0, totalProfit: 0 };
    }

    const engine = getEngine();

    for (const trade of openTrades) {
      const symbol = trade.symbol;
      if (!houseRiskCache[symbol]) {
        houseRiskCache[symbol] = { netLots: 0, totalProfit: 0 };
      }

      // 2. Calculate Net Lots (Buyers vs Sellers)
      if (trade.side === 'buy') houseRiskCache[symbol].netLots += Number(trade.lots);
      if (trade.side === 'sell') houseRiskCache[symbol].netLots -= Number(trade.lots);

      // 3. Calculate Unrealized Profit
      const currentPrice = engine.quote(symbol).mid;
      const entryPrice = Number(trade.entry_price);
      
      const priceDiff = trade.side === 'buy' 
        ? (currentPrice - entryPrice) 
        : (entryPrice - currentPrice);
      
      // Standard lot size of 100,000
      const pnl = priceDiff * Number(trade.lots) * 100000; 
      houseRiskCache[symbol].totalProfit += pnl;
    }
  } catch (error) {
    logger.error(error, "Failed to update House Risk Cache");
  }
}
// ─────────────────────────────────────────────

const startServer = async () => {
  try {
    const server = fastify({ logger: true });

    await server.register(cors, {
      origin: (_origin, cb) => cb(null, true),
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    });

    await server.register(multipart);
    await setupRateLimit(server);

    registerRoutes(server);

    server.register(walletRoutes);
    server.register(kaziRoutes);
    server.register(mpesaRoutes);
    server.register(palplussRoutes);
    server.register(bankingRoutes);
    server.register(referralRoutes);
    server.register(adminRoutes);
    server.register(userRoutes);
    server.register(bfxRoutes, { prefix: '/games/bfx' });

    server.get('/user/stats', async (_request, reply) => {
      return reply.send({
        activeTrades: 0,
        tradesChange: 0,
        jobsCompleted: 0,
        jobsChange: 0,
        investmentGrowth: '0%',
        growthChange: 0,
        businessesFunded: 0,
        activeBusinesses: 0,
      });
    });
    server.get('/trading/opportunities', async (_request, reply) => {
      return reply.send([]);
    });

    initSocket(server.server);
    startNewRound();
    startUpDownRounds();
    initCronJobs();

    // ─── FOREX ENGINE SETUP ───
    const stopPersistence = await hydrateAndAttach(getEngine());
    
    // Inject the House Risk Logic into the Engine
    getEngine().exposureProvider = (symbol: string) => {
      return houseRiskCache[symbol]?.netLots || 0;
    };
    
    getEngine().totalProfitProvider = (symbol: string) => {
      return houseRiskCache[symbol]?.totalProfit || 0;
    };

    getEngine().start();
    startPositionMonitor();
    startBinaryFxExpiryWorker();

    // Update the risk cache every 2 seconds so we don't spam the DB
    setInterval(updateHouseRiskCache, 2000);
    updateHouseRiskCache(); // Run once immediately on startup
    // ──────────────────────────

    const shutdown = () => {
      logger.info('Shutting down PESAKI Forex engine');
      stopBinaryFxExpiryWorker();
      getEngine().stop();
      if (stopPersistence) stopPersistence();
      process.exit(0);
    };
    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    await server.listen({ port: env.PORT, host: '0.0.0.0' });
    logger.info(`✨ Pesaki Server listening at http://localhost:${env.PORT}`);
  } catch (err) {
    logger.fatal(err, 'Failed to start server');
    process.exit(1);
  }
};

startServer();
