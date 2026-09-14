import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { TradingChart, type FxMarker } from "@/components/fx/TradingChart";
import {
  Activity,
  RefreshCw,
  Timer,
  ArrowLeft,
  PlusCircle,
  Clock,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import { apiRequest } from "@/utils/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { createClient } from "@supabase/supabase-js";
import { DepositSheet } from "@/components/DepositSheet";
import { toast } from "sonner";

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
const generateInitialData = (count: number, basePrice: number) => {
  let price = basePrice;
  const data = [];
  const now = Math.floor(Date.now() / 1000) - count;
  const drift = 0.00005;
  const volatility = 0.002;

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
  const { requireAuth, user } = useRequireAuth();
  const mode = search.mode === "real" ? "real" : "demo";

  const [data, setData] = useState<any[]>([]);
  const [currentPrice, setCurrentPrice] = useState<number | null>(null);
  const [pair, setPair] = useState("USD/KES");
  const [loading, setLoading] = useState(true);

  const [stake, setStake] = useState<number>(10);
  const [selectedDuration, setSelectedDuration] = useState<(typeof DURATIONS)[0]>(DURATIONS[0]);
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
  const [markers, setMarkers] = useState<FxMarker[]>([]);
  const [pendingMarkerPositions, setMarkerPositions] = useState<
    { id: string; x: number; y: number }[]
  >([]);
  const [showDeposit, setShowDeposit] = useState(false);

  // Per-trade stats shown in the header.
  const [todayPnl, setTodayPnl] = useState(0);
  const [activeTrades, setActiveTrades] = useState(0);
  const [winningTrades, setWinningTrades] = useState(0);

  // In-flight trade id + expiry timestamp (used for auto-resume on reload).
  const activeTradeIdRef = useRef<string | null>(null);
  const activeTradeExpiryRef = useRef<string | null>(null);
  const settleInFlightRef = useRef(false);
  const startTimerRef = useRef<(n: number) => void>(() => {});

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeIdRef = useRef<string | null>(null);
  const tradeActiveRef = useRef(false);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  // Ref to the chart wrapper so the Pocket Option marker overlay can measure
  // the chart width and extend each horizontal price line to the right edge.
  const overlayRef = useRef<HTMLDivElement | null>(null);

  const spread = currentPrice && currentPrice > 50 ? 0.1 : 0.0002;
  const ask = currentPrice ? currentPrice + spread / 2 : 0;
  const bid = currentPrice ? currentPrice - spread / 2 : 0;

  useEffect(() => {
    const checkAuth = async () => {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY,
      );
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) navigate({ to: "/auth" });
    };
    checkAuth();
  }, [navigate]);

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

  useEffect(() => {
    fetchBalance();
  }, [fetchBalance]);

  // Refresh balance after a successful deposit (used by the shared DepositSheet).
  const refreshRealBalance = () => fetchBalance();

  // ── Fetch the user's recent Binary FX trades + per-trade stats ──────────
  const fetchTrades = useCallback(async () => {
    try {
      const res = await apiRequest("/games/fx/trades?limit=200");
      if (res.success && Array.isArray(res.data)) {
        setMarkers(
          res.data.map((t: any) => {
            const entrySec = Math.floor(new Date(t.entry_time).getTime() / 1000);
            const expiresMs = new Date(t.expiry_time).getTime();
            const remaining =
              t.status === "pending" ? Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000)) : 0;
            return {
              id: t.id,
              time: entrySec,
              price: Number(t.entry_price),
              type: t.direction === "buy" ? "buy" : "sell",
              stake: Number(t.stake),
              status: t.status,
              remainingSeconds: remaining,
              expiresAt: expiresMs,
            };
          }),
        );
        const today = new Date().toDateString();
        let pnl = 0;
        let active = 0;
        let wins = 0;
        for (const t of res.data) {
          if (t.status === "pending") active++;
          else if (t.status === "won") {
            wins++;
            pnl += Number(t.payout_amount);
          } else if (t.status === "lost") pnl -= Number(t.stake);
        }
        setWinningTrades(wins);
        setActiveTrades(active);
        setTodayPnl(pnl);
      }
    } catch (err) {
      console.error("Failed to fetch fx trades:", err);
    }
  }, []);

  // Auto-resume: if a pending trade's expiry has passed, settle it now using
  // the current market price. This keeps markers correct across page reloads.
  const maybeResumePendingTrade = useCallback(async () => {
    if (settleInFlightRef.current) return;
    try {
      const res = await apiRequest("/games/fx/trades?limit=200");
      if (!res.success || !Array.isArray(res.data)) return;
      const pending = res.data.find((t: any) => t.status === "pending");
      if (!pending) return;
      const expiry = new Date(pending.expiry_time).getTime();
      if (expiry > Date.now()) {
        // Still running — restart the live countdown so the user can watch it finish.
        activeTradeIdRef.current = pending.id;
        activeTradeExpiryRef.current = pending.expiry_time;
        const remainingMs = expiry - Date.now();
        const remainingSec = Math.max(0, Math.ceil(remainingMs / 1000));
        setTradeActive(true);
        tradeActiveRef.current = true;
        setTimeRemaining(remainingSec);
        startTimerRef.current(remainingSec);
        return;
      }
      // Expired → settle with the current price.
      settleInFlightRef.current = true;
      activeTradeIdRef.current = pending.id;
      const priceRes = await apiRequest(`/market/price?pair=${pending.pair}`);
      const expiryPrice = Number(priceRes.price);
      const settleRes = await apiRequest(`/games/fx/trade/${pending.id}/settle`, {
        method: "POST",
        body: JSON.stringify({ expiryPrice }),
      });
      if (settleRes.success) {
        toast(
          settleRes.outcome === "won"
            ? `🎉 WON! +${(Number(pending.stake) * 0.5).toFixed(2)} KES`
            : `💀 LOST! -${Number(pending.stake).toFixed(2)} KES`,
        );
        setTradeResult(settleRes.outcome);
        setExitPrice(expiryPrice);
        setBalance(settleRes.newBalance ?? balance);
        // Rebuild the resumed marker from the fetched trade so the chart
        // reflects the settled outcome.
        fetchTrades();
        fetchBalance();
      }
      fetchTrades();
    } catch (err) {
      console.error("Auto-resume settle failed:", err);
    } finally {
      settleInFlightRef.current = false;
    }
  }, [fetchBalance, fetchTrades, balance]);

  const fetchOpenPositions = useCallback(async () => {
    try {
      const res = await apiRequest("/games/prediction/pending");
      if (res.success && res.data) setOpenPositions(res.data);
    } catch (err) {
      console.error("Failed to fetch positions", err);
    }
  }, []);

  const fetchPrice = useCallback(
    async (isInitial = false) => {
      try {
        if (isInitial) setLoading(true);
        const result = await apiRequest(`/market/price?pair=${pair}`);
        const price = result.price;
        setCurrentPrice(price);
        if (isInitial) {
          const initial = generateInitialData(50, price);
          setData(initial);
        }
      } catch (err) {
        console.error("Fetch error:", err);
        const fallbackPrice = 150.0;
        setCurrentPrice(fallbackPrice);
        if (isInitial) {
          const initial = generateInitialData(50, fallbackPrice);
          setData(initial);
        }
      } finally {
        if (isInitial) setLoading(false);
      }
    },
    [pair],
  );

  useEffect(() => {
    fetchPrice(true);
    fetchOpenPositions();

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

  const startTimer = (durationInSeconds: number) => {
    startTimerRef.current = startTimer;
    setTimeRemaining(durationInSeconds);
    tradeActiveRef.current = true;

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    // 100ms tick so the countdown feels live.
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0) {
          clearInterval(timerIntervalRef.current!);
          timerIntervalRef.current = null;
          if (tradeActiveRef.current && activeTradeIdRef.current) {
            settleTrade(activeTradeIdRef.current);
          }
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
  };

  // Keep the latest direction/entry-time in refs so settleTrade can update
  // the correct pending marker when the countdown hits zero.
  const directionRef = useRef<"buy" | "sell">("buy");
  const entryTimeRef = useRef<number | null>(null);
  // With multiple concurrent trades, refs only hold the latest trade, so
  // also map tradeId -> marker id to settle the right marker.
  const pendingMarkerByTradeRef = useRef<Map<string, string>>(new Map());

  // ── Settle an active trade when the countdown hits zero ────────────────
  const settleTrade = async (tradeId: string) => {
    if (!tradeActiveRef.current) return;
    tradeActiveRef.current = false;
    setTradeActive(false);

    const exit = currentPrice || entryPrice || 0;
    setExitPrice(exit);

    try {
      const res = await apiRequest(`/games/fx/trade/${tradeId}/settle`, {
        method: "POST",
        body: JSON.stringify({ expiryPrice: exit }),
      });

      if (res.success) {
        const outcome = res.outcome;
        setTradeResult(outcome);
        // Flip the pending marker for THIS trade to its final colour
        // (won=green / lost=red). With multiple concurrent trades we must
        // key off the trade id, not the latest refs.
        const markerId = pendingMarkerByTradeRef.current.get(tradeId);
        setMarkers((prev) => prev.map((m) => (m.id === markerId ? { ...m, status: outcome } : m)));
        pendingMarkerByTradeRef.current.delete(tradeId);

        if (outcome === "won") {
          toast(`🎉 WON! +${(res.payoutAmount ?? stake * 0.5).toFixed(2)} KES`, { duration: 4000 });
        } else {
          toast(`💀 LOST! -${stake.toFixed(2)} KES`, { duration: 4000 });
        }
        setBalance(res.newBalance ?? balance);
        fetchTrades();
        fetchBalance();
      } else {
        setTradeError(res.error || "Failed to settle trade");
      }
    } catch (err: any) {
      setTradeError(err.message || "Failed to settle trade");
    }
  };

  const handleTrade = async (direction: "buy" | "sell") => {
    if (!currentPrice || tradeActive) return;
    if (mode !== "demo" && !requireAuth()) return;
    if (stake < 10) {
      setTradeError("Minimum stake is KES 10");
      return;
    }
    if (mode === "real" && balance !== null && balance < stake) {
      setTradeError("Insufficient balance. Please deposit to continue.");
      setShowDeposit(true);
      return;
    }

    setTradeError(null);
    setTradeActive(true);
    setTradeResult(null);
    setExitPrice(null);

    // Entry price: Ask for BUY, Bid for SELL.
    const entryPrice = direction === "buy" ? ask : bid;
    setEntryPrice(entryPrice);

    let durationSeconds = selectedDuration.value;
    if (selectedDuration.unit === "minutes") {
      durationSeconds = selectedDuration.value * 60;
    }

    // Immediate permanent marker on the chart (pending -> pulsing until settle).
    // Accumulate so multiple trades can be open at once (Pocket Option style).
    const entryTime = Math.floor(Date.now() / 1000);
    const expiresAtMs = Date.now() + durationSeconds * 1000;
    directionRef.current = direction;
    entryTimeRef.current = entryTime;
    const pendingMarker: FxMarker = {
      id: `pending-${entryTime}-${direction}`,
      time: entryTime,
      price: entryPrice,
      type: direction,
      stake,
      status: "pending",
      remainingSeconds: durationSeconds,
      expiresAt: expiresAtMs,
    };
    setMarkers((prev) => [...prev, pendingMarker]);

    try {
      const res = await apiRequest("/games/fx/trade", {
        method: "POST",
        body: JSON.stringify({
          pair,
          direction,
          stake,
          duration: durationSeconds,
          mode,
          entryPrice,
        }),
      });

      if (res.success) {
        activeTradeIdRef.current = res.tradeId;
        activeTradeExpiryRef.current = res.expiresAt;
        pendingMarkerByTradeRef.current.set(res.tradeId, pendingMarker.id);
        setBalance(res.newBalance ?? balance);
        startTimer(durationSeconds);
        fetchTrades();
      } else {
        setTradeError(res.error || "Failed to place trade");
        setTradeActive(false);
        setMarkers((prev) => prev.filter((m) => m.id !== pendingMarker.id));
      }
    } catch (err: any) {
      const msg = err.message || "An error occurred";
      if (/insufficient/i.test(msg)) {
        setTradeError("Insufficient balance. Please deposit to continue.");
        setShowDeposit(true);
      } else {
        setTradeError(msg);
      }
      setTradeActive(false);
      setMarkers((prev) => prev.filter((m) => m.id !== pendingMarker.id));
    }
  };

  const handleCloseTrade = async (predictionId: string) => {
    if (tradeActiveRef.current) return;
    if (mode !== "demo" && !requireAuth()) return;
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

  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, []);

  // ── Live countdown tick: update remainingSeconds on every pending marker ──
  useEffect(() => {
    const hasPending = markers.some((m) => m.status === "pending");
    if (!hasPending) return;
    const id = setInterval(() => {
      setMarkers((prev) =>
        prev.map((m) => {
          if (m.status !== "pending") return m;
          const remaining = Math.max(0, Math.ceil((m.expiresAt - Date.now()) / 1000));
          return { ...m, remainingSeconds: remaining };
        }),
      );
    }, 1000);
    return () => clearInterval(id);
  }, [markers.some((m) => m.status === "pending")]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
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

  // Load persisted trades + stats, and auto-resume any pending trade.
  useEffect(() => {
    let cancelled = false;
    const init = async () => {
      await fetchTrades();
      await maybeResumePendingTrade();
      if (!cancelled) fetchBalance();
    };
    init();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-20 lg:pb-6 px-4">
      {/* Header */}
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <div className="flex items-center gap-2">
          <Link
            to="/trading"
            className="text-gray-400 hover:text-white transition-colors"
            title="Back to Trading Hub"
          >
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
            <span className="font-bold text-white">
              {currentBalance !== null ? currentBalance.toFixed(2) : "0.00"} KES
            </span>
            {updatingBalance && <span className="text-gray-400 text-[8px] animate-pulse">⋯</span>}
          </div>
          <div className="flex items-center gap-1 bg-[#181d29] px-2 py-1 rounded-lg text-xs">
            <span className={todayPnl >= 0 ? "text-emerald-400" : "text-red-400"}>
              {todayPnl >= 0 ? "+" : ""}
              {todayPnl.toFixed(2)} KES
            </span>
            <span className="text-gray-500">P&L</span>
          </div>
          <div className="flex items-center gap-1 bg-[#181d29] px-2 py-1 rounded-lg text-xs">
            <span className="text-white">{activeTrades}</span>
            <span className="text-gray-500">active</span>
          </div>
          <div className="flex items-center gap-1 bg-[#181d29] px-2 py-1 rounded-lg text-xs">
            <span className="text-emerald-400">{winningTrades}</span>
            <span className="text-gray-500">wins</span>
          </div>
          {!isDemo && (
            <button
              onClick={() => setShowDeposit(true)}
              className="flex items-center gap-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-lg transition-colors"
            >
              <PlusCircle size={14} className="h-3 w-3 md:h-4 md:w-4" /> Deposit
            </button>
          )}
          <span className="text-[8px] md:text-[10px] text-gray-400 hidden sm:inline">
            {isDemo ? "🎮 FUN" : "🔴 REAL"}
          </span>
          <button
            onClick={() => {
              setLoading(true);
              fetchPrice(true);
            }}
            className="p-1 hover:bg-white/5 rounded-lg transition-colors text-muted-foreground"
            title="Refresh"
          >
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
        <span
          className={`text-xs font-mono font-bold ${currentPrice ? "text-emerald-400" : "text-zinc-500"}`}
        >
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
            <TradingChart
              data={data}
              markers={markers}
              colors={{ backgroundColor: "#151924" }}
              onMarkerPosition={setMarkerPositions}
            />
          )}

          {/* Pocket Option–style marker overlays: triangle + stake label +
          live countdown + horizontal price line extending right */}
          <div ref={overlayRef} className="absolute inset-0 pointer-events-none">
            {pendingMarkerPositions.map((c) => {
              const m = markers.find((x) => x.id === c.id);
              if (!m) return null;
              const isBuy = m.type === "buy";
              const color =
                m.status === "won"
                  ? "#22c55e"
                  : m.status === "lost"
                    ? "#ef4444"
                    : isBuy
                      ? "#22c55e"
                      : "#ef4444";
              const chartWidth = overlayRef.current?.clientWidth ?? 0;
              const lineToRight = chartWidth > 0 ? Math.max(0, chartWidth - c.x) : 10000;
              return (
                <div key={c.id} className="absolute inset-0 pointer-events-none">
                  {/* Horizontal price line from the entry candle to the right edge */}
                  <div
                    className="absolute top-0"
                    style={{
                      left: c.x,
                      top: c.y,
                      width: lineToRight,
                      height: 1,
                      background: color,
                      opacity: 0.55,
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      left: c.x - 1,
                      top: c.y - 1,
                      width: 3,
                      height: 3,
                      background: color,
                      borderRadius: "50%",
                    }}
                  />
                  {/* Direction triangle at the entry price */}
                  <div className="absolute -translate-x-1/2" style={{ left: c.x, top: c.y, color }}>
                    <svg width="14" height="14" viewBox="0 0 14 14">
                      {isBuy ? (
                        <polygon
                          points="7,2 13,12 1,12"
                          fill={color}
                          stroke="#000"
                          strokeWidth="0.5"
                        />
                      ) : (
                        <polygon
                          points="7,12 13,2 1,2"
                          fill={color}
                          stroke="#000"
                          strokeWidth="0.5"
                        />
                      )}
                      {m.status === "won" && (
                        <text
                          x="7"
                          y="9"
                          textAnchor="middle"
                          fill="#000"
                          fontSize="7"
                          fontWeight="bold"
                        >
                          ✓
                        </text>
                      )}
                      {m.status === "lost" && (
                        <text
                          x="7"
                          y="8"
                          textAnchor="middle"
                          fill="#fff"
                          fontSize="7"
                          fontWeight="bold"
                        >
                          ✕
                        </text>
                      )}
                    </svg>
                  </div>
                  {/* Stake label above the marker */}
                  <div
                    className="absolute -translate-x-1/2 text-[9px] font-bold px-1.5 py-0.5 rounded whitespace-nowrap"
                    style={{ left: c.x, top: c.y - 26, background: color, color: "#000" }}
                  >
                    ▲ {m.stake}
                  </div>
                  {/* Live countdown below the marker (pending only) */}
                  {m.status === "pending" && (
                    <div
                      className="absolute -translate-x-1/2 text-[9px] font-mono font-bold px-1.5 py-0.5 rounded bg-black/70 text-amber-300 whitespace-nowrap"
                      style={{ left: c.x, top: c.y + 8 }}
                    >
                      {String(Math.floor(m.remainingSeconds / 60)).padStart(2, "0")}:
                      {String(m.remainingSeconds % 60).padStart(2, "0")}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {tradeActive && timeRemaining !== null && timeRemaining > 0 && (
            <div className="absolute top-4 right-4 bg-black/80 backdrop-blur-sm border border-[#dcb13c]/30 rounded-lg px-4 py-2 flex items-center gap-2">
              <Timer className="h-4 w-4 text-[#dcb13c]" />
              <span className="text-white font-mono text-sm font-bold">
                {formatTime(timeRemaining)}
              </span>
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">
              Stake (KES)
            </label>
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
            <label className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">
              Duration
            </label>
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
            <div className="text-gray-400">
              Ask:{" "}
              <span className="text-gray-200">
                {ask.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
              </span>
            </div>
            <div className="text-gray-500 text-xs">
              Spread: {spread.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
            </div>
            <div className="text-gray-400">
              Bid:{" "}
              <span className="text-gray-200">
                {bid.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
              </span>
            </div>
          </div>

          {entryPrice !== null && (
            <div className="flex justify-between text-xs text-gray-500 px-2">
              <span>
                Entry:{" "}
                <span className="text-white font-mono">
                  {entryPrice.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
                </span>
              </span>
              {exitPrice !== null && (
                <span>
                  Exit:{" "}
                  <span className="text-white font-mono">
                    {exitPrice.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
                  </span>
                </span>
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
              <span className="font-mono opacity-80 font-normal">
                {ask.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
              </span>
            </button>
            <button
              onClick={() => handleTrade("sell")}
              disabled={loading || !currentPrice || tradeActive}
              className="flex-1 py-4 bg-[#6e2525] hover:bg-[#852c2c] text-white font-bold rounded-lg flex flex-col items-center justify-center transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <span className="uppercase tracking-wider text-sm mb-1">Sell</span>
              <span className="font-mono opacity-80 font-normal">
                {bid.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
              </span>
            </button>
          </div>

          {tradeError && (
            <div className="text-center text-red-500 text-sm font-medium">{tradeError}</div>
          )}

          <div className="text-center text-xs text-gray-500">
            Mode: <span className="text-gray-300 font-medium capitalize">{mode}</span>
          </div>
        </div>
      </div>

      {/* Open Positions */}
      <div className="bg-[#0b0e14] border border-[#1e2330] rounded-xl p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">
          Open Positions ({openPositions.length})
        </h2>
        <div className="flex flex-col gap-2">
          {openPositions.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">No open positions.</p>
          ) : (
            openPositions.map((pos) => {
              const isBuy = pos.direction === "up" || pos.direction === "UP";
              let profitMock = 0;
              if (pos.market === pair && currentPrice) {
                const diff = isBuy
                  ? currentPrice - pos.entry_price
                  : pos.entry_price - currentPrice;
                if (diff > 0) profitMock = pos.amount * 0.2;
                else if (diff < 0) profitMock = -pos.amount;
              }
              const profitColor = profitMock >= 0 ? "text-emerald-500" : "text-red-500";
              return (
                <div
                  key={pos.id}
                  className="flex items-center justify-between p-3 bg-[#131720] rounded-lg border border-[#1e2330]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${isBuy ? "bg-[#236e40] text-emerald-100" : "bg-[#6e2525] text-red-100"} uppercase`}
                    >
                      {isBuy ? "Buy" : "Sell"}
                    </div>
                    <div className="font-semibold text-sm text-gray-200">{pos.market}</div>
                    <div className="text-xs text-gray-500">&times;{pos.amount / 10000}</div>
                  </div>
                  <div className="flex items-center gap-4">
                    <div className={`text-sm font-mono font-medium ${profitColor} w-20 text-right`}>
                      {profitMock > 0 ? "+" : ""}
                      {profitMock.toFixed(2)} KES
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

      {/* Binary FX Trade History (markers persisted in fx_trades) */}
      <div className="bg-[#0b0e14] border border-[#1e2330] rounded-xl p-4 flex flex-col gap-3">
        <h2 className="text-xs font-semibold text-gray-500 uppercase tracking-widest block">
          Trade History
        </h2>
        <div className="flex flex-col gap-2">
          {markers.length === 0 ? (
            <p className="text-sm text-gray-600 text-center py-4">
              No trades yet. Place a BUY or SELL to start.
            </p>
          ) : (
            markers.map((m, i) => {
              const isBuy = m.type === "buy";
              const statusColor =
                m.status === "won"
                  ? "text-emerald-400"
                  : m.status === "lost"
                    ? "text-red-400"
                    : "text-amber-400";
              const statusLabel =
                m.status === "won" ? "WON" : m.status === "lost" ? "LOST" : "PENDING";
              return (
                <div
                  key={m.id}
                  className="flex items-center justify-between p-3 bg-[#131720] rounded-lg border border-[#1e2330]"
                >
                  <div className="flex items-center gap-3">
                    <div
                      className={`text-[10px] font-bold px-2 py-0.5 rounded ${isBuy ? "bg-[#236e40] text-emerald-100" : "bg-[#6e2525] text-red-100"}`}
                    >
                      {isBuy ? "BUY ▲" : "SELL ▼"}
                    </div>
                    <div className="font-semibold text-sm text-gray-200">{pair}</div>
                    <div className="text-xs text-gray-500 font-mono">
                      {m.price.toFixed(currentPrice && currentPrice > 50 ? 2 : 4)}
                    </div>
                  </div>
                  <div className={`text-xs font-bold uppercase ${statusColor}`}>{statusLabel}</div>
                </div>
              );
            })
          )}
        </div>
      </div>

      {showDeposit && (
        <DepositSheet
          onClose={() => setShowDeposit(false)}
          user={user}
          onSuccess={refreshRealBalance}
          onDepositComplete={refreshRealBalance}
        />
      )}
    </div>
  );
}
