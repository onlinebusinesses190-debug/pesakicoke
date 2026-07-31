import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useState, useEffect, useRef, useCallback } from "react";
import { ArrowUp, ArrowDown, Loader2, TrendingUp, ArrowLeft, PlusCircle } from "lucide-react";
import { createClient } from "@supabase/supabase-js";
import { io, Socket } from "socket.io-client";
import { apiRequest } from "@/utils/api";

type RoundState = "open" | "locked" | "result";

interface UpDownRound {
  id: string;
  market: string;
  entryPrice: number;
  closePrice: number | null;
  direction: "up" | "down" | null;
  state: RoundState;
  opensAt: string;
  locksAt: string;
  resultsAt: string;
}

interface HistoryEntry {
  roundId: string;
  direction: "up" | "down" | null;
  entryPrice: number;
  closePrice: number;
  settledAt: string;
}

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";
const WS_URL = import.meta.env.VITE_WEBSOCKET_URL || "https://pesaki-server.onrender.com";
const AMOUNT_PRESETS = ["50", "100", "200", "500"];
const TOTAL_SECONDS = 10;
const DEMO_BALANCE_KEY = "pesaki_updown_demo_balance";
const INITIAL_DEMO_BALANCE = 10000;

function CountdownRing({ secondsLeft, total = TOTAL_SECONDS }: { secondsLeft: number; total?: number }) {
  const r = 40;
  const circ = 2 * Math.PI * r;
  const pct = Math.max(0, secondsLeft / total);
  const dash = pct * circ;
  const color = secondsLeft <= 3 ? "#ef4444" : secondsLeft <= 6 ? "#f59e0b" : "#10b981";

  return (
    <div className="relative flex items-center justify-center" style={{ width: 100, height: 100 }}>
      <svg width="100" height="100" className="-rotate-90" style={{ position: "absolute" }}>
        <circle cx="50" cy="50" r={r} fill="none" stroke="rgba(255,255,255,0.08)" strokeWidth="6" />
        <circle
          cx="50"
          cy="50"
          r={r}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeDasharray={`${dash} ${circ}`}
          strokeLinecap="round"
          style={{ transition: "stroke-dasharray 0.9s linear, stroke 0.5s ease" }}
        />
      </svg>
      <span className="text-3xl font-black text-white tabular-nums z-10">{secondsLeft}</span>
    </div>
  );
}

export const Route = createFileRoute("/trading/up-down")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: UpDownGame,
});

