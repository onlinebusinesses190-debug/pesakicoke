import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Disc, Sparkles, Loader2 } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";

type AllocationOutcome = {
  id: number;
  name: string;
  value: number;
  weight: number;
  color?: string;
};

const PRIZE_COLORS = [
  "#ef4444", "#f59e0b", "#10b981", "#3b82f6",
  "#8b5cf6", "#f97316", "#eab308",
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

  useEffect(() => {
    const checkAuth = async () => {
      try {
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY
        );
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) navigate({ to: "/auth" });
      } catch (err) {
        console.error("Auth check failed", err);
      }
    };
    checkAuth();
  }, [navigate]);

  useEffect(() => {
    const fetchOutcomes = async () => {
      try {
        const data = await apiRequest("/games/spin/prizes");
        if (data.success && data.data) setOutcomes(data.data);
      } catch (err) {
        console.error("Failed to load outcomes:", err);
      } finally {
        setLoadingOutcomes(false);
      }
    };
    fetchOutcomes();
  }, []);

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
      const segmentAngle = 360 / outcomes.length;
      const targetAngle =
        360 - (result.prizeIndex * segmentAngle) - segmentAngle / 2;
      const fullSpins = 5 * 360;
      const finalRotation =
        rotation + fullSpins + ((targetAngle - (rotation % 360) + 360) % 360);

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

  const buildConicGradient = () => {
    if (outcomes.length === 0) return "conic-gradient(#333 0deg 360deg)";
    const segAngle = 360 / outcomes.length;
    const stops = outcomes.map((p, i) => {
      const color = PRIZE_COLORS[i % PRIZE_COLORS.length];
      return `${color} ${segAngle * i}deg ${segAngle * (i + 1)}deg`;
    });
    return `conic-gradient(${stops.join(", ")})`;
  };

  const setMode = (newMode: "demo" | "real") => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.location.href = url.toString();
  };

  if (loadingOutcomes) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="animate-spin text-purple-400" size={40} />
      </div>
    );
  }

  return (
    <div className="space-y-4 max-w-5xl mx-auto pb-8 px-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <Disc className="text-purple-500" size={24} /> Market Growth Selector
        </h1>
        <div className="flex items-center gap-2">
          <span className="text-[10px] text-gray-400 font-medium">
            {mode === "demo" ? "🎮 FUN MODE" : "🔴 REAL MODE"}
          </span>
          <div className="flex items-center gap-1 rounded-lg bg-[#181d29] p-1 text-[10px] font-medium">
            <button
              onClick={() => setMode("demo")}
              className={`px-2.5 py-1 rounded-md transition-all ${
                mode === "demo"
                  ? "bg-[#dcb13c] text-black"
                  : "text-gray-400 hover:text-white hover:bg-[#202636]"
              }`}
            >
              Demo
            </button>
            <button
              onClick={() => setMode("real")}
              className={`px-2.5 py-1 rounded-md transition-all ${
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

      {/* Main content - reduced sizes */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-center">
        {/* Wheel - smaller */}
        <div className="relative flex justify-center items-center py-4">
          <div className="absolute top-0 z-20 w-0 h-0 border-l-[14px] border-l-transparent border-t-[28px] border-t-white border-r-[14px] border-r-transparent drop-shadow-lg" />

          <div
            className="w-[220px] h-[220px] md:w-[280px] md:h-[280px] rounded-full relative overflow-hidden shadow-[0_0_30px_rgba(139,92,246,0.25)] border-2 border-white/15"
            style={{
              transform: `rotate(${rotation}deg)`,
              transition: executing ? "transform 5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
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
                  className="absolute inset-0 flex justify-center pt-5"
                  style={{ transform: `rotate(${rotate}deg)` }}
                >
                  <span className="text-white font-bold text-shadow rotate-180 writing-mode-vertical text-[9px] md:text-xs tracking-wider drop-shadow-md whitespace-nowrap">
                    {prize.name}
                  </span>
                </div>
              );
            })}
          </div>

          <div className="absolute w-10 h-10 bg-gradient-to-br from-white to-gray-300 rounded-full shadow-xl flex items-center justify-center z-10">
            <Disc className="text-purple-600" size={20} />
          </div>
        </div>

        {/* Controls - compact */}
        <div className="bg-card border border-border rounded-2xl p-4 space-y-4">
          <div className="text-center space-y-1">
            {lastAdjustment !== null && (
              <div
                className={`text-lg font-bold animate-bounce ${
                  lastAdjustment.amount > 0 ? "text-green-500" : "text-red-500"
                }`}
              >
                {lastAdjustment.amount > 0
                  ? `🎉 GAIN: KSh ${lastAdjustment.amount}`
                  : `${lastAdjustment.name} – Adjustment`}
              </div>
            )}
            {!executing && lastAdjustment === null && (
              <div className="text-base font-bold text-white">Execute Allocation?</div>
            )}
            {executing && (
              <div className="text-base font-bold text-yellow-500 animate-pulse">Processing...</div>
            )}
          </div>

          <div className="space-y-3">
            <label className="text-xs font-medium text-muted-foreground">Allocation Amount</label>
            <div className="grid grid-cols-3 gap-1.5">
              {["50", "100", "200", "500", "1000"].map((amt) => (
                <button
                  key={amt}
                  onClick={() => setAllocation(amt)}
                  className={`py-1.5 rounded-lg text-xs font-bold border transition-all ${
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
              className="w-full bg-black/40 border border-white/10 rounded-lg p-2 text-center text-base font-bold"
            />
          </div>

          {/* Legend - smaller */}
          <div className="space-y-0.5">
            <div className="text-[10px] font-bold text-zinc-500 uppercase tracking-wider">Returns</div>
            {outcomes.slice(0, 4).map((p, i) => (
              <div key={i} className="flex items-center justify-between text-[10px]">
                <div className="flex items-center gap-1.5">
                  <div
                    className="w-2 h-2 rounded-full"
                    style={{ background: PRIZE_COLORS[i % PRIZE_COLORS.length] }}
                  />
                  <span className="text-zinc-400">{p.name}</span>
                </div>
                <span className="text-white font-bold">
                  {p.value === 0 ? "Adjust" : `${p.value}x`}
                </span>
              </div>
            ))}
          </div>

          <button
            onClick={executeSelection}
            disabled={executing || outcomes.length === 0}
            className="w-full py-3 text-base font-black rounded-xl bg-gradient-to-r from-purple-600 to-pink-600 text-white shadow-lg shadow-purple-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
          >
            {executing ? <Loader2 className="animate-spin w-4 h-4" /> : "EXECUTE ALLOCATION"}
          </button>

          <div className="text-[10px] text-center text-muted-foreground">
            <Sparkles className="inline w-3 h-3 mr-1" />
            Returns are multipliers
          </div>
        </div>
      </div>
    </div>
  );
}
