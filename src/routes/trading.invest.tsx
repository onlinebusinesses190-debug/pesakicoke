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
  Moon,
  Clock,
} from "lucide-react";
import { apiRequest } from "@/utils/api";
import { createClient } from "@supabase/supabase-js";
import { toast } from "sonner";

// ─── Mock Data (fallback) ──────────────────────────────────────────────────
const MOCK_STOCKS: NseStock[] = [
  { id: "1", name: "Safaricom", symbol: "SCOM", sector: "Telecom", price: 28.50, change: 0.75, changePercent: 2.70, volume: 1250000, high: 29.00, low: 27.80, open: 27.90 },
  { id: "2", name: "Equity Group", symbol: "EQTY", sector: "Banking", price: 48.25, change: -0.50, changePercent: -1.03, volume: 850000, high: 49.00, low: 47.80, open: 48.75 },
  { id: "3", name: "KCB Group", symbol: "KCB", sector: "Banking", price: 38.00, change: 0.20, changePercent: 0.53, volume: 620000, high: 38.50, low: 37.60, open: 37.80 },
  { id: "4", name: "EABL", symbol: "EABL", sector: "Beverages", price: 162.00, change: 1.50, changePercent: 0.93, volume: 210000, high: 163.50, low: 160.00, open: 160.50 },
  { id: "5", name: "Kenya Power", symbol: "KPLC", sector: "Energy", price: 6.85, change: -0.10, changePercent: -1.44, volume: 980000, high: 7.00, low: 6.75, open: 6.95 },
  { id: "6", name: "Co-operative Bank", symbol: "COOP", sector: "Banking", price: 18.50, change: 0.30, changePercent: 1.65, volume: 430000, high: 18.80, low: 18.20, open: 18.20 },
  { id: "7", name: "BAT Kenya", symbol: "BAT", sector: "Tobacco", price: 420.00, change: 2.00, changePercent: 0.48, volume: 98000, high: 425.00, low: 418.00, open: 418.00 },
  { id: "8", name: "KenGen", symbol: "KEGN", sector: "Energy", price: 4.25, change: -0.05, changePercent: -1.16, volume: 2150000, high: 4.35, low: 4.20, open: 4.30 },
];

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

