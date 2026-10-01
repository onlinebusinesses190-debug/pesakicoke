/**
 * PESAKI Forex — trading screen.
 *
 * Separate from /trading/fx, which is the binary prediction game.
 *
 * Everything authoritative comes from the backend: prices, quotes, candles,
 * balance, margin, position size and P/L. This file only renders what it is
 * given and sends intents. It never computes a P/L or decides whether a trade
 * is winning.
 *
 * DEMO and REAL are separate accounts on the server. The mode in the URL is a
 * display preference only — it grants nothing. If the backend has real trading
 * switched off, selecting REAL surfaces the server's reason instead of quietly
 * bouncing the user back to demo.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Wallet,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DepositSheet } from "@/components/DepositSheet";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Card, SectionTitle } from "@/components/ui-bits";
import { ForexChart, type ForexCandle, type ForexInterval } from "@/components/forex/ForexChart";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

type Mode = "demo" | "live";
type Side = "buy" | "sell";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  mid: number;
  spreadPips: number;
  provider: string;
  state: string;
}

interface WatchRow {
  pips: number;
  percent: number;
  high: number | null;
  low: number | null;
}

interface Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Position {
  id: string;
  instrument_id: number;
  symbol?: string;
  side: Side;
  quantity: number;
  average_entry_price: number;
  current_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  realized_pnl: number;
  unrealised_pnl?: number;
  margin?: number;
  opened_at: string;
}

interface AccountState {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPercent: number | null;
  /** Platform leverage as a plain multiplier, e.g. 10 for 10:1. */
  leverage?: number;
}

interface HistoryRow {
  id: string;
  kind: string;
  symbol?: string;
  side: Side;
  quantity: number;
  entry: number | null;
  pnl: number;
  status: string;
  closeReason?: string;
  closedAt: string;
}

