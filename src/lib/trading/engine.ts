// MetaTrader-style trading engine.
// Demo: 100% local (localStorage). Real: backed by Supabase wallet API.

import { apiRequest } from "../../utils/api";
import { supabase } from "../../utils/supabase/client";

export const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400 } as const;
export type TF = keyof typeof TIMEFRAMES;
export type Side = "buy" | "sell";
export type OrderType = "buy" | "sell" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
export type CloseReason = "manual" | "sl" | "tp" | "stopout";

export interface SymbolSpec { name: string; desc: string; digits: number; point: number; spread: number; contract: number; start: number; vol: number; }
export interface Quote { bid: number; ask: number; high: number; low: number; open: number; dir: -1 | 0 | 1; time: number; targetBid?: number; targetAsk?: number; }
export interface Candle { t: number; o: number; h: number; l: number; c: number; }
export interface Position { ticket: number; symbol: string; side: Side; lots: number; openPrice: number; openTime: number; sl: number; tp: number; backendId?: string; }
export interface PendingOrder { ticket: number; symbol: string; type: Exclude<OrderType, "buy" | "sell">; lots: number; price: number; sl: number; tp: number; time: number; }
export interface Deal { ticket: number; symbol: string; side: Side; lots: number; openPrice: number; closePrice: number; openTime: number; closeTime: number; profit: number; reason: CloseReason | "deposit" | "cancel"; }
export interface JournalEntry { time: number; msg: string; error?: boolean; }
export type Result = { ok: true; ticket?: number; backendId?: string } | { ok: false; error: string; };

export interface LiveSyncState {
  loading: boolean;
  error: string | null;
  lastSuccessfulPositions: Position[];
  lastFetchTime: number | null;
}

const SPREADS: Record<string, number> = { EURUSD: 1, GBPUSD: 2, USDJPY: 1, AUDUSD: 1, USDCAD: 2, USDCHF: 2, NZDUSD: 2, EURJPY: 2, GBPJPY: 3, XAUUSD: 2 };
function spreadFor(symbol: string): number { return SPREADS[symbol] ?? 2; }

const RAW: [string, string, number, number, number, number][] = [
  ["EURUSD", "Euro vs US Dollar", 5, 1, 10000, 1.0852], ["GBPUSD", "Great Britain Pound vs US Dollar", 5, 2, 10000, 1.2648], ["USDJPY", "US Dollar vs Japanese Yen", 3, 1, 10000, 149.52], ["AUDUSD", "Australian Dollar vs US Dollar", 5, 1, 10000, 0.6551], ["USDCAD", "US Dollar vs Canadian Dollar", 5, 2, 10000, 1.3602], ["USDCHF", "US Dollar vs Swiss Franc", 5, 2, 10000, 0.8803], ["NZDUSD", "New Zealand Dollar vs US Dollar", 5, 2, 10000, 0.6004], ["EURJPY", "Euro vs Japanese Yen", 3, 2, 10000, 162.24], ["GBPJPY", "Great Britain Pound vs Japanese Yen", 3, 3, 10000, 189.11], ["XAUUSD", "Gold vs US Dollar", 2, 2, 10, 2351.4],
];

