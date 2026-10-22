import { useState } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { OrderDialog, type DialogState } from "./OrderDialog";
import { Wallet, Menu, ArrowLeftRight, BarChart3, Clock, MessageSquare, List } from "lucide-react";

export function Terminal() {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  
  const [lots, setLots] = useState(0.01); 
  const [mobileTab, setMobileTab] = useState<"chart" | "market" | "positions" | "history" | "messages">("chart");

  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  const open = (d: DialogState) => { setDlgKey(k => k + 1); setDialog(d); };
  const handleTrade = (direction: "buy" | "sell") => open({ mode: "new", symbol, type: direction, lots }); 
  
  const totalFloatingPnl = e.positions.reduce((acc, p) => acc + e.profitOf(p), 0);

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] text-[#1e293b] font-sans pb-14 md:pb-0">
      
      {/* Top toolbar */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300">
        <Menu size={20} className="text-gray-700" />
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
           <input 
             type="number" 
             value={lots} 
             onChange={(val) => setLots(Number(val.target.value))} 
             className="w-full text-center text-sm font-bold focus:outline-none bg-transparent py-0.5" 
           />
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
          <div className="flex-1 relative bg-white w-full h-full min-h-[300px]">
            <PriceChart engine={e} symbol={symbol} tf={tf} zoom={zoom} />
          </div>
        </main>

        {/* Positions / History View */}
        <div className={`order-3 md:w-80 md:h-auto border-t md:border-t-0 md:border-l border-gray-300 bg-white overflow-y-auto ${["positions", "history", "messages"].includes(mobileTab) ? "block flex-1" : "hidden md:block"}`}>
          <div className="bg-[#f8f9fa] border-b border-gray-300 p-3 text-[11px] text-gray-700 space-y-1">
            <div className="flex justify-between"><span>Balance:</span> <span className="font-mono">{money(e.balance)}</span></div>
            <div className="flex justify-between"><span>Equity:</span> <span className="font-mono">{money(e.equity)}</span></div>
            <div className="flex justify-between"><span>Margin:</span> <span className="font-mono">{money(e.margin)}</span></div>
          </div>
          <div className="p-4 text-center text-xs text-gray-500">Positions list here</div>
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
          <span className={`text-[9px] font-bold mt-[-2px] ${totalFloatingPnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
            {totalFloatingPnl >= 0 ? "+" : ""}{totalFloatingPnl.toFixed(2)}
          </span>
        </button>
        <button onClick={() => setMobileTab("positions")} className={`flex flex-col items-center gap-0.5 w-full ${mobileTab === "positions" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <List size={18} />
          <span className="text-[9px] font-semibold">Positions</span>
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

      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}
    </div>
  );
}
