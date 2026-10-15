import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  RefreshCw,
  Timer,
  ArrowLeft,
  PlusCircle,
  Clock,
  TrendingUp,
  TrendingDown,
  BarChart3,
  Moon,
} from "lucide-react";
import { TradingChart, type FxMarker } from "@/components/fx/TradingChart";
import { apiRequest } from "@/utils/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { DepositSheet } from "@/components/DepositSheet";
import { toast } from "sonner";
import { midAt, quoteAt, PAIRS, TIMEFRAMES, type Pair, type TF } from "@/lib/fx/market";
import { supabase } from "@/utils/supabase/client";

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

type BfxTrade = {
  id: string;
  user_id: string;
  mode: "demo" | "real";
  asset: string;
  direction: "up" | "down";
  stake: number;
  payout_percentage: number;
  entry_price: number;
  expiry_price: number | null;
  opened_at: string;
  expires_at: string;
  settled_at: string | null;
  status: "open" | "win" | "loss" | "tie" | "cancelled";
  profit: number;
  total_return: number;
  settlement_id: string | null;
};

type Config = {
  assets: string[];
  expiries: { label: string; seconds: number }[];
  payout: number;
  minStake: number;
  maxStake: number;
  maxOpen: number;
  tie: string;
  demoStart: number;
};

const formatKes = (n: number) =>
  n.toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const priceDecimals = (asset: string) => (asset.includes("JPY") ? 3 : 5);

function roundToDigits(price: number, digits: number): number {
  const f = Math.pow(10, digits);
  return Math.round(price * f) / f;
}

function nowSeconds() {
  return Date.now() / 1000;
}

function candleFor(pair: Pair, t0: number, sec: number, now: number): any {
  const t1 = Math.min(t0 + sec, now);
  let h = -Infinity, l = Infinity, o = 0, c = 0;
  const S = 20;
  for (let k = 0; k <= S; k++) {
    const p = midAt(pair, t0 + ((t1 - t0) * k) / S);
    if (k === 0) o = p;
    if (k === S) c = p;
    h = Math.max(h, p);
    l = Math.min(l, p);
  }
  return {
    time: Math.floor(t0),
    open: roundToDigits(o, pair.digits),
    high: roundToDigits(h, pair.digits),
    low: roundToDigits(l, pair.digits),
    close: roundToDigits(c, pair.digits),
  };
}

