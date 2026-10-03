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
 * display preference only — it grants nothing. The Real view is always
 * reachable: real trading is gated by the server, not by a flag on this page.
 *
 * The order ticket mirrors MetaTrader 4's compact "quick ticket" (BUY/SELL +
 * volume + gear) with a collapsible detailed form behind the gear icon, and a
 * dense positions/history layout.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  ArrowDownRight,
  ArrowUpRight,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Save,
  Settings,
  Trash2,
  Wallet,
  WifiOff,
} from "lucide-react";
import { AppShell } from "@/components/AppShell";
import { DepositSheet } from "@/components/DepositSheet";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import { Badge, Card, Progress, SectionTitle } from "@/components/ui-bits";
import {
  ForexChart,
  type ForexCandle,
  type ForexInterval,
  type OrderBlock,
  type PriceLines,
} from "@/components/forex/ForexChart";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

type Mode = "demo" | "live";
type Side = "buy" | "sell";
type OrderType = "market" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

// MT4-style: 1 lot = 100,000 units of the base currency. Prices here are in USD
// terms, and the account currency is KES, so USD figures are converted at a
// fixed 130 KES/USD rate that matches the PESAKI wallet.
const LOT_SIZE = 100_000;
const KES_PER_USD = 130;

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

/** A real-time tick or candle pushed over the forex stream. */
type WsMessage =
  | {
      type: "quote" | "tick";
      symbol: string;
      bid: number;
      ask: number;
      mid: number;
      spreadPips: number;
      state: string;
      timestamp: string;
    }
  | { type: "candle"; symbol: string; interval: string; candle: Candle };