export const SYMBOLS: SymbolSpec[] = RAW.map(([name, desc, digits, spread, contract, start]) => ({ name, desc, digits, point: Math.pow(10, -digits), spread: spreadFor(name), contract, start, vol: start * 1.2e-5 }));
const STORAGE_KEY = "mt-terminal-v1";
const START_BALANCE = 10000;
const STOP_OUT = 50;
const MARGIN_CALL = 100;
// Module-level cache: survives engine recreation
const ENTRY_PRICE_CACHE = new Map<string, number>();
const ENTRY_SIDE_CACHE = new Map<string, string>();
export { ENTRY_PRICE_CACHE, ENTRY_SIDE_CACHE };
export const round = (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

function mulberry32(seed: number): () => number { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (a >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seededRNG(symbol: string, timestamp: number): () => number { const str = symbol + ":" + timestamp; let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return mulberry32((h ^ timestamp) >>> 0); }
function gaussFrom(rng: () => number) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }

export const isBuyType = (t: OrderType) => t.startsWith("buy");
export const typeLabel = (t: OrderType) => t.replace("_", " ");

function genCandles(s: SymbolSpec, tfSec: number, nowSec: number, n = 1000): Candle[] {
  const out: Candle[] = [];
  let p = s.start;
  const subSigma = s.vol * Math.sqrt((tfSec * 2) / 6);
  const last = Math.floor(nowSec / tfSec) * tfSec;
  const rng = seededRNG(s.name, tfSec);
  for (let i = 0; i < n; i++) {
    const o = p; let h = p, l = p;
    for (let k = 0; k < 6; k++) { p += gaussFrom(rng) * subSigma; h = Math.max(h, p); l = Math.min(l, p); }
    out.push({ t: last - (n - 1 - i) * tfSec, o, h, l, c: p });
  }
  const shift = s.start - p;
  return out.map((c) => ({ t: c.t, o: round(c.o + shift, s.digits), h: round(c.h + shift, s.digits), l: round(c.l + shift, s.digits), c: round(c.c + shift, s.digits) }));
}

export class Engine {
  quotes: Record<string, Quote> = {};
  candles: Record<string, Record<TF, Candle[]>> = {};
  leverage = 100; // Forced leverage
  currency = "USD";
  mode: "demo" | "live" = "demo";
  journal: JournalEntry[] = [];
  notice: JournalEntry | null = null;
  nextTicket = 100000001;
  version = 0;

  // Separate local state for Demo (virtual) and Real (backend-synced)
  private _demoBalance = START_BALANCE;
  private _demoPositions: Position[] = [];
  private _demoOrders: PendingOrder[] = [];
  private _demoHistory: Deal[] = [];

  // Live state synced from backend wallet API
  private _liveBalanceKes = 0;      // KES from /forex/account?account_type=live
  private _livePositions: Position[] = [];
  private _liveOrders: PendingOrder[] = [];
  private _liveHistory: Deal[] = [];

  exchangeRate = 130;

  // Live sync status for UI
  private _liveSync: LiveSyncState = {
    loading: false,
    error: null,
    lastSuccessfulPositions: [],
    lastFetchTime: null,
  };

  get balance() { return this.mode === "live" ? this._liveBalanceKes / this.exchangeRate : this._demoBalance; }
  set balance(v: number) { if (this.mode === "live") this._liveBalanceKes = v * this.exchangeRate; else this._demoBalance = v; }

  // Map liveBalance to realBalance for UI compatibility
  get liveBalance() { return this._liveBalanceKes / this.exchangeRate; }
  get liveKesBalance() { return this._liveBalanceKes; }
  get liveAvailableBalance() { return this.freeMargin * this.exchangeRate; }

  // Live sync status exposed to UI
  get liveSync() { return { ...this._liveSync }; }

  get positions() { return this.mode === "live" ? this._livePositions : this._demoPositions; }
  set positions(v: Position[]) { if (this.mode === "live") this._livePositions = v; else this._demoPositions = v; }
  get orders() { return this.mode === "live" ? this._liveOrders : this._demoOrders; }
  set orders(v: PendingOrder[]) { if (this.mode === "live") this._liveOrders = v; else this._demoOrders = v; }
  get history() { return this.mode === "live" ? this._liveHistory : this._demoHistory; }
  set history(v: Deal[]) { if (this.mode === "live") this._liveHistory = v; else this._demoHistory = v; }

  private listeners = new Set<() => void>();
  private marginCallWarned = false;
  private animationFrameId: number | null = null;
  private lastTickTime = 0;
  private tickCount = 0;
  private lastSaveTick = 0;
  private isTrading = false;
  private _liveEntryPrices = new Map<string, number>();
  private livePollInterval: number | null = null;
  private _realtimeChannels: Map<string, any> = new Map();
  private _realtimeStarted = false;
  private _liveUserId: string | null = null;
  private _onPositionClosed: ((side: string, lots: number, pnl: number, reason: string) => void) | null = null;
  _entryPriceMap = new Map<number | string, number>();

  constructor() {
    this.load();
    const now = Date.now() / 1000;
    for (const s of SYMBOLS) {
      if (!this.candles[s.name]) {
        const tfs = {} as Record<TF, Candle[]>;
        (Object.keys(TIMEFRAMES) as TF[]).forEach((tf) => (tfs[tf] = genCandles(s, TIMEFRAMES[tf], now)));
        this.candles[s.name] = tfs;
      }
      if (!this.quotes[s.name]) {
        const tfs = this.candles[s.name];
        const day = tfs.H1.slice(-24);
        const lastCandle = tfs.H1[tfs.H1.length - 1];
        const startPrice = lastCandle ? lastCandle.c : s.start;
        this.quotes[s.name] = { bid: startPrice, ask: round(startPrice + s.spread * s.point, s.digits), high: Math.max(...day.map((c) => c.h)), low: Math.min(...day.map((c) => c.l)), open: day[0].o, dir: 0, time: Date.now() };
      }
    }
    this.log("Terminal started.");
    this.start();
  }

  public start() { if (this.animationFrameId) return; this.lastTickTime = Date.now(); const loop = () => { this.animationFrameId = requestAnimationFrame(loop); const now = Date.now(); if (now - this.lastTickTime >= 200) { this.lastTickTime = now; this.tick(); } }; this.animationFrameId = requestAnimationFrame(loop); }
  public stop() { if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } }
  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; this.listeners.forEach((l) => l()); }

  private setLiveSync(partial: Partial<LiveSyncState>) {
    this._liveSync = { ...this._liveSync, ...partial };
    this.emit();
  }

  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({ 
        demoBalance: this._demoBalance, demoPositions: this._demoPositions, demoOrders: this._demoOrders, demoHistory: this._demoHistory.slice(0, 500), 
        journal: this.journal.slice(0, 300), nextTicket: this.nextTicket, tickCount: this.tickCount, 
        quotePrices: Object.fromEntries(Object.entries(this.quotes).map(([k, v]) => [k, { bid: v.bid, ask: v.ask, high: v.high, low: v.low, open: v.open }])), 
        candles: this.candles 
      }));
    } catch { /* ignore */ }
  }

  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY); if (!raw) return;
      const d = JSON.parse(raw);
      this._demoBalance = d.demoBalance ?? START_BALANCE; this._demoPositions = d.demoPositions ?? []; this._demoOrders = d.demoOrders ?? []; this._demoHistory = d.demoHistory ?? [];
      
      this.journal = d.journal ?? []; this.nextTicket = d.nextTicket ?? this.nextTicket; this.tickCount = d.tickCount ?? 0;
      if (d.quotePrices) { for (const [symbol, q] of Object.entries(d.quotePrices as Record<string, { bid: number; ask: number; high: number; low: number; open: number }>)) { if (this.quotes[symbol]) { const s = this.spec(symbol); if (s) { this.quotes[symbol].bid = q.bid; this.quotes[symbol].ask = q.ask; this.quotes[symbol].high = q.high; this.quotes[symbol].low = q.low; this.quotes[symbol].open = q.open; } } } }
      if (d.candles) this.candles = d.candles;
    } catch { /* ignore */ }
  }

  private log(msg: string, error = false) { const e = { time: Date.now(), msg, error }; this.journal.unshift(e); if (this.journal.length > 300) this.journal.length = 300; this.notice = e; }
  spec(name: string) { return SYMBOLS.find((s) => s.name === name)!; }
  fmt(name: string, v: number) { return v.toFixed(this.spec(name).digits); }
  marginFor(symbol: string, lots: number) { return round(lots * 100, 2); }
  closePriceOf(p: { symbol: string; side: Side }) { const q = this.quotes[p.symbol]; if (!q) return 0; return p.side === "buy" ? (q.bid ?? 0) : (q.ask ?? 0); }
  profitOf(p: Position, usdAmount = p.lots) { const spec = this.spec(p.symbol); if (!spec) return 0; const diff = (this.closePriceOf(p) - p.openPrice) * (p.side === "buy" ? 1 : -1); const units = usdAmount * (spec.contract ?? 10000); return round(diff * units, 2); }
  get floating() { return this.positions.reduce((a, p) => a + this.profitOf(p), 0); }
  get equity() { return round(this.balance + this.floating, 2); }
  get margin() { return round(this.positions.reduce((a, p) => a + this.marginFor(p.symbol, p.lots), 0), 2); }
  get freeMargin() { return Math.max(0, round(this.equity - this.margin, 2)); }
  get marginLevel() { return this.margin > 0 ? (this.equity / this.margin) * 100 : 0; }

  private checkStops(side: Side, ref: number, sl: number, tp: number, symbol: string): string | null {
    const minDist = this.spec(symbol).point * 10;
    if (sl < 0 || tp < 0) return "Invalid stops";
    if (side === "buy") { if (sl && sl > ref - minDist) return "Invalid S/L: must be below price"; if (tp && tp < ref + minDist) return "Invalid T/P: must be above price"; } 
    else { if (sl && sl < ref + minDist) return "Invalid S/L: must be above price"; if (tp && tp > ref - minDist) return "Invalid T/P: must be below price"; }
    return null;
  }

  private fail(msg: string): Result { this.log(msg, true); this.emit(); return { ok: false, error: msg }; }

  private openPosition(symbol: string, side: Side, lots: number, sl: number, tp: number, fromOrder?: number): Result {
    const s = this.spec(symbol);
    const need = this.marginFor(symbol, lots);
    if (this.freeMargin < need) return this.fail(`Not enough money: required margin ${need.toFixed(2)} USD`);
    const q = this.quotes[symbol];
    const price = side === "buy" ? q.ask : q.bid;
    const ticket = fromOrder ?? this.nextTicket++;
    this.positions.push({ ticket, symbol, side, lots, openPrice: price, openTime: Date.now(), sl, tp });
    this.balance = round(this.balance - 0.02, 2);
    this.log(`deal #${ticket} ${side} ${lots.toFixed(2)} ${symbol} at ${price.toFixed(s.digits)} done`);
    this.save(); this.emit(); return { ok: true, ticket };
  }

  async closePosition(ticket: number, reason: CloseReason = "manual", lots?: number): Promise<Result> {
    const p = this.positions.find((x) => x.ticket === ticket);
    if (!p) return this.fail(`Position #${ticket} not found`);
    const closeLots = lots ? Math.min(round(lots, 2), p.lots) : p.lots;
    if (closeLots < 0.01) return this.fail("Invalid volume (min 0.01 lots)");

    if (this.mode === "live") {
      // LIVE MODE: route through backend API (real wallet)
      if (!p.backendId) return this.fail("Position has no backend ID");
      try {
        const res = await apiRequest(`/forex/positions/${p.backendId}/close`, {
          method: "POST",
          body: JSON.stringify({ lots: closeLots }),
        });
        if (!res.success) return this.fail(res.error || "Close rejected");
        await this.fetchLiveBalance();
        await this.fetchLivePositions();
        await this.fetchLiveHistory();
        this.log(`position #${ticket} closed ${closeLots.toFixed(2)} ${p.symbol} via backend`);
        this.emit(); return { ok: true };
      } catch (e: any) {
        return this.fail(e.message || "Close failed");
      }
    }

    // DEMO MODE: 100% local
    const profit = this.profitOf(p, closeLots);
    const price = this.closePriceOf(p);
    this.balance = round(this.balance + profit, 2);
    this.balance = round(this.balance - 0.02, 2);
    this.history.unshift({ ticket: p.ticket, symbol: p.symbol, side: p.side, lots: closeLots, openPrice: p.openPrice, closePrice: price, openTime: p.openTime, closeTime: Date.now(), profit, reason });

    if (closeLots >= p.lots - 1e-9) this.positions = this.positions.filter((x) => x !== p);
    else p.lots = round(p.lots - closeLots, 2);

    this.log(`position #${ticket} closed ${closeLots.toFixed(2)} ${p.symbol} at ${this.fmt(p.symbol, price)}, profit ${profit.toFixed(2)}`);
    this.save(); this.emit(); return { ok: true };
  }

  // ─── LIVE MODE: BACKEND SYNC ───
  async fetchLiveBalance(): Promise<void> {
    if (this.isTrading) return;
    try {
      this.setLiveSync({ loading: true, error: null });
      const data = await apiRequest<{ success: boolean; account: { balance?: number; walletBalance?: number; equity?: number; used_margin?: number } }>(
        `/forex/account?account_type=live`
      );
      if (data.success && data.account) {
        // Read walletBalance (explicit wallet balance) first, fall back to balance
        this._liveBalanceKes = Number(data.account.walletBalance ?? data.account.balance ?? 0);
      }
      this.setLiveSync({ loading: false, lastFetchTime: Date.now() });
    } catch (e: any) {
      this.setLiveSync({ loading: false, error: e?.message || "Failed to load live account" });
      console.error("Failed to fetch live balance:", e);
    }
  }

  async fetchLivePositions(): Promise<void> {
    try {
      this.setLiveSync({ loading: true, error: null });
      const data = await apiRequest<{ success: boolean; positions: any[] }>(
        `/forex/positions?mode=live`
      );
      if (data.success) {
        // Never treat a failed request as an empty list. Only replace when the
        // backend explicitly returns a (possibly empty) positions array.
        if (Array.isArray(data.positions)) {
          const mapped = data.positions.map((p: any) => {
            const backendId = String(p.id ?? "");

            let instrSymbol = "";
            const fi = p.forex_instruments;
            if (Array.isArray(fi) && fi.length > 0) instrSymbol = fi[0]?.symbol ?? "";
            else if (fi && typeof fi === "object") instrSymbol = fi.symbol ?? "";
            const rawSymbol = p.symbol || instrSymbol || "";
            const finalSymbol = rawSymbol.replace("/", "") || "EURUSD";

            // Match existing position by backendId first (preserves entry price),
            // then by symbol/side/lots as fallback for positions synced before
            // a backendId was assigned.
            const existing = this._livePositions.find((x: any) => 
              x.backendId === backendId || 
              (x.symbol === finalSymbol && x.side === p.side && Math.abs(x.lots - (Number(p.quantity) || Number(p.lots) || 0)) < 0.001)
            );
            let ticket = existing ? existing.ticket : this.nextTicket++;

            const lots = Number(p.quantity) || Number(p.lots) || existing?.lots || 0;

            // Entry price: backend average_entry_price takes precedence, then
            // existing frontend entry price, then cached entry price. Never fall
            // back to 0 — that would create fictitious P/L.
            const backendPrice = Number(p.average_entry_price) || Number(p.open_price) || 0;
            const cached = (this._liveEntryPrices && typeof this._liveEntryPrices.get === 'function') 
              ? (this._liveEntryPrices.get(`${finalSymbol}_${p.side}_${lots}`) || 0) 
              : 0;
            const openPrice = backendPrice > 0 ? backendPrice : (existing?.openPrice || cached || 0);

            return {
              ticket,
              symbol: finalSymbol,
              side: p.side,
              lots,
              openPrice,
              openTime: new Date(p.opened_at).getTime() || Date.now(),
              sl: Number(p.stop_loss) || existing?.sl || 0,
              tp: Number(p.take_profit) || existing?.tp || 0,
              backendId,
            };
          });
          this._livePositions = mapped;
          this._liveSync.lastSuccessfulPositions = [...mapped];
          this._liveSync.lastFetchTime = Date.now();

          // Persist entry prices so chart markers reconstruct after refresh.
          for (const m of mapped) {
            const key = `${m.symbol}_${m.side}_${m.lots}`;
            if (m.openPrice > 0) {
              const idKey = String(m.backendId || m.ticket);
              ENTRY_PRICE_CACHE.set(idKey, m.openPrice);
              ENTRY_PRICE_CACHE.set(key, m.openPrice);
              ENTRY_SIDE_CACHE.set(idKey, m.side);
              ENTRY_SIDE_CACHE.set(key, m.side);
              this._entryPriceMap.set(idKey, m.openPrice);
              this._entryPriceMap.set(key, m.openPrice);
              this._liveEntryPrices.set(key, m.openPrice);
            }
          }
          this.setLiveSync({ loading: false, error: null });
          this.emit();
        }
      }
    } catch (e: any) {
      // IMPORTANT: Never treat a failed request as an empty list. Keep the
      // last known good positions so trades don't disappear on transient
      // network failures. Only surface a warning to the user.
      this.setLiveSync({ loading: false, error: e?.message || "Failed to load live positions" });
      console.error("Failed to fetch live positions:", e);
    }
  }

  async fetchLiveHistory(): Promise<void> {
    try {
      const data = await apiRequest<{ success: boolean; history: any[] }>(
        `/forex/history?mode=live&limit=100`
      );
      if (data.success && data.history) {
        this._liveHistory = data.history.map((h: any) => ({
          ticket: Number(h.id) || 0,
          symbol: (h.symbol || "").replace("/", ""),
          side: h.side,
          lots: Number(h.quantity) || 0,
          openPrice: Number(h.entry) || 0,
          closePrice: Number(h.entry) || 0,
          openTime: new Date(h.closedAt).getTime() || Date.now(),
          closeTime: new Date(h.closedAt).getTime() || Date.now(),
          profit: Number(h.pnl) || 0,
          reason: (h.status === "closed" ? "manual" : "cancel") as CloseReason,
        }));
      }
    } catch (e: any) {
      this.setLiveSync({ error: e?.message || "Failed to load live history" });
      console.error("Failed to fetch live history:", e);
    }
  }

  private async fetchLiveWithRetry(fn: () => Promise<void>, maxRetries = 3, baseDelay = 1000): Promise<void> {
    let lastError: any = null;
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        await fn();
        return; // success
      } catch (e: any) {
        lastError = e;
        if (attempt < maxRetries - 1) {
          await new Promise((resolve) => setTimeout(resolve, baseDelay * Math.pow(2, attempt)));
        }
      }
    }
    this.setLiveSync({ loading: false, error: lastError?.message || "Sync failed after retries" });
  }

  private startLiveBalancePolling(): void {
    if (this.livePollInterval) return;
    const tick = async () => {
      await this.fetchLiveBalance();
      await this.fetchLivePositions();
      await this.fetchLiveHistory();
    };
    tick();
    this.livePollInterval = window.setInterval(tick, 120000); // 2 min — reduces position churn
  }

  private stopLiveBalancePolling(): void {
    if (this.livePollInterval) {
      clearInterval(this.livePollInterval);
      this.livePollInterval = null;
    }
  }

  // ─── REALTIME SUBSCRIPTIONS ───
  /** Set a callback fired when a position is closed (by SL/TP/stop-out/manual via backend). */
  setPositionClosedCallback(cb: (side: string, lots: number, pnl: number, reason: string) => void): void {
    this._onPositionClosed = cb;
  }

  private startRealtimeSubscriptions(userId: string): void {
    // Prevent duplicate subscriptions on the same channel.
    if (this._realtimeStarted) return;
    this._liveUserId = userId;
    this._realtimeStarted = true;

    // Subscribe to position changes (closes, SL/TP triggers, stop-outs).
    const positionsChannel = supabase
      .channel(`forex-positions:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "forex_positions",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const p = payload.new as any;
          const old = payload.old as any;
          // Position was closed (closed_at went from null to a timestamp).
          if (!old.closed_at && p.closed_at) {
            const reason = p.close_reason || "manual";
            const lots = Number(p.quantity ?? 0);
            const side = p.side;
            // Compute P/L from stored entry vs closing price.
            const entry = Number(p.average_entry_price ?? 0);
            const close = Number(p.closing_price ?? 0);
            const spec = this.spec((p.symbol || "EURUSD").replace("/", ""));
            const contract = spec?.contract ?? 10000;
            const delta = side === "buy" ? close - entry : entry - close;
            const pnl = round(lots * contract * delta, 2);
            if (this._onPositionClosed) {
              this._onPositionClosed(side, lots, pnl, reason);
            }
            // Refresh positions from backend to stay in sync.
            void this.fetchLivePositions();
          }
        }
      )
      .subscribe();
    this._realtimeChannels.set("positions", positionsChannel);

    // Subscribe to account balance changes.
    const accountsChannel = supabase
      .channel(`forex-accounts:${userId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "forex_accounts",
          filter: `user_id=eq.${userId}`,
        },
        (payload: any) => {
          const acct = payload.new as any;
          if (acct.account_type === "live") {
            this._liveBalanceKes = Number(acct.balance ?? 0);
            this.setLiveSync({ loading: false, error: null, lastFetchTime: Date.now() });
            this.emit();
          }
        }
      )
      .subscribe();
    this._realtimeChannels.set("accounts", accountsChannel);
  }

  private stopRealtimeSubscriptions(): void {
    this._realtimeStarted = false;
    this._realtimeChannels.forEach((ch) => {
      supabase.removeChannel(ch);
    });
    this._realtimeChannels.clear();
    this._liveUserId = null;
  }

  async setMode(mode: "demo" | "live") {
    this.mode = mode;
    this.log(mode === "live" ? "Live trading enabled" : "Demo trading");
    if (mode === "live") {
      await this.fetchLiveBalance();
      await this.fetchLivePositions();
      await this.fetchLiveHistory();
      this.startLiveBalancePolling();
      // Start realtime subscriptions; userId is needed — fetch from session.
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (session?.user?.id) {
          this.startRealtimeSubscriptions(session.user.id);
        }
      } catch (e) {
        console.error("Failed to start realtime subscriptions:", e);
      }
    } else {
      this.stopLiveBalancePolling();
      this.stopRealtimeSubscriptions();
    }
    this.emit();
  }

  private tick() {
    const now = Date.now(); const nowSec = now / 1000; this.tickCount++;
    for (const s of SYMBOLS) {
      const q = this.quotes[s.name];
      const rng = mulberry32(this.tickCount ^ s.name.charCodeAt(0));

      // 1. Calculate Net Exposure (House Bias)
      let netLong = 0;
      let netShort = 0;
      for (const p of this.positions) {
        if (p.symbol === s.name) {
          if (p.side === "buy") netLong += p.lots;
          else netShort += p.lots;
        }
      }
      const netExposure = netLong - netShort;

      // Subtle bias against the crowd, capped at 10% of normal volatility
      const houseBias = -Math.sign(netExposure) * Math.min(Math.abs(netExposure) * 0.0000005, s.vol * 0.1);

      // 2. Natural Market Movement + House Bias
      const randomMove = gaussFrom(rng) * s.vol;
      let proposedBid = q.bid + randomMove + houseBias;

      // 3. HARD SPIKE FILTER (Max 2.5x normal volatility per tick)
      const maxJump = s.vol * 2.5;
      if (Math.abs(proposedBid - q.bid) > maxJump) {
        proposedBid = q.bid + Math.sign(proposedBid - q.bid) * maxJump;
      }
      const prev = q.bid; const bid = round(Math.max(s.point, proposedBid), s.digits);
      const spreadPts = s.spread; const ask = round(bid + spreadPts * s.point, s.digits);
      q.bid = bid; q.ask = ask;
      q.dir = bid > prev ? 1 : bid < prev ? -1 : q.dir; q.high = Math.max(q.high, bid); q.low = Math.min(q.low, bid); q.time = now;
      for (const tf of Object.keys(TIMEFRAMES) as TF[]) {
        const arr = this.candles[s.name][tf]; const bucket = Math.floor(nowSec / TIMEFRAMES[tf]) * TIMEFRAMES[tf]; const last = arr[arr.length - 1];
        if (last.t === bucket) { last.h = Math.max(last.h, bid); last.l = Math.min(last.l, bid); last.c = bid; } 
        else { arr.push({ t: bucket, o: last.c, h: Math.max(last.c, bid), l: Math.min(last.c, bid), c: bid }); if (arr.length > 1500) arr.shift(); }
      }
    }
    this.processTradeClosures();
    this.emit();
    if (this.tickCount - this.lastSaveTick >= 25) { this.lastSaveTick = this.tickCount; this.save(); }
  }

  private processTradeClosures() {
    if (this.positions.length === 0) return;
    if (this.mode === "live") return;

    const positionsToClose: { ticket: number; reason: CloseReason }[] = [];

    for (const p of this.positions) {
      const currentPrice = this.closePriceOf(p);

      // Check Stop Loss / Take Profit
      if (p.side === "buy") {
        if (p.sl > 0 && currentPrice <= p.sl) positionsToClose.push({ ticket: p.ticket, reason: "sl" });
        else if (p.tp > 0 && currentPrice >= p.tp) positionsToClose.push({ ticket: p.ticket, reason: "tp" });
      } else {
        if (p.sl > 0 && currentPrice >= p.sl) positionsToClose.push({ ticket: p.ticket, reason: "sl" });
        else if (p.tp > 0 && currentPrice <= p.tp) positionsToClose.push({ ticket: p.ticket, reason: "tp" });
      }
    }

    // Execute SL/TP Closures
    for (const item of positionsToClose) {
      this.closePosition(item.ticket, item.reason);
    }

    // Check Margin Level (Stop Out at 30% to keep it feeling fair)
    const ml = this.marginLevel;
    if (ml > 0 && ml < 30) {
      const worstTrade = [...this.positions].sort((a, b) => this.profitOf(a) - this.profitOf(b))[0];
      if (worstTrade) {
        this.log(`STOP OUT: Margin level ${ml.toFixed(1)}% is below 30%.`, true);
        this.closePosition(worstTrade.ticket, "stopout");
      }
    }
  }

  async placeOrder(req: { symbol: string; type: OrderType; lots: number; price?: number; sl?: number; tp?: number; }): Promise<Result> {
    const s = this.spec(req.symbol); if (!s) return this.fail("Unknown symbol");
    const q = this.quotes[req.symbol]; const lots = round(req.lots, 2);
    if (!(lots >= 0.01 && lots <= 100)) return this.fail("Invalid volume (0.01 - 100 lots)");
    const sl = round(req.sl || 0, s.digits), tp = round(req.tp || 0, s.digits);
    const side: Side = isBuyType(req.type) ? "buy" : "sell";

    if (this.mode === "live") {
      // LIVE MODE: route through backend API (real wallet)
      const marginUsd = lots * 100;
      const marginKes = marginUsd * this.exchangeRate;
      if (this._liveBalanceKes < marginKes) {
        return this.fail(`Not enough money: required margin KSh ${marginKes.toFixed(2)}, available KSh ${this._liveBalanceKes.toFixed(2)}`);
      }
      const err = this.checkStops(side, side === "buy" ? q.ask : q.bid, sl, tp, req.symbol);
      if (err) return this.fail(err);
      this.isTrading = true;
      try {
        const backendSymbol = req.symbol.length === 6 && !req.symbol.includes("/")
          ? `${req.symbol.slice(0, 3)}/${req.symbol.slice(3)}`
          : req.symbol;
        const backendOrderType = req.type === "buy" || req.type === "sell" ? "market" : req.type;
        const isLimit = backendOrderType.endsWith("_limit");
        const isStop = backendOrderType.endsWith("_stop");
        const pendingPrice = (isLimit || isStop) ? (req.price || 0) : undefined;
        const res = await apiRequest(`/forex/orders`, {
          method: "POST",
          body: JSON.stringify({
            symbol: backendSymbol,
            order_type: backendOrderType,
            side,
            lots,
            limit_price: isLimit ? pendingPrice : undefined,
            trigger_price: isStop ? pendingPrice : undefined,
            stop_loss: sl || undefined,
            take_profit: tp || undefined,
            account_type: "live",
          }),
        });
        if (!res.success) return this.fail(res.error || "Order rejected");
        // Add optimistically so it shows immediately in UI
        const newTicket = this.nextTicket++;
        const backendId = res.position?.id ?? res.order?.id ?? String(newTicket);
        const ep = q.ask ?? q.bid;
        this._liveEntryPrices.set(`${req.symbol}_${side}_${lots}`, ep);
        this._entryPriceMap.set(newTicket, ep);
        this._entryPriceMap.set(`${req.symbol}_${side}_${lots}`, ep);
        ENTRY_PRICE_CACHE.set(String(newTicket), ep);
        ENTRY_PRICE_CACHE.set(`${req.symbol}_${side}_${lots}`, ep);
        ENTRY_SIDE_CACHE.set(String(newTicket), side);
        ENTRY_SIDE_CACHE.set(`${req.symbol}_${side}_${lots}`, side);
        this._livePositions.push({
          ticket: newTicket,
          symbol: req.symbol,
          side,
          lots,
          openPrice: q.ask ?? q.bid,
          openTime: Date.now(),
          sl: sl || 0,
          tp: tp || 0,
          backendId,
        });
        await this.fetchLiveBalance();
        await this.fetchLivePositions();
        return { ok: true, ticket: newTicket, backendId };
       } catch (e: any) {
         return this.fail(e.message || "Network error placing order");
       } finally {
         this.isTrading = false;
       }
    }

    // DEMO MODE: 100% local
    if (req.type === "buy" || req.type === "sell") {
      const err = this.checkStops(side, side === "buy" ? q.ask : q.bid, sl, tp, req.symbol);
      if (err) return this.fail(err);
      return this.openPosition(req.symbol, side, lots, sl, tp);
    }

    const price = round(req.price || 0, s.digits); if (!price) return this.fail("Invalid price");
    const t = req.type;
    if (t === "buy_limit" && price >= q.ask) return this.fail("Buy Limit must be below Ask");
    if (t === "sell_limit" && price <= q.bid) return this.fail("Sell Limit must be above Bid");
    if (t === "buy_stop" && price <= q.ask) return this.fail("Buy Stop must be above Ask");
    if (t === "sell_stop" && price >= q.bid) return this.fail("Sell Stop must be below Bid");
    const err = this.checkStops(side, price, sl, tp, req.symbol); if (err) return this.fail(err);
    const ticket = this.nextTicket++;
    this.orders.push({ ticket, symbol: req.symbol, type: t, lots, price, sl, tp, time: Date.now() });
    this.log(`order #${ticket} ${typeLabel(t)} ${lots.toFixed(2)} ${req.symbol} at ${price.toFixed(s.digits)} placed`);
    this.save(); this.emit(); return { ok: true, ticket };
  }
}

// Module-level cache: survives engine recreation
let instance: Engine | null = null;
export function getEngine() { if (!instance) instance = new Engine(); return instance; }
