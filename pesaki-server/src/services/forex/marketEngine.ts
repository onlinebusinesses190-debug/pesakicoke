import { useEffect, useState, useRef, useCallback } from "react";

// ─── CONFIGURATION ───
export type TF = "M1" | "M5" | "M15" | "M30" | "H1" | "H4" | "D1";

export const TIMEFRAMES: Record<TF, number> = {
  M1: 60,
  M5: 300,
  M15: 900,
  M30: 1800,
  H1: 3600,
  H4: 14400,
  D1: 86400,
};

export const SYMBOLS = [
  { symbol: "EURUSD", desc: "Euro vs US Dollar", digits: 5, pipSize: 0.0001, base: 1.0850 },
  { symbol: "GBPUSD", desc: "Great Britain Pound vs US Dollar", digits: 5, pipSize: 0.0001, base: 1.2650 },
  { symbol: "USDJPY", desc: "US Dollar vs Japanese Yen", digits: 3, pipSize: 0.01, base: 150.50 },
  { symbol: "XAUUSD", desc: "Gold vs US Dollar", digits: 2, pipSize: 0.1, base: 2050.00 },
];

export interface Candle {
  t: number;
  o: number;
  h: number;
  l: number;
  c: number;
}

export interface Quote {
  bid: number;
  ask: number;
}

export interface Position {
  ticket: number;
  symbol: string;
  side: "buy" | "sell";
  lots: number;
  openPrice: number;
  sl?: number;
  tp?: number;
}

