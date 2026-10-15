import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import { ArrowLeft, Timer, TrendingUp, TrendingDown, Wallet, RefreshCw } from "lucide-react";
import { apiRequest } from "@/utils/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { DepositSheet } from "@/components/DepositSheet";
import { toast } from "sonner";
import { BfxLineChart, type BfxMarker } from "@/components/fx/BfxLineChart";
import { AssetSelector, SentimentBar, type SentimentTrade } from "@/components/fx/SentimentBar";

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

export const Route = createFileRoute("/games/binary-fx")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  component: BinaryFxPage,
});

function BinaryFxPage() {
  const { mode: defaultMode } = Route.useSearch();
  const navigate = useNavigate();
  const { user, ready: authReady } = useRequireAuth();

  const [config, setConfig] = useState<Config | null>(null);
  const [balance, setBalance] = useState<number | null>(null);
  const [price, setPrice] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);
  const [selectedAsset, setSelectedAsset] = useState("EUR/USD");
  const [selectedExpiry, setSelectedExpiry] = useState(60);
  const [stake, setStake] = useState("100");
  const [placing, setPlacing] = useState(false);
  const [openTrades, setOpenTrades] = useState<BfxTrade[]>([]);
  const [settledTrades, setSettledTrades] = useState<BfxTrade[]>([]);
  const [showDeposit, setShowDeposit] = useState(false);

  const [now, setNow] = useState(Date.now());
  const [, forceTick] = useState(0);
  const markerCoordsRef = useRef<{ id: string; x: number; y: number }[]>([]);
  const lastSettleScanRef = useRef(0);

  // ── Fairness refs ──
  // Latest known price per asset from the frontend's own live feed.
  const lastPriceByAssetRef = useRef<Record<string, number>>({});
  // Trades already being settled (prevents double-settle spam).
  const settlingIdsRef = useRef<Set<string>>(new Set());
  // Trades we've already settled locally (prevents repeat calls after refetch).
  const settledIdsRef = useRef<Set<string>>(new Set());

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiRequest<{
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
      const cfg: Config = {
        assets: data.assets || [],
        expiries: data.expiries || [],
        payout: data.payout ?? 0.6,
        minStake: data.minStake ?? 10,
        maxStake: data.maxStake ?? 5000,
        maxOpen: data.maxOpen ?? 10,
        tie: data.tie ?? "loss",
        demoStart: data.demoStart ?? 10000,
      };
      setConfig(cfg);
      setConnected(true);
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchPrice = useCallback(async (asset: string) => {
    try {
      const data = await apiRequest<{ success: boolean; price: number }>(
        `${API_URL}/games/bfx/price?asset=${encodeURIComponent(asset)}`,
      );
      const p = data.price;
      setPrice(p);
      lastPriceByAssetRef.current[asset] = p; // record for fairness checks
      setConnected(true);
      return p;
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{ balance: number; demo_balance: number }>(
        `${API_URL}/wallet/balance`,
      );
      const bal = defaultMode === "real" ? data.balance : data.demo_balance;
      setBalance(bal);
    } catch {
      setConnected(false);
    }
  }, [user, defaultMode]);

  const fetchOpenTrades = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(
        `${API_URL}/games/bfx/trades/open`,
      );
      const all = data.data || [];
      // Filter out trades we know are being/already settled locally
      const filtered = all.filter(
        (t) => t.mode === defaultMode && !settledIdsRef.current.has(t.id),
      );
      setOpenTrades(filtered);
    } catch (e) {
      console.error("Failed to fetch open trades:", e);
    }
  }, [user, defaultMode]);

  const fetchSettledTrades = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(
        `${API_URL}/games/bfx/trades/settled?limit=50`,
      );
      const all = data.data || [];
      setSettledTrades(all.filter((t) => t.mode === defaultMode));
    } catch (e) {
      console.error("Failed to fetch settled trades:", e);
    }
  }, [user, defaultMode]);

  const refreshAll = useCallback(() => {
    fetchConfig();
    fetchBalance();
    fetchOpenTrades();
    fetchSettledTrades();
  }, [fetchConfig, fetchBalance, fetchOpenTrades, fetchSettledTrades]);

  // ─── Fairness-aware settlement ──────────────────────────────────────────
  const settleTrade = useCallback(
    async (tradeId: string) => {
      // Guard: don't settle the same trade twice
      if (settlingIdsRef.current.has(tradeId)) return;
      settlingIdsRef.current.add(tradeId);

      const trade = openTrades.find((t) => t.id === tradeId);

      // Capture the frontend's last observed price for this asset as a
      // fairness cross-check for the backend.
      const clientExitPrice = trade
        ? lastPriceByAssetRef.current[trade.asset]
        : undefined;

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
          body: JSON.stringify({
            expiryPrice:
              typeof clientExitPrice === "number" && isFinite(clientExitPrice)
                ? clientExitPrice
                : undefined,
          }),
        });

        if (result.success) {
          // Mark locally so we don't try again
          settledIdsRef.current.add(tradeId);

          if (trade) {
            const profit = result.profit ?? trade.profit;
            const dir = result.direction ?? trade.direction;
            const asset = result.asset ?? trade.asset;
            const stakeAmount = result.stake ?? trade.stake;
            const entryPrice = result.entry_price ?? trade.entry_price;
            const exitPrice = result.exit_price ?? trade.expiry_price ?? 0;
            const entryTime = result.entry_time ?? trade.opened_at;
            const exitTime = result.exit_time ?? new Date().toISOString();

            const decimals = priceDecimals(asset);
            const entryStr = entryPrice.toFixed(decimals);
            const exitStr = Number(exitPrice).toFixed(decimals);
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

            // ── Client-side fairness sanity check ──────────────────────────
            // If the backend says "win" but the frontend's own price feed
            // shows the opposite, log a warning so it can be investigated.
            if (
              typeof clientExitPrice === "number" &&
              isFinite(clientExitPrice) &&
              typeof entryPrice === "number"
            ) {
              const frontendWouldWin =
                dir === "up"
                  ? clientExitPrice > entryPrice
                  : clientExitPrice < entryPrice;
              const backendSaysWin = result.status === "win";
              if (frontendWouldWin !== backendSaysWin) {
                console.warn(
                  "[BFX fairness] Frontend/backend mismatch",
                  {
                    tradeId,
                    asset,
                    direction: dir,
                    entryPrice,
                    clientExitPrice,
                    backendExitPrice: exitPrice,
                    frontendWouldWin,
                    backendSaysWin,
                  },
                );
              }
            }

            // ── Fairness receipt ───────────────────────────────────────────
            const receipt =
              `Entry: ${entryStr} @ ${entryT} → Exit: ${exitStr} @ ${exitT}` +
              ` · ${dir?.toUpperCase()} · ${asset}`;

            if (result.status === "win") {
              toast.success(`🎉 WON! +KSh ${formatKes(profit)}\n${receipt}`, {
                duration: 7000,
              });
            } else {
              toast.error(`💀 LOST! -KSh ${formatKes(stakeAmount)}\n${receipt}`, {
                duration: 7000,
              });
            }

            if (result.new_balance !== undefined) setBalance(result.new_balance);
            setOpenTrades((prev) => prev.filter((t) => t.id !== tradeId));
            fetchSettledTrades();
          }
        }
      } catch (err) {
        console.error("Settle failed:", err);
        // Allow retry on network error
        settlingIdsRef.current.delete(tradeId);
        return;
      }

      // Cleanup the "settling" marker after a short delay so the open-trades
      // fetch has time to remove the trade from the list.
      setTimeout(() => settlingIdsRef.current.delete(tradeId), 5000);
    },
    [openTrades, fetchSettledTrades],
  );

  const placeTrade = async (direction: "up" | "down") => {
    if (!user && defaultMode === "real") {
      navigate({
        to: "/auth",
        search: { mode: defaultMode, redirect: "/games/binary-fx" } as never,
      });
      return;
    }
    if (placing) return;
    if (!config) return;

    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum < config.minStake || stakeNum > config.maxStake) {
      toast(`Stake must be between KSh ${config.minStake} and KSh ${config.maxStake}`);
      return;
    }

    const currentBalance = defaultMode === "real" ? balance : (balance ?? config.demoStart);
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
    try {
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
          mode: defaultMode,
          asset: selectedAsset,
          direction,
          stake: stakeNum,
          expiry: selectedExpiry,
        }),
      });

      if (result.success) {
        toast(`${direction.toUpperCase()} trade placed at KSh ${formatKes(stakeNum)}`);
        setBalance(result.new_balance);
        fetchOpenTrades();
        fetchPrice(selectedAsset);
      } else {
        if (result.error?.includes("Insufficient")) {
          setShowDeposit(true);
        } else {
          toast(result.error || "Trade failed");
        }
      }
    } catch {
      toast("Connection lost. Please try again.");
      setConnected(false);
    } finally {
      setPlacing(false);
    }
  };

  const handleDepositSuccess = () => {
    fetchBalance();
    setShowDeposit(false);
  };

  const toggleMode = () => {
    const newMode = defaultMode === "real" ? "demo" : "real";
    window.location.href = `/games/binary-fx?mode=${newMode}`;
  };

  // ── Timers ──
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => forceTick((n) => n + 1), 1000);
    return () => clearInterval(id);
  }, []);

  // ── Initial loads ──
  useEffect(() => {
    fetchConfig();
    fetchPrice(selectedAsset);
  }, [fetchConfig, fetchPrice, selectedAsset]);

  useEffect(() => {
    fetchBalance();
    fetchOpenTrades();
    fetchSettledTrades();
  }, [user, fetchBalance, fetchOpenTrades, fetchSettledTrades, defaultMode]);

  // Refresh on tab visible
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshAll();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshAll]);

  // ── Auto-settle expired trades (fairness-critical) ──
  // Runs a scan every second. Only trades whose expires_at has passed AND
  // which are not already being settled get queued.
  useEffect(() => {
    const nowMs = Date.now();
    if (nowMs - lastSettleScanRef.current < 1000) return;
    lastSettleScanRef.current = nowMs;

    const expired = openTrades.filter(
      (t) =>
        t.status === "open" &&
        new Date(t.expires_at).getTime() <= nowMs &&
        !settledIdsRef.current.has(t.id) &&
        !settlingIdsRef.current.has(t.id),
    );

    if (expired.length === 0) return;
    expired.forEach((t) => settleTrade(t.id));
  }, [openTrades, now, settleTrade]);

  // ── Derived values ──
  const sentimentTrades: SentimentTrade[] = [...settledTrades, ...openTrades].map((t) => ({
    direction: t.direction,
  }));

  const markers: BfxMarker[] = openTrades.map((t) => {
    const expiresAtMs = new Date(t.expires_at).getTime();
    const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
    return {
      id: t.id,
      time: Math.floor(new Date(t.opened_at).getTime() / 1000),
      price: t.entry_price,
      direction: t.direction,
      stake: t.stake,
      status: t.status as BfxMarker["status"],
      remainingSeconds,
      expiresAt: expiresAtMs,
    };
  });

  const activeMarker = openTrades.reduce(
    (soonest, t) => {
      const tRemaining = new Date(t.expires_at).getTime() - now;
      if (tRemaining < 0) return soonest;
      if (!soonest || tRemaining < new Date(soonest.expires_at).getTime() - now) {
        return t;
      }
      return soonest;
    },
    null as BfxTrade | null,
  );

  const countdownSeconds = activeMarker
    ? Math.max(0, Math.ceil((new Date(activeMarker.expires_at).getTime() - now) / 1000))
    : 0;

  const expiryTime = activeMarker ? new Date(activeMarker.expires_at).getTime() : null;

  // ── Loading ──
  if (!authReady || !config) {
    return (
      <div className="min-h-screen bg-[#0a0e27] text-white flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-[#4a9eff] mx-auto mb-4"></div>
          <p className="text-gray-400">Loading Binary FX…</p>
        </div>
      </div>
    );
  }

  // ── Computed values ──
  const isRealMode = defaultMode === "real";
  const stakeNum = parseFloat(stake) || 0;
  const payout = config.payout;
  const potentialWin = stakeNum >= config.minStake ? stakeNum * (1 + payout) : 0;
  const displayBalance = isRealMode ? (balance ?? 0) : (balance ?? config.demoStart);
  const canTrade =
    (isRealMode ? user !== null && balance !== null && balance >= stakeNum : true) &&
    !placing &&
    connected;
  const insufficientFunds = isRealMode && balance !== null && balance < stakeNum;

  // ── Render ──
  return (
    <div className="min-h-screen bg-[#0a0e27] text-white pb-6">
      <div className="max-w-md mx-auto px-3 pt-4 space-y-3">
        {/* ── Top Bar ── */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <button
              onClick={() => window.history.back()}
              className="rounded-lg border border-[#2b313f] bg-[#0b0e14] p-1.5 text-gray-400 hover:text-white"
            >
              <ArrowLeft className="h-5 w-5" />
            </button>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Balance</div>
              <div className="font-bold text-sm text-gold">
                KSh {displayBalance !== null ? formatKes(displayBalance) : "—"}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex rounded-full bg-[#1a1e2e] p-0.5 text-xs font-semibold">
              <button
                onClick={() => toggleMode()}
                disabled={defaultMode === "demo"}
                className={`rounded-full px-3 py-1 transition-all ${
                  defaultMode === "demo"
                    ? "bg-emerald-500 text-black"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Demo
              </button>
              <button
                onClick={() => {
                  if (!user) {
                    navigate({
                      to: "/auth",
                      search: { mode: "real", redirect: "/games/binary-fx" } as never,
                    });
                  } else {
                    toggleMode();
                  }
                }}
                disabled={defaultMode === "real"}
                className={`rounded-full px-3 py-1 transition-all ${
                  defaultMode === "real"
                    ? "bg-gold text-black"
                    : "text-gray-500 hover:text-gray-300"
                }`}
              >
                Real
              </button>
            </div>

            <button
              onClick={() => fetchPrice(selectedAsset)}
              className="rounded-lg border border-[#2b313f] bg-[#0b0e14] px-2 py-1 text-xs text-gray-400 hover:text-white"
              disabled={!connected}
            >
              <RefreshCw className="h-3 w-3" />
            </button>

            <span className="flex items-center gap-1 text-[10px] font-semibold text-emerald-400">
              <span className="relative flex h-1.5 w-1.5">
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-400"></span>
              </span>
              LIVE
            </span>
          </div>
        </div>

        {/* ── Asset Selector + Sentiment ── */}
        <div className="flex items-end gap-3">
          <AssetSelector
            value={selectedAsset}
            assets={config.assets}
            onChange={(v) => {
              setSelectedAsset(v);
              fetchPrice(v);
            }}
          />
          <SentimentBar trades={sentimentTrades} />
        </div>

        {/* ── Chart ── */}
        <div className="relative rounded-xl overflow-hidden border border-[#2b313f]">
          <BfxLineChart
            pair={selectedAsset}
            expiryTime={expiryTime}
            markers={markers}
            colors={{ backgroundColor: "#0a0e27", textColor: "#7a82a8" }}
             onPrice={(p) => {
              setPrice(p);
            }}
            onMarkerPosition={(coords) => {
              markerCoordsRef.current = coords;
            }}
          />

          {/* Trade markers */}
          <div className="absolute inset-0 pointer-events-none">
            {(() => {
              const activeMarkers = markers.filter((m) => m.status === "open");

              const stacks: Record<
                string,
                { marker: BfxMarker; coord: { id: string; x: number; y: number } }[]
              > = {};
              activeMarkers.forEach((m) => {
                const coord = markerCoordsRef.current.find((c) => c.id === m.id);
                if (!coord) return;
                const key = Math.round(coord.y / 20).toString();
                if (!stacks[key]) stacks[key] = [];
                stacks[key].push({ marker: m, coord });
              });

              const offsetMap: Record<string, number> = {};
              Object.values(stacks).forEach((stack) => {
                stack.forEach((item, i) => {
                  offsetMap[item.marker.id] = i * 16;
                });
              });

              return activeMarkers.map((m) => {
                const coord = markerCoordsRef.current.find((c) => c.id === m.id);
                if (!coord) return null;
                const stackOffset = offsetMap[m.id] || 0;

                const isUp = m.direction === "up";
                const secondsLeft = Math.max(0, Math.ceil((m.expiresAt - now) / 1000));
                const mm = String(Math.floor(secondsLeft / 60)).padStart(2, "0");
                const ss = String(secondsLeft % 60).padStart(2, "0");

                return (
                  <div
                    key={m.id}
                    className="absolute pointer-events-none z-30"
                    style={{
                      left: coord.x,
                      top: coord.y - stackOffset,
                      transform: isUp ? "translate(-50%, -100%)" : "translate(-50%, 0%)",
                    }}
                  >
                    <div className="relative flex items-center gap-1 text-[11px] font-bold">
                      <div
                        className={`w-2.5 h-2.5 rounded-full shadow-[0_0_8px_rgba(74,158,255,0.8)] ${
                          isUp ? "bg-[#26a65b]" : "bg-[#e74c3c]"
                        }`}
                      ></div>
                      <span style={{ color: isUp ? "#26a65b" : "#e74c3c" }}>
                        KSh {m.stake}
                      </span>
                    </div>
                    <div className="text-[9px] text-[#8b92b8] text-center mt-0.5">
                      {mm}:{ss}
                    </div>
                  </div>
                );
              });
            })()}
          </div>

          {/* Active trade countdown */}
          {countdownSeconds > 0 && activeMarker && (
            <div className="absolute top-2 right-2 bg-[#0b0e14]/90 border border-[#2b313f] rounded-lg px-2 py-1 flex items-center gap-1">
              <Timer className="h-3 w-3 text-amber-300" />
              <span className="text-amber-300 font-mono text-xs font-bold">
                {Math.floor(countdownSeconds / 60)}:{String(countdownSeconds % 60).padStart(2, "0")}
              </span>
            </div>
          )}
        </div>

        {/* ── Trade Panel ── */}
        <div className="rounded-xl border border-[#2b313f] bg-[#0b0e14] p-3">
          <div className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <div className="text-[10px] uppercase text-gray-500">Time</div>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(Number(e.target.value))}
                className="mt-1 w-full bg-[#0a0e27] border border-[#2b313f] rounded-xl px-2 py-1 text-sm font-semibold text-white focus:outline-none focus:border-[#4a9eff] appearance-none"
              >
                {config.expiries.map((e) => (
                  <option key={e.seconds} value={e.seconds} className="bg-[#0a0e27]">
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Price</div>
              <div className="font-mono font-semibold text-gold text-base">
                {price?.toFixed(priceDecimals(selectedAsset)) ?? "—"}
              </div>
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Amount</div>
              <input
                type="number"
                value={stake}
                onChange={(e) => setStake(e.target.value)}
                min={config.minStake}
                max={config.maxStake}
                step="10"
                disabled={placing}
                className="mt-1 w-full h-11 bg-[#0a0e27] border border-[#2b313f] rounded-xl px-3 text-sm font-bold text-white focus:outline-none focus:border-[#4a9eff] disabled:opacity-50"
              />
            </div>
            <div>
              <div className="text-[10px] uppercase text-gray-500">Potential Payout</div>
              <div className="font-bold text-emerald-400 text-sm">
                {stakeNum >= config.minStake ? `KSh ${formatKes(potentialWin)}` : "—"}
                <span className="text-[10px] text-gray-500 ml-1">
                  ({Math.round(payout * 100)}%)
                </span>
              </div>
            </div>
          </div>

          {insufficientFunds && (
            <div className="mt-2 flex items-center justify-between rounded-lg bg-amber-500/10 border border-amber-500/20 px-3 py-2 text-xs">
              <span className="text-amber-400">
                Insufficient balance. You need at least KSh {formatKes(stakeNum)}.
              </span>
              <button
                onClick={() => setShowDeposit(true)}
                className="rounded-full border border-amber-400 px-3 py-0.5 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
              >
                Deposit Funds
              </button>
            </div>
          )}
        </div>

        {/* ── BUY / SELL ── */}
        <div className="grid grid-cols-2 gap-3">
          <button
            onClick={() => placeTrade("up")}
            disabled={!canTrade || placing}
            className={`relative overflow-hidden rounded-xl h-13 py-3 font-bold text-lg transition-all flex flex-col items-center justify-center gap-1 ${
              placing || !connected
                ? "cursor-wait bg-[#26a65b] text-black"
                : "bg-[#26a65b] hover:bg-[#229954] text-black hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#26a65b]/20"
            }`}
          >
            <TrendingUp className="h-5 w-5" />
            <span>BUY</span>
            <span className="text-[10px]">Higher</span>
          </button>
          <button
            onClick={() => placeTrade("down")}
            disabled={!canTrade || placing}
            className={`relative overflow-hidden rounded-xl h-13 py-3 font-bold text-lg transition-all flex flex-col items-center justify-center gap-1 ${
              placing || !connected
                ? "cursor-wait bg-[#e74c3c] text-white"
                : "bg-[#e74c3c] hover:bg-[#c0392b] text-white hover:scale-[1.02] active:scale-95 shadow-lg shadow-[#e74c3c]/20"
            }`}
          >
            <TrendingDown className="h-5 w-5" />
            <span>SELL</span>
            <span className="text-[10px]">Lower</span>
          </button>
        </div>

        {placing && <div className="text-center text-xs text-gray-400">Placing trade…</div>}

        {/* ── Open Trades ── */}
        <div className="space-y-2">
          <h3 className="text-[10px] uppercase text-gray-500 font-semibold">
            Open Trades ({openTrades.length})
          </h3>
          {openTrades.length === 0 ? (
            <div className="rounded-xl border border-[#2b313f] bg-[#0b0e14] p-4 text-center text-sm text-gray-500">
              No open trades. Place your first prediction above.
            </div>
          ) : (
            <div className="space-y-2">
              {openTrades.map((t) => {
                const expiresAt = new Date(t.expires_at).getTime();
                const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                // Use the trade's OWN asset price — not the globally selected one.
                const tradeAssetPrice = lastPriceByAssetRef.current[t.asset] ?? t.entry_price;
                const isWinning =
                  t.direction === "up"
                    ? tradeAssetPrice > t.entry_price
                    : tradeAssetPrice < t.entry_price;
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-xl border bg-[#0b0e14] border-[#2b313f]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          t.direction === "up"
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {t.direction.toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-sm">{t.asset}</div>
                        <div className="text-[10px] text-gray-500 font-mono">
                          Entry: {t.entry_price.toFixed(priceDecimals(t.asset))} · Now:{" "}
                          {tradeAssetPrice.toFixed(priceDecimals(t.asset))}
                        </div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div
                        className={`font-bold text-sm ${isWinning ? "text-emerald-400" : "text-red-400"}`}
                      >
                        {mins}:{String(secs).padStart(2, "0")}
                      </div>
                      <div className="text-[10px] text-gray-500">
                        KSh {formatKes(t.stake)} → KSh {formatKes(t.stake * (1 + payout))}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Recent Results ── */}
        <div className="space-y-2">
          <h3 className="text-[10px] uppercase text-gray-500 font-semibold">Recent Results</h3>
          {settledTrades.length === 0 ? (
            <div className="rounded-xl border border-[#2b313f] bg-[#0b0e14] p-4 text-center text-sm text-gray-500">
              No settled trades yet.
            </div>
          ) : (
            <div className="space-y-2">
              {settledTrades.map((t) => {
                const isWin = t.status === "win";
                const timeStr = new Date(t.opened_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                });
                return (
                  <div
                    key={t.id}
                    className="flex items-center justify-between p-3 rounded-xl border bg-[#0b0e14] border-[#2b313f]"
                  >
                    <div className="flex items-center gap-3">
                      <span
                        className={`text-[10px] font-bold px-2 py-0.5 rounded uppercase ${
                          isWin
                            ? "bg-emerald-500/20 text-emerald-400"
                            : "bg-red-500/20 text-red-400"
                        }`}
                      >
                        {t.status.toUpperCase()}
                      </span>
                      <div>
                        <div className="font-semibold text-sm">{t.asset}</div>
                        <div className="text-[10px] text-gray-500">{timeStr}</div>
                      </div>
                    </div>
                    <div className="text-right">
                      <div className={`font-bold ${isWin ? "text-emerald-400" : "text-red-400"}`}>
                        {t.profit > 0
                          ? `+KSh ${formatKes(t.profit)}`
                          : t.profit < 0
                            ? `-KSh ${formatKes(Math.abs(t.profit))}`
                            : "—"}
                      </div>
                      <div className="text-[9px] text-gray-600 dark:text-gray-500 font-mono">
                        Entry: {t.entry_price.toFixed(priceDecimals(t.asset))} → Exit:{" "}
                        {(t.expiry_price ?? 0).toFixed(priceDecimals(t.asset))} •{" "}
                        {t.direction.toUpperCase()}
                      </div>
                      <div className="text-[10px] text-gray-500">
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