function generateCandles(pair: Pair, count: number, now: number, tf: TF): any[] {
  const sec = TIMEFRAMES[tf];
  const out: any[] = [];
  const cur = Math.floor(now / sec) * sec;
  for (let i = count - 1; i >= 0; i--) {
    const t0 = cur - i * sec;
    out.push(candleFor(pair, t0, sec, now));
  }
  return out;
}

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

  const [config, setConfig] = useState<Config | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [data, setData] = useState<any[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState(false);

  const [stake, setStake] = useState<number>(10);
  const [selectedExpiry, setSelectedExpiry] = useState<{ label: string; seconds: number } | null>(null);
  const [tradeActive, setTradeActive] = useState(false);
  const [timeRemaining, setTimeRemaining] = useState<number | null>(null);
  const [tradeResult, setTradeResult] = useState<"won" | "lost" | null>(null);
  const [tradeError, setTradeError] = useState<string | null>(null);
  const [openTrades, setOpenTrades] = useState<BfxTrade[]>([]);
  const [settledTrades, setSettledTrades] = useState<BfxTrade[]>([]);
  const [markers, setMarkers] = useState<FxMarker[]>([]);
  const [placing, setPlacing] = useState(false);
  const [showDeposit, setShowDeposit] = useState(false);
  const [showMarketWatch, setShowMarketWatch] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TF>("M1");
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [activeView, setActiveView] = useState<"positions" | "history">("positions");

  // Per-trade stats shown in the header.
  const [todayPnl, setTodayPnl] = useState(0);
  const [winningTrades, setWinningTrades] = useState(0);
  const [activeTrades, setActiveTrades] = useState(0);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeActiveRef = useRef(false);
  const activeTradeIdRef = useRef<string | null>(null);

  const pairObj = PAIRS.find((p) => p.label === selectedPair) || PAIRS[0];

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiRequest<{
        success: boolean;
        assets: string[];
        expiries: { label: string; seconds: number }[];
        payout: number;
        minStake: number;
        maxStake: number;
        maxOpen: number;
        tie: string;
        demoStart: number;
      }>(`${API_URL}/games/bfx/config`);
      if (res.success) {
        const cfg: Config = {
          assets: res.assets,
          expiries: res.expiries,
          payout: res.payout,
          minStake: res.minStake,
          maxStake: res.maxStake,
          maxOpen: res.maxOpen,
          tie: res.tie,
          demoStart: res.demoStart,
        };
        setConfig(cfg);
        if (!selectedExpiry) setSelectedExpiry(cfg.expiries[2]);
      }
    } catch (e) {
      console.error("Failed to fetch config:", e);
    }
  }, [selectedExpiry]);

  const fetchBalance = useCallback(async () => {
    try {
      setUpdatingBalance(true);
      const data = await apiRequest<{ balance: number }>("/wallet/balance");
      setBalance(data.balance || 0);
    } catch (err) {
      console.error("Failed to fetch balance:", err);
      setBalance(0);
    } finally {
      setUpdatingBalance(false);
    }
  }, []);

  const fetchOpenTrades = useCallback(async () => {
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(
        `${API_URL}/games/bfx/trades/open`,
      );
      if (data.success) {
        setOpenTrades(data.data || []);
        setMarkers(
          (data.data || []).map((t) => {
            const entrySec = Math.floor(new Date(t.opened_at).getTime() / 1000);
            const expiresMs = new Date(t.expires_at).getTime();
            const remaining = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
            return {
              id: `trade-${t.id}`,
              time: entrySec,
              price: Number(t.entry_price),
              type: t.direction === "up" ? "buy" : "sell",
              stake: Number(t.stake),
              status: "pending",
              remainingSeconds: remaining,
              expiresAt: expiresMs,
            } as FxMarker;
          }),
        );
      }
    } catch (e) {
      console.error("Failed to fetch open trades:", e);
    }
  }, []);

  const fetchSettledTrades = useCallback(async () => {
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(
        `${API_URL}/games/bfx/trades/settled?limit=50`,
      );
      if (data.success) {
        const all = data.data || [];
        setSettledTrades(all.filter((t) => t.mode === mode));
      }
    } catch (e) {
      console.error("Failed to fetch settled trades:", e);
    }
  }, [mode]);

  const refreshAll = useCallback(() => {
    fetchConfig();
    fetchBalance();
    fetchOpenTrades();
    fetchSettledTrades();
  }, [fetchConfig, fetchBalance, fetchOpenTrades, fetchSettledTrades]);

  const settleTrade = useCallback(
    async (tradeId: string) => {
      try {
        const result = await apiRequest<{
          success: boolean;
          status: string;
          profit: number;
          total_return: number;
          new_balance: number;
          entry_price?: number;
          exit_price?: number;
          entry_time?: string;
          exit_time?: string;
          direction?: "up" | "down";
          asset?: string;
          stake?: number;
          already_settled?: boolean;
        }>(`${API_URL}/games/bfx/trade/${tradeId}/settle`, {
          method: "POST",
          body: JSON.stringify({}),
        });

        if (result.success) {
          const trade = openTrades.find((t) => t.id === tradeId);
          if (trade) {
            const profit = result.profit ?? trade.profit;
            const dir = result.direction ?? trade.direction;
            const asset = result.asset ?? trade.asset;
            const tradeStake = result.stake ?? trade.stake;
            const entryPrice = result.entry_price ?? trade.entry_price;
            const exitPrice = result.exit_price ?? trade.expiry_price;
            const entryTime = result.entry_time ?? trade.opened_at;
            const exitTime = result.exit_time ?? new Date().toISOString();

            const entryStr = entryPrice.toFixed(priceDecimals(asset));
            const exitStr = (exitPrice ?? 0).toFixed(priceDecimals(asset));
            const entryT = new Date(entryTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });
            const exitT = new Date(exitTime).toLocaleTimeString([], {
              hour: "2-digit",
              minute: "2-digit",
              second: "2-digit",
            });

            if (result.status === "win") {
              toast.success(
                `WON! +KSh ${formatKes(profit)} · Entry: ${entryStr} @ ${entryT} → Exit: ${exitStr} @ ${exitT} · ${(dir || "up").toUpperCase()}`,
                { duration: 6000 },
              );
            } else {
              toast.error(
                `LOST! -KSh ${formatKes(tradeStake)} · Entry: ${entryStr} @ ${entryT} → Exit: ${exitStr} @ ${exitT} · ${(dir || "up").toUpperCase()}`,
                { duration: 6000 },
              );
            }
            if (result.new_balance !== undefined) {
              setBalance(result.new_balance);
            }
            setOpenTrades((prev) => prev.filter((t) => t.id !== tradeId));
            setMarkers((prev) => prev.filter((m) => !m.id.startsWith(`trade-${tradeId}`)));
            fetchSettledTrades();
          }
        }
      } catch (err: unknown) {
        console.error("Settle failed:", err);
      }
    },
    [openTrades, fetchSettledTrades],
  );

  // ── Initial load ─────────────────────────────────────────────────────
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        navigate({ to: "/auth" });
        return;
      }
      await fetchConfig();
      await fetchBalance();
      await fetchOpenTrades();
      await fetchSettledTrades();
      setLoading(false);
    };
    init();
  }, []);

  // Refresh balance after a successful deposit
  const handleDepositSuccess = () => {
    fetchBalance();
    refreshAll();
  };

   // ── Chart price tick ──
  const updatePrice = useCallback(() => {
    if (!pairObj) return;
    const q = quoteAt(pairObj, nowSeconds());
    const p = roundToDigits(q.mid, pairObj.digits);
    setPrice(p);

    setData((prev) => {
      if (prev.length === 0) {
        return generateCandles(pairObj, 50, nowSeconds(), selectedTimeframe);
      }
      const last = prev[prev.length - 1];
      const sec = TIMEFRAMES[selectedTimeframe];
      const curBucket = Math.floor(nowSeconds() / sec) * sec;
      if (Math.floor(last.time) >= curBucket) return prev;
      const newCandle = candleFor(pairObj, curBucket, sec, nowSeconds());
      return [...prev.slice(1), newCandle];
    });
  }, [pairObj, selectedTimeframe]);

  useEffect(() => {
    updatePrice();
  }, [selectedPair, selectedTimeframe]);

  useEffect(() => {
    tickIntervalRef.current = setInterval(updatePrice, 1000);
    return () => {
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, [updatePrice]);

  // ── Countdown timer ──
  const startTimer = (durationInSeconds: number) => {
    setTimeRemaining(durationInSeconds);
    tradeActiveRef.current = true;
    setTradeActive(true);

    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);

    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0.5) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          if (tradeActiveRef.current && activeTradeIdRef.current) {
            settleTrade(activeTradeIdRef.current);
          }
          setTradeActive(false);
          tradeActiveRef.current = false;
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
  };

  const placeTrade = async (direction: "up" | "down") => {
    if (!user && mode === "real") {
      navigate({
        to: "/auth",
        search: { mode, redirect: "/trading/fx" } as never,
      });
      return;
    }
    if (placing) return;
    if (!config) return;
    if (!selectedExpiry) return;

    const stakeNum = stake;
    if (isNaN(stakeNum) || stakeNum < config.minStake || stakeNum > config.maxStake) {
      toast(`Stake must be between KSh ${config.minStake} and KSh ${config.maxStake}`);
      return;
    }

    const currentBalance = mode === "real" ? balance : (balance ?? config.demoStart);
    if (currentBalance !== null && currentBalance < stakeNum) {
      toast(`Insufficient balance. Current: KSh ${formatKes(currentBalance ?? 0)}`);
      setShowDeposit(true);
      return;
    }

    if (openTrades.length >= config.maxOpen) {
      toast(`Maximum ${config.maxOpen} open trades allowed`);
      return;
    }

    setPlacing(true);
    setTradeError(null);
    try {
      const pairLabel = pairObj?.label || selectedPair;
      const q = quoteAt(pairObj!, nowSeconds());
      const entryPrice = roundToDigits(q.mid, pairObj!.digits);

      const result = await apiRequest<{
        success: boolean;
        trade: BfxTrade;
        entry_price: number;
        expires_at: string;
        new_balance: number;
        error?: string;
      }>(`${API_URL}/games/bfx/trade`, {
        method: "POST",
        body: JSON.stringify({
          pair: pairLabel,
          asset: pairLabel,
          direction,
          stake: stakeNum,
          duration: selectedExpiry.seconds,
          expiry: selectedExpiry.seconds,
          mode,
          entryPrice,
        }),
      });

      if (result.success) {
        const now = Date.now();
        const expiresAtMs = new Date(result.expires_at).getTime();
        const durationSec = Math.max(1, Math.ceil((expiresAtMs - now) / 1000));

        activeTradeIdRef.current = result.trade.id;
        setTradeActive(true);
        tradeActiveRef.current = true;
        setTimeRemaining(durationSec);

        if (result.new_balance !== undefined) {
          setBalance(result.new_balance);
        }

        startTimer(durationSec);

        const marker: FxMarker = {
          id: `pending-${result.trade.id}`,
          time: Math.floor(now / 1000),
          price: result.entry_price,
          type: direction === "up" ? "buy" : "sell",
          stake: stakeNum,
          status: "pending",
          remainingSeconds: durationSec,
          expiresAt: expiresAtMs,
        };
        setMarkers((prev) => [...prev, marker]);
        fetchOpenTrades();

        const dirLabel = direction === "up" ? "UP" : "DOWN";
        toast.success(
          `${dirLabel} ${pairLabel} · Entry: ${entryPrice.toFixed(priceDecimals(pairLabel))} · Stake: KSh ${formatKes(stakeNum)}`,
          { duration: 4000 },
        );
      } else {
        setTradeError(result.error || "Failed to place trade");
      }
    } catch (err: any) {
      setTradeError(err.message || "Failed to place trade");
    } finally {
      setPlacing(false);
    }
  };

  // ── Stats from settled trades ──
  useEffect(() => {
    const today = new Date().toDateString();
    let pnl = 0;
    let wins = 0;
    let active = 0;
    for (const t of settledTrades) {
      if (new Date(t.opened_at).toDateString() === today) {
        if (t.status === "win") {
          wins++;
          pnl += Number(t.profit ?? 0);
        } else {
          pnl -= Number(t.stake ?? 0);
        }
      }
    }
    for (const t of openTrades) {
      active++;
    }
    setTodayPnl(pnl);
    setWinningTrades(wins);
    setActiveTrades(active);
  }, [settledTrades, openTrades]);

  // ── Cleanup on unmount ──
  useEffect(() => {
    return () => {
      if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
      if (tickIntervalRef.current) clearInterval(tickIntervalRef.current);
    };
  }, []);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    if (mins > 0) return `${mins}m ${secs}s`;
    return `${secs}s`;
  };

  const payout = config?.payout ?? 0.5;
  const potentialWin = stake * (1 + payout);
  const currentBalance = mode === "real" ? balance : (balance ?? config?.demoStart ?? 10000);

  const bid = price ? price - 0.00002 : 0;
  const ask = price ? price + 0.00002 : 0;
  const spread = 0.00004;
  const decimals = pairObj?.digits ?? 5;

  return loading ? (
    <div className="flex items-center justify-center min-h-screen bg-[#0f1420]">
      <div className="w-8 h-8 border-2 border-[#4a90d9] border-t-transparent rounded-full animate-spin" />
    </div>
  ) : (
  <div className="flex flex-col min-h-screen bg-[#0f1420] text-gray-200">
    {/* ─── Title Bar ─── */}
    <div className="flex items-center justify-between px-3 py-2 border-b border-[#2b313f] bg-[#0b0e14]">
      <div className="flex items-center gap-2">
        <Link
          to="/trading"
          className="text-gray-400 hover:text-white transition-colors"
          title="Back to Trading Hub"
        >
            <ArrowLeft size={24} />
          </Link>
          <div className="flex items-center gap-2">
            <div className="w-6 h-6 rounded flex items-center justify-center bg-primary/20">
              <BarChart3 className="w-4 h-4 text-primary" />
            </div>
            <div>
              <h1 className="text-lg md:text-xl font-bold text-white flex items-center gap-2">
                Pesaki Forex
                <span className="text-xs text-gray-500 hidden sm:inline">• Professional Trading</span>
              </h1>
              <div className="text-[9px] text-gray-500">
                {pairObj?.name || "Major Currency Pairs"}
              </div>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Mode Toggle */}
          <div className="flex rounded-full bg-[#181d29] p-0.5 text-[10px] font-medium">
            <button
              onClick={() => navigate({ search: { mode: "demo" } as never })}
              className={`px-2.5 py-1 rounded-full transition-all ${mode === "demo" ? "bg-[#dcb13c] text-black" : "text-gray-400 hover:text-white"}`}
            >
              Demo
            </button>
            <button
              onClick={() => {
                if (!user) navigate({ to: "/auth", search: { mode: "real" } } as never);
                else navigate({ search: { mode: "real" } as never });
              }}
              className={`px-2.5 py-1 rounded-full transition-all ${mode === "real" ? "bg-[#e74c3c] text-white" : "text-gray-400 hover:text-white"}`}
            >
              Real
            </button>
           </div>

           {/* Mode indicator */}
           <div className="px-2 py-0.5 rounded text-[10px] text-gray-500">
             <Moon size={10} className="inline" /> PRO
           </div>
         </div>
       </div>

      {/* ─── Account Summary Bar ─── */}
      <div className="flex items-center gap-4 px-3 py-2 text-xs border-b border-[#1e2330] bg-[#0b0e14]">
        <div className="flex items-center gap-1">
          <span className="text-gray-500">Balance</span>
          <span className="font-mono font-semibold text-white">
            {currentBalance !== null ? `${formatKes(currentBalance)} KES` : "—"}
          </span>
          {updatingBalance && <span className="text-gray-400 animate-pulse">⋯</span>}
        </div>
        <div className="flex items-center gap-1">
          <span className={`font-mono font-semibold ${todayPnl >= 0 ? "text-emerald-400" : "text-red-400"}`}>
            {todayPnl >= 0 ? "+" : ""}
            {formatKes(todayPnl)} KES
          </span>
          <span className="text-gray-500">P&amp;L (today)</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono font-semibold text-white">{activeTrades}</span>
          <span className="text-gray-500">Active</span>
        </div>
        <div className="flex items-center gap-1">
          <span className="font-mono font-semibold text-emerald-400">{winningTrades}</span>
          <span className="text-gray-500">Wins</span>
        </div>
        <div className="ml-auto flex items-center gap-1">
          <span className="text-xs text-gray-500">LIVE</span>
          <span className="relative flex h-1.5 w-1.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
            <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
          </span>
        </div>
      </div>

      {/* ─── Main Trading Area ─── */}
      <div className="flex-1 flex gap-2 p-2 overflow-hidden">
        {/* Market Watch Sidebar */}
        {showMarketWatch && (
          <div className="w-56 flex-shrink-0 flex flex-col rounded-lg border border-[#2b313f] bg-[#0b0e14] overflow-hidden">
            <div className="border-b border-[#1e2330] px-2 py-1.5">
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">Market Watch</h3>
            </div>
            <div className="overflow-y-auto flex-1">
              <div className="grid grid-cols-[1fr_auto_auto] gap-x-2 px-2 py-1 text-[9px] font-semibold text-gray-500 uppercase">
                <span>Symbol</span>
                <span className="text-right">Bid</span>
                <span className="text-right">Ask</span>
              </div>
              {PAIRS.map((p) => {
                const q = quoteAt(p, nowSeconds());
                const prev = quoteAt(p, nowSeconds() - 1);
                const tick = q.bid > prev.bid ? "text-emerald-400" : q.bid < prev.bid ? "text-red-400" : "";
                const isSelected = selectedPair === p.label;
                return (
                  <button
                    key={p.symbol}
                    onClick={() => setSelectedPair(p.label)}
                    className={`grid w-full grid-cols-[1fr_auto_auto] items-center gap-x-2 px-2 py-1.5 text-left transition-colors ${
                      isSelected
                        ? "bg-[#2b313f] ring-1 ring-primary"
                        : "hover:bg-[#181d29]/50"
                    }`}
                  >
                    <div>
                      <span className="block font-bold text-xs">{p.label}</span>
                      <span className="block text-[7px] text-gray-500">{p.name}</span>
                    </div>
                    <span className={`num font-mono text-right text-xs ${tick}`}>
                      {q.bid.toFixed(p.digits)}
                    </span>
                    <span className={`num font-mono text-right text-xs ${tick}`}>
                      {q.ask.toFixed(p.digits)}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Chart Window + Order Panel */}
        <div className="flex-1 flex flex-col gap-2 min-w-0">
          {/* Chart */}
          <div className="flex-1 rounded-lg border border-[#2b313f] bg-[#0b0e14] overflow-hidden relative">
            {/* Chart Toolbar */}
            <div className="flex items-center gap-1 border-b border-[#1e2330] bg-[#0f1420] px-2 py-1 text-xs">
              <span className="font-bold text-white mr-2">{selectedPair}</span>

              {/* Timeframe buttons */}
              <div className="flex flex-wrap gap-0.5">
                 {(["M1", "M5", "M15", "H1", "H4"] as TF[]).map((tf) => (
                   <button
                     key={tf}
                     onClick={() => setSelectedTimeframe(tf)}
                     className={`px-1.5 py-0.5 rounded text-[10px] font-semibold transition-colors ${selectedTimeframe === tf ? "bg-[#22c55e] text-black" : "text-gray-400 hover:text-white hover:bg-[#181d29]"}`}
                   >
                     {tf}
                   </button>
                 ))}
              </div>

              {/* Live price display */}
              <div className="ml-auto flex items-center gap-2">
                <div className="text-right">
                  <div className="font-mono font-semibold text-white">
                    {price !== null ? price.toFixed(decimals) : "—"}
                  </div>
                  <div className="flex items-center gap-1 text-[8px] text-gray-500">
                    <span>Bid: {bid.toFixed(decimals)}</span>
                    <span>Ask: {ask.toFixed(decimals)}</span>
                    <span>Spread: {spread.toFixed(decimals)}</span>
                  </div>
                </div>
                <button
                  onClick={updatePrice}
                  className="p-0.5 rounded text-gray-400 hover:text-white hover:bg-[#181d29] transition-colors"
                  title="Refresh"
                >
                  <RefreshCw size={10} />
                </button>
              </div>
            </div>

            {/* Chart Content */}
            <div className="h-[calc(100%-33px)]">
              {data.length > 0 ? (
                <TradingChart
                  data={data}
                  markers={markers}
                  colors={{ backgroundColor: "#0b0e14", textColor: "#7a82a8" }}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Activity className="animate-pulse text-primary" size={32} />
                </div>
              )}
            </div>

            {/* Countdown overlay */}
            {tradeActive && timeRemaining !== null && timeRemaining > 0 && (
              <div className="absolute top-2 right-2 bg-black/80 border border-[#dcb13c]/30 rounded-lg px-3 py-1.5 flex items-center gap-2">
                <Timer className="h-3 w-3 text-[#dcb13c]" />
                <span className="font-mono text-sm font-bold text-[#dcb13c]">
                  {formatTime(timeRemaining)}
                </span>
              </div>
            )}

            {/* Result overlay */}
            {tradeResult && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/50 backdrop-blur-sm">
                <div
                  className={`px-4 py-2 rounded-lg font-bold text-sm animate-pulse ${
                    tradeResult === "won"
                      ? "bg-emerald-500/20 text-emerald-400 border border-emerald-500/30"
                      : "bg-red-500/20 text-red-400 border border-red-500/30"
                  }`}
                >
                  {tradeResult === "won" ? "🎉 WON!" : "💀 LOST!"}
                </div>
              </div>
            )}
          </div>

          {/* Order Panel */}
          <div className="rounded-lg border border-[#2b313f] bg-[#0b0e14] p-3">
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider">
                Order Panel
              </h3>
              {mode === "real" && (
                <button
                  onClick={() => setShowDeposit(true)}
                  className="flex items-center gap-0.5 bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-400 text-[10px] font-semibold px-2 py-0.5 rounded transition-colors"
                >
                  <PlusCircle size={10} /> Deposit
                </button>
              )}
            </div>

            {/* Stake Input */}
            <div className="mb-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Stake (KES)
              </label>
              <input
                type="number"
                min={config?.minStake ?? 10}
                max={config?.maxStake ?? 5000}
                step="1"
                value={stake}
                onChange={(e) => setStake(Math.max(1, Number(e.target.value) || 1))}
                disabled={tradeActive}
                className="w-full bg-[#181d29] border border-[#2b313f] rounded-md px-3 py-2 text-sm font-mono font-semibold text-white focus:outline-none focus:border-[#dcb13c] disabled:opacity-50"
              />
              <div className="mt-1 flex gap-1.5 flex-wrap">
                {[10, 50, 100, 500, 1000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setStake(v)}
                    disabled={tradeActive}
                    className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                      stake === v
                        ? "bg-[#dcb13c] text-black"
                        : "bg-[#181d29] text-gray-400 hover:text-white"
                    } disabled:opacity-50`}
                  >
                    {v}
                  </button>
                ))}
              </div>
            </div>

            {/* Expiry Selector */}
            <div className="mb-3">
              <label className="block text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
                Expiry
              </label>
              {config?.expiries && (
                <div className="grid grid-cols-5 gap-1">
                  {config.expiries.map((d) => (
                    <button
                      key={d.label}
                      onClick={() => setSelectedExpiry(d)}
                      disabled={tradeActive}
                      className={`py-1.5 rounded text-xs font-semibold transition-all ${
                        selectedExpiry?.label === d.label
                          ? "bg-[#dcb13c] text-black"
                          : "bg-[#181d29] text-gray-400 hover:text-white"
                      } disabled:opacity-50`}
                    >
                      {d.label}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* Payout Display */}
            <div className="mb-3 p-2 rounded bg-[#181d29] flex justify-between items-center">
              <span className="text-[10px] text-gray-500">Potential Return</span>
              <span className="font-mono font-semibold text-emerald-400">
                {formatKes(potentialWin)} KES
              </span>
            </div>

            {/* Buy / Sell Buttons */}
            <div className="grid grid-cols-2 gap-2">
              <button
                onClick={() => placeTrade("up")}
                disabled={placing || !price || !config || tradeActive}
                className={`py-3 rounded-lg font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                  tradeActive
                    ? "bg-[#236e40] text-white cursor-not-allowed"
                    : "bg-[#2ecc71] hover:bg-[#27ae60] text-white shadow-lg shadow-[#2ecc71]/20"
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <TrendingUp size={14} />
                  <span>UP</span>
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">
                  {price?.toFixed(decimals)}
                </div>
              </button>
              <button
                onClick={() => placeTrade("down")}
                disabled={placing || !price || !config || tradeActive}
                className={`py-3 rounded-lg font-bold text-sm transition-all active:scale-95 disabled:opacity-50 ${
                  tradeActive
                    ? "bg-[#6e2525] text-white cursor-not-allowed"
                    : "bg-[#e74c3c] hover:bg-[#c0392b] text-white shadow-lg shadow-[#e74c3c]/20"
                }`}
              >
                <div className="flex items-center justify-center gap-1">
                  <TrendingDown size={14} />
                  <span>DOWN</span>
                </div>
                <div className="text-[10px] mt-0.5 opacity-80">
                  {price?.toFixed(decimals)}
                </div>
              </button>
            </div>

            {tradeError && (
              <div className="text-center text-red-500 text-sm font-medium mt-2">{tradeError}</div>
            )}

            {placing && <div className="text-center text-gray-500 text-xs mt-2">Placing trade…</div>}
          </div>
        </div>
      </div>

      {/* ─── Trade Tabs (Open / History) ─── */}
      <div className="mx-2 mb-4 rounded-lg border border-[#2b313f] bg-[#0b0e14] overflow-hidden">
        <div className="flex border-b border-[#1e2330]">
          <button
            onClick={() => setActiveView("positions")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeView === "positions"
                ? "border-b-2 border-[#dcb13c] text-[#dcb13c]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Open Trades ({openTrades.length})
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`px-3 py-1.5 text-xs font-semibold ${
              activeView === "history"
                ? "border-b-2 border-[#dcb13c] text-[#dcb13c]"
                : "text-gray-400 hover:text-white"
            }`}
          >
            Trade History ({settledTrades.length})
          </button>
        </div>

        <div className="overflow-y-auto max-h-60">
          {activeView === "positions" ? (
            openTrades.length === 0 ? (
              <div className="p-4 text-center text-gray-500 text-sm">
                <Clock className="w-8 h-8 mx-auto mb-1 opacity-30" />
                <div>No open trades. Select a pair and place your first trade.</div>
              </div>
            ) : (
              <div className="divide-y divide-[#1e2330]">
                {openTrades.map((t) => {
                  const expiresAt = new Date(t.expires_at).getTime();
                  const remaining = Math.max(0, Math.ceil((expiresAt - Date.now()) / 1000));
                  const mins = Math.floor(remaining / 60);
                  const secs = remaining % 60;
                  const isBuy = t.direction === "up";
                  const currentPriceLocal = price ?? 0;
                  const isWinning =
                    t.direction === "up"
                      ? currentPriceLocal > t.entry_price
                      : currentPriceLocal < t.entry_price;
                  return (
                    <div key={t.id} className="flex items-center justify-between p-2">
                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                            isBuy
                              ? "bg-[#236e40] text-emerald-100"
                              : "bg-[#6e2525] text-red-100"
                          }`}
                        >
                          {isBuy ? "UP" : "DOWN"}
                        </span>
                        <div>
                          <div className="font-semibold text-sm text-white">{t.asset}</div>
                          <div className="text-[9px] text-gray-500 font-mono">
                            Entry: {t.entry_price.toFixed(priceDecimals(t.asset))}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className={`font-bold text-sm ${isWinning ? "text-emerald-400" : "text-red-400"}`}>
                          {mins}:{String(secs).padStart(2, "0")}
                        </div>
                        <div className="text-[9px] text-gray-500 font-mono">
                          KSh {formatKes(t.stake)} → KSh {formatKes(t.stake * (1 + (config?.payout ?? 0.5)))}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : settledTrades.length === 0 ? (
            <div className="p-4 text-center text-gray-500 text-sm">
              No settled trades yet.
            </div>
          ) : (
            <div className="divide-y divide-[#1e2330]">
              {settledTrades.map((t) => {
                const isWin = t.status === "win";
                const timeStr = new Date(t.opened_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                const exitStr = (t.expiry_price ?? 0).toFixed(priceDecimals(t.asset));
                return (
                  <div key={t.id} className="flex items-center justify-between p-2">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase ${
                          isWin
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {isWin ? "WIN" : "LOSS"}
                      </span>
                      <div>
                        <div className="font-semibold text-sm text-white">{t.asset}</div>
                        <div className="text-[8px] text-gray-500 font-mono">
                          Entry: {t.entry_price.toFixed(priceDecimals(t.asset))} → Exit: {exitStr} · {t.direction.toUpperCase()} • {timeStr}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold text-sm ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                        {t.profit > 0 ? `+KSh ${formatKes(t.profit)}` : "-KSh " + formatKes(t.stake)}
                      </div>
                      <div className="text-[9px] text-gray-500">
                        Stake: KSh {formatKes(t.stake)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Deposit Sheet */}
      {showDeposit && user && (
        <DepositSheet
          user={user}
          onClose={() => setShowDeposit(false)}
          onDepositComplete={handleDepositSuccess}
        />
      )}
    </div>
  );
}
