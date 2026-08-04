import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { TradingChart } from "@/components/fx/TradingChart";
import { Activity, RefreshCw, Timer, ArrowLeft, PlusCircle } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";

// --- Constants ---
const DURATIONS = [
  { label: "3s", value: 3, unit: "seconds" },
  { label: "5s", value: 5, unit: "seconds" },
  { label: "10s", value: 10, unit: "seconds" },
  { label: "1m", value: 1, unit: "minutes" },
  { label: "5m", value: 5, unit: "minutes" },
  { label: "30m", value: 30, unit: "minutes" },
];

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// Helper to generate initial chart data
const generateData = (count: number, basePrice: number) => {
  let price = basePrice;
  const data = [];
  const now = Math.floor(Date.now() / 1000);
  for (let i = 0; i < count; i++) {
    const time = now - (count - i) * 1;
    const open = price;
    const close = price + (Math.random() - 0.5) * (basePrice * 0.0001);
    const high = Math.max(open, close) + Math.random() * (basePrice * 0.00005);
    const low = Math.min(open, close) - Math.random() * (basePrice * 0.00005);
    data.push({ time, open, high, low, close });
    price = close;
  }
  return data;
};

export const Route = createFileRoute("/trading/fx")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: TradingPage,
});

function TradingPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode = search.mode === "real" ? "real" : "demo";

  const [data, setData] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [pair, setPair] = useState("USD/KES");
  const [loading, setLoading] = useState(false);
  const targetPriceRef = useRef<number | null>(null);

  const [stake, setStake] = useState<number>(10);
  const [selectedDuration, setSelectedDuration] = useState<{ label: string; value: number; unit: string }>(
    DURATIONS[0]
  );
  const [tradeActive, setTradeActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [tradeDirection, setTradeDirection] = useState<"UP" | "DOWN" | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [exitPrice, setExitPrice] = useState<number | null>(null);
  const [tradeResult, setTradeResult] = useState<"won" | "lost" | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [openPositions, setOpenPositions] = useState<any[]>([]);

  const [balance, setBalance] = useState<number | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState(false);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeIdRef = useRef<string | null>(null);
  const tradeActiveRef = useRef(false);
  const isMountedRef = useRef(true);

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
      }
    };
    checkAuth();
  }, [navigate]);

  // ── Fetch balance ──────────────────────────────────────────────────────────
  const fetchBalance = async () => {
    if (!isMountedRef.current) return;
    try {
      setUpdatingBalance(true);
      const data = await apiRequest("/wallet/balance");
      if (isMountedRef.current) setBalance(data.balance || 0);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
      if (isMountedRef.current) setBalance(0);
    } finally {
      if (isMountedRef.current) setUpdatingBalance(false);
    }
  };

  useEffect(() => {
    fetchBalance();
    return () => { isMountedRef.current = false; };
  }, []);

  // ── API calls for price and positions ──────────────────────────────────────
  const fetchPrice = useCallback(async (isInitial = false) => {
    if (!isMountedRef.current) return;
    try {
      if (isInitial) setLoading(true);
      const result = await apiRequest(`/market/price?pair=${pair}`);
      targetPriceRef.current = result.price;

      if (isInitial) {
        setCurrentPrice(result.price);
        const initialHistory = generateData(10, result.price);
        setData(initialHistory);
      }
    } catch (err) {
      console.error("Fetch error:", err);
      const fallbackPrice = pair === "USD/KES" ? 150.0 : 1.0;
      targetPriceRef.current = fallbackPrice;
      if (isInitial && isMountedRef.current) {
        setCurrentPrice(fallbackPrice);
        const initialHistory = generateData(10, fallbackPrice);
        setData(initialHistory);
      }
    } finally {
      if (isInitial && isMountedRef.current) setLoading(false);
    }
  }, [pair]);

  const fetchOpenPositions = useCallback(async () => {
    if (!isMountedRef.current) return;
    try {
      const res = await apiRequest("/games/prediction/pending");
      if (res.success && res.data && isMountedRef.current) {
        setOpenPositions(res.data);
      }
    } catch (err) {
      console.error("Failed to fetch positions", err);
    }
  }, []);

  // ── Initial fetch and intervals ────────────────────────────────────────────
  useEffect(() => {
    fetchPrice(true);
    fetchOpenPositions();

    const priceInterval = setInterval(() => fetchPrice(false), 5000);
    const posInterval = setInterval(() => fetchOpenPositions(), 5000);

    return () => {
      clearInterval(priceInterval);
      clearInterval(posInterval);
    };
  }, [fetchPrice, fetchOpenPositions]);

  // ── Tick simulation ──────────────────────────────────────────────────────
  useEffect(() => {
    const tickInterval = setInterval(() => {
      if (!isMountedRef.current) return;
      setData((prev) => {
        if (prev.length === 0 || !targetPriceRef.current) return prev;

        const last = prev[prev.length - 1];
        const target = targetPriceRef.current;

        const maxVol = target * 0.00015;
        const noise = (Math.random() - 0.5) * maxVol * 2;
        const pull = (target - last.close) * 0.15;
        let delta = noise + pull;
        const maxDelta = target * 0.0005;
        if (delta > maxDelta) delta = maxDelta;
        if (delta < -maxDelta) delta = -maxDelta;

        const nextPrice = last.close + delta;
        const open = last.close;
        const close = nextPrice;
        const high = Math.max(open, close) + Math.random() * (maxVol * 0.5);
        const low = Math.min(open, close) - Math.random() * (maxVol * 0.5);

        if (isMountedRef.current) setCurrentPrice(close);

        const newCandle = {
          time: (last.time as number) + 1,
          open,
          high,
          low,
          close,
        };

        return [...prev.slice(1), newCandle];
      });
    }, 1000);

    return () => clearInterval(tickInterval);
  }, []);

  // ── Timer and trade logic ──────────────────────────────────────────────────
  const startTimer = (durationInSeconds: number) => {
    if (!isMountedRef.current) return;
    setTimeRemaining(durationInSeconds);
    tradeActiveRef.current = true;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          if (tradeActiveRef.current && tradeIdRef.current) {
            closeTradeAutomatically(tradeIdRef.current);
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
  };

  const closeTradeAutomatically = async (tradeId: string) => {
    if (!tradeActiveRef.current || !isMountedRef.current) return;
    tradeActiveRef.current = false;

    const exit = currentPrice || 0;
    if (isMountedRef.current) setExitPrice(exit);

    if (entryPrice !== null && tradeDirection) {
      const diff = tradeDirection === "UP" ? exit - entryPrice : entryPrice - exit;
      const won = diff > 0;

      if (isMountedRef.current) setTradeResult(won ? "won" : "lost");

      setTimeout(() => {
        if (!isMountedRef.current) return;
        setTradeResult(null);
        setEntryPrice(null);
        setExitPrice(null);
        setTradeDirection(null);
        setTimeRemaining(null);
        tradeIdRef.current = null;
      }, 3000);

      if (won) {
        console.log(`🎉 Won! +${stake * 0.2} KES`);
        fetchBalance();
      } else {
        console.log(`💀 Lost! -${stake} KES`);
        fetchBalance();
      }
    }

    setTradeActive(false);
  };

  const handleTrade = async (direction: "buy" | "sell") => {
    if (!currentPrice || tradeActive || !isMountedRef.current) return;
    if (stake < 10) {
      setTradeError("Minimum stake is KES 10");
      return;
    }

    setTradeError(null);
    setTradeActive(true);
    setTradeDirection(direction === "buy" ? "UP" : "DOWN");
    setEntryPrice(currentPrice);
    setExitPrice(null);
    setTradeResult(null);

    let durationSeconds = selectedDuration.value;
    if (selectedDuration.unit === "minutes") {
      durationSeconds = selectedDuration.value * 60;
    }

    try {
      const res = await apiRequest("/games/prediction/place", {
        method: "POST",
        body: JSON.stringify({
          amount: stake,
          mode,
          market: pair,
          direction: direction === "buy" ? "UP" : "DOWN",
          windowMinutes: selectedDuration.unit === "minutes" ? selectedDuration.value : 0,
          windowSeconds: selectedDuration.unit === "seconds" ? selectedDuration.value : 0,
        }),
      });

      if (res.success) {
        tradeIdRef.current = res.data?.id || `trade_${Date.now()}`;
        startTimer(durationSeconds);
        fetchOpenPositions();
        fetchBalance();
      } else {
        setTradeError(res.error || "Failed to place trade");
        setTradeActive(false);
      }
    } catch (err: any) {
      setTradeError(err.message || "An error occurred");
      setTradeActive(false);
    }
  };

  const handleCloseTrade = async (predictionId: string) => {
    if (tradeActiveRef.current || !isMountedRef.current) return;
    try {
      const res = await apiRequest("/games/prediction/close", {
        method: "POST",
        body: JSON.stringify({ predictionId }),
      });
      if (res.success) {
        fetchOpenPositions();
        fetchBalance();
      } else {
        alert(res.error || "Failed to close trade");
      }
    } catch (err: any) {
      alert(err.message || "An error occurred closing the trade");
    }
  };

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = seconds % 60;
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const renderResultBadge = () => {
    if (tradeResult === "won") {
      return (
        <div className="bg-emerald-500/20 text-emerald-500 border border-emerald-500/30 px-4 py-2 rounded-lg text-sm font-bold animate-pulse">
          🎉 WON! +{stake * 0.2} KES
        </div>
      );
    }
    if (tradeResult === "lost") {
      return (
        <div className="bg-red-500/20 text-red-500 border border-red-500/30 px-4 py-2 rounded-lg text-sm font-bold animate-pulse">
          💀 LOST! -{stake} KES
        </div>
      );
    }
    return null;
  };

  // ── Toggle mode ────────────────────────────────────────────────────────────
  const setMode = (newMode: "demo" | "real") => {
    navigate({
      search: (prev: any) => ({ ...prev, mode: newMode }),
    });
  };

  const isDemo = mode === "demo";
  const currentBalance = isDemo ? 10000 : balance;

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20 lg:pb-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link to="/trading" className="text-gray-400 hover:text-white transition-colors" title="Back to Trading Hub">
            <ArrowLeft size={24} />
          </Link>
          <h1 className="text-xl md:text-2xl font-bold text-white flex items-center gap-2">
            <Activity className="text-primary w-5 h-5" /> Binary FX
          </h1>
          <div className="flex items-center gap-0.5 bg-[#181d29] p-0.5 rounded-lg text-[10px] md:text-xs font-medium ml-1">
            <button
              onClick={() => setMode("demo")}
              className={`px-2 py-0.5 md:px-3 md:py-1 rounded-md transition-all ${isDemo ? "bg-[#dcb13c] text-black" : "text-gray-400 hover:text-white hover:bg-[#202636]"}`}
            >
              Demo
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-2 py-0.5 md:px-3 md:py-1 rounded-md transition-all ${!isDemo ? "bg-[#dcb13c] text-black" : "text-gray-400 hover:text-white hover:bg-[#202636]"}`}
            >
              Real
            </button>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex items-center gap-1 bg-[#181d29] px-2 py-1 rounded-lg text-xs">
            <span className="text-gray-500">{isDemo ? "Demo" : "Bal"}:</span>
            <span className="font-bold text-white">{currentBalance !== null ? currentBalance.toFixed(2) : "0.00"} KES</span>
            {updatingBalance && <span className="text-gray-400 text-[8px] animate-pulse">⋯</span>}
          </div>
          {!isDemo && (
            <Link to="/wallet" className="flex items-center gap-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-lg transition-colors">
              <PlusCircle size={14} className="h-3 w-3 md:h-4 md:w-4" /> Deposit
            </Link>
          )}
          <span className="text-[8px] md:text-[10px] text-gray-400 hidden sm:inline">{isDemo ? "🎮 FUN" : "🔴 REAL"}</span>
          <button onClick={() => fetchPrice(true)} className="p-1 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground" title="Refresh">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </button>
          <div className="flex items-center gap-1.5 px-2 py-0.5 bg-emerald-500/10 text-emerald-500 rounded border border-emerald-500/20 text-[10px] font-semibold tracking-wide">
            <span className="relative flex h-1.5 w-1.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
            </span>
            Live
          </div>
        </div>
      </div>

      {/* Pair selector */}
      <div className="flex items-center gap-2">
        <select
          value={pair}
          onChange={(e) => setPair(e.target.value)}
          className="bg-transparent border-none text-sm text-muted-foreground focus:ring-0 p-0 cursor-pointer"
        >
          <option value="EUR/USD">EUR/USD</option>
          <option value="GBP/USD">GBP/USD</option>
          <option value="USD/JPY">USD/JPY</option>
          <option value="USD/KES">USD/KES</option>
          <option value="EUR/KES">EUR/KES</option>
          <option value="GBP/KES">GBP/KES</option>
          <option value="XAU/USD">XAU/USD</option>
        </select>
        <span className="text-muted-foreground text-sm">•</span>
        <span className={`text-xs font-mono font-bold ${currentPrice ? "text-emerald-400" : "text-zinc-500"}`}>
          {currentPrice ? currentPrice.toFixed(currentPrice > 50 ? 2 : 4) : "Loading..."}
        </span>
      </div>

      <div className="flex flex-col lg:flex-row gap-6">
        {/* Chart */}
        <div className="flex-1 bg-[#151924] border border-[#2b313f] rounded-xl overflow-hidden p-2 lg:p-4 min-h-[200px] lg:min-h-[320px] relative">
          {loading && !currentPrice ? (
            <div className="w-full h-full flex items-center justify-center">
              <Activity className="animate-pulse text-primary" size={32} />
            </div>
          ) : (
            <TradingChart data={data} colors={{ backgroundColor: "#151924" }} />
          )}

          {tradeActive && timeRemaining !== null && timeRemaining > 0 && (
            <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm border border-[#dcb13c]/30 rounded-lg px-4 py-2 flex items-center gap-2">
              <Timer className="h-4 w-4 text-[#dcb13c]" />
              <span className="text-white font-mono text-sm font-bold">{formatTime(timeRemaining)}</span>
            </div>
          )}

          {tradeResult && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
              {renderResultBadge()}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="w-full lg:w-[380px] shrink-0 bg-[#0b0e14] border border-[#1e2330] rounded-xl p-4 flex flex-col gap-4">
          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">Stake (KES)</label>
            <input
              type="number"
              min="10"
              step="1"
              value={stake}
              onChange={(e) => setStake(Math.max(10, Number(e.target.value) || 10))}
              disabled={tradeActive}
              className="w-full bg-[#181d29] border border-[#2b313f] rounded-lg px-4 py-3 text-white text-sm font-medium focus:outline-none focus:border-[#dcb13c] disabled:opacity-50"
            />
            <div className="flex gap-2">
              {[10, 50, 100, 500, 1000].map((v) => (
                <button
                  key={v}
                  onClick={() => setStake(v)}
                  disabled={tradeActive}
                  className="px-3 py-1 bg-[#181d29] hover:bg-[#202636] text-gray-400 text-xs rounded transition-colors disabled:opacity-50"
                >
                  {v}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">Duration</label>
            <div className="grid grid-cols-3 gap-2">
              {DURATIONS.map((d) => (
                <button
                  key={d.label}
                  onClick={() => setSelectedDuration(d)}
                  disabled={tradeActive}
                  className={`py-2 rounded-lg text-sm font-medium transition-colors ${
                    selectedDuration.label === d.label
                      ? "bg-[#dcb13c] text-black"
                      : "bg-[#181d29] text-gray-400 hover:bg-[#202636]"
                  } disabled:opacity-50`}
                >
                  {d.label}
                </button>
              ))}
            </div>
          </div>

          <div className="flex justify-between items-center text-sm font-mono px-2">
            <div className="text-gray-400">Ask: <span className="text-gray-200">{ask.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span></div>
            <div className="text-gray-500 text-xs">Spread: {spread.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</div>
            <div className="text-gray-400">Bid: <span className="text-gray-200">{bid.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span></div>
          </div>

          {entryPrice !== null && (
            <div className="flex justify-between text-xs text-gray-500 px-2">
              <span>Entry: <span className="text-white font-mono">{entryPrice.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span></span>
              {exitPrice !== null && (
                <span>Exit: <span className="text-white font-mono">{exitPrice.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span></span>
              )}
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => handleTrade("buy")}
              disabled={loading || !currentPrice || tradeActive}
              className="flex-1 py-4 bg-[#236e40] hover:bg-[#28814a] text-white font-bold rounded-lg flex flex-col items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="uppercase tracking-wider text-sm mb-1">Buy</span>
              <span className="font-mono opacity-80 font-normal">{ask.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span>
            </button>
            <button
              onClick={() => handleTrade("sell")}
              disabled={loading || !currentPrice || tradeActive}
              className="flex-1 py-4 bg-[#6e2525] hover:bg-[#852c2c] text-white font-bold rounded-lg flex flex-col items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="uppercase tracking-wider text-sm mb-1">Sell</span>
              <span className="font-mono opacity-80 font-normal">{bid.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}</span>
            </button>
          </div>

          {tradeError && <div className="text-center text-red-500 text-sm font-medium">{tradeError}</div>}

          <div className="text-center text-xs text-gray-500">Mode: <span className="text-gray-300 font-medium capitalize">{mode}</span></div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-[#0b0e14] border border-[#1e2330] rounded-xl p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">Open Positions ({openPositions.length})</h2>
        <div className="flex flex-col gap-2">
          {openPositions.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No open positions.</p>
          ) : (
            openPositions.map((pos) => {
              const isBuy = pos.direction === "up" || pos.direction === "UP";
              let profitMock = 0;
              if (pos.market === pair && currentPrice) {
                const diff = isBuy ? currentPrice - pos.entry_price : pos.entry_price - currentPrice;
                if (diff > 0) profitMock = pos.amount * 0.2;
                else if (diff < 0) profitMock = -pos.amount;
              }
              const profitColor = profitMock >= 0 ? "text-emerald-500" : "text-red-500";
              return (
                <div key={pos.id} className="flex items-center justify-between p-3 bg-[#131720] rounded-lg border border-[#1e2330]">
                  <div className="flex items-center gap-3">
                    <div className={`text-[10px] font-bold px-2 py-0.5 rounded ${isBuy ? "bg-[#236e40] text-emerald-100" : "bg-[#6e2525] text-red-100"} uppercase`}>
                      {isBuy ? "Buy" : "Sell"}
                    </div>
                    <div className="font-semibold text-sm text-gray-200">{pos.market}</div>
                    <div className="text-xs text-gray-500">&times;{pos.amount / 10000}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`text-sm font-mono font-medium ${profitColor} w-20 text-right`}>
                      {profitMock > 0 ? "+" : ""}{profitMock.toFixed(2)} KES
                    </div>
                    <button
                      onClick={() => handleCloseTrade(pos.id)}
                      disabled={tradeActive}
                      className="text-[10px] uppercase font-bold bg-white/10 hover:bg-white/20 text-white px-3 py-1.5 rounded transition-colors disabled:opacity-50"
                    >
                      Close
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
