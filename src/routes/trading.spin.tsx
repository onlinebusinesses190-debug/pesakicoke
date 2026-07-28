import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Disc, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";

type AllocationOutcome = {
  id: number;
  name: string;
  value: number; // multiplier (0 = loss, 0.5 = half back, etc.)
  weight: number;
  color?: string;
};

const PRIZE_COLORS = [
  "#ef4444", // Loss - red
  "#f59e0b", // Cherry - amber
  "#10b981", // Lemon - green
  "#3b82f6", // Orange - blue
  "#8b5cf6", // Bell - purple
  "#f97316", // 7x7 - orange
  "#eab308", // Jackpot - yellow
];

export const Route = createFileRoute("/trading/spin")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: MarketGrowthPage,
});

function MarketGrowthPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode = search.mode === "real" ? "real" : "demo";

  const [outcomes, setOutcomes] = useState<AllocationOutcome[]>([]);
  const [loadingOutcomes, setLoadingOutcomes] = useState(true);
  const [executing, setExecuting] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [allocation, setAllocation] = useState("100");
  const [lastAdjustment, setLastAdjustment] = useState<{ name: string; amount: number } | null>(null);

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

  // ── Fetch outcomes ────────────────────────────────────────────────────────
  useEffect(() => {
    const fetchOutcomes = async () => {
      try {
        const data = await apiRequest("/games/spin/prizes");
        if (data.success && data.data) {
          setOutcomes(data.data);
        }
      } catch (err) {
        console.error("Failed to load outcomes:", err);
      } finally {
        setLoadingOutcomes(false);
      }
    };
    fetchOutcomes();
  }, []);

  // ── Execute spin ──────────────────────────────────────────────────────────
  const executeSelection = async () => {
    if (executing || outcomes.length === 0) return;
    setLastAdjustment(null);
    setExecuting(true);

    try {
      const data = await apiRequest("/games/spin/play", {
        method: "POST",
        body: JSON.stringify({ amount: Number(allocation), mode }),
      });

      const result = data.data;
      const outcomeSegmentIndex: number = result.prizeIndex;
      const segmentAngle = 360 / outcomes.length;
      const targetAngle =
        360 - (outcomeSegmentIndex * segmentAngle) - segmentAngle / 2;
      const fullSpins = 5 * 360;
      const finalRotation =
        rotation +
        fullSpins +
        ((targetAngle - (rotation % 360) + 360) % 360);

      setRotation(finalRotation);

      setTimeout(() => {
        setExecuting(false);
        setLastAdjustment({ name: result.prizeName, amount: result.winAmount });
      }, 5000);
    } catch (err: any) {
      alert(err.message || "Execution failed");
      setExecuting(false);
    }
  };

  // ── Build conic gradient ──────────────────────────────────────────────────
  const buildConicGradient = () => {
    if (outcomes.length === 0) return "conic-gradient(#333 0deg 360deg)";
    const segAngle = 360 / outcomes.length;
    const stops = outcomes.map((p, i) => {
      const color = PRIZE_COLORS[i % PRIZE_COLORS.length];
      return `${color} ${segAngle * i}deg ${segAngle * (i + 1)}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  };

  // ── Toggle mode (plain JS) ──────────────────────────────────────────────
  const setMode = (newMode: "demo" | "real") => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.location.href = url.toString();
  };

  // ── Loading state ─────────────────────────────────────────────────────────
  if (loadingOutcomes) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-purple-400" size={40} />
      </div>
    );
  }

  // ── Render ────────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-6xl mx-auto pb-8">
      {/* Header with mode toggle */}
      <div className="flex items-center justify-between">
        <h1 className="text-3xl font-bold text-white flex items-center gap-3">
          <Disc className="text-purple-500" /> Market Growth Selector
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

      {/* Main content */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-12 items-center">
        {/* Wheel */}
        <div className="relative flex justify-center items-center py-8">
          {/* Pointer */}
          <div className="absolute top-0 z-20 w-0 h-0 border-l-[20px] border-l-transparent border-t-[40px] border-t-white border-r-[20px] border-r-transparent drop-shadow-lg" />

          <div
            className="w-[300px] h-[300px] md:w-[400px] md:h-[400px] rounded-full relative overflow-hidden shadow-[0_0_50px_rgba(139,92,246,0.3)] border-4 border-white/20"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: executing
                ? "transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)"
                : "none",
            }}
          >
            <div
              className="absolute inset-0 w-full h-full rounded-full"
              style={{ background: buildConicGradient() }}
            />

            {outcomes.map((prize, i) => {
              const segAngle = 360 / outcomes.length;
              const rotate = segAngle * i + segAngle / 2;
              return (
                <div
                  key={i}
                  className="absolute inset-0 flex justify-center pt-8"
                  style={{ transform: `rotate(${rotate}deg)` }}
                >
                  <span className="text-white font-bold text-shadow rotate-180 writing-mode-vertical text-xs md:text-sm tracking-wider drop-shadow-md whitespace-nowrap">
                    {prize.name}
                  </span>
                </div>
              );
            })}
          </div>

          {/* Center hub */}
          <div className="absolute w-16 h-16 bg-gradient-to-br from-white to-gray-300 rounded-full shadow-xl flex items-center justify-center z-10">
            <Disc className="text-purple-600" size={32} />
          </div>
        </div>

        {/* Controls */}
        <div className="bg-card border border-border rounded-2xl p-6 space-y-8">
          <div className="text-center space-y-2">
            {lastAdjustment !== null && (
              <div
                className={`text-2xl font-bold animate-bounce ${
                  lastAdjustment.amount > 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {lastAdjustment.amount > 0
                  ? `GAIN REALIZED: KSh ${lastAdjustment.amount}! 🎉`
                  : `${lastAdjustment.name} – System Adjustment`}
              </div>
            )}
            {!executing && lastAdjustment === null && (
              <div className="text-xl font-bold text-white">
                Execute Allocation?
              </div>
            )}
            {executing && (
              <div className="text-xl font-bold text-yellow-500 animate-pulse">
                Processing...
              </div>
            )}
          </div>

          <div className="space-y-4">
            <label className="text-sm font-medium text-muted-foreground">
              Allocation Amount
            </label>
            <div className="grid grid-cols-3 gap-2">
              {["50", "100", "200", "500", "1000"].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAllocation(amt)}
                  className={`py-2 rounded-lg text-sm font-bold border transition-all ${
                    allocation === amt
                      ? "bg-purple-500/20 border-purple-500 text-purple-400"
                      : "bg-white/5 border-transparent hover:bg-white/10"
                  }`}
                >
                  {amt}
                </button>
              ))}
            </div>
            <input
              type="number"
              value={allocation}
              onChange={(e) => setAllocation(e.target.value)}
              className="w-full bg-black/40 border border-white/10 rounded-lg p-3 text-center text-xl font-bold"
            />
          </div>

          {/* Outcomes legend */}
          <div className="space-y-1">
            <div className="text-xs font-bold text-zinc-500 uppercase tracking-wider mb-2">
              Return Structure
            </div>
            {outcomes.map((p, i) => (
              <div key={i} className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <div
                    className="w-2.5 h-2.5 rounded-full"
                    style={{
                      background: PRIZE_COLORS[i % PRIZE_COLORS.length],
                    }}
                  />
                  <span className="text-zinc-400">{p.name}</span>
                </div>
                <span className="text-white font-bold">
                  {p.value === 0 ? "Adjustment" : `${p.value}x`}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={executeSelection}
            disabled={executing || outcomes.length === 0}
            className="w-full py-4 text-xl font-black rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {executing ? <Loader2 className="animate-spin" /> : "EXECUTE ALLOCATION"}
          </button>

          <div className="text-xs text-center text-muted-foreground">
            <Sparkles className="inline w-3 h-3 mr-1" />
            Returns are multipliers of your allocation
          </div>
        </div>
      </div>
    </div>
  );
}
