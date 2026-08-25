export interface MarketPrediction {
  id: string;
  user_id: string;
  market_symbol: string;
  direction: 'UP' | 'DOWN';
  entry_price: number;
  bet_amount: number;
  mode: 'real' | 'demo';
  status: 'pending' | 'settled';
  window_close_at: string;
}

export interface CachedMarketPrice {
  symbol: string;
  price: number;
  timestamp: string;
}
