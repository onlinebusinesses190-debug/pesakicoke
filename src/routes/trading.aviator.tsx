import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useRef, Component, ReactNode } from "react";
import { Plane, Loader2 } from "lucide-react";
import { io, Socket } from "socket.io-client";
import { motion, AnimatePresence } from "framer-motion";
import { createClient } from "@supabase/supabase-js";
import { apiRequest } from "@/utils/api";
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
  const [history, setHistory] = useState<number[]>([]);
  const [waitTime, setWaitTime] = useState(0);
  const [balance, setBalance] = useState<number | null>(null);

  // ── Allocation 1 state ──────────────────────────────────────────────────────
  const [betAmount1, setBetAmount1] = useState(10);
  const [isBetting1, setIsBetting1] = useState(false);
  const [cashedOut1, setCashedOut1] = useState(false);
  const [cashOutMultiplier1, setCashOutMultiplier1] = useState(0);

  // ── Allocation 2 state ──────────────────────────────────────────────────────
  const [betAmount2, setBetAmount2] = useState(10);
  const [isBetting2, setIsBetting2] = useState(false);
  const [cashedOut2, setCashedOut2] = useState(false);
  const [cashOutMultiplier2, setCashOutMultiplier2] = useState(0);

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

  // ── Place bet (Allocation 1) ──────────────────────────────────────────────
  const placeBet1 = async () => {
    if (status !== "WAITING" || isBetting1) return;
    setIsBetting1(true);
    try {
      await apiRequest("/games/aviator/bet", {
        method: "POST",
        body: JSON.stringify({ amount: betAmount1, mode }),
      });
    } catch (err: any) {
      alert(err.message || "Failed to place allocation 1");
      setIsBetting1(false);
    }
  };

  // ── Place bet (Allocation 2) ──────────────────────────────────────────────
  const placeBet2 = async () => {
    if (status !== "WAITING" || isBetting2) return;
    setIsBetting2(true);
    try {
      await apiRequest("/games/aviator/bet", {
        method: "POST",
        body: JSON.stringify({ amount: betAmount2, mode }),
      });
    } catch (err: any) {
      alert(err.message || "Failed to place allocation 2");
      setIsBetting2(false);
    }
  };

  // ── Cash out 1 ─────────────────────────────────────────────────────────────
  const handleCashOut1 = () => {
    if (status !== "FLYING" || cashedOut1 || !socketRef.current) return;
    socketRef.current.emit("CASHOUT");
  };

  // ── Cash out 2 ─────────────────────────────────────────────────────────────
  const handleCashOut2 = () => {
    if (status !== "FLYING" || cashedOut2 || !socketRef.current) return;
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
          setCashedOut1(false);
          setCashedOut2(false);
          setIsBetting1(false);
          setIsBetting2(false);
          setCashOutMultiplier1(0);
          setCashOutMultiplier2(0);
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
          if (isBetting1 && !cashedOut1) {
            setCashedOut1(true);
            setCashOutMultiplier1(data.multiplier);
          }
          if (isBetting2 && !cashedOut2) {
            setCashedOut2(true);
            setCashOutMultiplier2(data.multiplier);
          }
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

  // ── Toggle mode (plain JS, no router hooks) ─────────────────────────────
  const setMode = (newMode: "demo" | "real") => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.location.href = url.toString();
  };

  // ── Render ────────────────────────────────────────────────────────────────────
  const recentHistory = history.slice(0, 6);
  const isFlying = status === "FLYING";
  const isWaiting = status === "WAITING";
  const displayMultiplier = multiplier.toFixed(2);

  return (
    <div className="space-y-4 max-w-6xl mx-auto pb-8">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Plane className="text-red-500" /> Aviator
        </h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-gray-400 font-medium">
            {mode === "demo" ? "🎮 FUN MODE" : "🔴 REAL MODE"}
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-[#181d29] p-1 text-xs font-medium">
            <button
              onClick={() => setMode("demo")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "demo"
                  ? "bg-[#dcb13c] text-black"
                  : "text-gray-400 hover:text-white hover:bg-[#202636]"
              }`}
            >
              Demo
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-3 py-1.5 rounded-md transition-all ${
                mode === "real"
                  ? "bg-[#dcb13c] text-black"
                  : "text-gray-400 hover:text-white hover:bg-[#202636]"
              }`}
            >
              Real
            </button>
          </div>
        </div>
      </div>

      {/* Main game area – height reduced to 180px */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 relative bg-[#0f0f1a] border border-white/10 rounded-3xl overflow-hidden">
          <div className="relative" style={{ height: "180px" }}> {/* ⬅️ REDUCED TO 180px */}
            <div className="absolute top-1 left-1/2 -translate-x-1/2 z-20 text-3xl font-black text-white drop-shadow-lg">
              {displayMultiplier}x
            </div>
            <div className="absolute top-1 right-1 z-20 flex gap-1">
              {recentHistory.map((val, i) => (
                <div key={i} className="bg-black/50 backdrop-blur-sm px-1 py-0.5 rounded text-[8px] font-bold text-white border border-white/10">
                  {val.toFixed(2)}x
                </div>
              ))}
            </div>
            <AviatorCanvas multiplier={multiplier} gameState={status} roundHistory={history} />
            <AnimatePresence>
              {(cashedOut1 || cashedOut2) && (
                <motion.div
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  className="absolute inset-0 flex items-center justify-center pointer-events-none z-30"
                >
                  <div className="bg-green-500/20 backdrop-blur-sm px-4 py-2 rounded-2xl border border-green-500/50">
                    <span className="text-2xl font-black text-green-400">
                      🎉 +{(betAmount1 * cashOutMultiplier1 || betAmount2 * cashOutMultiplier2).toFixed(2)} KES
                    </span>
                  </div>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>

        {/* Right column: Two allocation panels side-by-side */}
        <div className="space-y-4">
          <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3 text-center">
            <div className="text-xs text-gray-400 uppercase tracking-wider">
              {isWaiting ? "Next round in" : isFlying ? "Round in progress" : "Crashed"}
            </div>
            <div className="text-xl font-bold text-white">
              {isWaiting ? `${Math.ceil(waitTime)}s` : isFlying ? "🔴 LIVE" : "💥 CRASHED"}
            </div>
          </div>

          {balance !== null && (
            <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3 text-center">
              <span className="text-sm text-gray-400">Balance: </span>
              <span className="text-lg font-bold text-white">{balance.toFixed(2)} KES</span>
            </div>
          )}

          <div className="grid grid-cols-2 gap-3">
            {/* Allocation 1 */}
            <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3">
              <div className="text-xs text-gray-400 mb-1">Allocation 1</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {[10, 100, 500, 200, 10000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setBetAmount1(v)}
                    disabled={isBetting1 || isFlying}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      betAmount1 === v ? "bg-[#dcb13c] text-black" : "bg-white/5 text-gray-300 hover:bg-white/10"
                    } disabled:opacity-50`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={betAmount1}
                onChange={(e) => setBetAmount1(Number(e.target.value) || 0)}
                disabled={isBetting1 || isFlying}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#dcb13c] disabled:opacity-40 mb-2"
              />
              {isFlying && !cashedOut1 && isBetting1 ? (
                <button
                  onClick={handleCashOut1}
                  className="w-full h-9 bg-orange-500 hover:bg-orange-400 text-black font-bold text-sm rounded-lg transition-all active:scale-95 flex flex-col items-center justify-center"
                >
                  <span>CASH OUT</span>
                  <span className="text-[10px] opacity-80">{(betAmount1 * multiplier).toFixed(2)} KES</span>
                </button>
              ) : (
                <button
                  onClick={placeBet1}
                  disabled={!isWaiting || isBetting1}
                  className="w-full h-9 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2"
                >
                  {isBetting1 ? <Loader2 className="animate-spin w-4 h-4" /> : "ALLOCATE"}
                </button>
              )}
              {cashedOut1 && (
                <div className="text-center text-xs text-green-400 mt-1">
                  Cashed out @ {cashOutMultiplier1.toFixed(2)}x
                </div>
              )}
            </div>

            {/* Allocation 2 */}
            <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3">
              <div className="text-xs text-gray-400 mb-1">Allocation 2</div>
              <div className="flex flex-wrap gap-1 mb-2">
                {[10, 100, 500, 200, 10000].map((v) => (
                  <button
                    key={v}
                    onClick={() => setBetAmount2(v)}
                    disabled={isBetting2 || isFlying}
                    className={`px-2 py-0.5 rounded text-[10px] font-bold transition-all ${
                      betAmount2 === v ? "bg-[#dcb13c] text-black" : "bg-white/5 text-gray-300 hover:bg-white/10"
                    } disabled:opacity-50`}
                  >
                    {v}
                  </button>
                ))}
              </div>
              <input
                type="number"
                value={betAmount2}
                onChange={(e) => setBetAmount2(Number(e.target.value) || 0)}
                disabled={isBetting2 || isFlying}
                className="w-full bg-black/50 border border-white/10 rounded-lg px-2 py-1.5 text-center text-sm font-bold text-white focus:outline-none focus:ring-1 focus:ring-[#dcb13c] disabled:opacity-40 mb-2"
              />
              {isFlying && !cashedOut2 && isBetting2 ? (
                <button
                  onClick={handleCashOut2}
                  className="w-full h-9 bg-orange-500 hover:bg-orange-400 text-black font-bold text-sm rounded-lg transition-all active:scale-95 flex flex-col items-center justify-center"
                >
                  <span>CASH OUT</span>
                  <span className="text-[10px] opacity-80">{(betAmount2 * multiplier).toFixed(2)} KES</span>
                </button>
              ) : (
                <button
                  onClick={placeBet2}
                  disabled={!isWaiting || isBetting2}
                  className="w-full h-9 bg-gradient-to-r from-green-600 to-emerald-500 hover:from-green-500 hover:to-emerald-400 disabled:opacity-50 disabled:cursor-not-allowed text-white font-bold text-sm rounded-lg flex items-center justify-center gap-2"
                >
                  {isBetting2 ? <Loader2 className="animate-spin w-4 h-4" /> : "ALLOCATE"}
                </button>
              )}
              {cashedOut2 && (
                <div className="text-center text-xs text-green-400 mt-1">
                  Cashed out @ {cashOutMultiplier2.toFixed(2)}x
                </div>
              )}
            </div>
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

      <div className="bg-[#0f0f1a] border border-white/10 rounded-2xl p-3">
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