export function useEngine() {
  // State for the React components to consume
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [candles, setCandles] = useState<Record<string, Record<TF, Candle[]>>>({});
  const [positions, setPositions] = useState<Position[]>([]);
  
  const [balance, setBalance] = useState(10000);
  const [equity, setEquity] = useState(10000);
  const [margin, setMargin] = useState(0);
  const [freeMargin, setFreeMargin] = useState(10000);

  // Refs to hold data inside the animation loop without triggering React re-renders
  const quotesRef = useRef<Record<string, Quote>>({});
  const candlesRef = useRef<Record<string, Record<TF, Candle[]>>>({});
  const positionsRef = useRef<Position[]>([]);
  
  // Initialize historical data once
  const initialized = useRef(false);

  const initEngine = useCallback(() => {
    if (initialized.current) return;
    
    const initialQuotes: Record<string, Quote> = {};
    const initialCandles: Record<string, Record<TF, Candle[]>> = {};

    SYMBOLS.forEach((s) => {
      const spread = s.pipSize * 1.2;
      initialQuotes[s.symbol] = { bid: s.base, ask: s.base + spread };
      
      initialCandles[s.symbol] = {} as Record<TF, Candle[]>;
      (Object.keys(TIMEFRAMES) as TF[]).forEach((tf) => {
        initialCandles[s.symbol][tf] = [];
        let currentPrice = s.base;
        const now = Math.floor(Date.now() / 1000);
        const tfSec = TIMEFRAMES[tf];
        const start = now - (50 * tfSec); // 50 historical candles

        for (let i = 0; i < 50; i++) {
          const volatility = s.pipSize * 20;
          const move = (Math.random() - 0.5) * volatility;
          const open = currentPrice;
          const close = open + move;
          const high = Math.max(open, close) + (Math.random() * volatility * 0.5);
          const low = Math.min(open, close) - (Math.random() * volatility * 0.5);
          
          initialCandles[s.symbol][tf].push({
            t: start + (i * tfSec),
            o: open,
            h: high,
            l: low,
            c: close,
          });
          currentPrice = close;
        }
        // Set the live quote to the last candle's close
        initialQuotes[s.symbol] = { 
          bid: currentPrice, 
          ask: currentPrice + (s.pipSize * 1.2) 
        };
      });
    });

    quotesRef.current = initialQuotes;
    candlesRef.current = initialCandles;
    setQuotes(initialQuotes);
    setCandles(initialCandles);
    initialized.current = true;
  }, []);

  // ─── THE ENGINE HEARTBEAT (No more freezing) ───
  useEffect(() => {
    initEngine();

    let animationFrameId: number;
    let lastTickTime = Date.now();
    const TICK_RATE = 200; // Generate a new tick every 200ms (5 times a second)

    const tick = () => {
      const now = Date.now();
      const timeDelta = now - lastTickTime;

      // Only process the tick if 200ms have passed
      if (timeDelta >= TICK_RATE) {
        lastTickTime = now;
        let quotesChanged = false;
        const newQuotes = { ...quotesRef.current };
        const newCandles = { ...candlesRef.current };

        SYMBOLS.forEach((s) => {
          const q = newQuotes[s.symbol];
          if (!q) return;

          const mid = (q.bid + q.ask) / 2;
          
          // 1. HOUSE RISK MANAGEMENT (B-Book Bias)
          let houseBias = 0;
          const openPositions = positionsRef.current.filter(p => p.symbol === s.symbol);
          
          if (openPositions.length > 0) {
            let buyLots = 0;
            let sellLots = 0;
            openPositions.forEach(p => {
              if (p.side === "buy") buyLots += p.lots;
              if (p.side === "sell") sellLots += p.lots;
            });
            const netExposure = buyLots - sellLots;
            
            // If users are buying, push price down. If selling, push up.
            if (netExposure !== 0) {
              houseBias = -netExposure * 0.000002; // Adjust this multiplier to protect the house more/less
            }
          }

          // 2. RANDOM MARKET MOVEMENT (Smooth)
          const volatility = s.pipSize * 1.5;
          const randomMove = (Math.random() - 0.5) * volatility;
          
          // 3. COMBINE AND CLAMP (Prevents Spikes)
          let proposedMid = mid + randomMove + houseBias;
          
          // HARD SPIKE FILTER: Max jump of 1.5 pips per tick
          const maxJump = s.pipSize * 1.5;
          if (Math.abs(proposedMid - mid) > maxJump) {
            proposedMid = mid + Math.sign(proposedMid - mid) * maxJump;
          }

          // 4. UPDATE QUOTE
          const newSpread = s.pipSize * (1.0 + Math.random() * 0.5); // Dynamic spread
          newQuotes[s.symbol] = {
            bid: proposedMid,
            ask: proposedMid + newSpread,
          };

          // 5. UPDATE CANDLES
          (Object.keys(TIMEFRAMES) as TF[]).forEach((tf) => {
            const tfSec = TIMEFRAMES[tf];
            const bucket = Math.floor((now / 1000) / tfSec) * tfSec;
            const series = newCandles[s.symbol][tf];
            const last = series[series.length - 1];

            if (last && last.t === bucket) {
              // Update live candle
              last.c = proposedMid;
              last.h = Math.max(last.h, proposedMid);
              last.l = Math.min(last.l, proposedMid);
            } else {
              // Create new candle
              series.push({
                t: bucket,
                o: proposedMid,
                h: proposedMid,
                l: proposedMid,
                c: proposedMid,
              });
              // Keep memory bounded
              if (series.length > 100) series.shift();
            }
          });
        });

        quotesRef.current = newQuotes;
        candlesRef.current = newCandles;
        
        // Trigger React re-render
        setQuotes(newQuotes);
        setCandles({ ...newCandles });
      }

      // Request next frame (guarantees no 10s freeze)
      animationFrameId = requestAnimationFrame(tick);
    };

    animationFrameId = requestAnimationFrame(tick);

    return () => cancelAnimationFrame(animationFrameId);
  }, [initEngine]);


  // ─── ACCOUNT METRICS (Margin / Equity) ───
  useEffect(() => {
    let currentMargin = 0;
    let currentProfit = 0;

    positions.forEach((p) => {
      const q = quotes[p.symbol];
      if (!q) return;
      
      // Margin requirement (Example: 1 lot = 100k, leverage 1:100 -> $1000 margin per lot)
      // Adjust this formula based on your exact lot definition
      currentMargin += p.lots * 1000; 

      // Unrealized P&L
      const spec = SYMBOLS.find(s => s.symbol === p.symbol);
      if (spec) {
        const diff = p.side === "buy" ? (q.bid - p.openPrice) : (p.openPrice - q.ask);
        currentProfit += (diff / spec.pipSize) * p.lots * 10; // $10 per pip per lot
      }
    });

    setMargin(currentMargin);
    setEquity(balance + currentProfit);
    setFreeMargin(balance + currentProfit - currentMargin);
  }, [positions, quotes, balance]);


  // ─── HELPER FUNCTIONS ───
  const spec = (symbol: string) => {
    return SYMBOLS.find((s) => s.symbol === symbol) || SYMBOLS[0];
  };

  const profitOf = (pos: Position) => {
    const q = quotes[pos.symbol];
    const s = spec(pos.symbol);
    if (!q) return 0;
    const diff = pos.side === "buy" ? (q.bid - pos.openPrice) : (pos.openPrice - q.ask);
    return (diff / s.pipSize) * pos.lots * 10;
  };

  const placeOrder = (order: { symbol: string; type: "buy" | "sell"; lots: number; sl?: number; tp?: number }) => {
    const q = quotes[order.symbol];
    if (!q) return;
    const openPrice = order.type === "buy" ? q.ask : q.bid;
    
    const newPos: Position = {
      ticket: Math.floor(Math.random() * 1000000),
      symbol: order.symbol,
      side: order.type,
      lots: order.lots,
      openPrice: openPrice,
      sl: order.sl,
      tp: order.tp,
    };

    setPositions((prev) => {
      const updated = [...prev, newPos];
      positionsRef.current = updated;
      return updated;
    });
  };

  const closePosition = (ticket: number, _reason: string, closeLots: number) => {
    setPositions((prev) => {
      const pos = prev.find((p) => p.ticket === ticket);
      if (pos) {
        const pnl = profitOf(pos);
        setBalance((b) => b + pnl);
      }
      const updated = prev.filter((p) => p.ticket !== ticket);
      positionsRef.current = updated;
      return updated;
    });
  };

  return {
    quotes,
    candles,
    positions,
    balance,
    equity,
    margin,
    freeMargin,
    spec,
    profitOf,
    placeOrder,
    closePosition,
    mode: "demo", // You can adapt this later
    setMode: () => {},
  };
}
