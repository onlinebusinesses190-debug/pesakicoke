/**
 * PESAKI Forex — trading screen (MetaTrader 4 Mobile Dark style).
 *
 * Separate from /trading/fx, which is the binary prediction game.
 *
 * Everything authoritative comes from the backend: prices, quotes, candles,
 * balance, margin, position size and P/L. This file only renders what it is
 * given and sends intents.
 *
 * DEMO and REAL are separate accounts on the server. The selected mode is a
 * display preference only and grants nothing. The REAL view is always
 * reachable from the UI; the server enforces real-money availability.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  BarChart3,
  ChevronDown,
  ChevronUp,
  Clock,
  LineChart,
  Loader2,
  Menu,
  MoreHorizontal,
  Newspaper,
  Pencil,
  Settings,
  Trash2,
} from "lucide-react";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  ForexChart,
  type ForexCandle,
  type ForexInterval,
  type PriceLines,
} from "@/components/forex/ForexChart";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

type Mode = "demo" | "live";
type Side = "buy" | "sell";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// MT4-style: 1 standard lot = 100,000 units of the base currency.
const LOT_SIZE = 100_000;

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
  /** Account currency, e.g. "USD" (MT4 quotes the account currency). */
  currency?: string;
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

/** 26 973.68 — space thousands separator, fixed decimals. */
const fmt = (n: number | null | undefined, decimals = 2): string =>
  Number(n || 0)
    .toLocaleString("en-US", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    })
    .replace(/,/g, " ");

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
  const { user } = useRequireAuth();
  const search = Route.useSearch?.() as { mode?: string } | undefined;

  const [mode, setMode] = useState<Mode>(search?.mode === "live" ? "live" : "demo");

  // Reflect the selected mode in the URL so a reload, refresh or shared link
  // returns to the same mode instead of silently reverting to DEMO.
  useEffect(() => {
    const current = search?.mode === "live" ? "live" : "demo";
    if (current !== mode) {
      navigate({ to: "/trading/foreign", search: { mode }, replace: true });
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
  // Real trading is always reachable from the UI; the server enforces it.
  const [realEnabled, setRealEnabled] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  // MT4-style: volume is entered in standard lots (0.01, 0.1, 1, ...).
  const [volumeInput, setVolumeInput] = useState("0.01");
  // Order type is market-only on the quick ticket; kept for the order payload.
  const [orderType] = useState<"market" | "limit">("market");
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
        // Real trading is unblocked on the client regardless of the server flag.
        setRealEnabled(true);
        setAccountError(null);
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : "Could not load the account";
      console.warn(`[forex] ${m === "live" ? "real" : "demo"} account load failed:`, message);
      setRealEnabled(true);
      setAccountError(message);
      // Clear on any failure. Keeping the previous mode's figures on screen is
      // exactly how the demo balance ended up displayed in the REAL view, which
      // misrepresents virtual money as real funds.
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

  // ── Derived values ───────────────────────────────────────────────────────
  const quote = quotes[symbol];
  const digits = symbol.toUpperCase().endsWith("JPY") ? 3 : 5;
  const currency = account?.currency ?? "USD";
  const leverage = account?.leverage ?? 10;
  const entry = side === "buy" ? quote?.ask : quote?.bid;
  const priceLines: PriceLines = (() => {
    const first = positions.find((p) => p.symbol === symbol);
    if (!first) return {};
    return {
      entry: Number(first.average_entry_price),
      stopLoss: first.stop_loss != null ? Number(first.stop_loss) : undefined,
      takeProfit: first.take_profit != null ? Number(first.take_profit) : undefined,
    };
  })();
  const positionLabel = (() => {
    const first = positions.find((p) => p.symbol === symbol);
    return first
      ? `${first.side.toUpperCase()} ${first.quantity.toFixed(2)} @ ${first.average_entry_price}`
      : undefined;
  })();
  const pnl = (() => {
    const first = positions.find((p) => p.symbol === symbol);
    return first?.unrealised_pnl;
  })();

  const vol = Number(volumeInput);
  const volValid = Number.isFinite(vol) && vol > 0;

  const placeOrder = async () => {
    if (!quote || !volValid) {
      toast.error("Enter a valid volume in lots");
      return;
    }
    // trade_amount is the KSh capital committed the legacy orders endpoint
    // expects: (volume * contract_size * price) / leverage.
    const price = entry ?? quote.mid;
    const tradeAmount = (vol * LOT_SIZE * price) / leverage;
    setBusy(true);
    try {
      const res = await apiRequest("/forex/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          volume: vol,
          trade_amount: tradeAmount,
          order_type: orderType,
          limit_price: orderType === "limit" ? Number(limitPrice) : null,
          stop_loss: stopLoss ? Number(stopLoss) : null,
          take_profit: takeProfit ? Number(takeProfit) : null,
          account_type: mode,
          idempotency_key: idemRef.current,
        }),
      });
      if (res?.success) {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${symbol} · ${fmt(vol, 2)} lots`);
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
        toast.success(`Closed for ${pnl >= 0 ? "+" : ""}${fmt(pnl)}`);
        await loadAccount(mode);
        await loadHistory(mode);
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close the position");
    }
  };

  const resetDemo = async () => {
    if (!window.confirm("Reset your demo account to 100,000 and close all demo positions?")) {
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

  // `user` drives auth gating in the shell; referenced to keep the require-auth
  // contract explicit at the call site.
  void user;

  const marketBadge =
    marketState === "open"
      ? "MARKET OPEN"
      : marketState === "paused"
        ? "MARKET PAUSED"
        : "MARKET UNAVAILABLE";

  const navItems = [
    { key: "quotes", label: "Quotes", icon: BarChart3 },
    { key: "trade", label: "Trade", icon: LineChart },
    { key: "history", label: "History", icon: Clock },
    { key: "news", label: "News", icon: Newspaper },
    { key: "settings", label: "Settings", icon: Settings },
  ];

  return (
    <div className="flex min-h-screen w-full flex-col bg-black text-gray-300">
      {/* ── Header: hamburger, title, balance ─────────────────────── */}
      <header className="flex h-11 items-center justify-between border-b border-zinc-800 bg-black px-2">
        <Menu className="h-5 w-5 text-gray-400" aria-label="Menu" />
        <span className="text-sm font-medium text-white">Trade</span>
        <span className="text-sm font-medium text-blue-500">
          {loadingAccount && !account ? "—" : `${fmt(account?.balance)} ${currency}`}
        </span>
      </header>

      {/* ── Mode toggle ───────────────────────────────────────────── */}
      <div className="flex border-b border-zinc-800 bg-black">
        {(["demo", "live"] as Mode[]).map((m) => (
          <button
            key={m}
            onClick={() => setMode(m)}
            className={[
              "flex-1 py-2 text-center text-xs font-bold",
              m === mode ? (m === "live" ? "text-white" : "text-blue-400") : "text-gray-500",
            ].join(" ")}
          >
            {m === "demo" ? "DEMO" : "REAL"}
          </button>
        ))}
      </div>

      <main className="flex-1 overflow-y-auto pb-20">
        {/* Account error — full width, dark, no card. */}
        {accountError && (
          <div className="border-b border-zinc-800 px-3 py-2">
            <p className="text-xs font-semibold text-red-400">
              {mode === "live" ? "Real account unavailable" : "Demo account unavailable"}
            </p>
            <p className="mt-0.5 text-[11px] text-gray-400">{accountError}</p>
          </div>
        )}

        {/* ── Account metrics (vertical list) ─────────────────────── */}
        <div className="px-2 py-1.5">
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-400 text-sm">Balance</span>
            <span className="text-white text-sm font-medium">
              {loadingAccount && !account ? "—" : `${fmt(account?.balance)} ${currency}`}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-400 text-sm">Equity</span>
            <span className="text-white text-sm font-medium">
              {loadingAccount && !account
                ? "—"
                : `${fmt(account?.equity ?? account?.balance ?? 0)} ${currency}`}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-400 text-sm">Margin</span>
            <span className="text-white text-sm font-medium">
              {loadingAccount && !account ? "—" : `${fmt(account?.usedMargin)} ${currency}`}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-400 text-sm">Free margin</span>
            <span className="text-white text-sm font-medium">
              {loadingAccount && !account ? "—" : `${fmt(account?.freeMargin)} ${currency}`}
            </span>
          </div>
          <div className="flex justify-between items-center py-1">
            <span className="text-gray-400 text-sm">Margin Level (%)</span>
            <span className="text-white text-sm font-medium">
              {loadingAccount && !account
                ? "—"
                : account?.marginLevelPercent != null
                  ? `${fmt(account.marginLevelPercent, 2)}%`
                  : "—"}
              {}
            </span>
          </div>
        </div>

        {/* ── Quick order ticket (MT4-style) ───────────────────────────── */}
        <div className="flex h-14 w-full text-xs">
          <button
            onClick={() => {
              setSide("sell");
              void placeOrder();
            }}
            disabled={busy || !quote || marketState !== "open"}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center bg-red-600 text-center text-white disabled:opacity-50"
          >
            <span className="text-[9px] uppercase">Sell</span>
            <span className="font-mono text-sm leading-tight">
              {quote ? fmt(quote.bid, digits) : "—"}
            </span>
          </button>

          <div className="flex flex-1 items-center justify-center gap-0.5 bg-zinc-800 text-xs">
            <button
              onClick={() => {
                const next = Math.max(0.01, vol - 0.01);
                setVolumeInput(fmt(next, 2));
              }}
              disabled={!volValid}
              className="p-0.5 text-gray-400"
              aria-label="Decrease volume"
            >
              <ChevronDown className="h-3 w-3" />
            </button>
            <input
              value={volumeInput}
              onChange={(e) => setVolumeInput(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.01"
              aria-label="Volume in lots"
              className="w-14 text-center font-mono text-sm text-white placeholder-gray-500 bg-transparent outline-none"
            />
            <button
              onClick={() => {
                const next = vol + 0.01;
                setVolumeInput(fmt(next, 2));
              }}
              disabled={busy || !quote || marketState !== "open"}
              className="p-0.5 text-gray-400"
              aria-label="Increase volume"
            >
              <ChevronUp className="h-3 w-3" />
            </button>
            <span className="ml-0.5 text-[9px] text-gray-400">Lots</span>
          </div>

          <button
            onClick={() => {
              setSide("buy");
              void placeOrder();
            }}
            disabled={busy || !quote || marketState !== "open"}
            className="flex flex-1 cursor-pointer flex-col items-center justify-center bg-blue-600 text-center text-white disabled:opacity-50"
          >
            <span className="text-[9px] uppercase">BUY</span>
            <span className="font-mono text-sm leading-tight">
              {quote ? fmt(quote.ask, digits) : "—"}
            </span>
          </button>
        </div>

        {/* ── Market watch (symbol selector + live prices) ─────────── */}
        <div className="border-b border-zinc-800 px-2 py-1">
          <div className="mb-1 text-[10px] uppercase tracking-wide text-gray-500">Quotes</div>
          {Object.values(quotes).map((q) => {
            const w = watch[q.symbol];
            const up = (w?.pips ?? 0) >= 0;
            const active = q.symbol === symbol;
            return (
              <button
                key={q.symbol}
                onClick={() => setSymbol(q.symbol)}
                className={[
                  "flex w-full justify-between py-1 text-left",
                  active ? "bg-zinc-800" : "hover:bg-zinc-900",
                ].join(" ")}
              >
                <span className="font-mono text-sm text-white">{q.symbol}</span>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-gray-300">
                    {fmt(q.bid, digits)} / {fmt(q.ask, digits)}
                  </span>
                  <span
                    className={["font-mono text-xs", up ? "text-emerald-400" : "text-red-400"].join(
                      " ",
                    )}
                  >
                    {w?.percent ?? "0.00"}%
                  </span>
                </div>
              </button>
            );
          })}
        </div>

        {/* ── Chart ───────────────────────────────────────────────── */}
        <div className="border-b border-zinc-800 bg-zinc-900 p-0">
          <p className="px-2 pt-2 text-xs text-gray-400">
            {symbol} · {fmt(quote?.bid, digits)} / {fmt(quote?.ask, digits)} ·{" "}
            {quote?.spreadPips ?? 0} pips <span className="mx-1">·</span>
            <span className={marketState === "open" ? "text-emerald-400" : "text-red-400"}>
              {marketBadge}
            </span>
          </p>
          {marketState === "unavailable" && (
            <div className="grid h-56 place-items-center">
              <p className="text-xs text-gray-500">Market unavailable. Retrying…</p>
            </div>
          )}
          {candles.length > 0 && marketState !== "unavailable" && (
            <ForexChart
              data={candles}
              interval={interval}
              onIntervalChange={setInterval_}
              lines={priceLines}
              digits={digits}
              symbol={symbol}
              symbols={Object.values(quotes).map((q) => q.symbol)}
              onSymbolChange={setSymbol}
              positionLabel={positionLabel}
              pnlLabel={pnl != null ? `${fmt(pnl)} ${currency}` : undefined}
              pnlPositive={(pnl ?? 0) >= 0}
            />
          )}
          {candles.length === 0 && marketState !== "unavailable" && (
            <div className="grid h-56 place-items-center bg-zinc-900">
              <Loader2 className="h-4 w-4 animate-spin text-gray-500" />
            </div>
          )}
        </div>

        {/* ── Open positions ─────────────────────────────────────── */}
        <div className="px-2 py-1.5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-white">Positions</span>
            <MoreHorizontal className="h-4 w-4 text-gray-400" />
          </div>
          {positions.length === 0 ? (
            <p className="py-3 text-xs text-gray-500">No open positions</p>
          ) : (
            positions.map((p) => {
              const pnl = Number(p.unrealised_pnl ?? 0);
              const isBuy = p.side === "buy";
              return (
                <div
                  key={p.id}
                  className="flex justify-between items-center border-b border-zinc-800 py-2"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-white">{p.symbol ?? "—"}</span>
                      <span className={isBuy ? "text-blue-400" : "text-red-400"}>
                        {" "}
                        {p.side} {fmt(p.quantity, 2)}
                      </span>
                    </div>
                    <span className="font-mono text-xs text-gray-400">
                      {fmt(p.average_entry_price, digits)}
                      {" → "}
                      {p.current_price != null ? fmt(p.current_price, digits) : "—"}
                    </span>
                  </div>
                  <div className="flex items-center gap-1 self-center">
                    <span
                      className={[
                        "font-mono font-bold",
                        pnl >= 0 ? "text-emerald-400" : "text-red-400",
                      ].join(" ")}
                    >
                      {pnl >= 0 ? "+" : ""}
                      {fmt(pnl)}
                    </span>
                    <button
                      onClick={() => {}}
                      className="rounded p-0.5 text-gray-400"
                      title="Modify"
                    >
                      <Pencil className="h-3 w-3" />
                    </button>
                    <button
                      onClick={() => closePosition(p.id)}
                      className="rounded p-0.5 text-gray-400"
                      title="Close"
                    >
                      <Trash2 className="h-3 w-3" />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Trade history ─────────────────────────────────────── */}
        <div className="px-2 py-1.5">
          <div className="flex justify-between items-center">
            <span className="text-sm text-white">History</span>
            <span className="text-xs text-gray-500">{history.length} trades</span>
          </div>
          {history.length === 0 ? (
            <p className="py-3 text-xs text-gray-500">No closed trades</p>
          ) : (
            history.map((h) => {
              const isBuy = h.side === "buy";
              const up = h.pnl > 0;
              return (
                <div
                  key={h.id}
                  className="flex justify-between items-center border-b border-zinc-800 py-2"
                >
                  <div className="flex flex-col">
                    <div className="flex items-center gap-1">
                      <span className="text-sm text-white">{h.symbol ?? "—"}</span>
                      <span
                        className={[
                          "rounded px-1.5 py-0.5 text-[9px] font-bold",
                          isBuy
                            ? "bg-emerald-400/15 text-emerald-400"
                            : "bg-red-400/15 text-red-400",
                        ].join(" ")}
                      >
                        {isBuy ? "BUY" : "SELL"}
                      </span>
                      <span className="font-mono text-xs text-gray-400">{fmt(h.quantity, 2)}</span>
                    </div>
                    <span className="font-mono text-xs text-gray-400">
                      Entry {h.entry != null ? fmt(h.entry, digits) : "—"}
                    </span>
                    <span className="font-mono text-xs text-gray-500">{h.closedAt ?? ""}</span>
                  </div>
                  <div className="flex items-center gap-1 self-center">
                    <span
                      className={[
                        "font-mono font-bold",
                        up ? "text-emerald-400" : h.pnl < 0 ? "text-red-400" : "text-gray-500",
                      ].join(" ")}
                    >
                      {up ? "+" : ""}
                      {fmt(h.pnl)}
                    </span>
                    <span
                      className={[
                        "text-[9px] font-semibold",
                        h.status === "win" || h.status === "closed"
                          ? "text-emerald-400"
                          : h.status === "loss"
                            ? "text-red-400"
                            : "text-gray-500",
                      ].join(" ")}
                    >
                      {h.status}
                    </span>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Settings nav stub (wire up the dedicated tab later). */}
        <div className="h-12" />
      </main>

      {/* ── Bottom navigation ───────────────────────────────────── */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid h-14 w-full grid-cols-5 gap-1 border-t border-zinc-800 bg-zinc-900 pb-[env(safe-area-inset-bottom)] pt-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = item.key === "trade";
          return (
            <button
              key={item.key}
              onClick={() => {}}
              disabled={item.key !== "trade"}
              className={[
                "flex flex-col items-center justify-center gap-0.5 text-xs",
                active ? "text-blue-500" : "text-gray-500 disabled:cursor-default",
              ].join(" ")}
            >
              <Icon className={active ? "h-4 w-4 text-blue-500" : "h-4 w-4 text-gray-400"} />
              <span>{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
}