// ─── Skeleton Card ──────────────────────────────────────────────────────────
function SkeletonCard() {
  return (
    <div className="rounded-xl border border-border bg-card p-3 animate-pulse">
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-full bg-white/10" />
          <div className="space-y-1.5">
            <div className="h-3 w-28 rounded bg-white/10" />
            <div className="h-2 w-16 rounded bg-white/8" />
          </div>
        </div>
        <div className="text-right space-y-1.5">
          <div className="h-3 w-14 rounded bg-white/10" />
          <div className="h-2 w-10 rounded bg-white/8" />
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
      className={`cursor-pointer rounded-xl border p-3 transition-all duration-200 hover:scale-[1.01] active:scale-[0.99] focus:outline-none focus:ring-2 focus:ring-primary/50
        ${
          selected
            ? "bg-primary/10 border-primary shadow-[0_0_20px_rgba(59,130,246,0.15)]"
            : "bg-card border-border hover:border-primary/50"
        }`}
    >
      <div className="flex justify-between items-center gap-2">
        <div className="flex items-center gap-2.5 min-w-0">
          <div
            className={`w-8 h-8 flex-shrink-0 rounded-full bg-gradient-to-br ${grad} flex items-center justify-center font-bold text-[10px] text-white shadow`}
          >
            {initials}
          </div>
          <div className="min-w-0">
            <h3 className="font-bold text-white text-sm truncate leading-tight">
              {stock.name}
            </h3>
            <div className="flex items-center gap-1.5 mt-0.5">
              <span className="text-[10px] font-mono text-blue-400">
                {stock.symbol}
              </span>
              <span className="text-[9px] text-muted-foreground bg-white/5 px-1.5 py-0.5 rounded truncate max-w-[70px]">
                {stock.sector}
              </span>
            </div>
          </div>
        </div>

        <div className="text-right flex-shrink-0">
          <div className="font-mono font-bold text-white text-sm">
            KES {stock.price.toFixed(2)}
          </div>
          <div className={`text-[10px] flex items-center justify-end gap-1 ${changeColor}`}>
            <ChangeIcon size={10} />
            <span>{isPositive ? "+" : ""}{stock.change.toFixed(2)}</span>
            <span className="opacity-70">({isPositive ? "+" : ""}{stock.changePercent.toFixed(2)}%)</span>
          </div>
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
  const [apiError, setApiError] = useState<string | null>(null);
  const [updatedAt, setUpdatedAt] = useState<string | null>(null);
  const [marketOpen, setMarketOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedStock, setSelectedStock] = useState<NseStock | null>(null);
  const [prediction, setPrediction] = useState<"HIGH" | "LOW" | null>(null);
  const [amount, setAmount] = useState("100");
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
        if (!session) navigate({ to: "/auth" });
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
      // Try to fetch from backend
      const data = await apiRequest("/games/nse/stocks");
      if (data && data.stocks) {
        setStocks(data.stocks);
        setUpdatedAt(data.updatedAt || new Date().toISOString());
        setMarketOpen(data.marketOpen ?? false);
      } else {
        // If response doesn't match, use mock data
        setStocks(MOCK_STOCKS);
        setUpdatedAt(new Date().toISOString());
        setMarketOpen(true);
        setApiError("Using demo data – backend not available yet.");
      }
    } catch (err) {
      console.error("Failed to fetch stocks, using mock data:", err);
      setStocks(MOCK_STOCKS);
      setUpdatedAt(new Date().toISOString());
      setMarketOpen(true);
      setApiError("Using demo data – backend not available yet.");
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

  // ── Toggle mode ──────────────────────────────────────────────────────────
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
    <div className="space-y-4 max-w-7xl mx-auto px-4 pb-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Building2 className="text-blue-500" size={24} />
            NSE Market Predict
          </h1>
          <div className="flex items-center gap-3 mt-0.5">
            <p className="text-xs text-muted-foreground">
              Daily HIGH/LOW predictions on Nairobi Securities Exchange
            </p>
            <span
              className={`inline-flex items-center gap-1.5 text-[10px] font-medium px-2 py-0.5 rounded-full border
                ${
                  marketOpen
                    ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400"
                    : "bg-white/5 border-white/10 text-muted-foreground"
                }`}
            >
              <CircleDot size={8} className={marketOpen ? "animate-pulse" : ""} />
              {marketOpen ? "Open" : "Closed"}
            </span>
          </div>
          {formattedTime && (
            <p className="text-[10px] text-muted-foreground mt-0.5">
              <span className="opacity-60">Last updated:</span> {formattedTime} EAT
            </p>
          )}
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <div className="flex items-center gap-1 rounded-lg bg-[#181d29] p-0.5 text-[10px] font-medium">
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

          <button
            onClick={() => fetchStocks(true)}
            disabled={loading || refreshing}
            className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-white/5 border border-white/10 text-[11px] text-muted-foreground hover:text-white hover:border-white/20 transition-all disabled:opacity-40"
            title="Refresh data"
          >
            <RefreshCw size={12} className={refreshing ? "animate-spin" : ""} />
            <span className="hidden sm:inline">Refresh</span>
          </button>

          <div className="relative flex-1 md:w-48">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground" size={14} />
            <input
              type="text"
              placeholder="Search stocks..."
              className="w-full bg-card border border-border rounded-lg pl-8 pr-3 py-1.5 text-xs focus:outline-none focus:ring-2 focus:ring-primary/60"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Error / Demo notice */}
      {apiError && (
        <div className="flex items-center gap-2 p-2 rounded-lg border border-amber-500/30 bg-amber-500/10 text-amber-300 text-xs">
          <AlertCircle size={14} />
          <span>{apiError}</span>
        </div>
      )}

      {/* Market Closed Notice */}
      {!loading && !marketOpen && (
        <div className="flex items-start gap-2 p-3 rounded-xl border border-blue-500/20 bg-blue-500/5 text-blue-300 text-xs">
          <Moon size={14} className="mt-0.5 flex-shrink-0" />
          <div>
            <p className="font-semibold text-sm">NSE Market is Currently Closed</p>
            <p className="opacity-70">Trades Monday–Friday, 9:00 AM – 3:00 PM EAT.</p>
          </div>
        </div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Stock list */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {Array.from({ length: 8 }).map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : filtered.length > 0 ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((stock) => (
                <StockCard
                  key={stock.id}
                  stock={stock}
                  selected={selectedStock?.id === stock.id}
                  onClick={() => {
                    setSelectedStock(stock);
                    setPrediction(null);
                  }}
                />
              ))}
            </div>
          ) : (
            <div className="text-center py-12 text-muted-foreground border-2 border-dashed border-white/5 rounded-xl">
              <Wifi size={24} className="mx-auto mb-2 opacity-20" />
              <p className="text-sm">No stocks match your search.</p>
            </div>
          )}
        </div>

        {/* Prediction Slip */}
        <div className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-4 sticky top-4">
            <h2 className="text-base font-bold text-white mb-4">Prediction Slip</h2>

            {selectedStock ? (
              <div className="space-y-4">
                {/* Selected stock */}
                <div className="p-3 bg-white/5 rounded-xl border border-white/10">
                  <div className="text-[10px] text-muted-foreground mb-0.5">Selected Asset</div>
                  <div className="font-bold text-base text-white leading-tight">
                    {selectedStock.name}
                  </div>
                  <div className="text-[10px] font-mono text-blue-400">
                    {selectedStock.symbol} • KES {selectedStock.price.toFixed(2)}
                  </div>
                  <div
                    className={`text-[10px] mt-1 flex items-center gap-1 ${
                      selectedStock.change >= 0 ? "text-emerald-400" : "text-red-400"
                    }`}
                  >
                    {selectedStock.change >= 0 ? <TrendingUp size={10} /> : <TrendingDown size={10} />}
                    Today: {selectedStock.change >= 0 ? "+" : ""}
                    {selectedStock.change.toFixed(2)}&nbsp;(
                    {selectedStock.changePercent.toFixed(2)}%)
                  </div>
                </div>

                {/* HIGH / LOW picker */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Price Direction at Market Close
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      onClick={() => setPrediction("HIGH")}
                      className={`h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all
                        ${
                          prediction === "HIGH"
                            ? "bg-emerald-500 text-black border-emerald-500 shadow-lg shadow-emerald-900/40"
                            : "bg-transparent border-white/10 text-muted-foreground hover:border-emerald-500/50 hover:text-emerald-400"
                        }`}
                    >
                      <ArrowUp size={14} /> HIGH
                    </button>
                    <button
                      onClick={() => setPrediction("LOW")}
                      className={`h-12 rounded-xl font-bold text-sm flex items-center justify-center gap-2 border transition-all
                        ${
                          prediction === "LOW"
                            ? "bg-red-500 text-black border-red-500 shadow-lg shadow-red-900/40"
                            : "bg-transparent border-white/10 text-muted-foreground hover:border-red-500/50 hover:text-red-400"
                        }`}
                    >
                      <ArrowDown size={14} /> LOW
                    </button>
                  </div>
                </div>

                {/* Amount */}
                <div className="space-y-1.5">
                  <label className="text-[10px] font-medium text-muted-foreground">
                    Allocation Amount <span className="text-[8px] opacity-60">(Min 10)</span>
                  </label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground font-mono">
                      KSh
                    </span>
                    <input
                      type="number"
                      min={10}
                      value={amount}
                      onChange={(e) => setAmount(e.target.value)}
                      className="w-full bg-black/40 border border-white/10 rounded-lg pl-11 pr-3 py-2 font-mono text-white text-sm focus:outline-none focus:ring-2 focus:ring-primary/50"
                    />
                  </div>
                  <div className="flex justify-
