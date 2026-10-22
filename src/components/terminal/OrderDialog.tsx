import { useState } from "react";
import { SYMBOLS, type OrderType } from "@/lib/trading/engine";
import { useEngine } from "@/lib/trading/use-engine";

export type DialogState =
  | { mode: "new"; symbol: string; type?: "buy" | "sell"; lots?: number }
  | { mode: "modify"; ticket: number }
  | null;

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode; }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" onMouseDown={onClose}>
      <div className="w-full max-w-sm border border-gray-300 bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col" onMouseDown={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between bg-[#1565c0] px-3 py-2 text-white">
          <span className="text-sm font-bold tracking-wide">{title}</span>
          <button onClick={onClose} aria-label="Close" className="px-2 text-lg leading-none hover:opacity-80 font-bold">✕</button>
        </div>
        <div className="p-4 space-y-4">{children}</div>
      </div>
    </div>
  );
}

const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <label className="grid grid-cols-[120px_1fr] items-center gap-2">
    <span className="text-xs font-bold text-gray-600 uppercase">{label}</span>
    {children}
  </label>
);

export function OrderDialog({ state, onClose }: { state: DialogState; onClose: () => void }) {
  const e = useEngine();
  
  const [symbol, setSymbol] = useState(state?.mode === "new" ? state.symbol : "EURUSD");
  const [exec, setExec] = useState<"market" | "pending">("market");
  const [ptype, setPtype] = useState<OrderType>("buy_limit");
  
  // PESAKI Lots (0.01 = $1 margin)
  const [pesakiLots, setPesakiLots] = useState<string>(
    state?.mode === "new" && state.lots ? state.lots.toString() : "0.01"
  );
  const [price, setPrice] = useState("");
  
  const pos = state?.mode === "modify" ? e.positions.find((p) => p.ticket === state.ticket) : undefined;
    
  const [sl, setSl] = useState(pos?.sl ? String(pos.sl) : "");
  const [tp, setTp] = useState(pos?.tp ? String(pos.tp) : "");
  const [closeLots, setCloseLots] = useState(pos ? pos.lots.toFixed(2) : "");
  
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(false); 
  
  if (!state) return null;

  const num = (v: string) => parseFloat(v) || 0;

  const handleTrade = async (direction: "buy" | "sell") => {
    setErr("");
    setLoading(true);
    try {
      // e.placeOrder expects 'lots', which we will map to Margin in the engine
      const res = await e.placeOrder({ 
        symbol, type: direction, lots: num(pesakiLots), sl: num(sl), tp: num(tp) 
      });
      if (res.ok) onClose();
      else setErr(res.error || "Execution failed");
    } catch (error: any) {
      setErr(error.message || "Network error");
    } finally {
      setLoading(false);
    }
  };

  const handleModify = () => {
    if (!pos) return;
    setErr("");
    const res = e.modifyPosition(pos.ticket, num(sl), num(tp));
    if (res.ok) onClose();
    else setErr(res.error || "Modify failed");
  };

  const handleClosePos = () => {
    if (!pos) return;
    setErr("");
    const res = e.closePosition(pos.ticket, "manual", num(closeLots));
    if (res.ok) onClose();
    else setErr(res.error || "Close failed");
  };

  if (state.mode === "modify") {
    if (!pos) return <div className="fixed inset-0 flex items-center justify-center">Position is closed.</div>;
    const s = e.spec(pos.symbol);
    
    return (
      <Shell title={`#${pos.ticket} ${pos.side.toUpperCase()} ${pos.lots.toFixed(2)} ${pos.symbol}`} onClose={onClose}>
        <div className="flex justify-between items-center bg-gray-50 border border-gray-200 p-2 rounded-sm font-mono text-sm">
          <span className="text-[#c62828] font-bold">Bid: {e.quotes[pos.symbol].bid.toFixed(s.digits)}</span>
          <span className="text-gray-400">|</span>
          <span className="text-[#1565c0] font-bold">Ask: {e.quotes[pos.symbol].ask.toFixed(s.digits)}</span>
        </div>
        <div className="text-xs text-gray-600 flex justify-between">
          <span>Open: <b className="font-mono text-black">{pos.openPrice.toFixed(s.digits)}</b></span>
          <span>Profit: <b className={`font-mono ${e.profitOf(pos) >= 0 ? "text-[#2e7d32]" : "text-[#c62828]"}`}>{e.profitOf(pos).toFixed(2)} USD</b></span>
        </div>
        <div className="space-y-3 pt-2 border-t border-gray-200">
          <Row label="Stop Loss"><input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono" value={sl} onChange={(v) => setSl(v.target.value)} placeholder="0.00000" /></Row>
          <Row label="Take Profit"><input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono" value={tp} onChange={(v) => setTp(v.target.value)} placeholder="0.00000" /></Row>
          <button className="w-full bg-[#1565c0] hover:bg-[#0d47a1] text-white py-2 text-sm font-bold rounded-sm" onClick={handleModify} disabled={loading}>Modify Position</button>
        </div>
        <div className="space-y-3 pt-4 border-t border-gray-200 mt-4">
          <Row label="Close Volume"><input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono" value={closeLots} onChange={(v) => setCloseLots(v.target.value)} /></Row>
          <button className="w-full bg-[#c62828] hover:bg-[#b71c1c] text-white py-2 text-sm font-bold rounded-sm" onClick={handleClosePos} disabled={loading}>Close at {e.closePriceOf(pos).toFixed(s.digits)}</button>
        </div>
        {err && <p className="text-[#c62828] text-xs font-bold text-center mt-2">{err}</p>}
      </Shell>
    );
  }

  const s = e.spec(symbol);
  const q = e.quotes[symbol];
  
  // PESAKI MARGIN & LEVERAGE MATH
  const MARGIN_PER_LOT = 100; 
  const LEVERAGE = 100;
  
  const marginUsd = num(pesakiLots) * MARGIN_PER_LOT;
  const exposureUsd = marginUsd * LEVERAGE;
  const openFeeUsd = marginUsd * 0.005;
  const closeFeeUsd = marginUsd * 0.005;
  const totalRequiredUsd = marginUsd + openFeeUsd;

  return (
    <Shell title="PESAKI FX Order" onClose={onClose}>
      <Row label="Symbol">
        <select className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm focus:outline-none" value={symbol} onChange={(v) => setSymbol(v.target.value)}>
          {SYMBOLS.map((x) => <option key={x.name} value={x.name}>{x.name}, {x.desc}</option>)}
        </select>
      </Row>

      <Row label="PESAKI Lots">
        <input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono focus:outline-none" type="number" step="0.01" min="0.01" value={pesakiLots} onChange={(v) => setPesakiLots(v.target.value)} />
      </Row>

      <div className="grid grid-cols-2 gap-2">
        <div>
          <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Stop Loss</span>
          <input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono" value={sl} onChange={(v) => setSl(v.target.value)} placeholder="0.00000" />
        </div>
        <div>
          <span className="text-[10px] font-bold text-gray-500 uppercase block mb-1">Take Profit</span>
          <input className="w-full border border-gray-300 rounded-sm px-2 py-1.5 text-sm font-mono" value={tp} onChange={(v) => setTp(v.target.value)} placeholder="0.00000" />
        </div>
      </div>

      <div className="bg-[#f8f9fa] border border-gray-200 rounded-sm p-3 flex flex-col gap-2 mt-2">
        <div className="flex justify-between items-center font-mono text-base border-b border-gray-300 pb-2">
          <span className="text-[#c62828] font-bold">{q.bid.toFixed(s.digits)}</span>
          <span className="text-[10px] text-gray-500 uppercase">Spread: {(q.ask - q.bid).toFixed(s.digits)}</span>
          <span className="text-[#1565c0] font-bold">{q.ask.toFixed(s.digits)}</span>
        </div>
        
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>Margin Allocated:</span>
          <span className="font-mono font-bold text-black">${marginUsd.toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>Notional Exposure (1:100):</span>
          <span className="font-mono font-bold text-black">${exposureUsd.toFixed(2)} USD</span>
        </div>
        <div className="flex justify-between text-[11px] text-gray-600 border-t border-gray-200 pt-1 mt-1">
          <span>Opening Commission (0.5%):</span>
          <span className="font-mono font-bold text-red-600">${openFeeUsd.toFixed(3)} USD</span>
        </div>
        <div className="flex justify-between text-[11px] text-gray-600">
          <span>Est. Closing Commission:</span>
          <span className="font-mono font-bold text-red-600">${closeFeeUsd.toFixed(3)} USD</span>
        </div>
        
        <div className="flex justify-between text-xs text-gray-800 border-t border-gray-200 pt-2 mt-1">
          <span className="font-bold">Total Deducted Upfront:</span>
          <span className="font-mono font-bold">${totalRequiredUsd.toFixed(3)} USD</span>
        </div>
      </div>

      {exec === "market" ? (
        <div className="grid grid-cols-2 gap-2 mt-2">
          <button className="bg-[#c62828] hover:bg-[#b71c1c] py-3 text-white text-sm font-bold uppercase rounded-sm flex flex-col items-center disabled:opacity-50" onClick={() => handleTrade("sell")} disabled={loading || marginUsd < 1}>
            <span>{loading ? "..." : "SELL"}</span>
            <span className="text-xs font-mono opacity-90">{q.bid.toFixed(s.digits)}</span>
          </button>
          <button className="bg-[#1565c0] hover:bg-[#0d47a1] py-3 text-white text-sm font-bold uppercase rounded-sm flex flex-col items-center disabled:opacity-50" onClick={() => handleTrade("buy")} disabled={loading || marginUsd < 1}>
            <span>{loading ? "..." : "BUY"}</span>
            <span className="text-xs font-mono opacity-90">{q.ask.toFixed(s.digits)}</span>
          </button>
        </div>
      ) : (
        <button className="w-full bg-[#1565c0] hover:bg-[#0d47a1] text-white py-3 text-sm font-bold uppercase rounded-sm mt-2 transition-colors disabled:opacity-50" onClick={handleTrade as any} disabled={loading}>
          {loading ? "Processing..." : "Place Pending Order"}
        </button>
      )}
      {marginUsd < 1 && <p className="text-[#c62828] text-xs font-bold text-center mt-2">Minimum trade is 0.01 Lots ($1 Margin)</p>}
      {err && <p className="text-[#c62828] text-xs font-bold text-center mt-2">{err}</p>}
    </Shell>
  );
}
