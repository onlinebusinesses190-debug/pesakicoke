import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { TradingChart } from "@/components/fx/TradingChart";
import { Activity, RefreshCw, Timer, ArrowLeft, PlusCircle } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";

// ─── Constants ──────────────────────────────────────────────────────────────
const DURATIONS = [
  { label: "3s", value: 3, unit: "seconds" },
  { label: "5s", value: 5, unit: "seconds" },
  { label: "10s", value: 10, unit: "seconds" },
  { label: "1m", value: 1, unit: "minutes" },
  { label: "5m", value: 5, unit: "minutes" },
  { label: "30m", value: 30, unit: "minutes" },
];

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// ─── Simulation Engine ──────────────────────────────────────────────────────
// Generates realistic candlesticks using Geometric Brownian Motion
const generateInitialData = (count: number, basePrice: number) => {
  let price = basePrice;
  const data = [];
  const now = Math.floor(Date.now() / 1000) - count;
  const drift = 0.00005;  // tiny upward drift
  const volatility = 0.002; // 0.2% per step

  for (let i = 0; i < count; i++) {
    const time = now + i;
    const change = (drift + (Math.random() - 0.5) * volatility) * price;
    const open = price;
    const close = price + change;
    const high = Math.max(open, close) + Math.random() * (price * 0.0005);
    const low = Math.min(open, close) - Math.random() * (price * 0.0005);
    data.push({ time, open, high, low, close });
    price = close;
  }
  return data;
};

const generateNextCandle = (lastPrice: number, time: number) => {
  const drift = 0.00005;
  const volatility = 0.002;
  const change = (drift + (Math.random() - 0.5) * volatility) * lastPrice;
  const open = lastPrice;
  const close = lastPrice + change;
  const high = Math.max(open, close) + Math.random() * (lastPrice * 0.0005);
  const low = Math.min(open, close) - Math.random() * (lastPrice * 0.0005);
  return { time, open, high, low, close };
};

