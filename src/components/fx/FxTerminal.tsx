import { Briefcase, Globe, History, LineChart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { closeTrade, getAccount, openTrade, resetDemo, type Trade } from "@/lib/fx/fx.functions";
import { TIMEFRAMES, calcPnl, getPair, quoteAt, type Side, type TF } from "@/lib/fx/market";
import { EXIT_URL, ksh } from "@/lib/fx/format";
import { supabase } from "@/integrations/supabase/client";
import { MarketList } from "./MarketList";
import { FxChart } from "./FxChart";
import { ExecBar, TradePanel } from "./TradePanel";
import { TradesTabs } from "./TradesTabs";

type Mode = "demo" | "real";
type View = "trade" | "markets" | "positions" | "history";

export function FxTerminal() {
  const qc = useQueryClient();
  const navigate = useNavigate();
  const fetchAccount = useServerFn(getAccount);
  const doOpen = useServerFn(openTrade);
  const doClose = useServerFn(closeTrade);
  const doReset = useServerFn(resetDemo);
  const { data, isLoading, error } = useQuery({ queryKey: ["fx-account"], queryFn: () => fetchAccount(), refetchInterval: 15000 });

  const [symbol, setSymbol] = useState("EURUSD");
  const [tf, setTf] = useState<TF>("M5");
  const [mode, setModeState] = useState<Mode>("demo");
  const [view, setView] = useState<View>("trade");
  const [raw, setRaw] = useState("1000");
  const [busy, setBusy] = useState(false);
  const [closing, setClosing] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ msg: string; bad?: boolean } | null>(null);
  const [fs, setFs] = useState(false);
  const fsRef = useRef<HTMLDivElement>(null);
  const autoClosing = useRef(new Set<string>());

  // live clock synced to server time
  const offset = data ? data.serverNow - Date.now() : 0;
  const [now, setNow] = useState(() => Date.now() / 1000);
  useEffect(() => {
    const id = setInterval(() => setNow((Date.now() + offset) / 1000), 1000);
    return () => clearInterval(id);
  }, [offset]);

  useEffect(() => { const m = localStorage.getItem("pesaki-fx-mode"); if (m === "real" || m === "demo") setModeState(m); }, []);
  const setMode = (m: Mode) => { setModeState(m); localStorage.setItem("pesaki-fx-mode", m); };

  useEffect(() => {
    const h = () => setFs(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", h);
    return () => document.removeEventListener("fullscreenchange", h);
  }, []);
  const toggleFs = () => { if (document.fullscreenElement) document.exitFullscreen(); else fsRef.current?.requestFullscreen?.(); };

  useEffect(() => { if (!notice) return; const t = setTimeout(() => setNotice(null), 5000); return () => clearTimeout(t); }, [notice]);

  const refresh = () => qc.invalidateQueries({ queryKey: ["fx-account"] });
  const pair = getPair(symbol)!;
  const open = (data?.open ?? []).filter((t) => t.mode === mode);
  const closed = (data?.closed ?? []).filter((t) => t.mode === mode);
  const balance = data ? data.wallet[mode] : 0;
  const floating = open.reduce((a, t) => a + Math.max(calcPnl(t, quoteAt(getPair(t.symbol)!, now)).pnl, -t.margin), 0);
  const marginUsed = open.reduce((a, t) => a + t.margin, 0);
  const equity = balance + marginUsed + floating;

  const trade = async (side: Side, amount: number) => {
    setBusy(true);
    try {
      const r = await doOpen({ data: { mode, symbol, side, amount } });
      if (r.ok) setNotice({ msg: `${side.toUpperCase()} ${pair.label} ${ksh(amount)} opened at ${r.entry.toFixed(pair.digits)}` });
      else setNotice({ msg: r.error, bad: true });
    } catch { setNotice({ msg: "Connection problem. Please try again.", bad: true }); }
    setBusy(false); refresh();
  };
  const close = async (t: Trade) => {
    setClosing(t.id);
    try {
      const r = await doClose({ data: { id: t.id } });
      if (r.ok) setNotice({ msg: `${getPair(t.symbol)!.label} closed: ${ksh(r.pnl, true)}`, bad: r.pnl < 0 });
      else setNotice({ msg: r.error, bad: true });
    } catch { setNotice({ msg: "Connection problem. Please try again.", bad: true }); }
    setClosing(null); refresh();
  };

  // auto-close trades whose loss has used up their margin
  useEffect(() => {
    for (const t of data?.open ?? []) {
      const { pnl } = calcPnl(t, quoteAt(getPair(t.symbol)!, now));
      if (pnl <= -t.margin && !autoClosing.current.has(t.id)) {
        autoClosing.current.add(t.id);
        doClose({ data: { id: t.id } }).finally(refresh);
      }
    }
  }, [now, data]);

  const back = () => { if (window.history.length > 1) window.history.back(); else window.location.href = EXIT_URL; };
  const signOut = async () => { await qc.cancelQueries(); qc.clear(); await supabase.auth.signOut(); navigate({ to: "/auth", replace: true }); };
  const reset = async () => { if (window.confirm("Reset your demo wallet to KSh 100,000? Demo trades will be removed.")) { await doReset(); refresh(); } };

  const onTrade = async (side: Side, amount: number) => { await trade(side, amount); setView("positions"); };
  const pick = (s: string) => { setSymbol(s); setView("trade"); };
  const NAV: { id: View; label: string; icon: typeof Globe }[] = [
    { id: "trade", label: "Trade", icon: LineChart }, { id: "markets", label: "Markets", icon: Globe },
    { id: "positions", label: `Positions${open.length ? ` (${open.length})` : ""}`, icon: Briefcase }, { id: "history", label: "History", icon: History },
  ];

  return (
    <div className="flex min-h-screen flex-col gap-2 p-2 pb-20">
      <header className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card px-2 py-2">
        <button onClick={back} className="rounded-md border border-border px-3 py-1.5 font-semibold hover:bg-muted">← Back</button>
        <span className="px-1 text-xl font-extrabold tracking-tight text-primary">Pesaki FX</span>
        <div className="flex rounded-full bg-muted p-1" role="tablist" aria-label="Account mode">
          <button onClick={() => setMode("demo")} className={`rounded-full px-4 py-1 font-bold ${mode === "demo" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Demo</button>
          <button onClick={() => setMode("real")} className={`rounded-full px-4 py-1 font-bold ${mode === "real" ? "bg-real text-real-foreground" : "text-muted-foreground"}`}>Real</button>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-x-4 gap-y-1">
          <span><span className="text-xs text-muted-foreground">{mode === "demo" ? "Virtual balance" : "Real wallet"}</span> <b className="num text-lg">{ksh(balance)}</b></span>
          <span><span className="text-xs text-muted-foreground">Equity</span> <b className="num">{ksh(equity)}</b></span>
          {mode === "demo" && <button onClick={reset} className="text-xs font-semibold text-primary underline">Reset demo</button>}
          <button onClick={signOut} className="text-xs font-semibold text-muted-foreground underline">Sign out</button>
        </div>
      </header>

      {mode === "real" && data && data.wallet.real <= 0 && (
        <div className="rounded-lg border border-real bg-real/15 px-3 py-2 text-sm">
          Your real wallet is empty. Fund it from your main wallet to place real trades — or switch to <button className="font-bold underline" onClick={() => setMode("demo")}>Demo</button> to practise with virtual money.
        </div>
      )}
      {error && <div className="rounded-lg bg-destructive px-3 py-2 text-destructive-foreground">Could not load your account. Please refresh.</div>}

      {view === "trade" && (
        <div className="grid flex-1 gap-2 lg:grid-cols-[1fr_320px]">
          <section ref={fsRef} className={`flex flex-col gap-2 ${fs ? "bg-background p-2" : ""}`}>
            <div className="sticky top-0 z-20 flex flex-col gap-2 rounded-lg border border-border bg-card p-2">
              <div className="flex items-center gap-2">
                <button onClick={() => setView("markets")} className="text-left">
                  <span className="block text-lg font-extrabold">{pair.label} ▾</span>
                  <span className="block text-xs text-muted-foreground">{pair.name}</span>
                </button>
                <span className="ml-auto inline-flex items-center gap-1 text-xs font-semibold text-up"><span className="h-2 w-2 animate-pulse rounded-full bg-up" />LIVE</span>
              </div>
              <ExecBar pair={pair} now={now} mode={mode} amount={Number(raw) || 0} balance={balance} busy={busy} onTrade={onTrade} />
            </div>
            <div className="flex flex-col overflow-hidden rounded-lg border border-border bg-card">
              <div className="flex flex-wrap items-center gap-1 border-b border-border px-2 py-1.5">
                {(Object.keys(TIMEFRAMES) as TF[]).map((t) => (
                  <button key={t} onClick={() => setTf(t)} className={`rounded px-2 py-1 text-xs font-bold ${tf === t ? "bg-primary text-primary-foreground" : "hover:bg-muted"}`}>{t}</button>
                ))}
                <button onClick={toggleFs} className="ml-auto rounded border border-border px-2 py-1 text-xs font-bold hover:bg-muted">{fs ? "Exit full screen" : "⛶ Full screen"}</button>
              </div>
              <div className={fs ? "h-[80vh]" : "h-[45vh] lg:h-[60vh]"}>
                <FxChart pair={pair} tf={tf} now={now} trades={open} />
              </div>
            </div>
          </section>
          <aside>
            {isLoading ? <div className="rounded-lg border border-border bg-card p-4">Loading your wallet…</div> :
              <TradePanel pair={pair} raw={raw} setRaw={setRaw} mode={mode} balance={balance} />}
          </aside>
        </div>
      )}
      {view === "markets" && <div className="h-[75vh]"><MarketList selected={symbol} onSelect={pick} now={now} /></div>}
      {view === "positions" && <div className="min-h-[60vh]"><TradesTabs view="open" open={open} closed={closed} now={now} closing={closing} onClose={close} /></div>}
      {view === "history" && <div className="min-h-[60vh]"><TradesTabs view="history" open={open} closed={closed} now={now} closing={closing} onClose={close} /></div>}

      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-border bg-card" aria-label="Sections">
        {NAV.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)} aria-current={view === n.id}
            className={`flex flex-col items-center py-2 text-xs font-bold ${view === n.id ? "border-t-2 border-primary text-primary" : "text-muted-foreground"}`}>
            <n.icon className="h-5 w-5" aria-hidden />{n.label}
          </button>
        ))}
      </nav>

      {notice && (
        <div className={`fixed bottom-20 left-1/2 z-40 -translate-x-1/2 rounded-lg px-4 py-2.5 font-semibold shadow-lg ${notice.bad ? "bg-destructive text-destructive-foreground" : "bg-primary text-primary-foreground"}`}>
          {notice.msg}
        </div>
      )}
    </div>
  );
}
