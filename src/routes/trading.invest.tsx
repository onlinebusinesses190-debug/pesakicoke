import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback } from "react";
import {
  TrendingUp,
  TrendingDown,
  Building2,
  ArrowUp,
  ArrowDown,
  Search,
  RefreshCw,
  CircleDot,
  AlertCircle,
  Wifi,
  WifiOff,
  Moon,
  Clock,
} from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";

// ─── Types ───────────────────────────────────────────────────────────────────
interface NseStock {
  id: string;
  name: string;
  symbol: string;
  sector: string;
  price: number;
  change: number;
  changePercent: number;
  volume?: number;
  high?: number;
  low?: number;
  open?: number;
}

interface ApiResponse {
  stocks: NseStock[];
  updatedAt: string;
  marketOpen: boolean;
}

// ─── Skeleton Card ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-4 animate-pulse">
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-white/10" />
          <div className="space-y-2">
            <div className="h-4 w-32 rounded bg-white/10" />
            <div className="h-3 w-20 rounded bg-white/8" />
          </div>
        </div>
        <div className="text-right space-y-2">
          <div className="h-4 w-16 rounded bg-white/10" />
          <div className="h-3 w-12 rounded bg-white/8" />
        </div>
      </div>
    </div>
  );
}

// ─── Stock Card ─────────────────────────────────────────────────────────────
function StockCard({
  stock,
  selected,
  onClick,
}: {
  stock: NseStock;
  selected: boolean;
  onClick: () => void;
}) {
  const isPositive = stock.change >= 0;
  const ChangeIcon = isPositive ? TrendingUp : TrendingDown;
  const changeColor = isPositive ? "text-emerald-400" : "text-red-400";
  const initials = stock.symbol.slice(0, 2).toUpperCase();

  const gradients = [
    "from-blue-700 to-blue-900",
    "from-violet-700 to-violet-900",
    "from-emerald-700 to-emerald-900",
    "from-amber-700 to-amber-900",
    "from-rose-700 to-rose-900",
    "from-cyan-700 to-cyan-900",
    "from-indigo-700 to-indigo-900",
  ];
  const grad = gradients[stock.symbol.charCodeAt(0) % gradients.length];

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => e.key === "Enter" && onClick()}
      className={`cursor-pointer rounded-xl border p-4 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/50
        ${
          selected
            ? "bg-primary/10 border-primary shadow-[0_0_24px_rgba(59,130,246,0.2)]"
            : "bg-card border-border hover:border-primary/50"
        }`}
    >
      <div className="flex justify-between items-start gap-2">
        <div className="flex items-center gap-3 min-w-0">
          <div
            className={`w-10 h-10 flex-shrink-0 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-xs text-white shadow`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-sm truncate leading-tight">
              {stock.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
              <span className="text-xs font-mono text-blue-400">
                {stock.symbol}
              </span>
              <span className="text-[10px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[100px]">
                {stock.sector}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono font-bold text-white text-sm">
            KES {stock.price.toFixed(2)}
          </div>
          <div className={`text-xs flex items-center justify-end gap-1 mt-0.5 ${changeColor}`}>
            <ChangeIcon size={11} />
            <span>{isPositive ? "+" : ""}{stock.change.toFixed(2)}</span>
            <span className="opacity-70">
              ({isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%)
            </span>
          </div>
          {stock.volume !== undefined && (
            <div className="text-[10px] text-muted-foreground mt-0.5">
              Vol: {(stock.volume / 1000).toFixed(0)}K
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Route ─────────────────────────────────────────────────────────────────
export const Route = createFileRoute("/trading/invest")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: InvestmentPage,
});

function InvestmentPage() {
  const search = Route.useSearch();
  const navigate = useNavigate();
  const mode = search.mode === "real" ? "real" : "demo";

  const [stocks, setStocks] = useState<NseStock[]>([]);
  const [loading, setLoading] = useState(true);
  const [apiError, setApiError] = useState<{ error: string; message: string } | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStock, setSelectedStock] = useState<NseStock | null>(null);
  const [prediction, setPrediction] = useState<"HIGH" | "LOW" | null>(null);
  const [amount, setAmount] = useState("1000");
  const [isPlacing, setIsPlacing] = useState(false);

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

  // ── Fetch stocks ──────────────────────────────────────────────────────────
  const fetchStocks = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true);
    else setLoading(true);
    setApiError(null);

    try {
      // Replace Next.js API route with apiRequest to your backend
      const data = await apiRequest("/games/nse/stocks");
      // The backend response might be { stocks, updatedAt, marketOpen }
      // Adjust if the structure differs.
      if (data && data.stocks) {
        setStocks(data.stocks);
        setUpdatedAt(data.updatedAt || null);
        setMarketOpen(data.marketOpen ?? false);
      } else {
        // Fallback if response format is different
        setStocks(data);
        setUpdatedAt(new Date().toISOString());
        setMarketOpen(true);
      }
    } catch (err: any) {
      console.error("[Invest] Fetch error:", err);
      setApiError({
        error: err.message || "NETWORK_ERROR",
        message: err.message || "Could not load stock data.",
      });
      setStocks([]);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchStocks();
  }, [fetchStocks]);

  // ── Place prediction ──────────────────────────────────────────────────────
  const handlePlacePrediction = async () => {
    if (!selectedStock || !prediction) return;
    setIsPlacing(true);

    try {
      await apiRequest("/games/nse/predict", {
        method: "POST",
        body: JSON.stringify({
          symbol: selectedStock.symbol,
          direction: prediction,
          amount: Number(amount),
          mode: mode,
          entryPrice: selectedStock.price,
        }),
      });

      toast.success(`Prediction placed for ${selectedStock.symbol}!`);
      setSelectedStock(null);
      setPrediction(null);
    } catch (err: any) {
      console.error("[Invest] Prediction error:", err);
      if (
        err.message?.includes("Authentication required") ||
        err.message?.includes("Authorization header")
      ) {
        toast.error("Session expired. Redirecting to login...");
        setTimeout(() => navigate({ to: "/auth" }), 1000);
        return;
      }
      toast.error(err.message || "Failed to place prediction");
    } finally {
      setIsPlacing(false);
    }
  };

  // ── Toggle mode (safe) ────────────────────────────────────────────────────
  const setMode = (newMode: "demo" | "real") => {
    const url = new URL(window.location.href);
    url.searchParams.set("mode", newMode);
    window.location.href = url.toString();
  };

  // ── Derived ────────────────────────────────────────────────────────────────
  const filtered = stocks.filter((s) =>
    s.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.symbol.toLowerCase().includes(searchTerm.toLowerCase()) ||
    s.sector.toLowerCase().includes(searchTerm.toLowerCase())
  );

  const formattedTime = updatedAt
    ? new Date(updatedAt).toLocaleTimeString("en-KE", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: "Africa/Nairobi",
      })
    : null;

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-6 max-w-7xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold text-white flex items-center gap-3">
            <Building2 className="text-blue-500" />
            NSE Market Predict
          </h1>
          <div className="flex items-center gap-3 mt-1">
            <p className="text-sm text-muted-foreground">
              Daily HIGH/LOW predictions on Nairobi Securities Exchange
            </p>
            <span
              className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-0.5 rounded-full border
                ${
                  marketOpen
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-white/5 border-white/10 text-muted-foreground"
                }`}
            >
              <CircleDot size={10} className={marketOpen ? "animate-pulse" : ""} />
              {marketOpen ? "Market Open" : "Market Closed"}
            </span>
          </div>
          {formattedTime && (
            <p className="text-xs text-muted-foreground mt-1">
              <span className="opacity-60">Last updated:</span> {formattedTime} EAT
            </p>
          )}
        </div>

        <div className="flex items-center gap-3 w-full md:w-auto">
          {/* Mode toggle */}
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

          <button
            onClick={() => fetchStocks(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm text-muted-foreground hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
            title="Refresh data"
          >
            <RefreshCw size={14} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="relative flex-1 md:w-64">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
            <input
              type="text"
              placeholder="Search stocks..."
              className="w-full bg-card border border-border rounded-lg pl-10 pr-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/60"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Error Banner */}
      {apiError && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-300">
          {apiError.error === "API_KEY_MISSING" ? (
            <WifiOff size={20} className="mt-0.5 flex-shrink-0" />
          ) : (
            <AlertCircle size={20} className="mt-0.5 flex-shrink-0" />
          )}
          <div>
            <p className="font-semibold text-sm">
              {apiError.error === "API_KEY_MISSING"
                ? "API key not configured"
                : "Could not load live data"}
            </p>
            <p className="text-xs mt-0.5 opacity-80">{apiError.message}</p>
          </div>
        </div>
      )}

      {/* Market Closed Notice */}
      {!loading && !marketOpen && (
        <div className="flex items-start gap-3 p-4 rounded-xl border border-blue-500/20 bg-blue-500/5">
          <Moon size={18} className="mt-0.5 flex-shrink-0 text-blue-400" />
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sm text-blue-300">
              NSE Market is Currently Closed
            </p>
            <p className="text-xs mt-0.5 text-blue-400/70 leading-relaxed">
              The Nairobi Securities Exchange trades{" "}
              <strong>Monday – Friday, 9:00 AM – 3:00 PM EAT</strong>.
              Stock prices shown are the most recent closing prices — some counters may not display if they had no activity on the last trading day.
            </p>
            <div className="flex items-center gap-1.5 mt-2 text-xs text-blue-400/60">
              <Clock size={11} />
              <span>Prices will update live when the market reopens on the next trading day.</span>
            </div>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Stock list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {Array.from({ length: 10 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  selected={selectedStock?.id === stock.id}
                  onClick={() => {
                    setSelectedStock(stock);
                    setPrediction(null);
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                />
              ))}
            </div>
          ) : !apiError ? (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
              <Wifi size={32} className="mx-auto mb-3 opacity-20" />
              <p>No stocks match your search.</p>
            </div>
          ) : (
            <div className="text-center py-16 text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
              <AlertCircle size={32} className="mx-auto mb-3 opacity-20" />
              <p>Live data unavailable.</p>
              <button
                onClick={() => fetchStocks()}
                className="mt-4 text-sm text-blue-400 hover:text-blue-300 underline underline-offset-2"
              >
                Retry
              </button>
            </div>
          )}
        </div>

        {/* Prediction Slip */}
        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-6 sticky top-6">
            <h2 className="text-xl font-bold text-white mb-6">Prediction Slip</h2>

            {selectedStock ? (
              <div className="space-y-5">
                {/* Selected stock */}
                <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-xs text-muted-foreground mb-1">Selected Asset</div>
                  <div className="font-bold text-lg text-white leading-tight">
                    {selectedStock.name}
                  </div>
                  <div className="text-xs font-mono text-blue-400 mt-1">
                    {selectedStock.symbol} • KES {selectedStock.price.toFixed(2)}
                  </div>
                  <div
                    className={`text-xs mt-1.5 flex items-center gap-1 ${
                      selectedStock.change >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {selectedStock.change >= 0 ? (
                      <TrendingUp size={11} />
                    ) : (
                      <TrendingDown size={11} />
                    )}
                    Today: {selectedStock.change >= 0 ? "+" : ""}
                    {selectedStock.change.toFixed(2)}&nbsp;(
                    {selectedStock.changePercent.toFixed(2)}%)
                  </div>
                  {(selectedStock.open || selectedStock.high || selectedStock.low) && (
                    <div className="mt-3 pt-3 border-t border-white/5 grid grid-cols-3 gap-2 text-center">
                      {[
                        { label: "Open", val: selectedStock.open },
                        { label: "High", val: selectedStock.high },
                        { label: "Low", val: selectedStock.low },
                      ].map(
                        ({ label, val }) =>
                          val !== undefined && (
                            <div key={label}>
                              <div className="text-[10px] text-muted-foreground">{label}</div>
                              <div className="text-xs font-mono font-bold text-white">
                                {val.toFixed(2)}
                              </div>
                            </div>
                          )
                      )}
                    </div>
                  )}
                </div>

                {/* HIGH / LOW picker */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Price Direction at Market Close
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      onClick={() => setPrediction("HIGH")}
                      className={`h-14 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all
                        ${
                          prediction === "HIGH"
                            ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-900/40"
                            : "bg-transparent border-white/10 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400"
                        }`}
                    >
                      <ArrowUp size={16} /> HIGH
                    </button>
                    <button
                      onClick={() => setPrediction("LOW")}
                      className={`h-14 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all
                        ${
                          prediction === "LOW"
                            ? "bg-red-500 text-black border-red-500 shadow-lg shadow-red-900/40"
                            : "bg-transparent border-white/10 text-muted-foreground hover:border-red-500/50 hover:text-red-400"
                        }`}
                    >
                      <ArrowDown size={16} /> LOW
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-2">
                  <label className="text-sm font-medium text-muted-foreground">
                    Allocation Amount <span className="text-xs opacity-60">(Min KSh 10)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm text-muted-foreground font-mono">
                      KSh
                    </span>
                    <input
                      type="number"
                      min={10}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg pl-12 pr-4 py-3 font-bold font-mono text-white focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground px-1">
                    <span>Potential Payout (30% Profit):</span>
                    <span className="text-emerald-400 font-bold">
                      {amount
                        ? `KES ${(Number(amount) * 1.3).toFixed(2)}`
                        : "KES 0.00"}
                    </span>
                  </div>
                </div>

                <button
                  onClick={handlePlacePrediction}
                  disabled={
                    !prediction || Number(amount) < 10 || isPlacing || !marketOpen
                  }
                  className="w-full py-4 text-base font-black rounded-xl bg-blue-600 hover:bg-blue-500 text-white shadow-lg shadow-blue-900/40 hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-40 disabled:cursor-not-allowed disabled:scale-100"
                >
                  {isPlacing
                    ? "PLACING..."
                    : !marketOpen
                    ? "MARKET CLOSED"
                    : "PLACE PREDICTION →"}
                </button>

                <p className="text-[11px] text-center text-muted-foreground leading-relaxed">
                  Results are settled against official NSE closing prices. Market closes at 15:00 EAT.
                </p>
              </div>
            ) : (
              <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
                <Building2 size={32} className="mx-auto mb-3 opacity-20" />
                <p className="text-sm">Select a stock from the list to start predicting.</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
