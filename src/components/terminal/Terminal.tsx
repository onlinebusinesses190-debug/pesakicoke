import { useState, useEffect, useRef } from "react";
import { TIMEFRAMES, type TF } from "@/lib/trading/engine";
import { money, useEngine } from "@/lib/trading/use-engine";
import { MarketWatch } from "./MarketWatch";
import { PriceChart } from "./PriceChart";
import { OrderDialog, type DialogState } from "./OrderDialog";
import { Menu, ChevronUp, ChevronDown, Wallet, ChevronLeft } from "lucide-react";

const TopCrosshair = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><circle cx="12" cy="12" r="6" /><path d="M12 2v3M12 19v3M2 12h3M19 12h3" /></svg>);
const TopActivity = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14h4l3-8 4 16 3-8h4" /></svg>);
const TopLayers = () => (<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5"><polygon points="12 2 2 7 12 12 22 7 12 2" /><polyline points="2 12 12 17 22 12" /><polyline points="2 17 12 22 22 17" /></svg>);
const BottomQuotes = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M7 10L3 14L7 18" /><path d="M17 14L21 10L17 6" /><path d="M3 14H12" /><path d="M12 10H21" /></svg>);
const BottomCharts = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><line x1="5" y1="15" x2="5" y2="21" /><rect x="3" y="9" width="4" height="6" /><line x1="12" y1="9" x2="12" y2="21" /><rect x="10" y="3" width="4" height="6" /><line x1="19" y1="17" x2="19" y2="21" /><rect x="17" y="11" width="4" height="6" /></svg>);
const BottomTrade = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M3 14h4l3-8 4 16 3-8h4" /></svg>);
const BottomHistory = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="9" /><polyline points="12 7 12 12 15 15" /></svg>);
const BottomMessages = () => (<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" /></svg>);

export function Terminal({ mode = "demo" }: { mode?: "demo" | "real" }) {
  const e = useEngine();
  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [zoom, setZoom] = useState(1);
  const [dialog, setDialog] = useState<DialogState>(null);
  const [dlgKey, setDlgKey] = useState(0);
  
  const [lots, setLots] = useState(0.01); 
  const [mobileTab, setMobileTab] = useState<"chart" | "market" | "trade" | "history" | "messages">("chart");
  
  const [showRadial, setShowRadial] = useState(false);
  const [showBulkMenu, setShowBulkMenu] = useState(false);
  
  const [depositOpen, setDepositOpen] = useState(false);
  const [depositAmount, setDepositAmount] = useState("");
  const [depositErr, setDepositErr] = useState("");

  const s = e.spec(symbol);
  const q = e.quotes[symbol];

  useEffect(() => {
    const engineMode = mode === "real" ? "live" : "demo";
    e.setMode(engineMode);
  }, [mode]);

  const [flash, setFlash] = useState<"up" | "down" | "none">("none");
  const prevBid = useRef(q?.bid);

  useEffect(() => {
    if (!q) return;
    if (prevBid.current !== undefined && prevBid.current !== null) {
      if (q.bid > prevBid.current) setFlash("up");
      else if (q.bid < prevBid.current) setFlash("down");
    }
    prevBid.current = q.bid;
    const timer = setTimeout(() => setFlash("none"), 300);
    return () => clearTimeout(timer);
  }, [q?.bid]);

  const open = (d: DialogState) => { setDlgKey(k => k + 1); setDialog(d); };
  const handleTrade = (direction: "buy" | "sell") => open({ mode: "new", symbol, type: direction, lots }); 
  
  const totalFloatingPnl = e.positions.reduce((acc, p) => acc + e.profitOf(p), 0);

  const handleBulkClose = (type: 'all' | 'profit' | 'loss') => {
    e.positions.forEach((p) => {
      const pnl = e.profitOf(p);
      if (type === 'all' || (type === 'profit' && pnl > 0) || (type === 'loss' && pnl < 0)) {
        e.closePosition(p.ticket, "manual", p.lots);
      }
    });
    setShowBulkMenu(false);
  };

  const renderPrice = (price: number | undefined, digits: number) => {
    if (!price) return "—";
    const str = price.toFixed(digits);
    return (
      <span className="flex items-start justify-center leading-none font-mono">
        <span>{str.slice(0, -1)}</span>
        <span className="text-[10px] font-bold mt-0.5">{str.slice(-1)}</span>
      </span>
    );
  };

  let sellBg = "bg-[#c62828]";
  let buyBg = "bg-[#1565c0]";
  if (flash === "up") { sellBg = "bg-[#1565c0]"; buyBg = "bg-[#1565c0]"; } 
  else if (flash === "down") { sellBg = "bg-[#c62828]"; buyBg = "bg-[#c62828]"; }

  return (
    <div className="flex h-[100dvh] flex-col bg-[#f8f9fa] text-[#1e293b] font-sans overflow-hidden">
      
      <div className="flex items-center justify-between px-3 py-2 bg-white border-b border-gray-300 shrink-0">
        <div className="flex items-center gap-2">
          <ChevronLeft size={24} className="text-gray-700 cursor-pointer" onClick={() => window.history.back()} />
          <Menu size={22} className="text-gray-700 cursor-pointer" onClick={() => setMobileTab(mobileTab === "market" ? "chart" : "market")} />
        </div>
        
        <div className="flex items-center gap-5 text-gray-700">
          <TopCrosshair />
          <TopActivity />
          <span className="font-bold text-sm text-black">{tf}</span>
          <div className="w-5 h-5 rounded-full bg-blue-100 flex items-center justify-center border border-red-400 relative overflow-hidden">
            <div className="absolute inset-0 bg-red-400 transform translate-x-1/2 translate-y-1/2"></div>
          </div>
          <TopLayers onClick={() => setShowRadial(true)} className="cursor-pointer" />
        </div>

        <div className="flex items-center gap-2">
          <div className="text-right flex flex-col items-end">
            <div className="text-[9px] text-gray-500 uppercase tracking-wide">
              {mode === "real" ? "LIVE WALLET" : "DEMO BAL"}
            </div>
            
            {mode === "real" ? (
              <div className="text-xs font-mono font-bold text-green-600">
                KSh {money(e.liveKesBalance)}
              </div>
            ) : (
              <div className="text-xs font-mono font-bold text-gray-900">${money(e.balance)}</div>
            )}
          </div>
          
          <button onClick={() => { if (mode === "real") window.location.href = "/wallet"; else setDepositOpen(true); }} className="p-1.5 bg-gray-100 rounded text-gray-700 hover:bg-gray-200">
            <Wallet size={16} />
          </button>
        </div>
      </div>

      <div className="flex bg-white border-b border-gray-300 select-none z-10 shrink-0">
        <button onClick={() => handleTrade("sell")} className={`flex-1 ${sellBg} text-white py-1 flex flex-col items-center justify-center transition-colors duration-150`}>
          <span className="text-[9px] font-bold tracking-wider opacity-90">SELL</span>
          <span className="text-lg font-bold">{renderPrice(q?.bid, s?.digits || 5)}</span>
        </button>

        <div className="w-24 flex flex-col items-center justify-center bg-white border-x border-gray-200 py-0.5">
           <ChevronUp size={16} className="text-gray-500 cursor-pointer" onClick={() => setLots(Math.max(0.01, lots + 0.01))} />
           <input type="number" value={lots} onChange={(val) => setLots(Number(val.target.value))} className="w-full text-center text-sm font-bold focus:outline-none bg-transparent py-0.5" />
           <ChevronDown size={16} className="text-gray-500 cursor-pointer" onClick={() => setLots(Math.max(0.01, lots - 0.01))} />
        </div>

        <button onClick={() => handleTrade("buy")} className={`flex-1 ${buyBg} text-white py-1 flex flex-col items-center justify-center transition-colors duration-150`}>
          <span className="text-[9px] font-bold tracking-wider opacity-90">BUY</span>
          <span className="text-lg font-bold">{renderPrice(q?.ask, s?.digits || 5)}</span>
        </button>
      </div>

      <div className="flex flex-col md:flex-row flex-1 overflow-hidden relative">
        <aside className={`order-2 md:order-1 md:w-64 border-r border-gray-300 bg-white overflow-y-auto ${mobileTab === "market" ? "block flex-1" : "hidden md:block"}`}>
          <MarketWatch selected={symbol} onSelect={(s) => { setSymbol(s); setMobileTab("chart"); }} onTrade={(s) => open({ mode: "new", symbol: s })} />
        </aside>

        <main className={`order-1 md:order-2 flex-1 flex flex-col min-w-0 ${mobileTab === "chart" ? "flex" : "hidden md:flex"}`}>
          <div className="flex-1 relative bg-white w-full h-full" onClick={() => setShowRadial(true)}>
            <PriceChart engine={e} symbol={symbol} tf={tf} zoom={zoom} />
          </div>
        </main>

        <div className={`order-3 md:w-80 md:h-auto border-t md:border-t-0 md:border-l border-gray-300 bg-white overflow-y-auto ${["trade", "history", "messages"].includes(mobileTab) ? "block flex-1" : "hidden md:block"}`}>
          <div className="bg-[#f8f9fa] border-b border-gray-300 p-3 text-[11px] text-gray-700 space-y-1">
            <div className="flex justify-between"><span>Balance:</span> <span className="font-mono">{mode === "real" ? `KSh ${money(e.liveKesBalance)}` : `$${money(e.balance)}`}</span></div>
            <div className="flex justify-between"><span>Equity:</span> <span className="font-mono">{mode === "real" ? `KSh ${money(e.liveKesBalance + e.floating)}` : `$${money(e.equity)}`}</span></div>
            <div className="flex justify-between"><span>Margin:</span> <span className="font-mono">{mode === "real" ? `KSh ${money(e.margin * e.exchangeRate)}` : `$${money(e.margin)}`}</span></div>
            <div className="flex justify-between"><span>Free Margin:</span> <span className="font-mono">{mode === "real" ? `KSh ${money(e.liveKesBalance - e.margin * e.exchangeRate)}` : `$${money(e.freeMargin)}`}</span></div>
          </div>

          {mobileTab === "trade" && (
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
                          <div className={`font-mono text-xs font-bold ${pnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>{pnl.toFixed(2)} USD</div>
                        </div>
                        <div className="flex justify-between items-center text-[10px] text-gray-500 font-mono">
                          <div>{p.openPrice.toFixed(spec.digits)} → {closePrice.toFixed(spec.digits)}</div>
                          <button onClick={() => e.closePosition(p.ticket, "manual", p.lots)} className="bg-red-50 text-red-600 px-2 py-0.5 rounded text-[10px] font-bold hover:bg-red-100">Close</button>
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

          {mobileTab === "messages" && (<div className="p-4 text-center text-xs text-gray-500">No new messages.</div>)}
        </div>
      </div>

      <div className="bg-white border-t border-gray-300 flex justify-around py-1 md:hidden shrink-0 z-50">
        <button onClick={() => setMobileTab("market")} className={`flex flex-col items-center gap-1 w-full ${mobileTab === "market" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BottomQuotes />
          <span className="text-[9px] font-semibold">Quotes</span>
        </button>
        <button onClick={() => setMobileTab("chart")} className={`flex flex-col items-center gap-1 w-full ${mobileTab === "chart" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BottomCharts />
          <span className="text-[9px] font-semibold">Charts</span>
        </button>
        <button onClick={() => setMobileTab("trade")} className={`flex flex-col items-center gap-1 w-full ${mobileTab === "trade" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BottomTrade />
          <span className="text-[9px] font-semibold">Trade</span>
          <span className={`text-[9px] font-bold mt-[-3px] ${totalFloatingPnl >= 0 ? "text-[#1565c0]" : "text-[#c62828]"}`}>
            {totalFloatingPnl >= 0 ? "+" : ""}{totalFloatingPnl.toFixed(2)}
          </span>
        </button>
        <button onClick={() => setMobileTab("history")} className={`flex flex-col items-center gap-1 w-full ${mobileTab === "history" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BottomHistory />
          <span className="text-[9px] font-semibold">History</span>
        </button>
        <button onClick={() => setMobileTab("messages")} className={`flex flex-col items-center gap-1 w-full ${mobileTab === "messages" ? "text-[#1565c0]" : "text-gray-500"}`}>
          <BottomMessages />
          <span className="text-[9px] font-semibold">Messages</span>
        </button>
      </div>

      {dialog && <OrderDialog key={dlgKey} state={dialog} onClose={() => setDialog(null)} />}
      
      {depositOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
          <div className="w-full max-w-sm border border-gray-300 bg-white shadow-2xl rounded-sm overflow-hidden flex flex-col">
            <div className="flex items-center justify-between bg-[#1565c0] px-3 py-2 text-white">
              <span className="text-sm font-bold">Deposit Demo Funds</span>
              <button onClick={() => setDepositOpen(false)} className="text-lg leading-none font-bold">✕</button>
            </div>
            <div className="p-4 space-y-4">
              <input className="w-full border border-gray-300 px-3 py-2 text-sm font-mono focus:outline-none focus:border-[#1565c0]" type="number" placeholder="Amount in USD" value={depositAmount} onChange={(v) => setDepositAmount(v.target.value)} />
              {depositErr && <p className="text-xs text-[#c62828] font-bold">{depositErr}</p>}
              <div className="flex gap-2">
                <button className="flex-1 bg-gray-200 text-gray-700 font-bold py-2 rounded-sm" onClick={() => setDepositOpen(false)}>Cancel</button>
                <button className="flex-1 bg-[#1565c0] text-white font-bold py-2 rounded-sm" onClick={() => { const n = Number(depositAmount); if (n > 0) { e.deposit(n); setDepositOpen(false); } else { setDepositErr("Enter a valid amount"); } }}>Deposit</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showRadial && (
        <div className="fixed inset-0 z-[100] bg-transparent" onClick={() => setShowRadial(false)}>
          <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2">
            <svg width="260" height="260" viewBox="0 0 260 260" className="overflow-visible">
              <circle cx="130" cy="130" r="90" fill="none" stroke="#2979FF" strokeWidth="52" />
              {[
                { label: "M15", type: "tf" }, { label: "M30", type: "tf" }, { label: "H1", type: "tf" }, { label: "H4", type: "tf" },
                { label: "D1", type: "tf" }, { label: "W1", type: "tf" }, { label: "MN", type: "tf" }, { label: "pulse", type: "icon" },
                { label: "crosshair", type: "icon" }, { label: "sliders", type: "icon" }, { label: "magnifier", type: "icon" }, { label: "duplicate", type: "icon" },
                { label: "M1", type: "tf" }, { label: "M5", type: "tf" }
              ].map((item, i) => {
                const total = 14;
                const angle = -90 + i * (360 / total);
                const rad = angle * (Math.PI / 180);
                const radius = 90; 
                const x = 130 + radius * Math.cos(rad);
                const y = 130 + radius * Math.sin(rad);
                const rotation = angle + 90; 

                return (
                  <g key={i} transform={`translate(${x}, ${y}) rotate(${rotation})`} onClick={(e) => { e.stopPropagation(); if(item.type === "tf") { setTf(item.label as TF); setShowRadial(false); } }} className={`transition-transform hover:scale-125 cursor-pointer ${item.type === "tf" && tf === item.label ? "opacity-100" : "opacity-90 hover:opacity-100"}`} style={{ transformOrigin: "center", transformBox: "fill-box" }}>
                    {item.type === "tf" ? (
                      <text textAnchor="middle" dominantBaseline="middle" fontFamily="Arial, sans-serif" fontWeight="700" fontSize="11" fill="#FFFFFF" stroke="#000000" strokeWidth="2.5" paintOrder="stroke">{item.label}</text>
                    ) : (
                      <g stroke="#FFFFFF" strokeWidth="1.8" fill="none" strokeLinecap="round" strokeLinejoin="round">
                        {item.label === "pulse" && <path d="M-8 0 H-4 L-2 -5 L2 5 L4 0 H8" />}
                        {item.label === "crosshair" && <><line x1="-6" y1="0" x2="6" y2="0" /><line x1="0" y1="-6" x2="0" y2="6" /><path d="M-2 -6 L0 -8 L2 -6 M-2 6 L0 8 L2 6 M-6 -2 L-8 0 L-6 2 M6 -2 L8 0 L6 2" /></>}
                        {item.label === "sliders" && <><line x1="-4" y1="-7" x2="-4" y2="7" /><circle cx="-4" cy="-2" r="2" fill="#FFFFFF" /><line x1="2" y1="-7" x2="2" y2="7" /><circle cx="2" cy="4" r="2" fill="#FFFFFF" /></>}
                        {item.label === "magnifier" && <><circle cx="-2" cy="-2" r="4" /><line x1="1" y1="1" x2="6" y2="6" /><circle cx="-2" cy="-2" r="1.5" fill="#FFFFFF" /></>}
                        {item.label === "duplicate" && <><rect x="-5" y="-5" width="7" height="7" /><rect x="-1" y="-1" width="7" height="7" /></>}
                      </g>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
      )}

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
