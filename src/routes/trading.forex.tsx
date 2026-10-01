/**
 * PESAKI Forex — public-facing trading screen.
 *
 * Separate from /trading/fx, which is the binary price-direction prediction
 * game. This is a spot FX market: real provider quotes, lots, margin,
 * positions and a server-validated order ticket.
 *
 * Demo is the default and is clearly labelled. Live trading is only offered
 * when the backend reports it enabled, which currently requires a licensed
 * execution provider.
 *
 * Nothing on this screen invents a price. When market data is unavailable the
 * UI says so instead of rendering a fabricated chart.
 */

import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownRight,
  ArrowUpRight,
  BarChart3,
  Calculator,
  Loader2,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle } from "@/components/ui-bits";
import { TradingChart } from "@/components/fx/TradingChart";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

type Side = "buy" | "sell";

interface Quote {
  symbol: string;
  bid: number;
  ask: number;
  spreadPips: number;
  mid: number;
  timestamp: string;
  provider: string;
  status: string;
}

interface Candle {
  time: string;
  open: number;
  high: number;
  low: number;
  close: number;
}

interface Position {
  id: string;
  side: Side;
  quantity: number;
  average_entry_price: number;
  current_price: number | null;
  stop_loss: number | null;
  take_profit: number | null;
  realized_pnl: number;
  unrealised_pnl?: number;
  instrument_id: number;
  opened_at: string;
  symbol?: string;
}

interface AccountState {
  balance: number;
  equity: number;
  usedMargin: number;
  freeMargin: number;
  marginLevelPercent: number | null;
}

interface RiskPreview {
  lots: number;
  units: number;
  riskAmount: number;
  stopDistancePips: number;
  marginRequired: number;
  entrySpreadPips: number;
  riskRewardRatio: number;
  potentialLoss: number;
  potentialProfit: number;
}

const SYMBOLS = [
  "EUR/USD",
  "GBP/USD",
  "USD/JPY",
  "USD/CHF",
  "AUD/USD",
  "USD/CAD",
  "NZD/USD",
  "EUR/GBP",
  "EUR/JPY",
  "GBP/JPY",
];