const ksh = (n: number) =>
  `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

// ── Forex mathematics (MT4 / standard broker formula) ───────────────────────

/** 0.0001 for most pairs, 0.01 for JPY pairs. */
function pipSizeFor(symbol: string): number {
  return symbol.toUpperCase().endsWith("JPY") ? 0.01 : 0.0001;
}

/**
 * Value of one pip for the given volume and symbol.
 * Formula (task spec): (0.0001 / ExchangeRate) * Volume * 100,000.
 * Returns the value in the account currency (KES), converting via KES_PER_USD.
 */
function calculatePipValue(
  symbol: string,
  volume: number,
  price: number,
  accountCurrency: "KSH" | "USD" = "KSH",
): number {
  const pip = pipSizeFor(symbol);
  if (!price || price <= 0 || volume <= 0) return 0;
  const pipValueQuote = (pip / price) * volume * LOT_SIZE;
  return accountCurrency === "KSH" ? pipValueQuote * KES_PER_USD : pipValueQuote;
}

/**
 * Margin required to open a position.
 * margin = (volume * 100,000 * price) / leverage, converted to KES via the
 * quote price (prices are in USD terms).
 */
function calculateRequiredMargin(volume: number, price: number, leverage: number): number {
  if (!leverage || leverage <= 0 || !price) return 0;
  return (volume * LOT_SIZE * price * KES_PER_USD) / leverage;
}

/** Margin level = equity / used margin * 100. null when no margin is used. */
function calculateMarginLevel(equity: number, usedMargin: number): number | null {
  if (!usedMargin || usedMargin <= 0) return null;
  return (equity / usedMargin) * 100;
}

/**
 * Swap / rollover preview. Positions held past 5 PM EST roll over and incur a
 * carry charge of 0.5 pips per lot (sign reflects payout/recent rate).
 */
function estimateSwap(symbol: string, volume: number, pipValueKes: number): number {
  return -0.5 * pipValueKes * (volume > 0 ? 1 : 0);
}

function formatLots(n: number): string {
  return `${Number(n || 0).toFixed(2)}`;
}

// ── WebSocket: real-time ticks, with REST polling as a fallback ────────────

const WS_URL = API_BASE.replace(/^https:/, "wss:").replace(/^http:/, "ws:") + "/forex/stream";

/**
 * Custom hook: keeps a WebSocket to the PESAKI stream open, forwards decoded
 * messages to `onMessage`, and reports a ready state. The caller gates its REST
 * polling on the ready state so the two never fight. Reconnection is attempted
 * after `reconnectMs` of silence.
 */
function useWebSocket(
  url: string,
  onMessage: (msg: WsMessage) => void,
  reconnectMs = 4_000,
): "connecting" | "open" | "closed" {
  const [ready, setReady] = useState<"connecting" | "open" | "closed">("closed");
  // `retry` is bumped on socket close to re-run the effect and reconnect.
  const [retry, setRetry] = useState(0);

  useEffect(() => {
    let ws: WebSocket;
    try {
      ws = new WebSocket(url);
    } catch {
      setReady("closed");
      return;
    }

    setReady("connecting");
    ws.onopen = () => setReady("open");
    ws.onclose = () => {
      setReady("closed");
      // Restore the REST polling gap, then attempt to reopen the stream.
      const t = setTimeout(() => setRetry((r) => r + 1), reconnectMs);
      return () => clearTimeout(t);
    };
    ws.onmessage = (ev) => {
      try {
        onMessage(JSON.parse(ev.data) as WsMessage);
      } catch {
        // Ignore malformed frames; the REST fallback covers gaps.
      }
    };
    ws.onerror = () => {
      try {
        ws.close();
      } catch {
        // Already closing/closed; nothing to do.
      }
    };

    return () => {
      try {
        ws.close();
      } catch {
        // Teardown after the socket already closed.
      }
    };
  }, [url, onMessage, reconnectMs, retry]);

  return ready;
}

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

function ModifyPositionModal({
  position,
  onClose,
  onSave,
}: {
  position: Position;
  onClose: () => void;
  onSave: (sl: number | null, tp: number | null) => void;
}) {
  const [sl, setSl] = useState(position.stop_loss?.toString() ?? "");
  const [tp, setTp] = useState(position.take_profit?.toString() ?? "");
  const parse = (v: string) => (v.trim() === "" ? null : Number(v));
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={onClose}
    >
      <div
        className="w-80 rounded-xl border border-border bg-card p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-sm font-bold text-foreground">Modify {position.symbol}</h3>
        <div className="mt-3 space-y-3">
          <div>
            <label className="block text-[11px] font-semibold text-foreground">Stop loss</label>
            <input
              type="text"
              value={sl}
              onChange={(e) => setSl(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="none"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-mono outline-none focus:border-brand-ink"
            />
          </div>
          <div>
            <label className="block text-[11px] font-semibold text-foreground">Take profit</label>
            <input
              type="text"
              value={tp}
              onChange={(e) => setTp(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="none"
              className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-mono outline-none focus:border-brand-ink"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2 justify-end">
          <button
            onClick={onClose}
            className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground"
          >
            Cancel
          </button>
          <button
            onClick={() => {
              onSave(parse(sl), parse(tp));
            }}
            className="rounded-full bg-brand-deep px-3 py-1.5 text-[11px] font-bold text-white"
          >
            OK
          </button>
        </div>
      </div>
    </div>
  );
}

function ForexPage() {
  const navigate = useNavigate();
  const { user } = useRequireAuth();
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
  // Real trading is unblocked on the client; the server enforces availability.
  const [realEnabled, setRealEnabled] = useState(true);
  const [accountError, setAccountError] = useState<string | null>(null);

  const [side, setSide] = useState<Side>("buy");
  // MT4-style: volume is entered in standard lots (0.01, 0.1, 1, ...).
  const [volumeInput, setVolumeInput] = useState("0.01");
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopPrice, setStopPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [busy, setBusy] = useState(false);
  const [loadingAccount, setLoadingAccount] = useState(true);
  // MT4-style compact order ticket: the detailed form collapses behind a gear.
  const [showOrderForm, setShowOrderForm] = useState(false);

  // Modify SL/TP and partial-close prompts are modal per position.
  const [modifyPosition, setModifyPosition] = useState<Position | null>(null);
  const [closePrompt, setClosePrompt] = useState<Position | null>(null);
  const [partialVolume, setPartialVolume] = useState("0.01");

  const idemRef = useRef<string>(crypto.randomUUID());

  // ── Real-time data: WebSocket first, REST polling as a fallback ────────────
  const handleWsMessage = useCallback(
    (msg: WsMessage) => {
      if (msg.type === "quote" || msg.type === "tick") {
        const q = msg as {
          symbol: string;
          bid: number;
          ask: number;
          mid: number;
          spreadPips: number;
          state: string;
          timestamp: string;
        };
        setQuotes((prev) => ({
          ...prev,
          [q.symbol]: {
            symbol: q.symbol,
            bid: q.bid,
            ask: q.ask,
            mid: q.mid,
            spreadPips: q.spreadPips,
            provider: "pesaki-engine",
            state: q.state,
          },
        }));
      } else if (msg.type === "candle") {
        const c = msg.candle;
        if (msg.symbol === symbol) {
          setCandles((prev) => {
            if (prev.length === 0) return [c];
            const last = prev[prev.length - 1];
            if (last.time === c.time) return [...prev.slice(0, -1), c];
            return [...prev, c];
          });
        }
      }
    },
    [symbol],
  );

  const wsReady = useWebSocket(WS_URL, handleWsMessage);

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

  useEffect(() => {
    void loadQuotes();
    // Fall back to REST polling only while the stream is not live — this is the
    // "WebSocket failed / down" case, so we keep ticking from the HTTP feed.
    if (wsReady === "open") return;
    const t = setInterval(() => void loadQuotes(), 5_000);
    return () => clearInterval(t);
  }, [loadQuotes, wsReady]);

  useEffect(() => {
    void loadCandles(symbol, interval);
    if (wsReady === "open") return;
    const t = setInterval(() => void loadCandles(symbol, interval), 5_000);
    return () => clearInterval(t);
  }, [symbol, interval, loadCandles, wsReady]);

  // ── Account ───────────────────────────────────────────────────────────────
  const loadAccount = useCallback(
    async (m: Mode) => {
      setLoadingAccount(true);
      try {
        const res = await apiRequest(`/forex/account?account_type=${m}`);
        if (res?.success) {
          setAccount(res.account);
          setPositions(res.positions ?? []);
          // Real trading is always reachable from the UI; the server decides.
          setRealEnabled(true);
          setAccountError(null);
        }
      } catch (err) {
        const message = err instanceof Error ? err.message : "Could not load the account";
        console.warn(`[forex] ${mode} account load failed:`, message);
        setAccountError(message);
        setAccount(null);
        setPositions([]);
      } finally {
        setLoadingAccount(false);
      }
    },
    [mode],
  );

  const loadHistory = useCallback(async (m: Mode) => {
    try {
      const res = await apiRequest(`/forex/history?mode=${m}&limit=50`);
      if (res?.success) setHistory(res.history ?? []);
      else setHistory([]);
    } catch {
      setHistory([]);
    }
  }, []);

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
  const pip = pipSizeFor(symbol);
  const volume = Number(volumeInput);
  const volumeValid = Number.isFinite(volume) && volume >= 0.01;
  const entryPrice = side === "buy" ? quote?.ask : quote?.bid;
  const leverage = account?.leverage ?? 10;

  const openPositionsForSymbol = useMemo(
    () => positions.filter((p) => p.symbol === symbol),
    [positions, symbol],
  );

  /** Selected (first) open position for this symbol, if any. */
  const selectedPosition = openPositionsForSymbol[0];

  const priceLines: PriceLines = useMemo(() => {
    if (!selectedPosition) return {};
    return {
      entry: Number(selectedPosition.average_entry_price),
      stopLoss: selectedPosition.stop_loss != null ? Number(selectedPosition.stop_loss) : undefined,
      takeProfit:
        selectedPosition.take_profit != null ? Number(selectedPosition.take_profit) : undefined,
    };
  }, [selectedPosition]);

  const priceLabel = quote
    ? `Bid ${quote.bid} · Ask ${quote.ask} · ${quote.spreadPips} pips`
    : undefined;
  const positionLabel = selectedPosition
    ? `${selectedPosition.side.toUpperCase()} ${selectedPosition.quantity.toFixed(2)} @ ${selectedPosition.average_entry_price}`
    : undefined;
  const pnl = selectedPosition?.unrealised_pnl;
  const pnlLabel =
    selectedPosition && pnl != null ? `${pnl >= 0 ? "+" : ""}${ksh(pnl)}` : undefined;
  const pnlPositive = (pnl ?? 0) >= 0;

  // Order block histogram for the chart (left-side volume bars).
  const orderBlocks: OrderBlock[] = useMemo(() => {
    return candles.slice(-24).map((c): OrderBlock => {
      return { price: c.close, side: c.close >= c.open ? "buy" : "sell" };
    });
  }, [candles]);

  /** Margin held in KSh for the entered volume at the live price. */
  const requiredMargin = useMemo(() => {
    if (!entryPrice || !volumeValid) return 0;
    return calculateRequiredMargin(volume, entryPrice, leverage);
  }, [entryPrice, volume, volumeValid, leverage]);

  /** Pip value in KSh for the entered volume. */
  const pipValueKes = useMemo(() => {
    if (!entryPrice || !volumeValid) return 0;
    return calculatePipValue(symbol, volume, entryPrice, "KSH");
  }, [symbol, volume, entryPrice, volumeValid]);

  /** Margin-level coloring for the header. */
  const marginLevel = account
    ? (account.marginLevelPercent ?? calculateMarginLevel(account.equity, account.usedMargin))
    : null;
  const marginLevelClass = (): string => {
    if (marginLevel == null) return "text-muted-foreground";
    if (marginLevel < 50) return "text-red-500 animate-pulse font-bold";
    if (marginLevel < 100) return "text-orange-500 font-semibold";
    return "text-brand-ink";
  };

  // ── Order flow ─────────────────────────────────────────────────────────────
  const placeOrder = async () => {
    if (!volumeValid) {
      toast.error("Enter a volume of at least 0.01 lots");
      return;
    }
    if (!quote) return;
    const isLimit = orderType === "buy_limit" || orderType === "sell_limit";
    const isStop = orderType === "buy_stop" || orderType === "sell_stop";
    if (isLimit && !limitPrice) {
      toast.error("Set a limit price");
      return;
    }
    if (isStop && !stopPrice) {
      toast.error("Set a stop price");
      return;
    }
    const entry = entryPrice ?? quote.mid;
    if (requiredMargin > (account?.freeMargin ?? 0)) {
      toast.error(
        `Insufficient free margin. Required ${ksh(requiredMargin)}, available ${ksh(account?.freeMargin ?? 0)}`,
      );
      return;
    }
    const sl = stopLoss ? Number(stopLoss) : null;
    const tp = takeProfit ? Number(takeProfit) : null;
    // SL/TP must stay off the entry price by at least 5 pips.
    if (sl != null && Math.abs(sl - entry) < pip * 5) {
      toast.error("Stop loss is too close to the entry price");
      return;
    }
    if (tp != null && Math.abs(tp - entry) < pip * 5) {
      toast.error("Take profit is too close to the entry price");
      return;
    }

    setBusy(true);
    try {
      const res = await apiRequest("/forex/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          volume,
          order_type: orderType,
          limit_price: isLimit ? Number(limitPrice) : null,
          stop_price: isStop ? Number(stopPrice) : null,
          stop_loss: sl,
          take_profit: tp,
          account_type: mode,
          idempotency_key: idemRef.current,
          // Legacy KSh margin figure the current server contract expects.
          // TODO: /forex/orders should accept `volume` directly once the
          // backend is migrated to lot-based order sizing.
          trade_amount: requiredMargin,
        }),
      });
      if (res?.success) {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${symbol} · ${volume} lots`);
        idemRef.current = crypto.randomUUID();
        await loadAccount(mode);
        await loadHistory(mode);
        setShowOrderForm(false);
      } else {
        toast.error(res?.error ?? "The order was rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach the trading server");
    } finally {
      setBusy(false);
    }
  };

  const closePosition = async (id: string, partialLots?: number) => {
    try {
      // TODO: partial close requires backend support for a `volume` body.
      const res = await apiRequest(`/forex/positions/${id}/close`, {
        method: "POST",
        body: partialLots != null ? JSON.stringify({ volume: partialLots }) : undefined,
      });
      if (res?.success) {
        const pnl = Number(res.realizedPnl ?? 0);
        toast.success(`Closed for ${pnl >= 0 ? "+" : ""}${ksh(pnl)}`);
        await loadAccount(mode);
        await loadHistory(mode);
        setClosePrompt(null);
      } else {
        toast.error(res?.error ?? "Close rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not close the position");
    }
  };

  const modifyPositionRequest = async (id: string, sl: number | null, tp: number | null) => {
    try {
      // TODO: /forex/positions/:id/modify is a placeholder endpoint.
      const res = await apiRequest(`/forex/positions/${id}/modify`, {
        method: "POST",
        body: JSON.stringify({ stop_loss: sl, take_profit: tp, account_type: mode }),
      });
      if (res?.success) {
        toast.success("Position modified");
        await loadAccount(mode);
        setModifyPosition(null);
      } else {
        toast.error(res?.error ?? "Modify rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not modify the position");
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

  const stopOut = !!account && marginLevel != null && marginLevel < 50;

  return (
    <AppShell>
      {/* ── Stop-out banner ────────────────────────────────────────────────── */}
      {stopOut && (
        <div className="sticky top-0 z-40 flex items-center justify-center gap-2 bg-red-600 px-3 py-2 text-[11px] font-bold text-white">
          MARGIN CALL: Close positions immediately to avoid forced liquidation.
        </div>
      )}

      {/* ── Header ───────────────────────────────────────────────────── */}
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
            <div className="grid grid-cols-5 gap-2">
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
                <p className={`font-mono text-[10px] font-bold ${marginLevelClass()}`}>
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

        {/* ── Margin level bar ───────────────────────────────────── */}
        {account && marginLevel != null && (
          <div className="mt-2">
            <Progress value={Math.max(0, Math.min(100, marginLevel))} />
          </div>
        )}

        {/* Mode switch. DEMO/REAL only — never "LIVE". */}
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

          <div className="relative flex flex-1 flex-col items-center">
            <div className="flex items-center">
              <button
                onClick={() => {
                  const next = Math.max(0.01, volume - 0.01);
                  setVolumeInput(formatLots(next));
                }}
                disabled={!volumeValid}
                className="rounded-l-lg border border-border px-1.5 py-0.5 text-muted-foreground"
                aria-label="Decrease volume"
              >
                <Minus className="h-3 w-3" />
              </button>
              <input
                value={volumeInput}
                onChange={(e) => setVolumeInput(e.target.value.replace(/[^0-9.]/g, ""))}
                inputMode="decimal"
                placeholder="0.01"
                aria-label="Volume in lots"
                className="w-16 text-center text-sm font-mono text-foreground outline-none"
              />
              <button
                onClick={() => {
                  const next = volume + 0.01;
                  setVolumeInput(formatLots(next));
                }}
                disabled={busy || !quote || marketState !== "open"}
                className="rounded-r-lg border border-border px-1.5 py-0.5 text-muted-foreground"
                aria-label="Increase volume"
              >
                <Plus className="h-3 w-3" />
              </button>
            </div>
            <p className="text-[9px] text-muted-foreground">
              {volumeValid ? `${formatLots(volume)} lots` : "Volume"}
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

        {/* ── Detailed order form ─────────────────────────────────────── */}
        {showOrderForm && (
          <div className="mt-2 rounded-xl border border-border bg-card p-4 space-y-3">
            <div className="mb-3 flex flex-wrap gap-1.5">
              {(
                [
                  { key: "market", label: "Market" },
                  { key: "buy_limit", label: "Buy Limit" },
                  { key: "sell_limit", label: "Sell Limit" },
                  { key: "buy_stop", label: "Buy Stop" },
                  { key: "sell_stop", label: "Sell Stop" },
                ] as { key: OrderType; label: string }[]
              ).map(({ key, label }) => (
                <button
                  key={key}
                  onClick={() => setOrderType(key)}
                  className={[
                    "rounded-lg px-3 py-1 text-[11px] font-semibold capitalize transition-colors",
                    orderType === key ? "bg-blue-600 text-white" : "bg-muted text-muted-foreground",
                  ].join(" ")}
                >
                  {label}
                </button>
              ))}
            </div>

            {(orderType === "buy_limit" || orderType === "sell_limit") && (
              <div>
                <label className="block text-[11px] font-semibold text-foreground">
                  Limit price
                </label>
                <input
                  value={limitPrice}
                  onChange={(e) => setLimitPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={entryPrice ? String(entryPrice) : "0.00000"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            )}

            {(orderType === "buy_stop" || orderType === "sell_stop") && (
              <div>
                <label className="block text-[11px] font-semibold text-foreground">
                  Stop price
                </label>
                <input
                  value={stopPrice}
                  onChange={(e) => setStopPrice(e.target.value)}
                  inputMode="decimal"
                  placeholder={entryPrice ? String(entryPrice) : "0.00000"}
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
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
                <label className="block text-[11px] font-semibold text-foreground">
                  Take profit
                </label>
                <input
                  value={takeProfit}
                  onChange={(e) => setTakeProfit(e.target.value)}
                  inputMode="decimal"
                  placeholder="none"
                  className="mt-1 h-10 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            </div>

            {/* ── Preview panel ───────────────────────────────────── */}
            <div className="space-y-1 rounded-xl bg-muted/50 p-3 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Entry</span>
                <span className="font-semibold text-foreground">{entryPrice ?? "—"}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Required margin</span>
                <span className="font-semibold text-foreground">
                  {volumeValid && entryPrice ? ksh(requiredMargin) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Pip value (KSh)</span>
                <span className="font-semibold text-foreground">
                  {volumeValid && entryPrice ? ksh(pipValueKes) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Spread cost</span>
                <span className="font-semibold text-foreground">
                  {quote
                    ? `${quote.spreadPips} pips (${ksh(quote.spreadPips * pipValueKes)})`
                    : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Swap (5 PM rollover)</span>
                <span className="font-semibold text-foreground">
                  {volumeValid && entryPrice ? ksh(estimateSwap(symbol, volume, pipValueKes)) : "—"}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Leverage</span>
                <span className="font-semibold text-foreground">1:{leverage}</span>
              </div>
            </div>

            <button
              onClick={placeOrder}
              disabled={busy || !quote || marketState !== "open"}
              className={[
                "mt-2 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold text-white disabled:opacity-50",
                side === "buy" ? "bg-blue-600" : "bg-red-600",
              ].join(" ")}
            >
              {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {busy ? "Submitting…" : `${side === "buy" ? "Buy" : "Sell"} ${volume} ${symbol}`}
            </button>
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
              symbols={Object.values(quotes).map((q) => q.symbol)}
              onSymbolChange={setSymbol}
              positionLabel={positionLabel}
              pnlLabel={pnlLabel}
              pnlPositive={pnlPositive}
              orderBlocks={orderBlocks}
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

        {/* ── Open positions ─────────────────────────────────────────── */}
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
            <div className="mt-2 overflow-x-auto">
              <table className="table-auto w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium">Symbol</th>
                    <th className="text-left font-medium">Type</th>
                    <th className="text-right font-medium">Volume</th>
                    <th className="text-right font-medium">Entry</th>
                    <th className="text-right font-medium">Current</th>
                    <th className="text-right font-medium">SL</th>
                    <th className="text-right font-medium">TP</th>
                    <th className="text-right font-medium">P/L</th>
                    <th className="text-center font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {positions.map((p) => {
                    const pnl = Number(p.unrealised_pnl ?? 0);
                    const isBuy = p.side === "buy";
                    return (
                      <tr key={p.id} className="border-t border-border">
                        <td className="py-1.5 text-brand-deep font-bold">{p.symbol ?? "—"}</td>
                        <td>
                          <Badge tone={isBuy ? "success" : "destructive"}>
                            {isBuy ? "BUY" : "SELL"} {formatLots(p.quantity)}
                          </Badge>
                        </td>
                        <td className="text-right">{formatLots(p.quantity)}</td>
                        <td className="text-right font-mono">{p.average_entry_price}</td>
                        <td className="text-right font-mono">{p.current_price ?? "—"}</td>
                        <td className="text-right font-mono">{p.stop_loss ?? "—"}</td>
                        <td className="text-right font-mono">{p.take_profit ?? "—"}</td>
                        <td className="text-right font-mono">
                          <span className={pnl >= 0 ? "text-blue-500" : "text-red-500"}>
                            {pnl >= 0 ? "+" : ""}
                            {ksh(pnl)}
                          </span>
                        </td>
                        <td className="py-1.5 text-center">
                          <div className="flex justify-center gap-1">
                            <button
                              onClick={() => setModifyPosition(p)}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-foreground"
                              title="Modify SL/TP"
                            >
                              <Save className="h-3 w-3" />
                            </button>
                            <button
                              onClick={() => {
                                setClosePrompt(p);
                                setPartialVolume(formatLots(Math.min(p.quantity, 0.01)));
                              }}
                              className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-semibold text-destructive"
                              title="Close position"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* ── Trade history ─────────────────────────────────────────── */}
        <div>
          <SectionTitle title={`Trade history · ${mode === "demo" ? "Demo" : "Real"}`} />
          {history.length === 0 ? (
            <Card className="mt-2 !p-4">
              <p className="text-[12px] font-semibold text-foreground">No closed trades yet</p>
            </Card>
          ) : (
            <div className="mt-2 overflow-x-auto">
              <table className="table-auto w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left font-medium">Symbol</th>
                    <th className="text-left font-medium">Type</th>
                    <th className="text-right font-medium">Volume</th>
                    <th className="text-right font-medium">Entry</th>
                    <th className="text-right font-medium">Close</th>
                    <th className="text-right font-medium">P/L</th>
                    <th className="text-left font-medium">Status</th>
                    <th className="text-right font-medium">Date</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((h) => {
                    const isBuy = h.side === "buy";
                    const pnlColor =
                      h.pnl > 0
                        ? "text-blue-500"
                        : h.pnl < 0
                          ? "text-red-500"
                          : "text-muted-foreground";
                    return (
                      <tr key={h.id} className="border-t border-border">
                        <td className="py-1.5 text-brand-deep font-bold">{h.symbol ?? "—"}</td>
                        <td>
                          <Badge tone={isBuy ? "success" : "destructive"}>
                            {isBuy ? "BUY" : "SELL"}
                          </Badge>
                        </td>
                        <td className="text-right">{formatLots(h.quantity)}</td>
                        <td className="text-right font-mono">{h.entry ?? "—"}</td>
                        <td className="text-right font-mono">
                          {/* close price not on HistoryRow */ "—"}
                        </td>
                        <td className="text-right font-mono">
                          <span className={pnlColor}>
                            {h.kind === "position"
                              ? `${h.pnl >= 0 ? "+" : ""}${ksh(h.pnl)}`
                              : h.status}
                          </span>
                        </td>
                        <td className="py-1.5">
                          <span
                            className={[
                              "rounded-full px-1.5 py-0.5 text-[10px] font-semibold",
                              h.status === "closed" || h.status === "win" || h.status === "loss"
                                ? "bg-success/15 text-success"
                                : "bg-muted text-muted-foreground",
                            ].join(" ")}
                          >
                            {h.closeReason && h.closeReason !== "manual" ? h.closeReason : h.status}
                          </span>
                        </td>
                        <td className="text-right font-mono text-muted-foreground">{h.closedAt}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* ── Modify SL/TP modal ────────────────────────────────────── */}
      {modifyPosition && (
        <ModifyPositionModal
          position={modifyPosition}
          onClose={() => setModifyPosition(null)}
          onSave={(sl, tp) => modifyPositionRequest(modifyPosition.id, sl, tp)}
        />
      )}

      {/* ── Partial close prompt ───────────────────────────────────── */}
      {closePrompt && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
          onClick={() => setClosePrompt(null)}
        >
          <div
            className="w-80 rounded-xl border border-border bg-card p-4"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-sm font-bold text-foreground">Close {closePrompt.symbol}</h3>
            <p className="mt-1 text-[11px] text-muted-foreground">
              Open: {formatLots(closePrompt.quantity)} lots. Enter a partial volume to close (0 =
              full close).
            </p>
            <input
              value={partialVolume}
              onChange={(e) => setPartialVolume(e.target.value.replace(/[^0-9.]/g, ""))}
              inputMode="decimal"
              placeholder="0.01"
              className="mt-3 h-9 w-full rounded-lg border border-border bg-background px-2 text-sm font-mono outline-none focus:border-brand-ink"
            />
            <div className="mt-4 flex gap-2 justify-end">
              <button
                onClick={() => setClosePrompt(null)}
                className="rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={() => closePosition(closePrompt.id, Number(partialVolume))}
                className="rounded-full bg-red-600 px-3 py-1.5 text-[11px] font-bold text-white"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

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
