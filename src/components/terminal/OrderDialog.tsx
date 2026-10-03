import { useState } from "react";
import { SYMBOLS, type OrderType } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export type DialogState =
  { mode: "new"; symbol: string } | { mode: "modify"; ticket: number } | null;

function Shell({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-foreground/30 p-2"
      onMouseDown={onClose}
    >
      <div
        className="w-full max-w-md border border-border bg-background shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between bg-primary px-2 py-1 text-primary-foreground">
          <span>{title}</span>
          <button onClick={onClose} aria-label="Close" className="px-2 hover:opacity-80">
            ✕
          </button>
        </div>
        <div className="space-y-2 p-3">{children}</div>
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="grid grid-cols-[110px_1fr] items-center gap-2">
    <span>{label}:</span>
    {children}
  </label>
);

export function OrderDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const e = useEngine();
  const [symbol, setSymbol] = useState(state?.mode === "new" ? state.symbol : "EURUSD");
  const [exec, setExec] = useState<"market" | "pending">("market");
  const [ptype, setPtype] = useState<OrderType>("buy_limit");
  const [lots, setLots] = useState("0.10");
  const [price, setPrice] = useState("");
  const pos =
    state?.mode === "modify" ? e.positions.find((p) => p.ticket === state.ticket) : undefined;
  const [sl, setSl] = useState(pos?.sl ? String(pos.sl) : "");
  const [tp, setTp] = useState(pos?.tp ? String(pos.tp) : "");
  const [closeLots, setCloseLots] = useState(pos ? pos.lots.toFixed(2) : "");
  const [err, setErr] = useState("");
  if (!state) return null;

  const num = (v: string) => parseFloat(v) || 0;
  const done = (r: { ok: boolean; error?: string }) =>
    r.ok ? onClose() : setErr(r.error || "Error");

  if (state.mode === "modify") {
    if (!pos)
      return (
        <Shell title="Position" onClose={onClose}>
          <p>Position is closed.</p>
        </Shell>
      );
    const s = e.spec(pos.symbol);
    const q = e.quotes[pos.symbol];
    return (
      <Shell
        title={`Position #${pos.ticket} ${pos.side} ${pos.lots.toFixed(2)} ${pos.symbol}`}
        onClose={onClose}
      >
        <div className="flex justify-around font-mono text-lg">
          <span className="text-sell">{q.bid.toFixed(s.digits)}</span>/
          <span className="text-buy">{q.ask.toFixed(s.digits)}</span>
        </div>
        <p>
          Open price {pos.openPrice.toFixed(s.digits)} · Profit{" "}
          <b className={e.profitOf(pos) >= 0 ? "text-up" : "text-down"}>
            {e.profitOf(pos).toFixed(2)}
          </b>
        </p>
        <Row label="Stop Loss">
          <input
            className="mt-input"
            value={sl}
            onChange={(v) => setSl(v.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </Row>
        <Row label="Take Profit">
          <input
            className="mt-input"
            value={tp}
            onChange={(v) => setTp(v.target.value)}
            placeholder="0"
            inputMode="decimal"
          />
        </Row>
        <button
          className="mt-btn w-full"
          onClick={() => done(e.modifyPosition(pos.ticket, num(sl), num(tp)))}
        >
          Modify
        </button>
        <hr className="border-border" />
        <Row label="Close volume">
          <input
            className="mt-input"
            value={closeLots}
            onChange={(v) => setCloseLots(v.target.value)}
            inputMode="decimal"
          />
        </Row>
        <button
          className="w-full bg-sell py-1.5 text-trade-foreground hover:opacity-90"
          onClick={() => done(e.closePosition(pos.ticket, "manual", num(closeLots)))}
        >
          Close #{pos.ticket} at {e.closePriceOf(pos).toFixed(s.digits)}
        </button>
        {err && <p className="text-destructive">{err}</p>}
      </Shell>
    );
  }

  const s = e.spec(symbol);
  const q = e.quotes[symbol];
  const margin = e.marginFor(symbol, num(lots));
  return (
    <Shell title="Order" onClose={onClose}>
      <Row label="Symbol">
        <select className="mt-input" value={symbol} onChange={(v) => setSymbol(v.target.value)}>
          {SYMBOLS.map((x) => (
            <option key={x.name} value={x.name}>
              {x.name}, {x.desc}
            </option>
          ))}
        </select>
      </Row>
      <Row label="Type">
        <select
          className="mt-input"
          value={exec}
          onChange={(v) => setExec(v.target.value as "market" | "pending")}
        >
          <option value="market">Market Execution</option>
          <option value="pending">Pending Order</option>
        </select>
      </Row>
      <Row label="Volume">
        <input
          className="mt-input"
          type="number"
          step="0.01"
          min="0.01"
          value={lots}
          onChange={(v) => setLots(v.target.value)}
        />
      </Row>
      <Row label="Stop Loss">
        <input
          className="mt-input"
          value={sl}
          onChange={(v) => setSl(v.target.value)}
          placeholder="0"
          inputMode="decimal"
        />
      </Row>
      <Row label="Take Profit">
        <input
          className="mt-input"
          value={tp}
          onChange={(v) => setTp(v.target.value)}
          placeholder="0"
          inputMode="decimal"
        />
      </Row>
      {exec === "pending" && (
        <>
          <Row label="Order type">
            <select
              className="mt-input"
              value={ptype}
              onChange={(v) => setPtype(v.target.value as OrderType)}
            >
              <option value="buy_limit">Buy Limit</option>
              <option value="sell_limit">Sell Limit</option>
              <option value="buy_stop">Buy Stop</option>
              <option value="sell_stop">Sell Stop</option>
            </select>
          </Row>
          <Row label="At price">
            <input
              className="mt-input"
              value={price}
              onChange={(v) => setPrice(v.target.value)}
              placeholder={q.bid.toFixed(s.digits)}
              inputMode="decimal"
            />
          </Row>
        </>
      )}
      <div className="flex justify-around py-1 font-mono text-2xl">
        <span className="text-sell">{q.bid.toFixed(s.digits)}</span>
        <span>/</span>
        <span className="text-buy">{q.ask.toFixed(s.digits)}</span>
      </div>
      <p className="text-muted-foreground">
        Required margin: {margin.toFixed(2)} USD · Free margin: {e.freeMargin.toFixed(2)} USD
      </p>
      {exec === "market" ? (
        <div className="grid grid-cols-2 gap-2">
          <button
            className="bg-sell py-2 text-trade-foreground hover:opacity-90"
            onClick={() =>
              done(
                e.placeOrder({ symbol, type: "sell", lots: num(lots), sl: num(sl), tp: num(tp) }),
              )
            }
          >
            Sell by Market
          </button>
          <button
            className="bg-buy py-2 text-trade-foreground hover:opacity-90"
            onClick={() =>
              done(e.placeOrder({ symbol, type: "buy", lots: num(lots), sl: num(sl), tp: num(tp) }))
            }
          >
            Buy by Market
          </button>
        </div>
      ) : (
        <button
          className="mt-btn w-full py-1.5"
          onClick={() =>
            done(
              e.placeOrder({
                symbol,
                type: ptype,
                lots: num(lots),
                price: num(price),
                sl: num(sl),
                tp: num(tp),
              }),
            )
          }
        >
          Place
        </button>
      )}
      {err && <p className="text-destructive">{err}</p>}
    </Shell>
  );
}
