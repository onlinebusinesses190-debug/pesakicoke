import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  Activity,
  ArrowLeft,
  PlusCircle,
  Settings,
  Target,
  StopCircle,
  BarChart3,
  ChevronDown,
  ChevronUp,
} from "lucide-react";
import { ForexChart, type FxMarker, type Theme } from "@/components/fx/ForexChart";
import { apiRequest } from "@/utils/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { DepositSheet } from "@/components/DepositSheet";
import { toast } from "sonner";
import { midAt, quoteAt, PAIRS, TIMEFRAMES, type Pair, type TF } from "@/lib/fx/market";
import { supabase } from "@/utils/supabase/client";

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// 🔴 ADJUST THIS: How much KSh is 1.00 Standard Lot?
// E.g., If 1 lot = 100,000 KSh, set to 100000.
// If 1 lot = 10,000 KSh, set to 10000.
const LOT_SIZE_KSH = 10000; 

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

  // Changed from Stake to Lots for UI
  const [lots, setLots] = useState<number>(0.1);
  const [tpPrice, setTpPrice] = useState<number | "">("");
  const [slPrice, setSlPrice] = useState<number | "">("");
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
  const [showMarketWatch, setShowMarketWatch] = useState(false); // Hidden by default on mobile
  const [showTradePanel, setShowTradePanel] = useState(true);
  const [selectedTimeframe, setSelectedTimeframe] = useState<TF>("M5");
  const [selectedPair, setSelectedPair] = useState("EUR/USD");
  const [activeView, setActiveView] = useState<"positions" | "history">("positions");

  const [todayPnl, setTodayPnl] = useState(0);
  const [winningTrades, setWinningTrades] = useState(0);
  const [activeTrades, setActiveTrades] = useState(0);
  const [tpLinePrice, setTpLinePrice] = useState<number | undefined>(undefined);
  const [slLinePrice, setSlLinePrice] = useState<number | undefined>(undefined);

  const timerIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tickIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const tradeActiveRef = useRef(false);
  const activeTradeIdRef = useRef<string | null>(null);

  const pairObj = PAIRS.find((p) => p.label === selectedPair) || PAIRS[0];
  
  // Derived stake calculation
  const stake = lots * LOT_SIZE_KSH;

  const fetchConfig = useCallback(async () => {
    try {
      const res = await apiRequest<any>(`${API_URL}/games/bfx/config`);
      if (res.success) {
        setConfig(res);
        if (!selectedExpiry) setSelectedExpiry(res.expiries[2]);
      }
    } catch (e) { console.error("Config fetch failed:", e); }
  }, [selectedExpiry]);

  const fetchBalance = useCallback(async () => {
    try {
      setUpdatingBalance(true);
      const data = await apiRequest<{ balance: number }>("/wallet/balance");
      setBalance(data.balance || 0);
    } catch (err) { setBalance(0); } finally { setUpdatingBalance(false); }
  }, []);

  const fetchOpenTrades = useCallback(async () => {
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(`${API_URL}/games/bfx/trades/open`);
      if (data.success) {
        setOpenTrades(data.data || []);
        setMarkers(
          (data.data || []).map((t) => {
            const entrySec = Math.floor(new Date(t.opened_at).getTime() / 1000);
            const expiresMs = new Date(t.expires_at).getTime();
            const remaining = Math.max(0, Math.ceil((expiresMs - Date.now()) / 1000));
            return {
              id: `trade-${t.id}`, time: entrySec, price: Number(t.entry_price),
              type: t.direction === "up" ? "buy" : "sell", stake: Number(t.stake),
              status: "pending", remainingSeconds: remaining, expiresAt: expiresMs,
            } as FxMarker;
          }),
        );
      }
    } catch (e) { console.error(e); }
  }, []);

  const fetchSettledTrades = useCallback(async () => {
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(`${API_URL}/games/bfx/trades/settled?limit=50`);
      if (data.success) setSettledTrades((data.data || []).filter((t) => t.mode === mode));
    } catch (e) { console.error(e); }
  }, [mode]);

  const settleTrade = useCallback(async (tradeId: string) => {
    try {
      const result = await apiRequest<any>(`${API_URL}/games/bfx/trade/${tradeId}/settle`, {
        method: "POST", body: JSON.stringify({}),
      });
      if (result.success) {
        const trade = openTrades.find((t) => t.id === tradeId);
        if (trade) {
           if (result.status === "win") {
            toast.success(`WON! +KSh ${formatKes(result.profit)}`, { duration: 4000 });
          } else {
            toast.error(`LOST! -KSh ${formatKes(trade.stake)}`, { duration: 4000 });
          }
          if (result.new_balance !== undefined) setBalance(result.new_balance);
          setOpenTrades((prev) => prev.filter((t) => t.id !== tradeId));
          setMarkers((prev) => prev.filter((m) => !m.id.startsWith(`trade-${tradeId}`)));
          fetchSettledTrades();
        }
      }
    } catch (err) { console.error("Settle failed:", err); }
  }, [openTrades, fetchSettledTrades]);

  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const init = async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) { navigate({ to: "/auth" }); return; }
      await fetchConfig(); await fetchBalance(); await fetchOpenTrades(); await fetchSettledTrades();
      setLoading(false);
    };
    init();
  }, []);

  const updatePrice = useCallback(() => {
    if (!pairObj) return;
    const q = quoteAt(pairObj, nowSeconds());
    setPrice(roundToDigits(q.mid, pairObj.digits));

    setData((prev) => {
      if (prev.length === 0) return generateCandles(pairObj, 50, nowSeconds(), selectedTimeframe);
      const last = prev[prev.length - 1];
      const sec = TIMEFRAMES[selectedTimeframe];
      const curBucket = Math.floor(nowSeconds() / sec) * sec;
      if (Math.floor(last.time) >= curBucket) return prev;
      return [...prev.slice(1), candleFor(pairObj, curBucket, sec, nowSeconds())];
    });
  }, [pairObj, selectedTimeframe]);

  useEffect(() => { updatePrice(); }, [selectedPair, selectedTimeframe]);

  useEffect(() => {
    tickIntervalRef.current = setInterval(updatePrice, 1000);
    return () => { if (tickIntervalRef.current) clearInterval(tickIntervalRef.current); };
  }, [updatePrice]);

  const startTimer = (durationInSeconds: number) => {
    setTimeRemaining(durationInSeconds);
    tradeActiveRef.current = true;
    setTradeActive(true);
    if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
    timerIntervalRef.current = setInterval(() => {
      setTimeRemaining((prev) => {
        if (prev === null || prev <= 0.5) {
          if (timerIntervalRef.current) clearInterval(timerIntervalRef.current);
          if (tradeActiveRef.current && activeTradeIdRef.current) settleTrade(activeTradeIdRef.current);
          setTradeActive(false);
          tradeActiveRef.current = false;
          return 0;
        }
        return prev - 0.1;
      });
    }, 100);
  };

  const computeTpSl = useCallback(() => {
    if (!price) return { tp: undefined, sl: undefined };
    const pip = Math.pow(10, -pairObj.digits) * 10;
    return {
      tp: tpPrice !== "" ? Number(tpPrice) : price + pip * 3,
      sl: slPrice !== "" ? Number(slPrice) : price - pip * 3,
    };
  }, [price, tpPrice, slPrice, pairObj]);

  const placeTrade = async (direction: "up" | "down") => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session) { navigate({ to: "/auth", search: { mode, redirect: "/trading/fx" } }); return; }
    if (placing || !config || !selectedExpiry) return;

    if (stake < config.minStake || stake > config.maxStake) {
      toast(`Stake must be between KSh ${config.minStake} and KSh ${config.maxStake}`);
      return;
    }

    const currentBalance = mode === "real" ? balance : (balance ?? config.demoStart);
    if (currentBalance !== null && currentBalance < stake) {
      toast(`Insufficient balance.`);
      setShowDeposit(true);
      return;
    }

    setPlacing(true);
    setTradeError(null);

    const { tp, sl } = computeTpSl();
    if (tp) setTpLinePrice(tp);
    if (sl) setSlLinePrice(sl);

    try {
      const q = quoteAt(pairObj!, nowSeconds());
      const entryPrice = roundToDigits(q.mid, pairObj!.digits);

      const result = await apiRequest<any>(`${API_URL}/games/bfx/trade`, {
        method: "POST",
        body: JSON.stringify({
          pair: pairObj.label, asset: pairObj.label, direction, stake,
          duration: selectedExpiry.seconds, expiry: selectedExpiry.seconds,
          mode, entryPrice,
        }),
      });

      if (result.success) {
        const now = Date.now();
        const expiresAtMs = new Date(result.expires_at).getTime();
        const durationSec = Math.max(1, Math.ceil((expiresAtMs - now) / 1000));

        activeTradeIdRef.current = result.trade.id;
        if (result.new_balance !== undefined) setBalance(result.new_balance);
        startTimer(durationSec);

        setMarkers((prev) => [...prev, {
          id: `pending-${result.trade.id}`, time: Math.floor(now / 1000), price: result.entry_price,
          type: direction === "up" ? "buy" : "sell", stake, status: "pending",
          remainingSeconds: durationSec, expiresAt: expiresAtMs,
        } as FxMarker]);
        fetchOpenTrades();
        toast.success(`${direction === "up" ? "UP" : "DOWN"} ${pairObj.label} · ${entryPrice.toFixed(pairObj!.digits)}`);
      } else {
        setTradeError(result.error || "Failed to place trade");
      }
    } catch (err: any) {
      setTradeError(err.message || "Failed to place trade");
    } finally { setPlacing(false); }
  };

  useEffect(() => {
    let pnl = 0, wins = 0, active = 0;
    const today = new Date().toDateString();
    for (const t of settledTrades) {
      if (new Date(t.opened_at).toDateString() === today) {
        if (t.status === "win") { wins++; pnl += Number(t.profit ?? 0); }
        else pnl -= Number(t.stake ?? 0);
      }
    }
    for (const t of openTrades) active++;
    setTodayPnl(pnl); setWinningTrades(wins); setActiveTrades(active);
  }, [settledTrades, openTrades]);

  const formatTime = (seconds: number | null) => {
    if (seconds === null) return "--:--";
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return mins > 0 ? `${mins}m ${secs}s` : `${secs}s`;
  };

  const payout = config?.payout ?? 0.5;
  const currentBalance = mode === "real" ? balance : (balance ?? config?.demoStart ?? 10000);
  const bid = price ? roundToDigits(quoteAt(pairObj, nowSeconds()).bid, pairObj.digits) : 0;
  const ask = price ? roundToDigits(quoteAt(pairObj, nowSeconds()).ask, pairObj.digits) : 0;
  const spread = bid && ask ? roundToDigits(ask - bid, pairObj.digits) : 0;

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-white">
        <div className="w-8 h-8 border-2 border-[#1565c0] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen bg-[#f8f9fa] text-[#1e293b] font-sans">
      
      {/* ─── Top Header (MT5 Style) ─── */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300 shadow-sm">
        <div className="flex items-center gap-2">
          <Link to="/trading" className="text-gray-500 hover:text-black"><ArrowLeft size={20} /></Link>
          <div>
            <h1 className="text-sm font-bold flex items-center gap-1">
              Pesaki FX 
              <span className={`text-[9px] px-1.5 py-0.5 rounded font-bold uppercase ${mode === 'real' ? 'bg-red-100 text-red-700' : 'bg-green-100 text-green-700'}`}>
                {mode}
              </span>
            </h1>
          </div>
        </div>
        <div className="flex items-center gap-4 text-xs font-mono">
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Balance</div>
            <div className="font-semibold">{currentBalance !== null ? `${formatKes(currentBalance)}` : "—"}</div>
          </div>
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wider">Equity</div>
            <div className={`font-semibold ${todayPnl >= 0 ? "text-[#2e7d32]" : "text-[#c62828]"}`}>
              {formatKes(currentBalance + todayPnl)}
            </div>
          </div>
        </div>
      </div>

      {/* ─── Top Action Bar (SELL | Lot | BUY) ─── */}
      <div className="flex bg-white border-b border-gray-300 select-none">
        <button
          onClick={() => placeTrade("down")}
          disabled={placing || !price || tradeActive}
          className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] text-white py-2 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
        >
          <span className="text-[10px] font-bold tracking-wider">SELL</span>
          <span className="text-sm font-mono font-bold leading-tight">{bid.toFixed(pairObj.digits)}</span>
        </button>

        <div className="flex-1 flex flex-col items-center justify-center bg-white border-x border-gray-200">
           <div className="text-[9px] text-gray-500 font-semibold mb-0.5">Volume</div>
           <div className="flex items-center justify-between w-full px-2">
             <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="px-2 text-gray-500 hover:text-black font-bold">-</button>
             <input
               type="number"
               step="0.01"
               value={lots}
               onChange={(e) => setLots(Math.max(0.01, Number(e.target.value)))}
               className="w-12 text-center text-sm font-bold focus:outline-none bg-transparent"
             />
             <button onClick={() => setLots(lots + 0.01)} className="px-2 text-gray-500 hover:text-black font-bold">+</button>
           </div>
           <div className="text-[8px] text-gray-400 mt-0.5">~ KSh {formatKes(stake)}</div>
        </div>

        <button
          onClick={() => placeTrade("up")}
          disabled={placing || !price || tradeActive}
          className="flex-1 bg-[#1565c0] hover:bg-[#0d47a1] text-white py-2 flex flex-col items-center justify-center transition-colors disabled:opacity-50"
        >
          <span className="text-[10px] font-bold tracking-wider">BUY</span>
          <span className="text-sm font-mono font-bold leading-tight">{ask.toFixed(pairObj.digits)}</span>
        </button>
      </div>

      {/* ─── Chart Section ─── */}
      <div className="flex-1 flex flex-col bg-white">
        {/* Chart Header */}
        <div className="flex items-center justify-between px-2 py-1 bg-[#f1f3f4] border-b border-gray-300">
          <div className="flex items-center gap-2">
            <span className="font-bold text-sm text-[#0f172a]">{selectedPair}</span>
            <span className="text-[10px] text-gray-500">{pairObj.name}</span>
          </div>
          <div className="flex items-center gap-1">
            {["M1", "M5", "M15", "H1", "H4"].map((tf) => (
              <button
                key={tf}
                onClick={() => setSelectedTimeframe(tf as TF)}
                className={`px-2 py-0.5 text-[11px] font-bold rounded-sm border ${
                  selectedTimeframe === tf
                    ? "bg-white border-gray-400 shadow-sm text-black"
                    : "border-transparent text-gray-500 hover:bg-gray-200"
                }`}
              >
                {tf}
              </button>
            ))}
            <button className="ml-2 p-1 text-gray-500 hover:text-black"><Settings size={14} /></button>
          </div>
        </div>

        {/* Chart Canvas */}
        <div className="flex-1 relative min-h-[300px]">
          {data.length > 0 ? (
            <ForexChart
              data={data}
              markers={markers}
              theme={"light" as Theme}
              currentPrice={price || undefined}
              tp={tpLinePrice}
              sl={slLinePrice}
              onTpChange={setTpLinePrice}
              onSlChange={setSlLinePrice}
              pairDigits={pairObj.digits}
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <Activity className="animate-pulse text-[#1565c0]" size={32} />
            </div>
          )}

          {/* Countdown Timer Overlay */}
          {tradeActive && timeRemaining !== null && timeRemaining > 0 && (
            <div className="absolute top-2 right-2 bg-white border border-gray-300 shadow-md rounded px-2 py-1 flex items-center gap-1.5">
              <span className="relative flex h-2 w-2">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-2 w-2 bg-red-500"></span>
              </span>
              <span className="font-mono text-xs font-bold text-black">{formatTime(timeRemaining)}</span>
            </div>
          )}
        </div>
      </div>

      {/* ─── Order Ticket (Bottom Sheet Style) ─── */}
      <div className="bg-white border-t border-gray-300 shadow-[0_-4px_6px_-1px_rgba(0,0,0,0.05)] z-10">
        <div 
          className="flex items-center justify-between px-3 py-2 bg-[#f8f9fa] border-b border-gray-200 cursor-pointer"
          onClick={() => setShowTradePanel(!showTradePanel)}
        >
          <h3 className="text-xs font-bold text-gray-700 uppercase">Order Ticket</h3>
          <div className="flex items-center gap-2">
             <span className="text-[10px] text-gray-500">Spread: <span className="font-mono font-bold text-black">{spread.toFixed(pairObj.digits)}</span></span>
             {showTradePanel ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
          </div>
        </div>

        {showTradePanel && (
          <div className="p-3 grid grid-cols-2 gap-3 pb-8">
            {/* TP / SL Inputs */}
            <div className="col-span-2 grid grid-cols-2 gap-2">
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase mb-1">
                  <Target size={10} className="text-[#2e7d32]" /> Stop Loss
                </label>
                <input
                  type="number" step={Math.pow(10, -pairObj.digits)} value={slPrice}
                  onChange={(e) => setSlPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder={slLinePrice?.toFixed(pairObj.digits) || "Price"}
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[#2e7d32]"
                />
              </div>
              <div>
                <label className="flex items-center gap-1 text-[10px] font-bold text-gray-500 uppercase mb-1">
                  <StopCircle size={10} className="text-[#c62828]" /> Take Profit
                </label>
                <input
                  type="number" step={Math.pow(10, -pairObj.digits)} value={tpPrice}
                  onChange={(e) => setTpPrice(e.target.value === "" ? "" : Number(e.target.value))}
                  placeholder={tpLinePrice?.toFixed(pairObj.digits) || "Price"}
                  className="w-full bg-white border border-gray-300 rounded px-2 py-1.5 text-sm font-mono focus:outline-none focus:border-[#c62828]"
                />
              </div>
            </div>

            {/* Expiry */}
            <div className="col-span-2">
              <label className="block text-[10px] font-bold text-gray-500 uppercase mb-1">Expiration Time</label>
              <div className="flex gap-1 overflow-x-auto pb-1">
                {config?.expiries.map((d) => (
                  <button
                    key={d.label} onClick={() => setSelectedExpiry(d)}
                    className={`px-3 py-1.5 rounded text-[11px] font-bold whitespace-nowrap border ${
                      selectedExpiry?.label === d.label
                        ? "bg-[#e3f2fd] border-[#1565c0] text-[#1565c0]"
                        : "bg-white border-gray-300 text-gray-600"
                    }`}
                  >
                    {d.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* ─── Bottom Positions / History Tabs ─── */}
      <div className="bg-white border-t border-gray-300">
        <div className="flex border-b border-gray-200 bg-[#f8f9fa]">
          <button
            onClick={() => setActiveView("positions")}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeView === "positions" ? "border-[#1565c0] text-[#1565c0]" : "border-transparent text-gray-500"
            }`}
          >
            Positions ({openTrades.length})
          </button>
          <button
            onClick={() => setActiveView("history")}
            className={`flex-1 py-2 text-xs font-bold border-b-2 transition-colors ${
              activeView === "history" ? "border-[#1565c0] text-[#1565c0]" : "border-transparent text-gray-500"
            }`}
          >
            History
          </button>
        </div>

        <div className="overflow-y-auto max-h-48 bg-white">
          {activeView === "positions" ? (
            openTrades.length === 0 ? (
              <div className="p-6 text-center text-gray-400 text-xs">
                No open positions.
              </div>
            ) : (
              <div className="divide-y divide-gray-100">
                {openTrades.map((t) => {
                  const remaining = Math.max(0, Math.ceil((new Date(t.expires_at).getTime() - Date.now()) / 1000));
                  return (
                    <div key={t.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                      <div className="flex items-center gap-2">
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white ${t.direction === "up" ? "bg-[#1565c0]" : "bg-[#c62828]"}`}>
                          {t.direction === "up" ? "BUY" : "SELL"}
                        </span>
                        <div>
                          <div className="font-bold text-xs text-black">{t.asset}</div>
                          <div className="text-[10px] text-gray-500 font-mono">Vol: {(t.stake / LOT_SIZE_KSH).toFixed(2)}</div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-mono text-xs text-black">{t.entry_price.toFixed(pairObj.digits)}</div>
                        <div className="text-[10px] text-gray-500 font-mono">{formatTime(remaining)}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )
          ) : (
            <div className="divide-y divide-gray-100">
              {settledTrades.map((t) => (
                <div key={t.id} className="flex items-center justify-between p-3 hover:bg-gray-50">
                  <div className="flex items-center gap-2">
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded text-white ${t.status === "win" ? "bg-[#2e7d32]" : "bg-[#c62828]"}`}>
                      {t.status === "win" ? "WIN" : "LOSS"}
                    </span>
                    <div>
                      <div className="font-bold text-xs text-black">{t.asset}</div>
                      <div className="text-[9px] text-gray-500">{new Date(t.opened_at).toLocaleTimeString()}</div>
                    </div>
                  </div>
                  <div className={`font-mono text-xs font-bold ${t.status === "win" ? "text-[#2e7d32]" : "text-[#c62828]"}`}>
                    {t.status === "win" ? "+" : "-"}KSh {formatKes(t.status === "win" ? t.profit : t.stake)}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDeposit && (
        <DepositSheet user={user} onClose={() => setShowDeposit(false)} onDepositComplete={fetchBalance} />
      )}
    </div>
  );
}
