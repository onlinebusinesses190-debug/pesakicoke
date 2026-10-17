import { useState } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { apiRequest } from "@/utils/api";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { Toolbox } from "./Toolbox";
import { OrderDialog, type DialogState } from "./OrderDialog";
import { Wallet, Menu, BarChart3, Clock, ArrowLeftRight, X } from "lucide-react";

export function Terminal() {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  
  const [lots, setLots] = useState(0.10); 
  const [mobileTab, setMobileTab] = useState<"chart" | "market" | "positions" | "history">("chart");
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositErr, setDepositErr] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  const [realBalance, setRealBalance] = useState<number | null>(null);

  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  const open = (d: DialogState) => {
    setDlgKey((k) => k + 1);
    setDialog(d);
  };

  const handleTrade = (direction: "buy" | "sell") => {
    open({ mode: "new", symbol, type: direction, lots }); 
  };

  const handleClosePosition = (ticket: number, volume: number) => {
    if (window.confirm(`Close position #${ticket}?`)) {
      e.closePosition(ticket, "manual", volume);
    }
  };

  const deposit = () => {
    setDepositOpen(true);
    setDepositErr("");
    setDepositAmount("");
  };

  const fetchRealBalance = async () => {
    try {
      const res = await apiRequest<{ success: boolean; balance: number }>(
        "/forex/account?account_type=live",
      );
      setRealBalance(res.balance ?? 0);
    } catch (err) {
      setRealBalance(null);
    }
  };

  const toggleMode = () => {
    e.setMode(e.mode === "live" ? "demo" : "live");
    if (e.mode !== "live") void fetchRealBalance();
  };

  const marginLevel = e.margin > 0 ? (e.equity / e.margin) * 100 : 0;

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] text-[#1e293b] font-sans">
      
      {/* ─── MT5 Top Header ─── */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <Menu size={20} className="text-gray-600 cursor-pointer" onClick={() => setMobileTab(mobileTab === "market" ? "chart" : "market")} />
          <div>
            <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
              {symbol} <span className="text-xs font-normal text-gray-500">{s?.desc}</span>
            </div>
            <div className="text-[10px] text-gray-500">Forex</div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wide">Balance</div>
            <div className="text-xs font-mono font-bold">
              {e.mode === "live" ? `KSh ${realBalance?.toLocaleString() ?? "—"}` : money(e.equity)}
            </div>
          </div>
          <div className="flex gap-1">
            <button className={`text-xs font-bold px-2 py-1 rounded ${e.mode === "live" ? "bg-red-100 text-red-700" : "bg-green-100 text-green-700"}`} onClick={toggleMode}>
              {e.mode === "live" ? "LIVE" : "DEMO"}
            </button>
            <button className="text-xs px-2 py-1 bg-gray-100 rounded text-gray-700 font-bold" onClick={deposit}>
              <Wallet size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* ─── MT5 Action Bar (SELL | Lot | BUY) ─── */}
      <div className="flex bg-white border-b border-gray-300 select-none z-10">
        <button
          onClick={() => handleTrade("sell")}
          className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] text-white py-2 flex flex-col items-center justify-center transition-colors"
        >
          <span className="text-[10px] font-bold tracking-wider opacity-90">SELL</span>
          <span className="text-sm font-mono font-bold leading-tight">
            {q?.bid.toFixed(s?.digits ?? 5) ?? "—"}
          </span>
        </button>

        <div className="w-32 flex flex-col items-center justify-center bg-white border-x border-gray-200">
           <div className="text-[9px] text-gray-500 font-semibold mb-0.5">Volume</div>
           <div className="flex items-center justify-between w-full px-2">
             <button onClick={() => setLots(Math.max(0.01, lots - 0.01))} className="px-2 text-gray-500 hover:text-black font-bold text-lg leading-none">-</button>
             <input
               type="number"
               step="0.01"
               value={lots}
               onChange={(val) => setLots(Math.max(0.01, Number(val.target.value)))}
               className="w-10 text-center text-sm font-bold focus:outline-none bg-transparent"
             />
             <button onClick={() => setLots(lots + 0.01)} className="px-2 text-gray-500 hover:text-black font-bold text-lg leading-none">+</button>
           </div>
           <div className="text-[8px] text-gray-400 mt-0.5">1 Lot = 100k</div>
        </div>

        <button
          onClick={() => handleTrade("buy")}
          className="flex-1 bg-[#1565c0] hover:bg-[#0d47a1] text-white py-2 flex flex-col items-center justify-center transition-colors"
        >
          <span className="text-[10px] font-bold tracking-wider opacity-90">BUY</span>
          <span className="text-sm font-mono font-bold leading-tight">
             {q?.ask.toFixed(s?.digits ?? 5) ?? "—"}
          </span>
        </button>
      </div>

      {/* ─── Mobile Tabs ─── */}
      <div className="flex border-b border-gray-300 bg-[#f1f3f4] md:hidden">
        {(["chart", "market", "positions", "history"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setMobileTab(tab)}
            className={`flex-1 py-1.5 text-xs font-bold capitalize border-b-2 transition-colors ${
              mobileTab === tab ? "border-[#1565c0] text-[#1565c0]" : "border-transparent text-gray-500"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* ─── Main Layout ─── */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0">
        
        {/* Sidebar (Market Watch) */}
        <aside className={`order-2 md:order-1 md:w-64 border-r border-gray-300 bg-white ${mobileTab === "market" ? "block flex-1" : "hidden md:block"}`}>
          <MarketWatch
            selected={symbol}
            onSelect={(s) => { setSymbol(s); setMobileTab("chart"); }}
            onTrade={(s) => open({ mode: "new", symbol: s })}
          />
        </aside>

        {/* Main Chart Area */}
        <main className={`order-1 md:order-2 flex-1 flex flex-col min-w-0 h-[60vh] md:h-auto ${mobileTab === "chart" ? "flex" : "hidden md:flex"}`}>
          <div className="flex items-center justify-between px-2 py-1 bg-white border-b border-gray-200">
            <div className="flex items-center gap-1">
              {(Object.keys(TIMEFRAMES) as TF[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-sm border transition-colors ${
                    tf === t ? "bg-[#e3f2fd] border-[#1565c0] text-[#1565c0]" : "bg-transparent border-transparent text-gray-500 hover:bg-gray-100"
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 text-gray-500">
              <button onClick={() => setZoom((z) => Math.min(3.5, z * 1.25))} className="hover:text-black font-bold">＋</button>
              <button onClick={() => setZoom((z) => Math.max(0.3, z / 1.25))} className="hover:text-black font-bold">－</button>
              <button onClick={() => open({ mode: "new", symbol })} className="text-[#1565c0] font-bold text-xs ml-2">Trade</button>
            </div>
          </div>

          <div className="flex-1 relative bg-white w-full h-full min-h-[300px]">
            <PriceChart symbol={symbol} tf={tf} zoom={zoom} />
          </div>
        </main>

        {/* ─── Positions / Trade View (Image 4) ─── */}
        <div className={`order-3 md:w-80 md:h-auto border-t md:border-t-0 md:border-l border-gray-300 bg-white overflow-y-auto ${mobileTab === "positions" || mobileTab === "history" ? "block flex-1" : "hidden md:block"}`}>
          
          {/* Account Summary Header (Only visible on mobile positions tab) */}
          <div className="bg-[#f8f9fa] border-b border-gray-300 p-3 text-[11px] text-gray-700 space-y-1 md:block">
            <div className="flex justify-between"><span>Balance:</span> <span className="font-mono">{money(e.balance)}</span></div>
            <div className="flex justify-between"><span>Equity:</span> <span className="font-mono">{money(e.equity)}</span></div>
            <div className="flex justify-between"><span>Margin:</span> <span className="font-mono">{money(e.margin)}</span></div>
            <div className="flex justify-between"><span>Free margin:</span> <span className="font-mono">{money(e.freeMargin)}</span></div>
            <div className="flex justify-between"><span>Margin Level (%):</span> <span className="font-mono">{marginLevel > 0 ? marginLevel.toFixed(2) : "-"}</span></div>
          </div>

          <div className="p-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
            <h3 className="text-xs font-bold text-gray-700">{mobileTab === "history" ? "History" : "Positions"}</h3>
          </div>

          {/* Positions List */}
          {mobileTab === "positions" && (
            <div className="divide-y divide-gray-100">
              {e.positions.length === 0 ? (
                <div className="p-4 text-center text-xs text-gray-500">No open positions</div>
              ) : (
                e.positions.map((p) => {
                  const pnl = e.profitOf(p);
                  const spec = e.spec(p.symbol);
                  const quote = e.quotes[p.symbol];
                  const closePrice = p.side === "buy" ? quote.bid : quote.ask;
                  return (
                    <div key={p.ticket} className="p-2 hover:bg-gray-50 relative group">
                      <div className="flex justify-between items-center mb-1">
                        <div className="flex items-center gap-1">
                          <span className="text-xs font-bold text-gray-800">{p.symbol}</span>
                          <span className="text-[10px] text-gray-500">{p.side}</span>
                          <span className="text-[10px] text-gray-500">{p.lots.toFixed(2)}</span>
                        </div>
                        <div className={`font-mono text-xs font-bold ${pnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                          {pnl.toFixed(2)}
                        </div>
                      </div>
                      <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                        <div>{p.openPrice.toFixed(spec.digits)} → {closePrice.toFixed(spec.digits)}</div>
                        <button 
                          onClick={() => handleClosePosition(p.ticket, p.lots)}
                          className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-100"
                        >
                          Close
                        </button>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* History List */}
          {mobileTab === "history" && (
            <div className="divide-y divide-gray-100">
              {e.history?.length === 0 ? (
                 <div className="p-4 text-center text-xs text-gray-500">No history</div>
              ) : (
                e.history?.map((h: any) => (
                  <div key={h.ticket} className="p-2 flex justify-between items-center">
                    <div>
                      <div className="text-xs font-bold">{h.symbol} <span className="text-gray-500 font-normal">{h.side} {h.lots.toFixed(2)}</span></div>
                      <div className="text-[10px] text-gray-500 font-mono">{h.closeTime || "Closed"}</div>
                    </div>
                    <div className={`font-mono text-xs font-bold ${h.profit >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                      {h.profit?.toFixed(2)}
                    </div>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-gray-300 bg-[#f1f3f4] text-[10px] text-gray-600 font-mono z-20">
        <span className={e.notice?.error ? "text-red-600 font-bold" : ""}>
          {e.notice?.msg ?? "Connected"}
        </span>
        <div className="flex gap-4">
          <span>Margin: {money(e.margin)}</span>
        </div>
      </div>

      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}
      
      {/* Deposit Modal (Same as before) */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-gray-300 bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between bg-[#1565c0] px-3 py-2 text-white">
              <span className="text-sm font-bold">{e.mode === "live" ? "Deposit Real Funds" : "Deposit Demo Funds"}</span>
              <button onClick={() => setDepositOpen(false)} className="text-lg font-bold">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <input className="w-full border border-gray-300 px-3 py-2 text-sm" type="number" placeholder="Amount" value={depositAmount} onChange={(v) => setDepositAmount(v.target.value)} />
              {depositErr && <p className="text-xs text-red-600">{depositErr}</p>}
              <button className="w-full bg-[#1565c0] text-white py-2 font-bold" onClick={() => {
                const n = Number(depositAmount);
                if (e.mode === "live") { /* API CALL */ } else { e.deposit(n); }
                setDepositOpen(false);
              }}>Deposit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