function UpDownGame() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode = search.mode === "real" ? "real" : "demo";

  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [round, setRound] = useState<UpDownRound | null>(null);
  const [secondsLeft, setSecondsLeft] = useState(0);
  const [history, setHistory] = useState<HistoryEntry[]>([]);
  const [lastResult, setLastResult] = useState<{
    direction: "up" | "down" | null;
    entryPrice: number;
    closePrice: number;
    userWon: boolean | null;
    profit: number | null;
  } | null>(null);
  const [myPosition, setMyPosition] = useState<{ direction: "up" | "down"; amount: number } | null>(null);
  const [amount, setAmount] = useState("100");
  const [executingOrder, setExecutingOrder] = useState(false);
  const [balance, setBalance] = useState<number | null>(null);
  const [updatingBalance, setUpdatingBalance] = useState(false);
  const [flash, setFlash] = useState<"up" | "down" | null>(null);

  const currentRoundIdRef = useRef<string | null>(null);
  const isDemo = mode === "demo";

  // ── Demo balance ──────────────────────────────────────────────────────────
  const [demoBalance, setDemoBalance] = useState<number>(() => {
    const saved = localStorage.getItem(DEMO_BALANCE_KEY);
    return saved ? parseFloat(saved) : INITIAL_DEMO_BALANCE;
  });

  const updateDemoBalance = (newBalance: number) => {
    setDemoBalance(newBalance);
    localStorage.setItem(DEMO_BALANCE_KEY, String(newBalance));
  };

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

  // ── Fetch real balance ──────────────────────────────────────────────────
  const fetchRealBalance = async () => {
    if (mode !== "real") return;
    try {
      setUpdatingBalance(true);
      const data = await apiRequest("/wallet/balance");
      setBalance(data.balance || 0);
    } catch (err) {
      console.error("Failed to fetch real balance:", err);
      setBalance(0);
    } finally {
      setUpdatingBalance(false);
    }
  };

  useEffect(() => {
    if (mode === "real") fetchRealBalance();
  }, [mode]);

  // ── WebSocket connection (using WS_URL) ──────────────────────────────────
  useEffect(() => {
    let socket: Socket;

    const connect = async () => {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL,
        import.meta.env.VITE_SUPABASE_ANON_KEY
      );
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.access_token) return;

      // ✅ Use WS_URL for WebSocket
      socket = io(`${WS_URL}/updown`, {
        transports: ["websocket"],
        auth: { token: session.access_token },
      });

      socketRef.current = socket;

      socket.on("connect", () => setConnected(true));
      socket.on("disconnect", () => setConnected(false));

      socket.on("SYNC_STATE", (data) => {
        setRound(data.round);
        setSecondsLeft(data.secondsLeft);
        setHistory(data.history || []);
        if (data.round && data.round.id !== currentRoundIdRef.current) {
          currentRoundIdRef.current = data.round.id;
          setMyPosition(null);
        }
      });

      socket.on("UPDOWN_ROUND_OPEN", (data) => {
        setRound({
          id: data.roundId,
          market: data.market,
          entryPrice: data.entryPrice,
          closePrice: null,
          direction: null,
          state: "open",
          opensAt: data.opensAt,
          locksAt: data.locksAt,
          resultsAt: new Date(new Date(data.locksAt).getTime() + 2000).toISOString(),
        });
        setSecondsLeft(data.duration);
        setLastResult(null);
        setFlash(null);
        if (data.roundId !== currentRoundIdRef.current) {
          currentRoundIdRef.current = data.roundId;
          setMyPosition(null);
        }
      });

      socket.on("UPDOWN_COUNTDOWN", (data) => setSecondsLeft(data.secondsLeft));

      socket.on("UPDOWN_ROUND_LOCKED", () => {
        setRound((prev) => (prev ? { ...prev, state: "locked" } : null));
        setSecondsLeft(0);
      });

      socket.on("UPDOWN_ROUND_RESULT", (data) => {
        let winningDirection: "up" | "down" | null = data.direction || null;
        if (data.totalUp !== undefined && data.totalDown !== undefined) {
          const minorityIsUp = data.totalUp < data.totalDown;
          winningDirection = minorityIsUp ? "up" : "down";
        }

        setRound((prev) =>
          prev
            ? {
                ...prev,
                state: "result",
                closePrice: data.closePrice,
                direction: winningDirection,
              }
            : null
        );

        const userWon = myPosition && winningDirection ? myPosition.direction === winningDirection : false;
        const profit = userWon && myPosition ? myPosition.amount * 0.5 : null;

        setLastResult({
          direction: winningDirection,
          entryPrice: data.entryPrice,
          closePrice: data.closePrice,
          userWon: userWon ?? null,
          profit: profit ?? null,
        });

        // ✅ Update demo balance if in demo mode
        if (isDemo && myPosition) {
          const newBalance = demoBalance + (userWon ? profit || 0 : 0);
          updateDemoBalance(newBalance);
        }

        if (winningDirection) {
          setFlash(winningDirection);
          setTimeout(() => setFlash(null), 1800);
        }

        setHistory((prev) => {
          const entry: HistoryEntry = {
            roundId: data.roundId,
            direction: winningDirection,
            entryPrice: data.entryPrice,
            closePrice: data.closePrice,
            settledAt: new Date().toISOString(),
          };
          return [entry, ...prev].slice(0, 20);
        });

        // Refresh balance after result (real mode)
        if (mode === "real") fetchRealBalance();
      });

      socket.on("POSITION_CONFIRMED", (data) => {
        setMyPosition({ direction: data.direction as "up" | "down", amount: data.amount });
        if (mode === "real") {
          setBalance(data.newBalance);
        }
        setExecutingOrder(false);
      });

      socket.on("ORDER_REJECTED", (data) => {
        alert(data.error || "Order rejected");
        setExecutingOrder(false);
      });
    };

    connect();

    return () => socket?.disconnect();
  }, [mode]);

  // ── Handle order ──────────────────────────────────────────────────────────
  const handleOrder = useCallback(
    (direction: "up" | "down") => {
      if (!socketRef.current || !round || round.state !== "open" || myPosition || executingOrder) return;
      const stake = Number(amount);
      if (isNaN(stake) || stake <= 0) return;

      if (isDemo) {
        if (demoBalance < stake) {
          alert("Insufficient demo balance!");
          return;
        }
        updateDemoBalance(demoBalance - stake);
        // Send the order to the backend (so it tracks it for demo mode)
        socketRef.current.emit("PLACE_POSITION", {
          roundId: round.id,
          direction,
          amount: stake,
          mode: "demo",
        });
        // The backend will return the result; we'll update demo balance in the result handler.
      } else {
        setExecutingOrder(true);
        socketRef.current.emit("PLACE_POSITION", {
          roundId: round.id,
          direction,
          amount: stake,
          mode: "real",
        });
      }
    },
    [round, myPosition, executingOrder, amount, mode, demoBalance]
  );

  const priceChange =
    round?.closePrice != null && round.entryPrice
      ? (((round.closePrice - round.entryPrice) / round.entryPrice) * 100).toFixed(3)
      : null;

  const canPlaceOrder = round?.state === "open" && !myPosition && !executingOrder && connected;

  // ── Toggle mode ────────────────────────────────────────────────────────────
  const setMode = (newMode: "demo" | "real") => {
    navigate({
      search: (prev: any) => ({ ...prev, mode: newMode }),
    });
  };

  const currentBalance = isDemo ? demoBalance : balance;

  return (
    <>
      <div
        className="fixed inset-0 pointer-events-none z-10 transition-opacity duration-700"
        style={{
          background:
            flash === "up"
              ? "rgba(16,185,129,0.12)"
              : flash === "down"
              ? "rgba(239,68,68,0.12)"
              : "transparent",
          opacity: flash ? 1 : 0,
        }}
      />

      <div className="space-y-4 max-w-2xl mx-auto pb-8">
        {/* Header with back arrow, mode toggle, balance */}
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <div className="flex items-center gap-2">
            <Link
              to="/trading"
              className="text-gray-400 hover:text-white transition-colors"
              title="Back to Trading Hub"
            >
              <ArrowLeft size={24} />
            </Link>
            <h1 className="text-2xl font-black text-white flex items-center gap-2">
              <TrendingUp className="text-emerald-400" size={24} /> Up & Down
            </h1>
            {/* Mode toggle on the left */}
            <div className="flex items-center gap-0.5 bg-[#181d29] p-0.5 rounded-lg text-[10px] md:text-xs font-medium ml-1">
              <button
                onClick={() => setMode("demo")}
                className={`px-2 py-0.5 md:px-3 md:py-1 rounded-md transition-all ${
                  isDemo
                    ? "bg-[#dcb13c] text-black"
                    : "text-gray-400 hover:text-white hover:bg-[#202636]"
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => setMode("real")}
                className={`px-2 py-0.5 md:px-3 md:py-1 rounded-md transition-all ${
                  !isDemo
                    ? "bg-[#dcb13c] text-black"
                    : "text-gray-400 hover:text-white hover:bg-[#202636]"
                }`}
              >
                Real
              </button>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Balance + Deposit */}
            <div className="flex items-center gap-1 bg-[#181d29] px-2 py-1 rounded-lg text-xs">
              <span className="text-gray-500">{isDemo ? "Demo" : "Bal"}:</span>
              <span className="font-bold text-white">
                {currentBalance !== null ? currentBalance.toFixed(2) : "0.00"} KES
              </span>
              {updatingBalance && <span className="text-gray-400 text-[8px] animate-pulse">⋯</span>}
            </div>
            {!isDemo && (
              <Link
                to="/wallet"
                className="flex items-center gap-0.5 bg-green-600 hover:bg-green-500 text-white text-[10px] md:text-xs font-bold px-2 py-1 rounded-lg transition-colors"
              >
                <PlusCircle size={14} className="h-3 w-3 md:h-4 md:w-4" /> Deposit
              </Link>
            )}
            <span className="text-[8px] md:text-[10px] text-gray-400 hidden sm:inline">
              {isDemo ? "🎮 FUN" : "🔴 REAL"}
            </span>
            {/* Connection status dot */}
            <div className={`w-2 h-2 rounded-full ${connected ? "bg-emerald-400" : "bg-red-500"}`} />
          </div>
        </div>

        {/* History pills */}
        <div className="flex gap-1.5 overflow-x-auto pb-1 no-scrollbar">
          {history.length === 0 && (
            <span className="text-xs text-zinc-600 italic px-1">No results yet</span>
          )}
          {[...history]
            .reverse()
            .slice(0, 10)
            .map((h, i) => (
              <div
                key={i}
                className={`flex-shrink-0 w-8 h-8 rounded-full flex items-center justify-center border font-bold text-xs ${
                  h.direction === "up"
                    ? "bg-emerald-500/20 border-emerald-500/50 text-emerald-400"
                    : h.direction === "down"
                    ? "bg-red-500/20 border-red-500/50 text-red-400"
                    : "bg-zinc-500/20 border-zinc-500/50 text-zinc-400"
                }`}
              >
                {h.direction === "up" ? "↑" : h.direction === "down" ? "↓" : "–"}
              </div>
            ))}
        </div>

        {/* Main Game Card */}
        <div className="bg-[#0f0f1a] border border-white/10 rounded-3xl overflow-hidden shadow-2xl">
          {/* State banner */}
          <div
            className={`px-4 py-2 text-center text-xs font-bold uppercase tracking-widest ${
              round?.state === "open"
                ? "bg-emerald-500/20 text-emerald-400"
                : round?.state === "locked"
                ? "bg-amber-500/20 text-amber-400"
                : "bg-indigo-500/20 text-indigo-400"
            }`}
          >
            {round?.state === "open"
              ? "🟢 Accepting orders"
              : round?.state === "locked"
              ? "🔒 Locked — fetching result..."
              : round?.state === "result"
              ? "📊 Round result"
              : "⏳ Waiting for round..."}
          </div>

          {/* Price + Timer */}
          <div className="p-6 flex flex-col items-center gap-4">
            <div className="text-xs uppercase tracking-widest text-zinc-500 font-bold">
              {round?.market ?? "USD/KES"}
            </div>

            <div className="text-5xl font-black text-white tabular-nums tracking-tighter">
              {round?.entryPrice != null ? round.entryPrice.toFixed(4) : "—"}
            </div>

            {round?.state === "result" && lastResult && (
              <div
                className={`flex flex-col items-center gap-1 ${
                  lastResult.direction === "up"
                    ? "text-emerald-400"
                    : lastResult.direction === "down"
                    ? "text-red-400"
                    : "text-zinc-400"
                }`}
              >
                <div className="flex items-center gap-2 text-4xl">
                  {lastResult.direction === "up" ? (
                    <ArrowUp size={48} strokeWidth={3} />
                  ) : lastResult.direction === "down" ? (
                    <ArrowDown size={48} strokeWidth={3} />
                  ) : (
                    <span className="text-2xl">—</span>
                  )}
                </div>
                <div className="text-sm font-mono">
                  {lastResult.entryPrice.toFixed(4)} → {lastResult.closePrice.toFixed(4)}
                  {priceChange && <span className="ml-1 opacity-60">({priceChange}%)</span>}
                </div>
                {lastResult.userWon !== null && (
                  <div
                    className={`mt-1 text-lg font-black px-4 py-1 rounded-full ${
                      lastResult.userWon
                        ? "bg-emerald-500/20 text-emerald-400"
                        : "bg-red-500/20 text-red-400"
                    }`}
                  >
                    {lastResult.userWon
                      ? `🎉 Profit: KES ${lastResult.profit?.toFixed(2) || "0"}`
                      : `😔 Loss: KES ${myPosition?.amount || 0}`}
                  </div>
                )}
              </div>
            )}

            {round?.state === "open" && <CountdownRing secondsLeft={secondsLeft} total={TOTAL_SECONDS} />}

            {round?.state === "locked" && (
              <div className="flex items-center gap-2 text-amber-400 animate-pulse">
                <Loader2 className="animate-spin" size={20} />
                <span className="text-sm font-bold">Fetching close price...</span>
              </div>
            )}

            {myPosition && (
              <div
                className={`px-4 py-1.5 rounded-full text-sm font-bold border ${
                  myPosition.direction === "up"
                    ? "bg-emerald-500/10 border-emerald-500/50 text-emerald-400"
                    : "bg-red-500/10 border-red-500/50 text-red-400"
                }`}
              >
                ✓ Position placed: {myPosition.direction.toUpperCase()} — KES {myPosition.amount}
              </div>
            )}
          </div>

          {/* Buttons */}
          <div className="grid grid-cols-2 gap-3 px-6 pb-4">
            <button
              onClick={() => handleOrder("up")}
              disabled={!canPlaceOrder}
              className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 text-lg font-black ${
                myPosition?.direction === "up"
                  ? "bg-emerald-500/30 border-emerald-500 text-emerald-300"
                  : canPlaceOrder
                  ? "bg-emerald-500/10 border-emerald-500/60 text-emerald-400 hover:bg-emerald-500/20"
                  : "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed opacity-50"
              }`}
            >
              {executingOrder && myPosition === null ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <ArrowUp size={28} strokeWidth={3} />
              )}
              UP
            </button>
            <button
              onClick={() => handleOrder("down")}
              disabled={!canPlaceOrder}
              className={`h-20 rounded-2xl border-2 flex flex-col items-center justify-center gap-1 transition-all duration-200 active:scale-95 text-lg font-black ${
                myPosition?.direction === "down"
                  ? "bg-red-500/30 border-red-500 text-red-300"
                  : canPlaceOrder
                  ? "bg-red-500/10 border-red-500/60 text-red-400 hover:bg-red-500/20"
                  : "bg-white/5 border-white/10 text-zinc-600 cursor-not-allowed opacity-50"
              }`}
            >
              {executingOrder && myPosition === null ? (
                <Loader2 className="animate-spin" size={20} />
              ) : (
                <ArrowDown size={28} strokeWidth={3} />
              )}
              DOWN
            </button>
          </div>

          {/* Amount */}
          <div className="px-6 pb-6 space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-zinc-500">Amount (KES)</span>
              <span className="text-xs text-zinc-500">
                Target Gain:{" "}
                <span className="text-white font-bold">KES {(Number(amount) * 0.5).toFixed(2)}</span>
              </span>
            </div>
            <div className="grid grid-cols-4 gap-2">
              {AMOUNT_PRESETS.map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAmount(amt)}
                  disabled={!!myPosition}
                  className={`py-2 rounded-xl text-sm font-bold border transition-all ${
                    amount === amt
                      ? "bg-indigo-500/20 border-indigo-500 text-indigo-400"
                      : "bg-white/5 border-white/5 text-zinc-400 hover:border-white/20"
                  } disabled:opacity-40 disabled:cursor-not-allowed`}
                >
                  {amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              disabled={!!myPosition}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-center text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:opacity-40"
            />
          </div>

          {/* Footer */}
          <div className="px-6 pb-5 flex items-center justify-between text-xs text-zinc-600">
            <span>Round outcome</span>
            {balance !== null && <span>Balance: KES {balance.toFixed(2)}</span>}
          </div>
        </div>
      </div>
    </>
  );
}
