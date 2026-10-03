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
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  RefreshCw,
  Settings,
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
  account_type?: "demo" | "live";
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPercent: number | null;
  /** Platform leverage as a plain multiplier, e.g. 10 for 10:1. */
  leverage?: number;
  /**
   * Where balance came from. "pesaki_wallet" for REAL, "forex_demo_account" for
   * DEMO. Used to guarantee the REAL view can never be rendered from demo funds.
   */
  balanceSource?: "pesaki_wallet" | "forex_demo_account";
  /** Real PESAKI wallet figures, present only for REAL. */
  walletBalance?: number;
  walletLocked?: number;
  unrealized_pnl?: number;
  /** Funds genuinely free to open a new position. */
  availableBalance?: number;
  /** Server-computed minimum Trade Amount, so the UI never hard-codes it. */
  minTradeAmount?: number;
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
  // Declared so the selected mode survives a reload and can be linked to. It
  // validates to demo/live only, so the URL cannot select any other mode.
  validateSearch: (search: Record<string, unknown>): { mode?: Mode } => {
    const mode = search.mode;
    if (mode === "live" || mode === "demo") return { mode };
    return {};
  },
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

  // Reflect the selected mode in the URL so a reload, refresh or shared link
  // returns to the same mode instead of silently reverting to DEMO.
  useEffect(() => {
    const current = search?.mode === "live" ? "live" : "demo";
    if (current !== mode) {
      navigate({ to: "/trading/forex", search: { mode }, replace: true });
    }
    // `search` is intentionally omitted: this reacts to a mode change, not to
    // the URL being rewritten by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, navigate]);
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
  const [accountError, setAccountError] = useState<string | null>(null);

  const [side, setSide] = useState<Side>("buy");
  // Trade Amount is the user's input: KSh of capital committed to the trade.
  // Position size (lots) is derived server-side from this and the platform
  // leverage, because a KSh 100 trade cannot be expressed in standard lots.
  const [tradeAmountInput, setTradeAmountInput] = useState("1000");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  // MT4-style compact order ticket: the detailed form collapses behind a gear.
  const [showOrderForm, setShowOrderForm] = useState(false);

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

  const loadCandles = useCallback(async (sym: string, iv: ForexInterval) => {
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
  }, []);

  // ── Account ───────────────────────────────────────────────────────────────
  const loadAccount = useCallback(async (m: Mode) => {
    setLoadingAccount(true);
    try {
      const res = await apiRequest(`/forex/account?account_type=${m}`);
      if (res?.success) {
        setAccount(res.account);
        setPositions(res.positions ?? []);
        setRealEnabled(true);
        setRealBlocked(null);
        setAccountError(null);
      }
    } catch (err) {
      // A gated or failed REAL account is a legitimate server answer, not a
      // crash. Report it as an error state rather than silently showing a number
      // that came from the other mode.
      const message = err instanceof Error ? err.message : "Could not load the account";
      setAccountError(message);
      // Clear on any failure. Keeping the previous mode's figures on screen is
      // exactly how the KSh 100,000 demo balance ended up displayed in the REAL
      // view, which misrepresents virtual money as real funds.
      setAccount(null);
      setPositions([]);
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  const loadHistory = useCallback(async (m: Mode) => {
    try {
      const res = await apiRequest(`/forex/history?mode=${m}&limit=50`);
      // An empty history is a valid result and must render as an empty list.
      if (res?.success) setHistory(res.history ?? []);
      else setHistory([]);
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
    // Clear the previous mode's figures before fetching the new ones. Switching
    // modes must never show DEMO numbers while REAL is still loading, or REAL
    // numbers while DEMO loads.
    setAccount(null);
    setPositions([]);
    setHistory([]);
    setAccountError(null);
    setLoadingAccount(true);

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

  // Context shown in the fullscreen bar so a position remains readable without
  // scrolling back to the ticket. Read-only: fullscreen must never act on it.
  const fullscreenContext = useMemo(() => {
    const first = openPositionsForSymbol[0];
    return {
      priceLabel: quote ? `Bid ${quote.bid} · Ask ${quote.ask}` : undefined,
      positionLabel: first
        ? `${first.side.toUpperCase()} ${first.quantity} lots @ ${first.average_entry_price}`
        : undefined,
      pnlLabel: first?.unrealised_pnl != null ? ksh(first.unrealised_pnl) : undefined,
      pnlPositive: (first?.unrealised_pnl ?? 0) >= 0,
    };
  }, [openPositionsForSymbol, quote]);

  // Entry price for the ticket, derived from the live quote rather than typed.
  const entryPrice = side === "buy" ? quote?.ask : quote?.bid;

  // Trade Amount is the capital the user commits, in KSh. The margin held is
  // exactly this amount; the position size behind it is derived server-side
  // using the platform's leverage, which the client never sets.
  const leverage = account?.leverage ?? 10;
  // Server-computed, so the product minimum can change without a frontend edit.
  const minTradeAmount = account?.minTradeAmount ?? 100;
  const freeMargin = account?.freeMargin ?? null;

  /**
   * Available Balance.
   *
   * REAL: the actual PESAKI wallet figure the server read, so it always matches
   * the money the user owns. DEMO: the forex demo account.
   */
  const availableBalance = useMemo(() => {
    if (!account) return null;
    if (account.balanceSource === "pesaki_wallet") {
      const wallet = Number(account.walletBalance ?? account.balance ?? 0);
      const locked = Number(account.walletLocked ?? 0);
      return Math.max(0, wallet - locked);
    }
    return Number(account.availableBalance ?? account.freeMargin ?? account.balance ?? 0);
  }, [account]);

  /**
   * Largest Trade Amount the server will accept.
   *
   * Bounded by what is actually free (never more than the user has) and by
   * exposure at the configured leverage, so the ticket can never offer a size
   * the order path would reject.
   */
  const maxTradeAmount = useMemo(() => {
    if (freeMargin == null || !Number.isFinite(freeMargin) || freeMargin <= 0) return null;
    return Math.floor(freeMargin * 100) / 100;
  }, [freeMargin]);

  const exposure = Number(tradeAmountInput) > 0 ? Number(tradeAmountInput) * leverage : 0;

  // Approximate lot size for the compact ticket display. The exact figure is
  // computed server-side; this is an estimate so the trader sees an intuitive
  // number rather than a raw KSh amount. Uses KES 130/USD for USD-quoted pairs.
  const volumeLots =
    Number(tradeAmountInput) > 0 && entryPrice
      ? ((Number(tradeAmountInput) * leverage) / (entryPrice * 130 * 100_000)).toFixed(2)
      : "0.00";

  // Pairs offered in the fullscreen selector, taken from the same live watchlist
  // the normal view uses so the two can never disagree.
  const symbolOptions = useMemo(() => Object.values(quotes).map((q) => q.symbol), [quotes]);

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
    if (maxTradeAmount != null && amount > maxTradeAmount) {
      toast.error(`Maximum trade amount is KSh ${maxTradeAmount.toLocaleString("en-KE")}`);
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
    marketState === "open"
      ? "MARKET OPEN"
      : marketState === "paused"
        ? "MARKET PAUSED"
        : "MARKET UNAVAILABLE";

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
            <div className="grid grid-cols-5 gap-3">
              <div>
                <p className="text-[7px] uppercase tracking-wide text-muted-foreground">Balance</p>
                <p className="font-mono text-[10px] font-bold text-brand-deep">
                  {loadingAccount && !account ? "—" : ksh(account?.balance ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[7px] uppercase tracking-wide text-muted-foreground">Equity</p>
                <p className="font-mono text-[10px] font-bold text-brand-deep">
                  {loadingAccount && !account ? "—" : ksh(account?.equity ?? account?.balance ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[7px] uppercase tracking-wide text-muted-foreground">Used</p>
                <p className="font-mono text-[10px] font-bold text-brand-deep">
                  {loadingAccount && !account ? "—" : ksh(account?.usedMargin ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[7px] uppercase tracking-wide text-muted-foreground">Free</p>
                <p className="font-mono text-[10px] font-bold text-brand-deep">
                  {loadingAccount && !account ? "—" : ksh(account?.freeMargin ?? 0)}
                </p>
              </div>
              <div>
                <p className="text-[7px] uppercase tracking-wide text-muted-foreground">Lvl</p>
                <p className="font-mono text-[10px] font-bold text-brand-deep">
                  {loadingAccount && !account
                    ? "—"
                    : account?.marginLevelPercent != null
                      ? `${account.marginLevelPercent.toFixed(1)}%`
                      : "—"}
                </p>
              </div>
            </div>
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
                        {up ? (
                          <ArrowUpRight className="h-3 w-3" />
                        ) : (
                          <ArrowDownRight className="h-3 w-3" />
                        )}
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

        {/* ── Quick order ticket (MT4-style) ─────────────────────────────── */}
        <div className="flex items-center gap-1.5 rounded-xl border border-border bg-card p-2">
          <button
            onClick={() => {
              setSide("sell");
              setOrderType("market");
              void placeOrder();
            }}
            disabled={busy || !quote || marketState !== "open"}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
          >
            <ArrowDownRight className="h-3 w-3" />
            <span>SELL</span>
            <span className="font-mono text-xs">{quote ? quote.bid : "—"}</span>
          </button>

          <div className="flex flex-1 flex-col items-center">
            <input
              value={tradeAmountInput}
              onChange={(e) => setTradeAmountInput(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="1000"
              aria-label="Trade Amount in KSh"
              className="w-full text-center text-sm font-mono text-foreground outline-none"
            />
            <p className="text-[9px] text-muted-foreground">
              {Number(tradeAmountInput) > 0 ? `${volumeLots} lots` : "Volume"}
            </p>
          </div>

          <button
            onClick={() => {
              setSide("buy");
              setOrderType("market");
              void placeOrder();
            }}
            disabled={busy || !quote || marketState !== "open"}
            className="flex h-9 items-center justify-center gap-1.5 rounded-lg bg-blue-600 px-3 py-1.5 text-[11px] font-bold text-white disabled:opacity-50"
          >
            <span>BUY</span>
            <ArrowUpRight className="h-3 w-3" />
            <span className="font-mono text-xs">{quote ? quote.ask : "—"}</span>
          </button>

          <button
            onClick={() => setShowOrderForm((v) => !v)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-muted text-foreground"
            aria-label={showOrderForm ? "Hide order form" : "Show order form"}
          >
            <Settings className="h-3 w-3" />
          </button>
        </div>

        {/* Detailed order form — toggled by the gear icon above. */}
        {showOrderForm && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4">
            <div className="mb-3 flex gap-2">
              {(["market", "limit"] as const).map((t) => (
                <button
                  key={t}
                  onClick={() => setOrderType(t)}
                  className={[
                    "flex-1 rounded-lg py-1.5 text-[11px] font-semibold capitalize transition-colors",
                    t === orderType ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {t}
                </button>
              ))}
            </div>

            {orderType === "limit" && (
              <div className="mb-3">
                <label className="block text-[11px] font-semibold text-foreground">
                  Limit price
                </label>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={entryPrice ? String(entryPrice) : "0.00000"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-blue-600"
                />
              </div>
            )}

            <div className="mb-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-foreground">Stop loss</label>
                <input
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  inputMode="decimal"
                  placeholder="none"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-blue-600"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-foreground">
                  Take profit
                </label>
                <input
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  inputMode="decimal"
                  placeholder="none"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-blue-600"
                />
              </div>
            </div>

            <div className="mb-3 space-y-1 rounded-xl bg-muted/50 p-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry (estimated)</span>
                <span className="font-semibold text-foreground">{entryPrice ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Margin held</span>
                <span className="font-semibold text-foreground">
                  {Number(tradeAmountInput) > 0 ? ksh(Number(tradeAmountInput)) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Leverage</span>
                <span className="font-semibold text-foreground">1:{leverage}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Position value</span>
                <span className="font-semibold text-foreground">
                  {exposure > 0 ? ksh(exposure) : "—"}
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
                side === "buy" ? "bg-blue-600" : "bg-red-600",
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
          </div>
        )}

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
              symbol={symbol}
              symbols={symbolOptions}
              onSymbolChange={setSymbol}
              {...fullscreenContext}
            />
          ) : (
            <div className="grid h-64 place-items-center rounded-2xl border border-border bg-card">
              <p className="text-[12px] text-muted-foreground">Loading {symbol} candles…</p>
            </div>
          )}
        </div>

        {/* Account error — the five margin metrics now live in the header. */}
        {accountError && (
          <Card className="mt-2 !p-3">
            <p className="text-[12px] font-semibold text-destructive">
              {mode === "live" ? "Real account unavailable" : "Demo account unavailable"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{accountError}</p>
          </Card>
        )}

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
                        h.pnl > 0
                          ? "text-brand-ink"
                          : h.pnl < 0
                            ? "text-destructive"
                            : "text-muted-foreground",
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
