import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState, useEffect, useCallback, useRef } from "react";
import {
  RefreshCw,
  Timer,
  TrendingUp,
  TrendingDown,
  Wallet,
} from "lucide-react";
import { apiRequest } from "@/utils/api";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { DepositSheet } from "@/components/DepositSheet";
import { toast } from "sonner";
import { BfxLineChart, type BfxMarker } from "@/components/fx/BfxLineChart";

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

  const [priceData, setPriceData] = useState<{ time: number; value: number }[]>([]);
  const [now, setNow] = useState(Date.now());
  const lastSettleScanRef = useRef(0);

  const fetchConfig = useCallback(async () => {
    try {
      const data = await apiRequest<{ success: boolean; data: Config } | Config>(
        `${API_URL}/games/bfx/config`,
      );
      const cfg = (data as { success: boolean; data: Config }).data ?? (data as Config);
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
      const t = Math.floor(Date.now() / 1000);
      setPriceData((prev) => {
        const updated = [...prev, { time: t, value: p }];
        if (updated.length > 200) updated.shift();
        return updated;
      });
      setConnected(true);
      return p;
    } catch {
      setConnected(false);
    }
  }, []);

  const fetchBalance = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{
        balance: number;
        demo_balance: number;
      }>(`${API_URL}/wallet/balance`);
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
      setOpenTrades(data.data || []);
    } catch {
      // silent
    }
  }, [user]);

  const fetchSettledTrades = useCallback(async () => {
    if (!user) return;
    try {
      const data = await apiRequest<{ success: boolean; data: BfxTrade[] }>(
        `${API_URL}/games/bfx/trades/settled?limit=50`,
      );
      setSettledTrades(data.data || []);
    } catch {
      // silent
    }
  }, [user]);

  const refreshAll = useCallback(() => {
    fetchConfig();
    fetchBalance();
    fetchOpenTrades();
    fetchSettledTrades();
  }, [fetchConfig, fetchBalance, fetchOpenTrades, fetchSettledTrades]);

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    fetchConfig();
    fetchPrice(selectedAsset);
  }, [fetchConfig, fetchPrice, selectedAsset]);

  useEffect(() => {
    if (user) {
      fetchBalance();
      fetchOpenTrades();
      fetchSettledTrades();
    }
  }, [user, fetchBalance, fetchOpenTrades, fetchSettledTrades, defaultMode]);

  useEffect(() => {
    const interval = setInterval(() => {
      fetchPrice(selectedAsset);
    }, 2000);
    return () => clearInterval(interval);
  }, [fetchPrice, selectedAsset]);

  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        refreshAll();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => document.removeEventListener("visibilitychange", handleVisibility);
  }, [refreshAll]);

  const settleTrade = async (tradeId: string) => {
    try {
      await apiRequest(`${API_URL}/games/bfx/trade/${tradeId}/settle`, {
        method: "POST",
        body: JSON.stringify({}),
      });
      fetchOpenTrades();
      fetchSettledTrades();
      fetchBalance();
    } catch {
      // silent
    }
  };

  useEffect(() => {
    const expired = openTrades.filter(
      (t) => t.status === "open" && new Date(t.expires_at).getTime() <= now,
    );
    if (expired.length === 0) return;
    expired.forEach((t) => settleTrade(t.id));
  }, [openTrades, now]);

  const placeTrade = async (direction: "up" | "down") => {
    if (!user) return;
    if (placing) return;
    if (!config) return;

    const stakeNum = parseFloat(stake);
    if (isNaN(stakeNum) || stakeNum < config.minStake || stakeNum > config.maxStake) {
      toast(`Stake must be between KSh ${config.minStake} and KSh ${config.maxStake}`);
      return;
    }

    if (balance !== null && balance < stakeNum) {
      toast(`Insufficient balance. Current: KSh ${formatKes(balance)}`);
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
    if (newMode === "real" && !user) {
      navigate({ to: "/auth", search: { redirect: `/games/binary-fx?mode=real` } as never });
      return;
    }
    window.location.href = `/games/binary-fx?mode=${newMode}`;
  };

  if (!authReady || !config) {
    return (
      <AppShell>
        <PageHeader title="Binary FX" subtitle="Quick UP/DOWN predictions on major pairs" />
        <div className="p-5 space-y-3">
          {!config && (
            <Card>
              <div className="text-center py-8 text-muted-foreground">Loading configuration…</div>
            </Card>
          )}
          <Card>
            <div className="flex items-center justify-center py-6 text-muted-foreground">
              <RefreshCw className="h-5 w-5 animate-spin mr-2" />
              <span>Connecting to Binary FX engine…</span>
            </div>
          </Card>
        </div>
      </AppShell>
    );
  }

  const isRealMode = defaultMode === "real";
  const stakeNum = parseFloat(stake) || 0;
  const canTrade = user !== null && balance !== null && balance >= stakeNum && !placing;
  const insufficientFunds = balance !== null && balance < stakeNum;
  const payout = config.payout;
  const potentialWin = stakeNum >= config.minStake ? stakeNum * (1 + payout) : 0;

  const chartData = priceData.length > 0
    ? priceData
    : [{ time: Math.floor(Date.now() / 1000), value: price ?? 0 }];

  const markers: BfxMarker[] = openTrades.map((t) => {
    const expiresAtMs = new Date(t.expires_at).getTime();
    const remainingSeconds = Math.max(0, Math.ceil((expiresAtMs - now) / 1000));
    return {
      id: t.id,
      time: Math.floor(new Date(t.opened_at).getTime() / 1000),
      price: t.entry_price,
      direction: t.direction,
      stake: t.stake,
      status: t.status,
      remainingSeconds,
      expiresAt: expiresAtMs,
    };
  });

  const activeMarker = openTrades.reduce((soonest, t) => {
    const tRemaining = new Date(t.expires_at).getTime() - now;
    if (tRemaining < 0) return soonest;
    if (!soonest || tRemaining < (new Date(soonest.expires_at).getTime() - now)) {
      return t;
    }
    return soonest;
  }, null as BfxTrade | null);

  const countdownSeconds = activeMarker
    ? Math.max(0, Math.ceil((new Date(activeMarker.expires_at).getTime() - now) / 1000))
    : 0;

  const handleDeposit = () => setShowDeposit(true);

  return (
    <AppShell>
      <PageHeader
        title="Binary FX"
        subtitle="Predict direction. Win 90% if you're right."
        right={
          <button
            onClick={toggleMode}
            className={`px-3 py-1 rounded-full text-xs font-semibold transition-all ${
              isRealMode
                ? "bg-primary/10 text-primary border border-primary/30"
                : "bg-muted/50 text-muted-foreground border border-border"
            }`}
          >
            {isRealMode ? "REAL" : "DEMO"}
          </button>
        }
      />

      <div className="px-5 pt-4 space-y-4 pb-6">
        {/* ── Balance & Connection Status ── */}
        <Card className="!p-3">
          <div className="flex items-center justify-between text-sm">
            <div className="flex items-center gap-2">
              <Wallet className="h-4 w-4 text-muted-foreground" />
              <span className="text-muted-foreground">Balance</span>
            </div>
            <div className="flex items-center gap-3">
              <span className="font-bold text-lg text-gold">
                KSh {balance !== null ? formatKes(balance) : "—"}
              </span>
              {!connected && (
                <Badge tone="destructive" className="text-[10px]">
                  OFFLINE
                </Badge>
              )}
              {insufficientFunds && (
                <button
                  onClick={handleDeposit}
                  className="rounded-full border border-warning px-2 py-0.5 text-[10px] font-semibold text-warning-foreground hover:bg-warning/20"
                >
                  Deposit
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* ── Asset Picker ── */}
        <Card className="!p-3">
          <SectionTitle title="Asset" />
          <select
            value={selectedAsset}
            onChange={(e) => setSelectedAsset(e.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-medium focus:outline-none focus:ring-1 focus:ring-primary"
          >
            {config.assets.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>

          <div className="mt-2 grid grid-cols-2 gap-3">
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Expiry</label>
              <select
                value={selectedExpiry}
                onChange={(e) => setSelectedExpiry(Number(e.target.value))}
                className="mt-1 w-full rounded-lg border border-border bg-background px-2 py-1.5 text-sm focus:outline-none focus:ring-1 focus:ring-primary"
              >
                {config.expiries.map((e) => (
                  <option key={e.seconds} value={e.seconds}>
                    {e.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="text-[10px] uppercase text-muted-foreground">Current Price</label>
              <div className="mt-1 flex items-center gap-2">
                <span className="font-bold text-xl text-gold">
                  {price?.toFixed(5) ?? "—"}
                </span>
                <Badge tone={connected ? "success" : "destructive"} className="text-[9px]">
                  {connected ? "LIVE" : "OFFLINE"}
                </Badge>
              </div>
            </div>
          </div>
        </Card>

        {/* ── Chart ── */}
        <Card className="!relative !p-3">
          <div className="mb-2 flex items-center justify-between">
            <SectionTitle title="Price Chart" />
            <button
              onClick={() => fetchPrice(selectedAsset)}
              className="rounded-lg border border-border bg-background px-2 py-1 text-xs"
              disabled={!connected}
            >
              <RefreshCw className="h-3 w-3" />
            </button>
          </div>
          <BfxLineChart
            data={chartData}
            markers={markers}
            colors={{ backgroundColor: "transparent", textColor: "#9ca3af" }}
          />
          {countdownSeconds > 0 && activeMarker && (
            <div className="absolute top-3 right-3 rounded-lg bg-card/90 border border-border px-3 py-1.5 text-center">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <Timer className="h-3 w-3" />
                <span>{activeMarker.direction.toUpperCase()}</span>
              </div>
              <div className="text-lg font-bold text-gold">
                {Math.floor(countdownSeconds / 60)}:{String(countdownSeconds % 60).padStart(2, "0")}
              </div>
            </div>
          )}
        </Card>

        {/* ── Stake Input & Trade Buttons ── */}
        <Card className="!p-4">
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Stake (KSh)</label>
                <input
                  type="number"
                  value={stake}
                  onChange={(e) => setStake(e.target.value)}
                  min={config.minStake}
                  max={config.maxStake}
                  step="10"
                  className="mt-1 w-full rounded-lg border border-border bg-background px-3 py-2 text-sm font-bold focus:outline-none focus:ring-1 focus:ring-primary"
                  disabled={placing}
                />
              </div>
              <div>
                <label className="text-[10px] uppercase text-muted-foreground">Potential Win</label>
                <div className="mt-1 flex items-center">
                  <span className="font-bold text-xl text-green-400">
                    {stakeNum >= config.minStake
                      ? `KSh ${formatKes(potentialWin)}`
                      : "—"}
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    ({Math.round(payout * 100)}% payout)
                  </span>
                </div>
              </div>
            </div>

            {insufficientFunds && (
              <div className="flex items-center justify-between rounded-lg bg-warning/10 border border-warning/20 px-3 py-2 text-xs">
                <span className="text-warning-foreground">
                  Insufficient balance. You need at least KSh {formatKes(stakeNum)}.
                </span>
                <button
                  onClick={handleDeposit}
                  className="rounded-full border border-warning px-3 py-1 text-xs font-semibold text-warning-foreground hover:bg-warning/20"
                >
                  Deposit
                </button>
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={() => placeTrade("up")}
                disabled={!canTrade || placing || !connected}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 font-bold transition-all ${
                  placing || !connected
                    ? "cursor-wait opacity-50"
                    : "gradient-primary text-primary-foreground hover:scale-105 active:scale-95"
                }`}
              >
                <TrendingUp className="h-5 w-5" />
                <span>UP</span>
              </button>
              <button
                onClick={() => placeTrade("down")}
                disabled={!canTrade || placing || !connected}
                className={`flex flex-col items-center gap-1 rounded-xl py-3 font-bold transition-all ${
                  placing || !connected
                    ? "cursor-wait opacity-50"
                    : "gradient-primary text-primary-foreground hover:scale-105 active:scale-95"
                }`}
              >
                <TrendingDown className="h-5 w-5" />
                <span>DOWN</span>
              </button>
            </div>

            {placing && (
              <div className="text-center text-xs text-muted-foreground">
                Placing trade…
              </div>
            )}
          </div>
        </Card>

        {/* ── Open Trades ── */}
        <div className="space-y-2">
          <SectionTitle title="Open Trades" />
          {openTrades.length === 0 ? (
            <Card>
              <p className="text-center py-4 text-sm text-muted-foreground">
                No open trades. Place your first prediction above.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {openTrades.map((t) => {
                const expiresAt = new Date(t.expires_at).getTime();
                const remaining = Math.max(0, Math.ceil((expiresAt - now) / 1000));
                const mins = Math.floor(remaining / 60);
                const secs = remaining % 60;
                const currentPrice = price ?? 0;
                const isWinning = t.direction === "up"
                  ? currentPrice > t.entry_price
                  : currentPrice < t.entry_price;
                return (
                  <Card key={t.id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge tone={t.direction === "up" ? "success" : "warning"}>
                          {t.direction.toUpperCase()}
                        </Badge>
                        <div>
                          <div className="font-semibold">{t.asset}</div>
                          <div className="text-xs text-muted-foreground">
                            Entry: {t.entry_price.toFixed(5)} | Stake: KSh {formatKes(t.stake)}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold text-sm ${isWinning ? "text-green-400" : "text-red-400"}`}
                        >
                          {mins}:{String(secs).padStart(2, "0")}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Potential: KSh {formatKes(t.stake * (1 + payout))}
                        </div>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── Settled Trades ── */}
        <div className="space-y-2">
          <SectionTitle title="Recent Results" />
          {settledTrades.length === 0 ? (
            <Card>
              <p className="text-center py-4 text-sm text-muted-foreground">
                No settled trades yet.
              </p>
            </Card>
          ) : (
            <div className="space-y-2">
              {settledTrades.map((t) => {
                const isWin = t.status === "win";
                const isLoss = t.status === "loss" || t.status === "tie";
                return (
                  <Card key={t.id} className="!p-3">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <Badge
                          tone={isWin ? "success" : isLoss ? "destructive" : "neutral"}
                        >
                          {t.status.toUpperCase()}
                        </Badge>
                        <div>
                          <div className="font-semibold">{t.asset}</div>
                          <div className="text-xs text-muted-foreground">
                            {new Date(t.opened_at).toLocaleTimeString()}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div
                          className={`font-bold ${
                            isWin
                              ? "text-green-400"
                              : isLoss
                                ? "text-red-400"
                                : "text-muted-foreground"
                          }`}
                        >
                          {t.profit > 0
                            ? `+KSh ${formatKes(t.profit)}`
                            : t.profit < 0
                              ? `-KSh ${formatKes(Math.abs(t.profit))}`
                              : "—"}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          Stake: KSh {formatKes(t.stake)}
                        </div>
                      </div>
                    </div>
                  </Card>
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
    </AppShell>
  );
}
