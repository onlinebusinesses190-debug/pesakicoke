import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, Component, ReactNode } from "react";
import { Plane, Loader2 } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import { apiRequest } from "@/utils/api";
// import { ModeToggle } from "@/components/dashboard/ModeToggle";  // ⬅️ COMMENTED OUT
import { AviatorCanvas } from "@/components/aviator/AviatorCanvas";

type GameStatus = "WAITING" | "FLYING" | "CRASHED";

const API_URL = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// ── Error Boundary ──────────────────────────────────────────────────────────────
class ErrorBoundary extends Component<{ children: ReactNode }> {
  state = { error: null as Error | null };
  static getDerivedStateFromError(error: Error) {
    return { error };
  }
  render() {
    if (this.state.error) {
      return (
        <div className="p-4 text-white bg-red-900/50 border border-red-500 rounded-xl m-4">
          <h2 className="text-xl font-bold">Something went wrong:</h2>
          <pre className="text-sm whitespace-pre-wrap mt-2">{this.state.error.message}</pre>
          <pre className="text-xs text-gray-400 mt-2">{this.state.error.stack}</pre>
        </div>
      );
    }
    return this.props.children;
  }
}

export const Route = createFileRoute("/trading/aviator")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: () => (
    <ErrorBoundary>
      <AviatorPage />
    </ErrorBoundary>
  ),
});

function AviatorPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode = search.mode === "real" ? "real" : "demo";

  const [status, setStatus] = useState<GameStatus>("WAITING");
  const [multiplier, setMultiplier] = useState(1.0);
  const [betAmount, setBetAmount] = useState(10);
  const [cashedOut, setCashedOut] = useState(false);
  const [cashOutMultiplier, setCashOutMultiplier] = useState(0);
  const [history, setHistory] = useState<number[]>([]);
  const [isBetting, setIsBetting] = useState(false);
  const [waitTime, setWaitTime] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const multiplierRef = useRef(1.0);

  // ── Auth check ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) {
          navigate({ to: "/auth" });
        }
      } catch (err) {
        console.error("Auth check failed", err);
      }
    };
    checkAuth();
  }, [navigate]);

  // ── Place bet (Allocation) ────────────────────────────────────────────────
  const placeBet = async () => {
    if (status !== "WAITING" || isBetting) return;
    setIsBetting(true);
    try {
      await apiRequest("/games/aviator/bet", {
        method: "POST",
        body: JSON.stringify({ amount: betAmount, mode }),
      });
    } catch (err: any) {
      alert(err.message || "Failed to place allocation");
      setIsBetting(false);
    }
  };

  // ── Cash out ───────────────────────────────────────────────────────────────
  const handleCashOut = () => {
    if (status !== "FLYING" || cashedOut || !socketRef.current) return;
    socketRef.current.emit("CASHOUT");
  };

  // ── WebSocket connection ──────────────────────────────────────────────────
  useEffect(() => {
    const supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY
    );

    const initGame = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return;

        const socket = io(`${API_URL}/aviator`, {
          transports: ["websocket"],
          reconnection: true,
          reconnectionAttempts: 5,
          reconnectionDelay: 1000,
          auth: { token: session.access_token },
        });

        socketRef.current = socket;

        socket.on("connect", () => console.log("Aviator socket connected"));
        socket.on("connect_error", (err) => console.error("Aviator socket error:", err));
        socket.on("disconnect", (reason) => console.warn("Aviator socket disconnected:", reason));

        socket.on("ROUND_WAITING", (data) => {
          setStatus("WAITING");
          setMultiplier(1.0);
          multiplierRef.current = 1.0;
          setWaitTime(data.waitTime / 1000);
          setCashedOut(false);
          setIsBetting(false);
          apiRequest("/wallet/balance").then(res => setBalance(res.balance)).catch(() => {});
        });

        socket.on("ROUND_START", () => {
          setStatus("FLYING");
          setWaitTime(0);
        });

        socket.on("MULTIPLIER_TICK", (data) => {
          const newMult = parseFloat(data.multiplier);
          setMultiplier(newMult);
          multiplierRef.current = newMult;
        });

        socket.on("ROUND_CRASHED", (data) => {
          setStatus("CRASHED");
          const finalMult = parseFloat(data.multiplier);
          setMultiplier(finalMult);
          multiplierRef.current = finalMult;
          setHistory((prev) => [finalMult, ...prev.slice(0, 19)]);
          apiRequest("/wallet/balance").then(res => setBalance(res.balance)).catch(() => {});
        });

        socket.on("CASHED_OUT", (data) => {
          setCashedOut(true);
          setCashOutMultiplier(data.multiplier);
          apiRequest("/wallet/balance").then(res => setBalance(res.balance)).catch(() => {});
        });

        socket.on("error", (err) => console.error("Socket error:", err));

        apiRequest("/wallet/balance").then(res => setBalance(res.balance)).catch(() => {});
      } catch (err) {
        console.error("Failed to initialize game", err);
      }
    };

    initGame();

    return () => {
      socketRef.current?.disconnect();
    };
  }, []);

  // ── Render ────────────────────────────────────────────────────────────────────
  const recentHistory = history.slice(0, 6);
  const isFlying = status === "FLYING";
  const isWaiting = status === "WAITING";
  const displayMultiplier = multiplier.toFixed(2);

  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Plane className="text-red-500" /> Aviator
        </h1>
        {/* <ModeToggle />  ⬅️ COMMENTED OUT */}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 relative bg-[#0f0f1a] border border-white/10 rounded-3xl overflow-hidden">
          <div className="relative" style={{ height: "480px" }}>
            <div className="absolute top-4 left-1/2 -translate-x-1/2 z-20 text-6xl font-black text-white drop-shadow-lg">
              {displayMultiplier}x
            </div>
            <div className="absolute top-4 right-4 z-20 flex gap-2">
              {recentHistory.map((val, i) => (
                <div key={i} className="bg-black/50 backdrop-blur-sm px-2 py-1 rounded text-xs font-bold text-white border border-white/10">
                  {val.toFixed(2)}x
                </div>
              ))}
            </div>
            <AviatorCanvas multiplier={multiplier} gameState={status} roundHistory={history} />
            <AnimatePresence>
              {cashedOut && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                >
                  <div className="bg-green-500/20 backdrop-blur-sm px-8 py-4 rounded-2xl border border-green-500/50">
                    <span className="text-4xl font-black text-green-400">
                      🎉 +{(betAmount * cashOutMultiplier).toFixed(2)} KES
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        <div className="space-y-4">
          <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-4 text-center">
            <div className="text-sm text-gray-400 uppercase tracking-wider">
              {isWaiting ? "Next round in" : isFlying ? "Round in progress" : "Crashed"}
            </div>
            <div className="text-2xl font-bold text-white">
              {isWaiting ? `${Math.ceil(waitTime)}s` : isFlying ? "🔴 LIVE" : "💥 CRASHED"}
            </div>
          </div>

          {balance !== null && (
            <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3 text-center">
              <span className="text-sm text-gray-400">Balance: </span>
              <span className="text-lg font-bold text-white">{balance.toFixed(2)} KES</span>
            </div>
          )}

          <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-4">
            <label className="text-xs uppercase tracking-wider text-gray-400 block mb-2">Allocation Amount</label>
            <div className="flex flex-wrap gap-2 mb-3">
              {[10, 100, 500, 200, 10000].map((v) => (
                <button
                  key={v}
                  onClick={() => setBetAmount(v)}
                  disabled={isBetting || isFlying}
                  className={`px-3 py-1.5 rounded-lg text-sm font-bold transition-all ${
                    betAmount === v ? "bg-[#dcb13c] text-black" : "bg-white/5 text-gray-300 hover:bg-white/10"
                  } disabled:opacity-50`}
                >
                  {v}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={betAmount}
              onChange={(e) => setBetAmount(Number(e.target.value) || 0)}
              disabled={isBetting || isFlying}
              className="w-full bg-black/50 border border-white/10 rounded-xl px-4 py-2.5 text-center text-lg font-bold text-white focus:outline-none focus:ring-2 focus:ring-[#dcb13c] disabled:opacity-40"
            />
          </div>

          <div className="mt-auto">
            {isFlying && !cashedOut && isBetting ? (
              <button
                onClick={handleCashOut}
                className="w-full h-16 bg-orange-500 hover:bg-orange-400 text-black font-black text-xl rounded-xl shadow-[0_0_30px_rgba(249,115,22,0.4)] transition-all active:scale-95 flex flex-col items-center justify-center"
              >
                <span>REALIZE GAIN</span>
                <span className="text-sm font-medium opacity-80">{(betAmount * multiplier).toFixed(2)} KES</span>
              </button>
            ) : (
              <button
                onClick={placeBet}
                disabled={!isWaiting || isBetting}
                className="w-full h-16 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-black text-xl rounded-xl shadow-[0_0_30px_rgba(22,163,74,0.4)] transition-all active:scale-95 flex items-center justify-center gap-2"
              >
                {isBetting ? <Loader2 className="animate-spin" /> : "ALLOCATE"}
              </button>
            )}
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs text-gray-500">
            <div className="bg-[#0f0f1a] border border-white/10 rounded-xl p-2 text-center">
              <span className="block">This round</span>
              <span className="text-white font-bold">{multiplier.toFixed(2)}x</span>
            </div>
            <div className="bg-[#0f0f1a] border border-white/10 rounded-xl p-2 text-center">
              <span className="block">Best</span>
              <span className="text-white font-bold">{history.length > 0 ? Math.max(...history).toFixed(2) : '--'}x</span>
            </div>
          </div>
        </div>
      </div>

      <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-4">
        <div className="flex items-center gap-2 text-sm text-gray-400">
          <span>Recent crashes: </span>
          <div className="flex gap-2 flex-wrap">
            {history.slice(0, 10).map((val, i) => (
              <span key={i} className="px-2 py-0.5 bg-white/5 rounded text-xs text-white">
                {val.toFixed(2)}x
              </span>
            ))}
            {history.length === 0 && <span className="text-gray-600">No history yet</span>}
          </div>
        </div>
      </div>
    </div>
  );
}
