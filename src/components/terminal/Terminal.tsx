import { useState } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { apiRequest } from "@/utils/api";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { Toolbox } from "./Toolbox";
import { OrderDialog, type DialogState } from "./OrderDialog";
import { Settings, TrendingDown, TrendingUp, Wallet, Menu } from "lucide-react";

export function Terminal() {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  
  // MT5-style state
  const [lots, setLots] = useState(0.10); 
  const [mobileTab, setMobileTab] = useState<"chart" | "market" | "positions">("chart");
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositErr, setDepositErr] = useState("");
  const [depositLoading, setDepositLoading] = useState(false);
  
  const [realBalance, setRealBalance] = useState<number | null>(null);

  const open = (d: DialogState) => {
    setDlgKey((k) => k + 1);
    setDialog(d);
  };

  const handleTrade = (direction: "buy" | "sell") => {
    open({ mode: "new", symbol, type: direction, lots } as any); 
    // Note: You may need to adjust the "type" and "lots" props depending on how OrderDialog is built.
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

  const reset = () => {
    if (window.confirm("Reset the demo account? All positions and history will be removed."))
      e.resetAccount();
  };

  return (
    <div className="flex min-h-screen flex-col bg-[#f8f9fa] text-[#1e293b] font-sans">
      
      {/* ─── MT5 Top Header (Account Info) ─── */}
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300 shadow-sm z-20">
        <div className="flex items-center gap-3">
          <Menu size={20} className="text-gray-600" />
          <div>
            <div className="text-sm font-bold text-gray-900 flex items-center gap-2">
              EURUSD <span className="text-xs font-normal text-gray-500">Euro vs US Dollar</span>
            </div>
            <div className="text-[10px] text-gray-500">Forex Major</div>
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
        {/* SELL Button */}
        <button
          onClick={() => handleTrade("sell")}
          className="flex-1 bg-[#c62828] hover:bg-[#b71c1c] text-white py-2 flex flex-col items-center justify-center transition-colors"
        >
          <span className="text-[10px] font-bold tracking-wider opacity-90">SELL</span>
          <span className="text-sm font-mono font-bold leading-tight">
            {/* Replace with real bid from your engine if available */}
            1.13418
          </span>
        </button>

        {/* Lot Size Input */}
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

        {/* BUY Button */}
        <button
          onClick={() => handleTrade("buy")}
          className="flex-1 bg-[#1565c0] hover:bg-[#0d47a1] text-white py-2 flex flex-col items-center justify-center transition-colors"
        >
          <span className="text-[10px] font-bold tracking-wider opacity-90">BUY</span>
          <span className="text-sm font-mono font-bold leading-tight">
             {/* Replace with real ask from your engine if available */}
            1.13430
          </span>
        </button>
      </div>

      {/* ─── Mobile Tabs (Chart / Market / Positions) ─── */}
      <div className="flex border-b border-gray-300 bg-[#f1f3f4] md:hidden">
        {(["chart", "market", "positions"] as const).map((tab) => (
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
        <main className={`order-1 md:order-2 flex-1 flex flex-col min-w-0 ${mobileTab === "chart" ? "flex" : "hidden md:flex"}`}>
          
          {/* Chart Toolbar */}
          <div className="flex items-center justify-between px-2 py-1 bg-white border-b border-gray-200">
            <div className="flex items-center gap-1">
              {(Object.keys(TIMEFRAMES) as TF[]).map((t) => (
                <button
                  key={t}
                  onClick={() => setTf(t)}
                  className={`px-2 py-0.5 text-[11px] font-bold rounded-sm border transition-colors ${
                    tf === t 
                      ? "bg-[#e3f2fd] border-[#1565c0] text-[#1565c0]" 
                      : "bg-transparent border-transparent text-gray-500 hover:bg-gray-100"
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

          {/* The Chart Component */}
          <div className="flex-1 relative bg-white">
             {/* IMPORTANT: See instructions below to fix candle sizes in PriceChart.tsx */}
            <PriceChart symbol={symbol} tf={tf} zoom={zoom} />
            
            {/* Pending Orders Overlay (Optional - can add later) */}
            <div className="absolute top-2 left-2 pointer-events-none">
              <span className="bg-white/80 border border-gray-300 text-[10px] px-1.5 py-0.5 rounded font-mono font-bold text-gray-700">
                {symbol} • {tf}
              </span>
            </div>
          </div>
        </main>

        {/* Bottom Toolbox (Positions / History) */}
        <div className={`order-3 md:w-80 md:h-auto border-t md:border-t-0 md:border-l border-gray-300 bg-white h-64 md:h-auto ${mobileTab === "positions" ? "block flex-1" : "hidden md:block"}`}>
          <Toolbox onModify={(t) => open({ mode: "modify", ticket: t })} />
        </div>

      </div>

      {/* ─── Bottom Status Bar ─── */}
      <div className="flex items-center justify-between px-2 py-1 border-t border-gray-300 bg-[#f1f3f4] text-[10px] text-gray-600 font-mono z-20">
        <span className={e.notice?.error ? "text-red-600 font-bold" : ""}>
          {e.notice?.msg ?? "Connected to Server"}
        </span>
        <div className="flex gap-4">
          <span>Margin: {money(e.margin)}</span>
          <span>Free: {money(e.freeMargin)}</span>
        </div>
      </div>

      {/* Modals */}
      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}

      {/* Deposit Modal remains the same... */}
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
           {/* ... your existing deposit code ... */}
        </div>
      )}
    </div>
  );
}