const ksh = (n: number) =>
  `KSh ${Number(n || 0).toLocaleString("en-KE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export const Route = createFileRoute("/trading/forex")({
  head: () => ({
    meta: [
      { title: "PESAKI Forex — Spot Currency Trading" },
      {
        name: "description",
        content:
          "Trade major currency pairs on PESAKI Forex. View live quotes, charts and your open positions.",
      },
    ],
  }),
  component: ForexPage,
});

function ForexPage() {
  const [symbol, setSymbol] = useState("EUR/USD");
  const [quotes, setQuotes] = useState<Record<string, Quote>>({});
  const [candles, setCandles] = useState<Candle[]>([]);
  const [connection, setConnection] = useState<"connecting" | "live" | "unavailable">("connecting");
  const [account, setAccount] = useState<AccountState | null>(null);
  const [positions, setPositions] = useState<Position[]>([]);
  const [liveTradingEnabled, setLiveTradingEnabled] = useState(false);

  // order ticket
  const [side, setSide] = useState<Side>("buy");
  const [lots, setLots] = useState("0.10");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [preview, setPreview] = useState<RiskPreview | null>(null);

  const idemRef = useRef<string>(crypto.randomUUID());

  const loadQuotes = useCallback(async () => {
    try {
      const res = await fetch(`${API_BASE}/forex/quotes`);
      const body = await res.json();
      if (!res.ok || !body.success) throw new Error(body.error);
      const map: Record<string, Quote> = {};
      for (const q of body.quotes as Quote[]) map[q.symbol] = q;
      setQuotes(map);
      setConnection("live");
    } catch {
      setConnection("unavailable");
    }
  }, []);

  const loadCandles = useCallback(async (sym: string) => {
    try {
      const res = await fetch(`${API_BASE}/forex/candles/${sym}?count=60`);
      const body = await res.json();
      if (res.ok && body.success) setCandles(body.candles);
      else setCandles([]);
    } catch {
      setCandles([]);
    }
  }, []);

  const loadAccount = useCallback(async () => {
    try {
      const res = await apiRequest("/forex/account?account_type=demo");
      if (res?.success) {
        setAccount(res.account);
        setPositions(res.positions ?? []);
        setLiveTradingEnabled(Boolean(res.liveTradingEnabled));
      }
    } catch {
      /* account loads after sign-in; the market view still works without it */
    }
  }, []);

  useEffect(() => {
    void loadQuotes();
    void loadAccount();
    const t = setInterval(() => void loadQuotes(), 30_000);
    return () => clearInterval(t);
  }, [loadQuotes, loadAccount]);

  useEffect(() => {
    void loadCandles(symbol);
  }, [symbol, loadCandles]);

  const quote = quotes[symbol];

  // Risk preview, debounced so typing a stop loss does not spam the API.
  useEffect(() => {
    const sl = Number(stopLoss);
    const entry = side === "buy" ? quote?.ask : quote?.bid;
    if (!quote || !entry || !Number.isFinite(sl) || sl <= 0 || !account) {
      setPreview(null);
      return;
    }
    const t = setTimeout(async () => {
      try {
        const res = await fetch(`${API_BASE}/forex/risk/preview`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            symbol,
            side,
            balance: account.balance,
            risk_percent: 1,
            entry_price: entry,
            stop_loss: sl,
          }),
        });
        const body = await res.json();
        if (body.success) setPreview(body.preview);
        else setPreview(null);
      } catch {
        setPreview(null);
      }
    }, 350);
    return () => clearTimeout(t);
  }, [symbol, side, stopLoss, quote, account]);

  const placeOrder = async () => {
    const entry = side === "buy" ? quote?.ask : quote?.bid;
    const amount = Number(lots);
    if (!quote || !entry) return;
    if (!Number.isFinite(amount) || amount <= 0) {
      toast.error("Enter a valid position size");
      return;
    }
    setSubmitting(true);
    try {
      const res = await apiRequest("/forex/orders", {
        method: "POST",
        body: JSON.stringify({
          symbol,
          side,
          lots: amount,
          order_type: "market",
          stop_loss: stopLoss ? Number(stopLoss) : null,
          take_profit: takeProfit ? Number(takeProfit) : null,
          account_type: "demo",
          idempotency_key: idemRef.current,
        }),
      });
      if (res?.success) {
        toast.success(`${side === "buy" ? "Bought" : "Sold"} ${amount} lots of ${symbol}`);
        idemRef.current = crypto.randomUUID();
        await loadAccount();
      } else {
        toast.error(res?.error ?? "Order rejected");
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Could not reach the trading server");
    } finally {
      setSubmitting(false);
    }
  };

  const closePosition = async (id: string) => {
    try {
      const res = await apiRequest(`/forex/positions/${id}/close`, { method: "POST" });
      if (res?.success) {
        toast.success(`Closed for ${res.realizedPnl >= 0 ? "+" : ""}${ksh(res.realizedPnl)}`);
        await loadAccount();
      }
    } catch {
      toast.error("Could not close the position");
    }
  };

  const connectionBanner =
    connection === "unavailable" ? (
      <div className="mx-5 mt-4 flex items-start gap-2.5 rounded-2xl border border-border bg-muted/40 p-3.5">
        <WifiOff className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" />
        <div className="min-w-0">
          <p className="text-[13px] font-semibold text-foreground">
            Market data is currently unavailable
          </p>
          <p className="mt-0.5 text-[11px] leading-relaxed text-muted-foreground">
            We could not reach the rate provider, so prices are not shown. No orders can be placed
            until live pricing returns. Your existing positions are unaffected.
          </p>
          <button
            onClick={() => void loadQuotes()}
            className="mt-2 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink"
          >
            <RefreshCw className="h-3 w-3" /> Try again
          </button>
        </div>
      </div>
    ) : null;

  return (
    <AppShell>
      <PageHeader
        title="Forex"
        subtitle="Spot currency trading"
        right={
          <span
            className={[
              "rounded-full px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide",
              connection === "live"
                ? "bg-brand-tint-green text-brand-ink"
                : "bg-muted text-muted-foreground",
            ].join(" ")}
          >
            {connection === "live"
              ? "Live"
              : connection === "connecting"
                ? "Connecting"
                : "Offline"}
          </span>
        }
      />

      <div className="px-5 pb-6">
        <div className="mt-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-xl font-bold text-brand-deep">{symbol}</h2>
            {quote ? (
              <p className="mt-1 font-mono text-2xl font-semibold text-foreground">
                {quote.mid.toFixed(symbol.endsWith("JPY") ? 3 : 5)}
              </p>
            ) : (
              <p className="mt-1 flex items-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading {symbol}…
              </p>
            )}
            {quote && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Bid {quote.bid} · Ask {quote.ask} · {quote.spreadPips} pips
              </p>
            )}
          </div>
          <div className="shrink-0 text-right">
            <span className="rounded-full bg-brand-gold px-2 py-0.5 text-[9px] font-bold uppercase tracking-wide text-brand-deep">
              Demo
            </span>
          </div>
        </div>

        {connectionBanner}

        {/* Symbol picker */}
        <div className="mt-4 flex gap-2 overflow-x-auto pb-1">
          {SYMBOLS.map((s) => (
            <button
              key={s}
              onClick={() => setSymbol(s)}
              className={[
                "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-colors",
                s === symbol
                  ? "bg-brand-deep text-white"
                  : "bg-muted text-muted-foreground hover:text-foreground",
              ].join(" ")}
            >
              {s}
            </button>
          ))}
        </div>

        {/* Chart */}
        <div className="mt-4">
          {candles.length > 0 ? (
            <TradingChart data={candles} />
          ) : (
            <div className="grid h-56 place-items-center rounded-2xl border border-border bg-card">
              <div className="text-center">
                <BarChart3 className="mx-auto h-5 w-5 text-muted-foreground" />
                <p className="mt-2 text-[12px] font-semibold text-foreground">
                  Chart data unavailable
                </p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  No historical rates for {symbol} right now.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Account summary */}
        {account && (
          <div className="mt-5 grid grid-cols-2 gap-3">
            {[
              ["Balance", ksh(account.balance)],
              ["Equity", ksh(account.equity)],
              ["Free margin", ksh(account.freeMargin)],
              ["Margin level", account.marginLevelPercent ? `${account.marginLevelPercent}%` : "—"],
            ].map(([label, value]) => (
              <Card key={label} className="!p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
                <p className="mt-1 text-sm font-bold text-brand-deep">{value}</p>
              </Card>
            ))}
          </div>
        )}

        {/* Order ticket */}
        <div className="mt-6">
          <SectionTitle title="Order ticket" />
          <Card className="mt-3 !p-4">
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
                  {s === "buy" ? (
                    <ArrowUpRight className="h-4 w-4" />
                  ) : (
                    <ArrowDownRight className="h-4 w-4" />
                  )}
                  {s === "buy" ? "BUY" : "SELL"}
                </button>
              ))}
            </div>

            <label className="mt-4 block text-[11px] font-semibold text-foreground">
              Position size (lots)
            </label>
            <input
              value={lots}
              onChange={(e) => setLots(e.target.value)}
              inputMode="decimal"
              className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
            />

            <div className="mt-3 grid grid-cols-2 gap-3">
              <div>
                <label className="block text-[11px] font-semibold text-foreground">Stop loss</label>
                <input
                  value={stopLoss}
                  onChange={(e) => setStopLoss(e.target.value)}
                  inputMode="decimal"
                  placeholder="optional"
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
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
                  placeholder="optional"
                  className="mt-1 h-11 w-full rounded-xl border border-border bg-background px-3 text-sm outline-none focus:border-brand-ink"
                />
              </div>
            </div>

            {preview && (
              <div className="mt-4 rounded-xl bg-brand-tint-green p-3">
                <p className="flex items-center gap-1.5 text-[11px] font-bold text-brand-deep">
                  <Calculator className="h-3.5 w-3.5" /> Risk preview (1% of balance)
                </p>
                <dl className="mt-2 space-y-1 text-[11px]">
                  {[
                    [
                      "Suggested size",
                      `${preview.lots} lots (${preview.units.toLocaleString()} units)`,
                    ],
                    ["Stop distance", `${preview.stopDistancePips} pips`],
                    ["Maximum planned loss", ksh(preview.potentialLoss)],
                    ["Potential profit at 2R", ksh(preview.potentialProfit)],
                    ["Risk / reward", `1 : ${preview.riskRewardRatio}`],
                    ["Required margin", ksh(preview.marginRequired)],
                    ["Spread", `${preview.entrySpreadPips} pips`],
                  ].map(([k, v]) => (
                    <div key={k} className="flex justify-between gap-3">
                      <dt className="text-muted-foreground">{k}</dt>
                      <dd className="font-semibold text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            )}

            <button
              onClick={placeOrder}
              disabled={submitting || connection !== "live" || !quote}
              className={[
                "mt-4 flex h-12 w-full items-center justify-center gap-2 rounded-full text-sm font-bold transition-opacity disabled:opacity-50",
                side === "buy" ? "bg-brand-deep text-white" : "bg-destructive text-white",
              ].join(" ")}
            >
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Calculator className="h-4 w-4" />
              )}
              {submitting ? "Submitting…" : `Confirm ${side === "buy" ? "buy" : "sell"}`}
            </button>

            <p className="mt-2 text-center text-[10px] leading-relaxed text-muted-foreground">
              Forex trading involves risk and can result in the loss of your demo balance. This is a
              simulated account.
            </p>

            {!liveTradingEnabled && (
              <p className="mt-2 rounded-lg bg-muted/50 p-2 text-center text-[10px] text-muted-foreground">
                Live currency trading is not yet available on PESAKI.
              </p>
            )}
          </Card>
        </div>

        {/* Positions */}
        <div className="mt-6">
          <SectionTitle title="Open positions" />
          {positions.length === 0 ? (
            <Card className="mt-3 !p-4">
              <p className="text-[12px] font-semibold text-foreground">No open positions</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Place a trade above and it will appear here.
              </p>
            </Card>
          ) : (
            <div className="mt-3 space-y-2">
              {positions.map((p) => (
                <Card key={p.id} className="!p-3.5">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-[13px] font-bold text-brand-deep">
                        {p.symbol ?? "Position"} · {p.side.toUpperCase()}
                      </p>
                      <p className="mt-0.5 text-[11px] text-muted-foreground">
                        {p.quantity} lots @ {p.average_entry_price}
                        {p.stop_loss ? ` · SL ${p.stop_loss}` : ""}
                        {p.take_profit ? ` · TP ${p.take_profit}` : ""}
                      </p>
                    </div>
                    <div className="shrink-0 text-right">
                      <p
                        className={[
                          "text-[13px] font-bold",
                          Number(p.unrealised_pnl ?? 0) >= 0
                            ? "text-brand-ink"
                            : "text-destructive",
                        ].join(" ")}
                      >
                        {Number(p.unrealised_pnl ?? 0) >= 0 ? "+" : ""}
                        {ksh(p.unrealised_pnl ?? 0)}
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
              ))}
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}