const ksh = (n: number) =>
  `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/trading/forex")({
  head: () => ({
    meta: [
      { title: "PESAKI Forex — Currency Trading" },
      {
        name: "description",
        content: "Trade currency pairs on the PESAKI market engine. Demo and real accounts.",
      },
    ],
  }),
  component: ForexPage,
});

function ForexPage() {
  const navigate = useNavigate();
  const { user, ready } = useRequireAuth();
  const search = Route.useSearch?.() as { mode?: string } | undefined;
  const [showDeposit, setShowDeposit] = useState(false);

  const [mode, setMode] = useState<Mode>(search?.mode === "live" ? "live" : "demo");
  const [symbol, setSymbol] = useState("EUR/USD");
  const [interval, setInterval_] = useState<ForexInterval>("5m");

  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [watch, setWatch] = useState<Record<string, WatchRow>>({});
  const [marketState, setMarketState] = useState("open");
  const [candles, setCandles] = useState<Candle[]>([]);

  const [account, setAccount] = useState<AccountState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [history, setHistory] = useState<HistoryRow[]>([]);
  const [realEnabled, setRealEnabled] = useState(true);
  const [realBlocked, setRealBlocked] = useState<string | null>(null);

  const [side, setSide] = useState<Side>("buy");
  // Trade Amount is the user's input: KSh of capital committed to the trade.
  // Position size (lots) is derived server-side from this and the platform
  // leverage, because a KSh 100 trade cannot be expressed in standard lots.
  const [tradeAmountInput, setTradeAmountInput] = useState("1000");
  const [lots, setLots] = useState("0.10");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);

  const idemRef = useRef<string>(crypto.randomUUID());

  // ── Market data ───────────────────────────────────────────────────────────
  const loadQuotes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/forex/quotes`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error);
      const map: Record<string, Quote> = {};
      for (const q of body.quotes as Quote[]) map[q.symbol] = q;
      setQuotes(map);
      setWatch(body.watch ?? {});
      setMarketState(body.state ?? "open");
    } catch {
      setMarketState("unavailable");
    }
  }, []);

  const loadCandles = useCallback(
    async (sym: string, iv: ForexInterval) => {
      try {
        const res = await fetch(
          `${API_BASE}/forex/candles?symbol=${encodeURIComponent(sym)}&interval=${iv}&count=180`,
        );
        const body = await res.json();
        if (res.ok && body.success) setCandles(body.candles);
        else setCandles([]);
      } catch {
        setCandles([]);
      }
    },
    [],
  );

  // ── Account ───────────────────────────────────────────────────────────────
  const loadAccount = useCallback(
    async (m: Mode) => {
      setLoadingAccount(true);
      try {
        const res = await apiRequest(`/forex/account?account_type=${m}`);
        if (res?.success) {
          setAccount(res.account);
          setPositions(res.positions ?? []);
          setRealEnabled(Boolean(res.realTradingEnabled));
          setRealBlocked(null);
        }
      } catch (err) {
        // A disabled real account is a legitimate server answer, not a crash.
        const message = err instanceof Error ? err.message : "Could not load the account";
        if (m === "live") {
          setRealBlocked(message);
          setRealEnabled(false);
        }
        // Clear the account on any failure. Leaving the previous mode's numbers
        // on screen is how the KSh 100,000 demo balance ended up displayed in the
        // REAL view, which misrepresents real funds as demo money.
        setAccount(null);
        setPositions([]);
      } finally {
        setLoadingAccount(false);
      }
    },
    [],
  );

  const loadHistory = useCallback(async (m: Mode) => {
    try {
      const res = await apiRequest(`/forex/history?mode=${m}&limit=50`);
      if (res?.success) setHistory(res.history ?? []);
    } catch {
      setHistory([]);
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
    const t = setInterval(() => void loadQuotes(), 5_000);
    return () => clearInterval(t);
  }, [loadQuotes]);

  useEffect(() => {
    void loadCandles(symbol, interval);
    const t = setInterval(() => void loadCandles(symbol, interval), 5_000);
    return () => clearInterval(t);
  }, [symbol, interval, loadCandles]);

  useEffect(() => {
    void loadAccount(mode);
    void loadHistory(mode);
    const t = setInterval(() => void loadAccount(mode), 5_000);
    return () => clearInterval(t);
  }, [mode, loadAccount, loadHistory]);

  const quote = quotes[symbol];
  const digits = symbol.endsWith("JPY") ? 3 : 5;

  const openPositionsForSymbol = useMemo(
    () => positions.filter((p) => p.symbol === symbol),
    [positions, symbol],
  );

  const priceLines = useMemo(() => {
    const first = openPositionsForSymbol[0];
    if (!first) return {};
    return {
      entry: Number(first.average_entry_price),
      stopLoss: first.stop_loss != null ? Number(first.stop_loss) : undefined,
      takeProfit: first.take_profit != null ? Number(first.take_profit) : undefined,
    };
  }, [openPositionsForSymbol]);

  // Entry price for the ticket, derived from the live quote rather than typed.
  const entryPrice = side === "buy" ? quote?.ask : quote?.bid;

  const requiredMargin = useMemo(() => {
    if (!quote || !entryPrice) return null;
    // Indicative only. The server recomputes and is the authority; this exists
    // so the user sees a number before committing.
    const notional = Number(lots) * 100_000 * entryPrice;
    const q2k = quote.symbol.endsWith("JPY") ? 0.88 : 130;
    return (notional * q2k) / 100;
  }, [quote, entryPrice, lots]);

  // Trade Amount is the capital the user commits, in KSh. The margin held is
  // exactly this amount; the position size behind it is derived server-side
  // using the platform's leverage, which the client never sets.
  const leverage = account?.leverage ?? 10;
  const minTradeAmount = 100;
  const freeMargin = account?.freeMargin ?? null;
  const exposure = Number(tradeAmountInput) > 0 ? Number(tradeAmountInput) * leverage : 0;

  const placeOrder = async () => {
    if (!quote) return;
    const amount = Number(tradeAmountInput);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid trade amount");
      return;
    }
    if (amount < minTradeAmount) {
      toast.error(`Minimum trade amount is KSh ${minTradeAmount}`);
      return;
    }
    if (freeMargin != null && amount > freeMargin) {
      toast.error(`Insufficient free margin. You have KSh ${freeMargin.toFixed(2)} available.`);
      return;
    }
    setBusy(true);
    try {
      const res = await apiRequest("/forex/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          trade_amount: amount,
          order_type: orderType,
          limit_price: orderType === "limit" ? Number(limitPrice) : null,
          stop_loss: stopLoss ? Number(stopLoss) : null,
          take_profit: takeProfit ? Number(takeProfit) : null,
          account_type: mode,
          idempotency_key: idemRef.current,
        }),
      });
      if (res?.success) {
        toast.success(
          `${side === "buy" ? "Bought" : "Sold"} ${symbol} · KSh ${amount.toLocaleString()} committed`,
        );
        idemRef.current = crypto.randomUUID();
        await loadAccount(mode);
        await loadHistory(mode);
      } else {
        toast.error(res?.error ?? "The order was rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach the trading server");
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (id: string) => {
    try {
      const res = await apiRequest(`/forex/positions/${id}/close`, { method: "POST" });
      if (res?.success) {
        const pnl = Number(res.realizedPnl ?? 0);
        toast.success(`Closed for ${pnl >= 0 ? "+" : ""}${ksh(pnl)}`);
        await loadAccount(mode);
        await loadHistory(mode);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close the position");
    }
  };

  const resetDemo = async () => {
    if (!window.confirm("Reset your demo account to KSh 100,000 and close all demo positions?")) {
      return;
    }
    try {
      const res = await apiRequest("/forex/account/reset-demo", { method: "POST" });
      if (res?.success) {
        toast.success("Demo account reset");
        await loadAccount("demo");
        await loadHistory("demo");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reset the demo account");
    }
  };

  const marketBadge =
    marketState === "open" ? "MARKET OPEN" : marketState === "paused" ? "MARKET PAUSED" : "MARKET UNAVAILABLE";

  return (
    <AppShell>
      {/* ── Header ─────────────────────────────────────────────────────── */}
      <header className="sticky top-0 z-30 border-b border-border bg-background/95 px-4 py-3 backdrop-blur-xl">
        <div className="flex items-center gap-3">
          <button
            onClick={() => navigate({ to: "/trading" })}
            aria-label="Back to trading"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>

          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-bold text-brand-deep">Forex</p>
            <p className="truncate text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              {marketBadge}
            </p>
          </div>

          <div className="shrink-0 text-right">
            <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Available balance
            </p>
            <p className="font-display text-sm font-bold text-brand-deep">
              {loadingAccount && !account ? "—" : ksh(account?.balance ?? 0)}
            </p>
          </div>
        </div>

        {/* Mode switch. DEMO/REAL only — never "LIVE", which used to sit on a
            demo account and misrepresent it. */}
        <div className="mt-3 flex gap-2">
          {(["demo", "live"] as Mode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={[
                "flex-1 rounded-full py-1.5 text-[11px] font-bold uppercase tracking-wide transition-colors",
                m === mode
                  ? m === "live"
                    ? "bg-brand-deep text-white"
                    : "bg-brand-gold text-brand-deep"
                  : "bg-muted text-muted-foreground",
              ].join(" ")}
            >
              {m === "demo" ? "Demo" : "Real"}
            </button>
          ))}
        </div>
      </header>

      <div className="space-y-4 px-4 pb-8 pt-4">
        {/* Real trading disabled: explain, do not pretend, do not force demo. */}
        {mode === "live" && !realEnabled && (
          <div className="flex items-start gap-2.5 rounded-2xl border border-border bg-muted/40 p-3.5">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
            <div>
              <p className="text-[13px] font-semibold text-foreground">
                Real trading is not enabled on this deployment
              </p>
              <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
                {realBlocked ??
                  "The server has not switched real-money forex trading on. Your demo account is unaffected."}
              </p>
            </div>
          </div>
        )}

        {/* Deposit / reset */}
        <div className="flex gap-2">
          {mode === "live" ? (
            <button
              onClick={() => setShowDeposit(true)}
              className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-gold py-2.5 text-[12px] font-bold text-brand-deep"
            >
              <Wallet className="h-4 w-4" /> Deposit
            </button>
          ) : (
            <button
              onClick={resetDemo}
              className="flex flex-1 items-center justify-center gap-2 rounded-full border border-border py-2.5 text-[12px] font-semibold text-foreground"
            >
              <RefreshCw className="h-4 w-4" /> Reset demo
            </button>
          )}
        </div>

        {/* ── Market watch ────────────────────────────────────────────── */}
        <div>
          <SectionTitle title="Market watch" />
          <div className="mt-2 grid grid-cols-2 gap-2">
            {Object.values(quotes).map((q) => {
              const w = watch[q.symbol];
              const up = (w?.pips ?? 0) >= 0;
              const active = q.symbol === symbol;
              return (
                <button
                  key={q.symbol}
                  onClick={() => setSymbol(q.symbol)}
                  className={[
                    "rounded-xl border p-2.5 text-left transition-colors",
                    active ? "border-brand-ink bg-brand-tint-green" : "border-border bg-card",
                  ].join(" ")}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-[12px] font-bold text-brand-deep">{q.symbol}</span>
                    {w && (
                      <span
                        className={[
                          "flex items-center text-[10px] font-bold",
                          up ? "text-brand-ink" : "text-destructive",
                        ].join(" ")}
                      >
                        {up ? <ArrowUpRight className="h-3 w-3" /> : <ArrowDownRight className="h-3 w-3" />}
                        {w.percent}%
                      </span>
                    )}
                  </div>
                  <div className="mt-1 font-mono text-[11px] text-foreground">
                    {q.bid} / {q.ask}
                  </div>
                  <div className="mt-0.5 text-[9px] text-muted-foreground">
                    {q.spreadPips} pips
                    {w?.high != null && w?.low != null ? ` · ${w.low}–${w.high}` : ""}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* ── Chart ───────────────────────────────────────────────────── */}
        <div>
          <div className="mb-2 flex items-end justify-between">
            <div>
              <h2 className="font-display text-lg font-bold text-brand-deep">{symbol}</h2>
              {quote ? (
                <p className="text-[11px] text-muted-foreground">
                  Bid {quote.bid} · Ask {quote.ask} · {quote.spreadPips} pips
                </p>
              ) : (
                <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <Loader2 className="h-3 w-3 animate-spin" /> Loading
                </p>
              )}
            </div>
          </div>

          {marketState === "unavailable" ? (
            <div className="grid h-64 place-items-center rounded-2xl border border-border bg-card">
              <div className="text-center">
                <WifiOff className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-[12px] font-semibold text-foreground">Market unavailable</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  The PESAKI market engine is not reachable right now.
                </p>
              </div>
            </div>
          ) : candles.length > 0 ? (
            <ForexChart
              data={candles}
              interval={interval}
              onIntervalChange={setInterval_}
              lines={priceLines}
              digits={digits}
            />
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-border bg-card">
              <p className="text-[12px] text-muted-foreground">Loading {symbol} candles…</p>
            </div>
          )}
        </div>

        {/* ── Account metrics ─────────────────────────────────────────── */}
        {account && (
          <div className="grid grid-cols-2 gap-2">
            {(
              [
                ["Equity", ksh(account.equity)],
                ["Used margin", ksh(account.usedMargin)],
                ["Free margin", ksh(account.freeMargin)],
                ["Margin level", account.marginLevelPercent ? `${account.marginLevelPercent}%` : "—"],
              ] as const
            ).map(([label, value]) => (
              <Card key={label} className="!p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-0.5 text-[13px] font-bold text-brand-deep">{value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* ── Order ticket ────────────────────────────────────────────── */}
        <div>
          <SectionTitle title="Order ticket" />
          <Card className="mt-2 !p-4">
            <div className="grid grid-cols-2 gap-2">
              {(["buy", "sell"] as Side[]).map((s) => (
                <button
                  key={s}
                  onClick={() => setSide(s)}
                  className={[
                    "flex h-11 items-center justify-center gap-1.5 rounded-xl text-sm font-bold transition-colors",
                    s === side
                      ? s === "buy"
                        ? "bg-brand-deep text-white"
                        : "bg-destructive text-white"
                      : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {s === "buy" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownRight className="h-4 w-4" />}
                  {s.toUpperCase()}
                </button>
              ))}
            </div>

            <div className="mt-3 flex gap-2">
              {(["market", "limit"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={[
                    "flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize transition-colors",
                    t === orderType ? "bg-brand-deep text-white" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>

            {orderType === "limit" && (
              <div className="mt-3">
                <label className="block text-[11px] font-semibold text-foreground">Limit price</label>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={entryPrice ? String(entryPrice) : "0.00000"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            )}

            <label className="mt-3 block text-[11px] font-semibold text-foreground">
              Trade Amount (KSh)
            </label>
            <input
              value={tradeAmountInput}
              onChange={(e) => setTradeAmountInput(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="1000"
              aria-label="Trade Amount in Kenyan Shillings"
              className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
            />
            <p className="mt-1 text-[10px] text-muted-foreground">
              Minimum KSh {minTradeAmount}. This amount is held as margin
              {exposure > 0 ? ` and controls a KSh ${exposure.toLocaleString()} position.` : "."}
            </p>

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-foreground">Stop loss</label>
                <input
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  inputMode="decimal"
                  placeholder="none"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-foreground">Take profit</label>
                <input
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  inputMode="decimal"
                  placeholder="none"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            </div>

            <div className="mt-3 space-y-1 rounded-xl bg-muted/50 p-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry (estimated)</span>
                <span className="font-semibold text-foreground">{entryPrice ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required margin</span>
                <span className="font-semibold text-foreground">
                  {requiredMargin != null ? ksh(requiredMargin) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spread cost</span>
                <span className="font-semibold text-foreground">
                  {quote ? `${quote.spreadPips} pips` : "—"}
                </span>
              </div>
            </div>

            <button
              onClick={placeOrder}
              disabled={busy || !quote || marketState !== "open"}
              className={[
                "mt-3 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-white disabled:opacity-50",
                side === "buy" ? "bg-brand-deep" : "bg-destructive",
              ].join(" ")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Submitting…" : `${side === "buy" ? "Buy" : "Sell"} ${symbol}`}
            </button>

            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
              Prices come from the PESAKI market engine and are generated, not interbank rates.
              {mode === "demo"
                ? " Demo funds are virtual and never touch your wallet."
                : " Trading real funds can lose you money."}
            </p>
          </Card>
        </div>

        {/* ── Positions ───────────────────────────────────────────────── */}
        <div>
          <SectionTitle title="Open positions" />
          {positions.length === 0 ? (
            <Card className="mt-2 !p-4">
              <p className="text-[12px] font-semibold text-foreground">No open positions</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Place a trade above and it will appear here.
              </p>
            </Card>
          ) : (
            <div className="mt-2 space-y-2">
              {positions.map((p) => {
                const pnl = Number(p.unrealised_pnl ?? 0);
                return (
                  <Card key={p.id} className="!p-3.5">
                    <div className="flex items-center justify-between gap-3">
                      <div className="min-w-0">
                        <p className="text-[13px] font-bold text-brand-deep">
                          {p.symbol ?? "—"} · {p.side.toUpperCase()}
                        </p>
                        <p className="mt-0.5 text-[11px] text-muted-foreground">
                          {p.quantity} lots @ {p.average_entry_price}
                          {p.current_price != null ? ` → ${p.current_price}` : ""}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {p.stop_loss != null ? `SL ${p.stop_loss} · ` : ""}
                          {p.take_profit != null ? `TP ${p.take_profit}` : ""}
                        </p>
                      </div>
                      <div className="shrink-0 text-right">
                        <p
                          className={[
                            "text-[13px] font-bold",
                            pnl >= 0 ? "text-brand-ink" : "text-destructive",
                          ].join(" ")}
                        >
                          {pnl >= 0 ? "+" : ""}
                          {ksh(pnl)}
                        </p>
                        <button
                          onClick={() => void closePosition(p.id)}
                          className="mt-1 text-[10px] font-semibold text-muted-foreground underline"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  </Card>
                );
              })}
            </div>
          )}
        </div>

        {/* ── History ─────────────────────────────────────────────────── */}
        <div>
          <SectionTitle title={`Trade history · ${mode === "demo" ? "Demo" : "Real"}`} />
          {history.length === 0 ? (
            <Card className="mt-2 !p-4">
              <p className="text-[12px] font-semibold text-foreground">No closed trades yet</p>
            </Card>
          ) : (
            <div className="mt-2 space-y-2">
              {history.map((h) => (
                <Card key={h.id} className="!p-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[12px] font-bold text-brand-deep">
                        {h.symbol ?? "—"} · {h.side?.toUpperCase() ?? "—"} · {h.quantity} lots
                      </p>
                      <p className="mt-0.5 text-[10px] text-muted-foreground">
                        {h.entry != null ? `Entry ${h.entry} · ` : ""}
                        {h.status}
                        {h.closeReason && h.closeReason !== "manual" ? ` · ${h.closeReason}` : ""}
                      </p>
                    </div>
                    <p
                      className={[
                        "shrink-0 text-[12px] font-bold",
                        h.pnl > 0 ? "text-brand-ink" : h.pnl < 0 ? "text-destructive" : "text-muted-foreground",
                      ].join(" ")}
                    >
                      {h.kind === "position" ? `${h.pnl >= 0 ? "+" : ""}${ksh(h.pnl)}` : h.status}
                    </p>
                  </div>
                </Card>
              ))}
            </div>
          )}
        </div>
      </div>

      {showDeposit && user && (
        <DepositSheet
          onClose={() => setShowDeposit(false)}
          user={user}
          onSuccess={() => void loadAccount(mode)}
          onDepositComplete={() => void loadAccount(mode)}
        />
      )}
    </AppShell>
  );
}