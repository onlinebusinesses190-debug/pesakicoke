import axios from 'axios';
import { logger } from './logger';

/**
 * Scrapes the current share price of an NSE stock from afx.kwayisi.org
 * @param symbol The NSE stock symbol (e.g., 'SCOM', 'EQTY')
 * @returns The current price as a number, or null if scraping fails
 */
export const fetchNsePrice = async (symbol: string): Promise<number | null> => {
  try {
    const slug = symbol.toLowerCase();
    const url = `https://afx.kwayisi.org/nse/${slug}.html`;
    
    const response = await axios.get(url, {
      headers: { 
        'User-Agent': 'Mozilla/5.0 (compatible; PesakiApp/1.0)',
        'Accept': 'text/html'
      },
      timeout: 10000 // 10s timeout
    });

    if (response.status !== 200) return null;

    const html = response.data;

    // Extract: "current share price of ... is KES 32.00"
    const priceMatch = html.match(/is KES ([\d,]+\.?\d*)/i);
    if (!priceMatch) {
      logger.warn({ symbol, url }, 'NSE price match failed in HTML content');
      return null;
    }

    const price = parseFloat(priceMatch[1].replace(/,/g, ''));
    return price > 0 ? price : null;
  } catch (err: any) {
    logger.error({ err: err.message, symbol }, 'Failed to fetch NSE price from afx.kwayisi.org');
    return null;
  }
};

/**
 * Checks if a market symbol is a known NSE stock
 * This list should match the frontend TOP_NSE_STOCKS
 */
const NSE_SYMBOLS = new Set([
  'SCOM', 'EQTY', 'KCB', 'COOP', 'EABL', 'ABSA', 'SCBK', 'SBIC', 
  'KEGN', 'KPLC', 'BAT', 'BAMB', 'CARB', 'CIC', 'BRIT', 'JUB', 
  'NCBA', 'DTK', 'IMH', 'NMG'
]);

export const isNseSymbol = (symbol: string): boolean => {
  return NSE_SYMBOLS.has(symbol.toUpperCase());
};
