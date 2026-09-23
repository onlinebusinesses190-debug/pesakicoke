import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { verifyAuth } from '../../middleware/auth';
import { placeNsePrediction } from '../../games/nse/engine';
import { logger } from '../../utils/logger';

// ─── NSE Stock definitions ────────────────────────────────────────────────────

const TOP_NSE_STOCKS = [
  { symbol: 'SCOM', slug: 'scom', name: 'Safaricom Plc', sector: 'Telecommunications' },
  { symbol: 'EQTY', slug: 'eqty', name: 'Equity Group Holdings', sector: 'Banking' },
  { symbol: 'KCB',  slug: 'kcb',  name: 'KCB Group', sector: 'Banking' },
  { symbol: 'COOP', slug: 'coop', name: 'Co-operative Bank', sector: 'Banking' },
  { symbol: 'EABL', slug: 'eabl', name: 'East African Breweries', sector: 'Manufacturing' },
  { symbol: 'ABSA', slug: 'absa', name: 'ABSA Bank Kenya', sector: 'Banking' },
  { symbol: 'SCBK', slug: 'scbk', name: 'Standard Chartered Bank', sector: 'Banking' },
  { symbol: 'SBIC', slug: 'sbic', name: 'Stanbic Holdings', sector: 'Banking' },
  { symbol: 'KEGN', slug: 'kegn', name: 'KenGen Plc', sector: 'Energy' },
  { symbol: 'KPLC', slug: 'kplc', name: 'Kenya Power & Lighting', sector: 'Energy' },
  { symbol: 'BAT',  slug: 'bat',  name: 'British American Tobacco Kenya', sector: 'Manufacturing' },
  { symbol: 'BAMB', slug: 'bamb', name: 'Bamburi Cement', sector: 'Construction' },
  { symbol: 'CARB', slug: 'carb', name: 'Carbacid Investments', sector: 'Investment' },
  { symbol: 'CIC',  slug: 'cic',  name: 'CIC Insurance Group', sector: 'Insurance' },
  { symbol: 'BRIT', slug: 'brit', name: 'Britam Holdings', sector: 'Insurance' },
  { symbol: 'JUB',  slug: 'jub',  name: 'Jubilee Holdings', sector: 'Insurance' },
  { symbol: 'NCBA', slug: 'ncba', name: 'NCBA Group Plc', sector: 'Banking' },
  { symbol: 'DTK',  slug: 'dtk',  name: 'Diamond Trust Bank', sector: 'Banking' },
  { symbol: 'IMH',  slug: 'imh',  name: 'I&M Holdings Plc', sector: 'Banking' },
  { symbol: 'NMG',  slug: 'nmg',  name: 'Nation Media Group', sector: 'Media' },
];

async function fetchRapidApiStocks() {
  const apiKey = process.env.RAPIDAPI_KEY;
  const apiHost = process.env.RAPIDAPI_HOST;
  if (!apiKey || !apiHost) {
    throw new Error('RapidAPI credentials missing in environment');
  }

  const url = `https://${apiHost}/stocks`;
  const res = await fetch(url, {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': apiHost,
      'Content-Type': 'application/json',
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36',
    },
    signal: AbortSignal.timeout(10_000),
  });

  if (!res.ok) {
    throw new Error(`RapidAPI Error: ${res.statusText}`);
  }

  const json = await res.json();
  const apiStocks = json.data || [];

  const results = [];
  for (const top of TOP_NSE_STOCKS) {
    const apiMatch = apiStocks.find((s: any) => s.ticker === top.symbol);
    if (!apiMatch) continue;

    const price = parseFloat(apiMatch.price) || 0;
    const changePercentStr = apiMatch.change.replace('%', '').trim();
    const changePercent = parseFloat(changePercentStr) || 0;
    
    // Estimate raw change since it's not provided by API
    const originalPrice = price / (1 + (changePercent / 100));
    const change = parseFloat((price - originalPrice).toFixed(2));
    const volume = parseInt(apiMatch.volume, 10) || 0;

    results.push({
      id: top.symbol,
      name: top.name,
      symbol: top.symbol,
      sector: top.sector,
      price,
      change,
      changePercent,
      volume
    });
  }

  return results;
}

// In-memory cache: re-use data for 5 minutes to avoid hammering the site
let cache: { stocks: any[]; updatedAt: string; marketOpen: boolean } | null = null;
let cacheExpiry = 0;

function isMarketOpen(): boolean {
  const now = new Date();
  const eat = new Date(now.getTime() + 3 * 60 * 60 * 1000);
  const day = eat.getUTCDay();
  const mins = eat.getUTCHours() * 60 + eat.getUTCMinutes();
  return day >= 1 && day <= 5 && mins >= 540 && mins < 900;
}

const nsePredictSchema = z.object({
  symbol: z.string().min(1),
  direction: z.enum(['UP', 'DOWN']),
  amount: z.number().min(10), // Min 10 KSh
  mode: z.enum(['real', 'demo']),
  entryPrice: z.number().positive(),
});

export const nseRoutes = async (fastify: FastifyInstance) => {

  // GET /games/nse/stocks — live NSE stock data (scraped from afx.kwayisi.org)
  // No auth required — public market data
  fastify.get('/stocks', async (_request, reply) => {
    try {
      const now = Date.now();

      // Serve from cache if still valid (5 min TTL)
      if (cache && now < cacheExpiry) {
        logger.info('NSE stocks served from cache');
        return reply.send({ success: true, ...cache });
      }

      // Fetch live data from RapidAPI
      const stocks = await fetchRapidApiStocks();
      const updatedAt = new Date().toISOString();
      const marketOpen = isMarketOpen();

      // Update cache
      cache = { stocks, updatedAt, marketOpen };
      cacheExpiry = now + 5 * 60 * 1000; // 5 minutes

      logger.info({ count: stocks.length }, 'NSE stocks scraped and cached');

      return reply.send({ success: true, stocks, updatedAt, marketOpen });
    } catch (err: any) {
      logger.error(err, 'NSE stocks scraper error');
      // Return stale cache on error rather than failing
      if (cache) {
        return reply.send({ success: true, ...cache, stale: true });
      }
      return reply.code(502).send({ success: false, error: 'Failed to fetch NSE market data' });
    }
  });


  fastify.post('/predict', { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = nsePredictSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.code(400).send({ success: false, error: 'Invalid payload', details: parsed.error.format() });
    }

    try {
      const { symbol, direction, amount, mode, entryPrice } = parsed.data;
      const result = await placeNsePrediction(
        request.user!.id,
        symbol,
        direction,
        amount,
        mode,
        entryPrice
      );

      return reply.send({
        success: true,
        message: `Prediction for ${symbol} placed successfully. Settlements happen at 15:00 EAT.`,
        data: result
      });
    } catch (err: any) {
      logger.error(err, 'NSE prediction route error');
      return reply.code(400).send({ success: false, error: err.message });
    }
  });
};