// ─── Route ──────────────────────────────────────────────────────────────────
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

  // ── Chart state ────────────────────────────────────────────────────────────
  const [data, setData] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [pair, setPair] = useState("USD/KES");
  const [loading, setLoading] = useState(true);

  // ── Trade state ────────────────────────────────────────────────────────────
  const [stake, setStake] = useState<number>(10);
  const [selectedDuration, setSelectedDuration] = useState<typeof DURATIONS[0]>(DURATIONS[0]);
  const [tradeActive, setTradeActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [tradeDirection, setTradeDirection] = useState<"UP" | "DOWN" | null>(null);
  const [entryPrice, setEntryPrice] = useState<number | null>(null);
  const [exitPrice, setExitPrice] = useState<number | null>(null);
  const [tradeResult, setTradeResult] = useState<"won" | "lost" | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [openPositions, setOpenPositions] = useState<any[]>([]);

  // ── Balance state ──────────────────────────────────────────────────────────
  const [balance, setBalance] = useState<number | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState(false);

  // ── Chart markers ─────────────────────────────────────────────────────────
  const [markers, setMarkers] = useState<any[]>([]);

  // ── Refs ──────────────────────────────────────────────────────────────────
  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeIdRef = useRef<string | null>(null);
  const tradeActiveRef = useRef(false);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // ── Derived prices ─────────────────────────────────────────────────────────
  const spread = currentPrice && currentPrice > 50 ? 0.1 : 0.0002;
  const ask = currentPrice ? currentPrice + spread / 2 : 0;
  const bid = currentPrice ? currentPrice - spread / 2 : 0;

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) navigate({ to: "/auth" });
    };
    checkAuth();
  }, [navigate]);

  // ── Fetch balance ──────────────────────────────────────────────────────────
  const fetchBalance = useCallback(async () => {
    try {
      setUpdatingBalance(true);
      const data = await apiRequest("/wallet/balance");
      setBalance(data.balance || 0);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
      setBalance(0);
    } finally {
      setUpdatingBalance(false);
    }
  }, []);

  useEffect(() => { fetchBalance(); }, [fetchBalance]);

  // ── Fetch open positions ──────────────────────────────────────────────────
  const fetchOpenPositions = useCallback(async () => {
    try {
      const res = await apiRequest("/games/prediction/pending");
      if (res.success && res.data) setOpenPositions(res.data);
    } catch (err) {
      console.error("Failed to fetch positions", err);
    }
  }, []);

  // ── Initial chart data and tick engine ──────────────────────────────────
  useEffect(() => {
    // Get initial price from API or fallback
    const init = async () => {
      try {
        const result = await apiRequest(`/market/price?pair=${pair}`);
        const price = result.price;
        setCurrentPrice(price);
        const initial = generateInitialData(50, price);
        setData(initial);
        setLoading(false);
      } catch (err) {
        const fallbackPrice = 150.0;
        setCurrentPrice(fallbackPrice);
        const initial = generateInitialData(50, fallbackPrice);
        setData(initial);
        setLoading(false);
      }
    };
    init();
    fetchOpenPositions();

    // ── Start tick engine (new candle every second) ──────────────────────
    tickIntervalRef.current = setInterval(() => {
      setData((prev) => {
        if (prev.length === 0) return prev;
        const last = prev[prev.length - 1];
        const newTime = last.time + 1;
        const newCandle = generateNextCandle(last.close, newTime);
        setCurrentPrice(newCandle.close);
        return [...prev.slice(1), newCandle];
      });
    }, 1000);

    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [pair, fetchOpenPositions]);

  // ── Timer logic ──────────────────────────────────────────────────────────
  const startTimer = (durationInSeconds: number) => {
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
    if (!tradeActiveRef.current) return;
    tradeActiveRef.current = false;

    const exit = currentPrice || 0;
    setExitPrice(exit);

    if (entryPrice !== null && tradeDirection) {
      const diff = tradeDirection === "UP" ? exit - entryPrice : entryPrice - exit;
      const won = diff > 0;
      setTradeResult(won ? "won" : "lost");

      // Remove marker
      setMarkers([]);

      setTimeout(() => {
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

  // ── Handle Buy/Sell ──────────────────────────────────────────────────────
  const handleTrade = async (direction: "buy" | "sell") => {
    if (!currentPrice || tradeActive) return;
    if (stake < 10) {
      setTradeError("Minimum stake is KES 10");
      return;
    }

    setTradeError(null);
    setTradeActive(true);
    const dir = direction === "buy" ? "UP" : "DOWN";
    setTradeDirection(dir);
    setEntryPrice(currentPrice);
    setExitPrice(null);
    setTradeResult(null);

    // ── Add marker to chart ──────────────────────────────────────────────
    const markerColor = direction === "buy" ? "#26a69a" : "#ef5350";
    const markerShape = direction === "buy" ? "arrowUp" : "arrowDown";
    const newMarker = {
      time: Math.floor(Date.now() / 1000),
      position: "aboveBar",
      color: markerColor,
      shape: markerShape,
      text: direction === "buy" ? "BUY ▲" : "SELL ▼",
    };
    setMarkers([newMarker]);

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
          direction: dir,
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
        setMarkers([]);
      }
    } catch (err: any) {
      setTradeError(err.message || "An error occurred");
      setTradeActive(false);
      setMarkers([]);
    }
  };

  // ── Close trade manually ─────────────────────────────────────────────────
  const handleCloseTrade = async (predictionId: string) => {
    if (tradeActiveRef.current) return;
    try {
      const res = await apiRequest("/games/prediction/close", {
        method: "POST",
        body: JSON.stringify({ predictionId }),
      });
      if (res.success) {
        fetchOpenPositions();
        fetchBalance();
        setMarkers([]);
      } else {
        alert(res.error || "Failed to close trade");
      }
    } catch (err: any) {
      alert(err.message || "An error occurred closing the trade");
    }
  };

  // ── Cleanup intervals ────────────────────────────────────────────────────
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, []);

  // ── UI helpers ────────────────────────────────────────────────────────────
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

  const setMode = (newMode: "demo" | "real") => {
    navigate({ search: (prev: any) => ({ ...prev, mode: newMode }) });
  };

  const isDemo = mode === "demo";
  const currentBalance = isDemo ? 10000 : balance;

  // ── Render ──────────────────────────────────────────────────────────────────
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
          <button onClick={() => { setLoading(true); fetchPrice(true); }} className="p-1 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground" title="Refresh">
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
            <TradingChart data={data} markers={markers} colors={{ backgroundColor: "#151924" }} />
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
                      : "bg-[#1
