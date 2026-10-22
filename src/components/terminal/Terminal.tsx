import { useState } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { OrderDialog, type DialogState } from "./OrderDialog";
import { Wallet, Menu, ArrowLeftRight, BarChart3, Clock, MessageSquare, List, ChevronUp, ChevronDown, X, Crosshair, Settings } from "lucide-react";

export function Terminal() {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  
  const [lots, setLots] = useState(0.01); 
  const [mobileTab, setMobileTab] = useState<"chart" | "market" | "positions" | "history" | "messages">("chart");
  
  // Radial Menu State
  const [showRadial, setShowRadial] = useState(false);

  // Bulk Menu State
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  
  // Deposit State
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositErr, setDepositErr] = useState("");

  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  const open = (d: DialogState) => { setDlgKey(k => k + 1); setDialog(d); };
  const handleTrade = (direction: "buy" | "sell") => open({ mode: "new", symbol, type: direction, lots }); 
  
  const totalFloatingPnl = e.positions.reduce((acc, p) => acc + e.profitOf(p), 0);

  // Bulk Close Logic
  const handleBulkClose = (type: 'all' | 'profit' | 'loss') => {
    e.positions.forEach((p) => {
      const pnl = e.profitOf(p);
      if (type === 'all' || (type === 'profit' && pnl > 0) || (type === 'loss' && pnl < 0)) {
        e.closePosition(p.ticket, "manual", p.lots);
      }
    });
    setShowBulkMenu(false);
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] text-[#1e293b] font-sans pb-14 md:pb-0">
      
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300">
        <Menu size={20} className="text-gray-700 cursor-pointer" onClick={() => setMobileTab(mobileTab === "market" ? "chart" : "market")} />
        <div className="flex items-center gap-4 text-gray-600">
          <span className="font-bold text-sm text-gray-900">{tf}</span>
        </div>
      </div>

      {/* Account header */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <ArrowLeftRight size={20} className="text-gray-600 cursor-pointer rotate-180" onClick={() => window.history.back()} />
          <div>
            <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
              {symbol} <span className="text-[10px] font-normal text-gray-500 uppercase">{s?.desc}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-[9px] text-gray-500 uppercase tracking-wide">Balance</div>
            <div className="text-xs font-mono font-bold">{money(e.equity)}</div>
          </div>
          <button onClick={() => setDepositOpen(true)} className="p-1.5 bg-gray-100 rounded text-gray-700 hover:bg-gray-200">
            <Wallet size={16} />
          </button>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex bg-white border-b border-gray-300 select-none z-10">
        <button
          onClick={() => handleTrade("sell")}
          className="flex-1 bg-[#c62828] text-white py-1 flex flex-col items-center justify-center"
        >
          <span className="text-[9px] font-bold tracking-wider opacity-90">SELL</span>
          <span className="text-lg font-mono font-bold leading-tight">{q?.bid.toFixed(5) ?? "—"}</span>
        </button>

        <div className="w-24 flex flex-col items-center justify-center bg-white border-x border-gray-200 py-1">
           <ChevronUp size={12} className="text-gray-400 cursor-pointer" onClick={() => setLots(Math.max(0.01, lots + 0.01))} />
           <input 
             type="number" 
             value={lots} 
             onChange={(val) => setLots(Number(val.target.value))} 
             className="w-full text-center text-sm font-bold focus:outline-none bg-transparent py-0.5" 
           />
           <ChevronDown size={12} className="text-gray-400 cursor-pointer" onClick={() => setLots(Math.max(0.01, lots - 0.01))} />
        </div>

        <button
          onClick={() => handleTrade("buy")}
          className="flex-1 bg-[#1565c0] text-white py-1 flex flex-col items-center justify-center"
        >
          <span className="text-[9px] font-bold tracking-wider opacity-90">BUY</span>
          <span className="text-lg font-mono font-bold leading-tight">{q?.ask.toFixed(5) ?? "—"}</span>
        </button>
      </div>

      {/* Main Layout */}
      <div className="flex flex-col md:flex-row flex-1 min-h-0 mb-12 md:mb-0">
        
        {/* Sidebar (Market Watch) */}
        <aside className={`order-2 md:order-1 md:w-64 border-r border-gray-300 bg-white ${mobileTab === "market" ? "block flex-1" : "hidden md:block"}`}>
          <MarketWatch selected={symbol} onSelect={(s) => { setSymbol(s); setMobileTab("chart"); }} onTrade={(s) => open({ mode: "new", symbol: s })} />
        </aside>

        {/* Main Chart Area */}
        <main className={`order-1 md:order-2 flex-1 flex flex-col min-w-0 h-[65vh] md:h-auto ${mobileTab === "chart" ? "flex" : "hidden md:flex"}`}>
          <div 
            className="flex-1 relative bg-white w-full h-full min-h-[300px]" 
            onClick={() => setShowRadial(true)}
          >
            <PriceChart engine={e} symbol={symbol} tf={tf} zoom={zoom} />
          </div>
        </main>

        {/* Positions / History / Messages View */}
        <div className={`order-3 md:w-80 md:h-auto border-t md:border-t-0 md:border-l border-gray-300 bg-white overflow-y-auto ${["positions", "history", "messages"].includes(mobileTab) ? "block flex-1" : "hidden md:block"}`}>
          
          <div className="bg-[#f8f9fa] border-b border-gray-300 p-3 text-[11px] text-gray-700 space-y-1">
            <div className="flex justify-between"><span>Balance:</span> <span className="font-mono">{money(e.balance)}</span></div>
            <div className="flex justify-between"><span>Equity:</span> <span className="font-mono">{money(e.equity)}</span></div>
            <div className="flex justify-between"><span>Margin:</span> <span className="font-mono">{money(e.margin)}</span></div>
            <div className="flex justify-between"><span>Free Margin:</span> <span className="font-mono">{money(e.freeMargin)}</span></div>
          </div>

          {mobileTab === "positions" && (
            <div>
              <div className="p-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-700">Open Positions</h3>
                {e.positions.length > 0 && (
                  <button onClick={() => setShowBulkMenu(true)} className="text-[10px] text-red-600 font-bold hover:underline">Bulk Ops</button>
                )}
              </div>
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
                            <span className={`text-[10px] font-bold uppercase ${p.side === "buy" ? "text-[#1565c0]" : "text-[#c62828]"}`}>{p.side}</span>
                            <span className="text-[10px] text-gray-500">{p.lots.toFixed(2)} lots</span>
                          </div>
                          <div className={`font-mono text-xs font-bold ${pnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                            {pnl.toFixed(2)} USD
                          </div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                          <div>{p.openPrice.toFixed(spec.digits)} → {closePrice.toFixed(spec.digits)}</div>
                          <button onClick={() => e.closePosition(p.ticket, "manual", p.lots)} className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-100">
                            Close
                          </button>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mobileTab === "history" && (
            <div>
              <div className="p-2 border-b border-gray-200 bg-gray-50 flex justify-between items-center">
                <h3 className="text-xs font-bold text-gray-700">Closed Trades</h3>
              </div>
              <div className="divide-y divide-gray-100">
                {e.history.length === 0 ? (
                  <div className="p-4 text-center text-xs text-gray-500">No trade history</div>
                ) : (
                  e.history.map((h: any) => {
                    const isWin = h.profit >= 0;
                    return (
                      <div key={h.ticket} className="p-2 flex justify-between items-center hover:bg-gray-50">
                        <div>
                          <div className="flex items-center gap-1">
                             <span className="text-xs font-bold text-gray-800">{h.symbol}</span>
                             <span className={`text-[10px] font-bold uppercase ${h.side === "buy" ? "text-[#1565c0]" : "text-[#c62828]"}`}>{h.side}</span>
                          </div>
                          <div className="text-[9px] text-gray-500">{new Date(h.closeTime).toLocaleTimeString()}</div>
                        </div>
                        <div className={`font-mono text-xs font-bold ${isWin ? "text-[#1565c0]" : "text-[#c62828]"}`}>
                          {isWin ? "+" : ""}{h.profit.toFixed(2)} USD
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {mobileTab === "messages" && (
            <div className="p-4 text-center text-xs text-gray-500">
              No new messages from the server.
            </div>
          )}

        </div>
      </div>

      {/* Bottom Navigation */}
      <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-300 flex justify-around py-1 md:hidden z-50">
        <button onClick={() => setMobileTab("market")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "market" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <ArrowLeftRight size={18} />
          <span className="text-[9px] font-semibold">Quotes</span>
        </button>
        <button onClick={() => setMobileTab("chart")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "chart" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BarChart3 size={18} />
          <span className="text-[9px] font-semibold">Charts</span>
        </button>
        <button onClick={() => setMobileTab("positions")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "positions" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <List size={18} />
          <span className="text-[9px] font-semibold">Positions</span>
          <span className={`text-[9px] font-bold mt-[-2px] ${totalFloatingPnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
            {totalFloatingPnl >= 0 ? "+" : ""}{totalFloatingPnl.toFixed(2)}
          </span>
        </button>
        <button onClick={() => setMobileTab("history")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "history" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <Clock size={18} />
          <span className="text-[9px] font-semibold">History</span>
        </button>
        <button onClick={() => setMobileTab("messages")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "messages" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <MessageSquare size={18} />
          <span className="text-[9px] font-semibold">Messages</span>
        </button>
      </div>

      {/* Modals */}
      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}
      
      {/* Deposit Modal */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-gray-300 bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between bg-[#1565c0] px-3 py-2 text-white">
              <span className="text-sm font-bold">Deposit Funds</span>
              <button onClick={() => setDepositOpen(false)} className="text-lg leading-none font-bold">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <input
                className="w-full border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1565c0]"
                type="number"
                placeholder="Amount in USD"
                value={depositAmount}
                onChange={(v) => setDepositAmount(v.target.value)}
              />
              {depositErr && <p className="text-xs text-[#c62828] font-bold">{depositErr}</p>}
              <div className="flex gap-2">
                <button className="flex-1 bg-gray-200 text-gray-700 font-bold py-2 rounded-sm" onClick={() => setDepositOpen(false)}>Cancel</button>
                <button
                  className="flex-1 bg-[#1565c0] text-white font-bold py-2 rounded-sm"
                  onClick={() => {
                    const n = Number(depositAmount);
                    if (n > 0) {
                      e.deposit(n);
                      setDepositOpen(false);
                    } else {
                      setDepositErr("Enter a valid amount");
                    }
                  }}
                >
                  Deposit
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* RADIAL MENU - CLEAN PROFESSIONAL VERSION */}
      {showRadial && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/30 backdrop-blur-[2px]" onClick={() => setShowRadial(false)}>
          <div 
            className="relative w-[280px] h-[280px] rounded-full border-[28px] border-[#1565c0]/90 shadow-2xl flex items-center justify-center"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Center Close Area */}
            <button onClick={() => setShowRadial(false)} className="absolute inset-0 m-auto w-12 h-12 rounded-full bg-transparent hover:bg-black/10 flex items-center justify-center">
               <X className="text-white/60" size={24} />
            </button>

            {/* Timeframes */}
            {["M1", "M5", "M15", "M30", "H1", "H4", "D1", "W1"].map((t, i) => {
              const total = 8;
              const angle = (i / total) * 2 * Math.PI - Math.PI / 2;
              const radius = 140; 
              const x = Math.cos(angle) * radius;
              const y = Math.sin(angle) * radius;

              return (
                <button
                  key={t}
                  onClick={() => { setTf(t as TF); setShowRadial(false); }}
                  className={`absolute w-8 h-8 flex items-center justify-center text-[11px] font-bold rounded-full transition-transform hover:scale-125 ${
                    tf === t ? "text-white bg-[#0d47a1] shadow-md" : "text-blue-100 hover:text-white"
                  }`}
                  style={{ transform: `translate(${x}px, ${y}px)` }}
                >
                  {t}
                </button>
              );
            })}

            {/* Inner Tools */}
            <div className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-4 flex flex-col gap-6 text-blue-100/80">
              <Crosshair size={18} className="hover:text-white cursor-pointer hover:scale-110 transition-transform" />
              <BarChart3 size={18} className="hover:text-white cursor-pointer hover:scale-110 transition-transform" />
              <Settings size={18} className="hover:text-white cursor-pointer hover:scale-110 transition-transform" />
            </div>
          </div>
        </div>
      )}

      {/* Bulk Operations Bottom Sheet */}
      {showBulkMenu && (
        <div className="fixed inset-0 z-[100] flex flex-col justify-end bg-black/50" onClick={() => setShowBulkMenu(false)}>
          <div className="w-full bg-white rounded-t-2xl p-4 pb-8" onClick={(ev) => ev.stopPropagation()}>
            <div className="text-center font-bold text-lg mb-4 text-gray-800 border-b border-gray-200 pb-2">Bulk Operations</div>
            <button onClick={() => handleBulkClose('all')} className="w-full text-left py-3 text-sm text-gray-700 border-b border-gray-100">Close All Positions</button>
            <button onClick={() => handleBulkClose('profit')} className="w-full text-left py-3 text-sm text-gray-700 border-b border-gray-100">Close Profitable Positions</button>
            <button onClick={() => handleBulkClose('loss')} className="w-full text-left py-3 text-sm text-gray-700 border-b border-gray-100">Close Losing Positions</button>
            <button onClick={() => setShowBulkMenu(false)} className="w-full text-center py-3 mt-2 text-sm font-bold text-[#1565c0]">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
