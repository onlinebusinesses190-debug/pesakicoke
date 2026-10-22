// Simulated MetaTrader-style trading engine.
export const TIMEFRAMES = { M1: 60, M5: 300, M15: 900, M30: 1800, H1: 3600, H4: 14400 } as const;
export type TF = keyof typeof TIMEFRAMES;

export type Side = "buy" | "sell";
export type OrderType = "buy" | "sell" | "buy_limit" | "sell_limit" | "buy_stop" | "sell_stop";
export type CloseReason = "manual" | "sl" | "tp" | "stopout";

const KES_PER_QUOTE: Record<string, number> = { USD: 130, EUR: 141, GBP: 168, JPY: 0.88, CHF: 152, AUD: 85, CAD: 95, NZD: 79 };
export function kesPerQuote(currency: string): number { const code = currency.toUpperCase(); if (code === "KES") return 1; return KES_PER_QUOTE[code] ?? 1; }

export interface SymbolSpec { name: string; desc: string; digits: number; point: number; spread: number; contract: number; start: number; vol: number; }
export interface Quote { bid: number; ask: number; high: number; low: number; open: number; dir: -1 | 0 | 1; time: number; }
export interface Candle { t: number; o: number; h: number; l: number; c: number; }
export interface Position { ticket: number | string; symbol: string; side: Side; lots: number; openPrice: number; openTime: number; sl: number; tp: number; }
export interface PendingOrder { ticket: number | string; symbol: string; type: Exclude<OrderType, "buy" | "sell">; lots: number; price: number; sl: number; tp: number; time: number; }
export interface Deal { ticket: number | string; symbol: string; side: Side; lots: number; openPrice: number; closePrice: number; openTime: number; closeTime: number; profit: number; reason: CloseReason | "deposit" | "cancel"; }
export interface JournalEntry { time: number; msg: string; error?: boolean; }
export type Result = { ok: true; ticket?: number | string } | { ok: false; error: string };

import { configuredLeverage } from "@/lib/fx/market";
import { apiRequest } from "@/utils/api"; 
import { supabase } from "@/utils/supabase/client";

const SPREADS: Record<string, number> = { EURUSD: 1, GBPUSD: 2, USDJPY: 1, AUDUSD: 1, USDCAD: 2, USDCHF: 2, NZDUSD: 2, EURJPY: 2, GBPJPY: 3, XAUUSD: 2 };
function spreadFor(symbol: string): number { return SPREADS[symbol] ?? 2; }

const RAW: [string, string, number, number, number, number][] = [
  ["EURUSD", "Euro vs US Dollar", 5, 1, 100000, 1.0852], ["GBPUSD", "Great Britain Pound vs US Dollar", 5, 2, 100000, 1.2648],
  ["USDJPY", "US Dollar vs Japanese Yen", 3, 1, 100000, 149.52], ["AUDUSD", "Australian Dollar vs US Dollar", 5, 1, 100000, 0.6551],
  ["USDCAD", "US Dollar vs Canadian Dollar", 5, 2, 100000, 1.3602], ["USDCHF", "US Dollar vs Swiss Franc", 5, 2, 100000, 0.8803],
  ["NZDUSD", "New Zealand Dollar vs US Dollar", 5, 2, 100000, 0.6004], ["EURJPY", "Euro vs Japanese Yen", 3, 2, 100000, 162.24],
  ["GBPJPY", "Great Britain Pound vs Japanese Yen", 3, 3, 100000, 189.11], ["XAUUSD", "Gold vs US Dollar", 2, 2, 100, 2351.4],
];

export const SYMBOLS: SymbolSpec[] = RAW.map(([name, desc, digits, spread, contract, start]) => ({ name, desc, digits, point: Math.pow(10, -digits), spread: spreadFor(name), contract, start, vol: start * 1.2e-5 }));

const STORAGE_KEY = "mt-terminal-v3"; 
const DEMO_START_BALANCE = 10000;
const STOP_OUT = 50;
const MARGIN_CALL = 100;

export const round = (v: number, d: number) => Math.round(v * Math.pow(10, d)) / Math.pow(10, d);

function mulberry32(seed: number): () => number { let a = seed >>> 0; return function () { a |= 0; a = (a + 0x6d2b79f5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function seededRNG(symbol: string, timestamp: number): () => number { const str = symbol + ":" + timestamp; let h = 0; for (let i = 0; i < str.length; i++) h = (h * 31 + str.charCodeAt(i)) | 0; return mulberry32((h ^ timestamp) >>> 0); }
function gaussFrom(rng: () => number) { let u = 0, v = 0; while (u === 0) u = rng(); while (v === 0) v = rng(); return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v); }
export const isBuyType = (t: OrderType) => t.startsWith("buy");
export const typeLabel = (t: OrderType) => t.replace("_", " ");

function genCandles(s: SymbolSpec, tfSec: number, nowSec: number, n = 400): Candle[] {
  const out: Candle[] = []; let p = s.start; const subSigma = s.vol * Math.sqrt((tfSec * 2) / 6); const last = Math.floor(nowSec / tfSec) * tfSec; const rng = seededRNG(s.name, tfSec);
  for (let i = 0; i < n; i++) { const o = p; let h = p, l = p; for (let k = 0; k < 6; k++) { p += gaussFrom(rng) * subSigma; h = Math.max(h, p); l = Math.min(l, p); } out.push({ t: last - (n - 1 - i) * tfSec, o, h, l, c: p }); }
  const shift = s.start - p; return out.map((c) => ({ t: c.t, o: round(c.o + shift, s.digits), h: round(c.h + shift, s.digits), l: round(c.l + shift, s.digits), c: round(c.c + shift, s.digits) }));
}

export class Engine {
  quotes: Record<string, Quote> = {};
  candles: Record<string, Record<TF, Candle[]>> = {};
  mode: "demo" | "live" = "demo";
  
  demoBalance = DEMO_START_BALANCE;
  liveKesBalance = 0;
  liveBalance = 0; 
  exchangeRate = 130; // 👈 Store the exchange rate
  
  leverage = configuredLeverage();
  currency = "USD";
  positions: Position[] = [];
  orders: PendingOrder[] = [];
  history: Deal[] = [];
  journal: JournalEntry[] = [];
  notice: JournalEntry | null = null;
  nextTicket = 100000001;
  version = 0;
  
  private listeners = new Set<() => void>();
  private marginCallWarned = false;
  private animationFrameId: number | null = null;
  private lastTickTime = 0;
  private tickCount = 0;

  constructor() {
    const now = Date.now() / 1000;
    for (const s of SYMBOLS) {
      const tfs = {} as Record<TF, Candle[]>;
      (Object.keys(TIMEFRAMES) as TF[]).forEach((tf) => (tfs[tf] = genCandles(s, TIMEFRAMES[tf], now)));
      this.candles[s.name] = tfs;
      const day = tfs.H1.slice(-24);
      this.quotes[s.name] = { bid: s.start, ask: round(s.start + s.spread * s.point, s.digits), high: Math.max(...day.map((c) => c.h)), low: Math.min(...day.map((c) => c.l)), open: day[0].o, dir: 0, time: Date.now() };
    }
    this.load();
    this.log("Terminal started. Demo account connected.");
    this.start();
  }

  get balance() { return this.mode === "live" ? this.liveBalance : this.demoBalance; }

  // ─── FIXED: Fetch Rate and Convert to USD ───
  async fetchLiveBalance() {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;

      // 1. Fetch the live exchange rate from the backend
      try {
        const rateRes = await apiRequest<any>("/forex/rates");
        if (rateRes && rateRes.success && rateRes.usdToKes) {
          this.exchangeRate = rateRes.usdToKes;
        }
      } catch (err) {
        console.warn("Could not fetch live rate, using default.", err);
      }

      // 2. Fetch the KES wallet balance
      const res = await apiRequest<any>("/forex/account?account_type=live");
      console.log("Live Forex API Response:", res);

      if (res && res.success) {
        const kesBalance = Number(res.balance ?? res.account?.walletBalance ?? 0);
        this.liveKesBalance = kesBalance;
        
        // 3. Convert KES to USD for the engine's math
        this.liveBalance = kesBalance / this.exchangeRate; 
        
        this.emit();
      }
    } catch (err: any) {
      console.error("Failed to fetch live balance", err);
    }
  }

  setMode(mode: "demo" | "live") {
    this.mode = mode;
    if (mode === "live") {
      this.fetchLiveBalance();
      this.log("Switched to LIVE trading. Real funds active.");
    } else {
      this.log("Switched to DEMO trading.");
    }
    this.emit();
  }

  start() {
    if (this.animationFrameId) return;
    this.lastTickTime = Date.now();
    const loop = () => {
      this.animationFrameId = requestAnimationFrame(loop);
      const now = Date.now();
      if (now - this.lastTickTime >= 200) {
        this.lastTickTime = now;
        this.tick();
      }
    };
    this.animationFrameId = requestAnimationFrame(loop);
  }

  stop() { if (this.animationFrameId) { cancelAnimationFrame(this.animationFrameId); this.animationFrameId = null; } }

  subscribe = (fn: () => void) => { this.listeners.add(fn); return () => { this.listeners.delete(fn); }; };
  getVersion = () => this.version;
  private emit() { this.version++; this.listeners.forEach((l) => l()); }
  
  private save() {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify({
        demoBalance: this.demoBalance, positions: this.positions, orders: this.orders,
        history: this.history.slice(0, 500), journal: this.journal.slice(0, 300), nextTicket: this.nextTicket,
      }));
    } catch { /* ignore */ }
  }
  
  private load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const d = JSON.parse(raw);
      this.demoBalance = d.demoBalance ?? DEMO_START_BALANCE;
      this.positions = d.positions ?? [];
      this.orders = d.orders ?? [];
      this.history = d.history ?? [];
      this.journal = d.journal ?? [];
      this.nextTicket = d.nextTicket ?? this.nextTicket;
    } catch { /* ignore */ }
  }
  
  private log(msg: string, error = false) {
    const e = { time: Date.now(), msg, error };
    this.journal.unshift(e);
    if (this.journal.length > 300) this.journal.length = 300;
    this.notice = e;
  }

  spec(name: string) { return SYMBOLS.find((s) => s.name === name)!; }
  fmt(name: string, v: number) { return v.toFixed(this.spec(name).digits); }

  toUSD(symbol: string, amount: number) {
    const q = symbol.slice(3, 6);
    if (q === "USD") return amount;
    const conv = this.quotes["USD" + q];
    return conv ? amount / conv.bid : amount;
  }
  marginFor(symbol: string, usdAmount: number) { return usdAmount / this.leverage; }
  closePriceOf(p: { symbol: string; side: Side }) { const q = this.quotes[p.symbol]; return p.side === "buy" ? q.bid : q.ask; }
  profitOf(p: Position, usdAmount = p.lots) {
    const diff = (this.closePriceOf(p) - p.openPrice) * (p.side === "buy" ? 1 : -1);
    return round((usdAmount * diff) / p.openPrice, 2);
  }
  get floating() { return this.positions.reduce((a, p) => a + this.profitOf(p), 0); }
  get equity() { return round(this.balance + this.floating, 2); }
  get margin() { return round(this.positions.reduce((a, p) => a + this.marginFor(p.symbol, p.lots), 0), 2); }
  get freeMargin() { return round(this.equity - this.margin, 2); }
  get marginLevel() { return this.margin > 0 ? (this.equity / this.margin) * 100 : 0; }

  private checkStops(side: Side, ref: number, sl: number, tp: number, symbol: string): string | null {
    const minDist = this.spec(symbol).point * 10;
    if (sl < 0 || tp < 0) return "Invalid stops";
    if (side === "buy") {
      if (sl && sl > ref - minDist) return "Invalid S/L: must be below price";
      if (tp && tp < ref + minDist) return "Invalid T/P: must be above price";
    } else {
      if (sl && sl < ref + minDist) return "Invalid S/L: must be above price";
      if (tp && tp > ref - minDist) return "Invalid T/P: must be below price";
    }
    return null;
  }
  
  private fail(msg: string): Result { this.log(msg, true); this.emit(); return { ok: false, error: msg }; }

  async placeOrder(req: { symbol: string; type: OrderType; lots: number; price?: number; sl?: number; tp?: number; }): Promise<Result> {
    const s = this.spec(req.symbol);
    if (!s) return this.fail("Unknown symbol");
    const q = this.quotes[req.symbol];
    
    if (this.mode === "live") {
      try {
        const payloadSymbol = req.symbol.replace(/(...)(...)/, "$1/$2"); 
        
        // PESAKI MATH: req.lots here is the PESAKI lot size (e.g. 0.01)
        const marginUsd = req.lots * 100; // 0.01 lots = $1 margin
        const tradeAmountKes = marginUsd * this.exchangeRate; // Convert $1 to KES (e.g. 130)

        const res = await apiRequest<any>("/forex/orders", {
          method: "POST",
          body: JSON.stringify({
            symbol: payloadSymbol,
            side: isBuyType(req.type) ? "buy" : "sell", 
            trade_amount: tradeAmountKes, // 👈 Sending KES to backend
            stop_loss: req.sl || null, 
            take_profit: req.tp || null, 
            account_type: "live"
          })
        });
        
        if (!res.success) return this.fail(res.error || "Backend rejected trade");
        
        this.fetchLiveBalance(); 
        this.log(`LIVE order #${res.order?.id} executed`);
        return { ok: true, ticket: res.order?.id };
      } catch (err: any) {
        return this.fail(err.message || "Network error placing live trade");
      }
    }

    // ─── DEMO TRADING ───
    const lots = round(req.lots, 2);
    if (!(lots >= 0.01 && lots <= 10000)) return this.fail("Invalid volume (0.01 - 10000)");
    const sl = round(req.sl || 0, s.digits), tp = round(req.tp || 0, s.digits);
    const side: Side = isBuyType(req.type) ? "buy" : "sell";

    if (req.type === "buy" || req.type === "sell") {
      const err = this.checkStops(side, side === "buy" ? q.ask : q.bid, sl, tp, req.symbol);
      if (err) return this.fail(err);
      return this.openPosition(req.symbol, side, lots, sl, tp);
    }

    const price = round(req.price || 0, s.digits);
    if (!price) return this.fail("Invalid price");
    const t = req.type;
    if (t === "buy_limit" && price >= q.ask) return this.fail("Buy Limit must be below Ask");
    if (t === "sell_limit" && price <= q.bid) return this.fail("Sell Limit must be above Bid");
    if (t === "buy_stop" && price <= q.ask) return this.fail("Buy Stop must be above Ask");
    if (t === "sell_stop" && price >= q.bid) return this.fail("Sell Stop must be below Bid");
    const err = this.checkStops(side, price, sl, tp, req.symbol);
    if (err) return this.fail(err);
    const ticket = this.nextTicket++;
    this.orders.push({ ticket, symbol: req.symbol, type: t, lots, price, sl, tp, time: Date.now() });
    this.log(`order #${ticket} ${typeLabel(t)} ${lots.toFixed(2)} ${req.symbol} at ${price.toFixed(s.digits)} placed`);
    this.save(); this.emit();
    return { ok: true, ticket };
  }

  private openPosition(symbol: string, side: Side, lots: number, sl: number, tp: number, fromOrder?: number): Result {
    const need = this.marginFor(symbol, lots);
    if (this.freeMargin < need) return this.fail(`Not enough money: required margin $${need.toFixed(2)}`);
    const q = this.quotes[symbol];
    const price = side === "buy" ? q.ask : q.bid;
    const ticket = fromOrder ?? this.nextTicket++;
    this.positions.push({ ticket, symbol, side, lots, openPrice: price, openTime: Date.now(), sl, tp });
    this.log(`deal #${ticket} ${side} ${lots.toFixed(2)} ${symbol} at ${price.toFixed(this.spec(symbol).digits)} done`);
    this.save(); this.emit();
    return { ok: true, ticket };
  }

  closePosition(ticket: number | string, reason: CloseReason = "manual", lots?: number): Result {
    if (this.mode === "live") {
      apiRequest<any>(`/forex/positions/${ticket}/close`, { method: "POST" })
        .then((res) => {
          if (res.success) {
            this.fetchLiveBalance();
            this.log(`LIVE position #${ticket} closed. Profit: ${res.realizedPnl}`);
          } else {
            this.log(`Failed to close position: ${res.error}`, true);
          }
        })
        .catch((err) => this.log(err.message, true));
      return { ok: true }; 
    }

    const p = this.positions.find((x) => x.ticket === ticket);
    if (!p) return this.fail(`Position #${ticket} not found`);
    const closeLots = lots ? Math.min(round(lots, 2), p.lots) : p.lots;
    if (closeLots < 0.01) return this.fail("Invalid volume");
    
    const profit = this.profitOf(p, closeLots);
    const price = this.closePriceOf(p);
    this.demoBalance = round(this.demoBalance + profit, 2);
    
    this.history.unshift({ ticket: p.ticket, symbol: p.symbol, side: p.side, lots: closeLots, openPrice: p.openPrice, closePrice: price, openTime: p.openTime, closeTime: Date.now(), profit, reason });
    
    if (closeLots >= p.lots - 1e-9) this.positions = this.positions.filter((x) => x !== p);
    else p.lots = round(p.lots - closeLots, 2);
    
    const tag = reason === "manual" ? "" : ` [${reason === "stopout" ? "stop out" : reason}]`;
    this.log(`position #${ticket} closed ${closeLots.toFixed(2)} ${p.symbol} at ${this.fmt(p.symbol, price)}, profit ${profit.toFixed(2)}${tag}`, reason === "stopout");
    this.save(); this.emit();
    return { ok: true };
  }

  closeAll(filter?: "profit" | "loss") {
    [...this.positions].forEach((p) => {
      const pr = this.profitOf(p);
      if (!filter || (filter === "profit" && pr > 0) || (filter === "loss" && pr < 0)) this.closePosition(p.ticket);
    });
  }

  modifyPosition(ticket: number | string, sl: number, tp: number): Result {
    const p = this.positions.find((x) => x.ticket === ticket);
    if (!p) return this.fail(`Position #${ticket} not found`);
    const d = this.spec(p.symbol).digits;
    sl = round(sl || 0, d); tp = round(tp || 0, d);
    const err = this.checkStops(p.side, this.closePriceOf(p), sl, tp, p.symbol);
    if (err) return this.fail(err);
    p.sl = sl; p.tp = tp;
    this.log(`position #${ticket} modified: sl ${sl || "-"}, tp ${tp || "-"}`);
    this.save(); this.emit();
    return { ok: true };
  }

  cancelOrder(ticket: number | string): Result {
    const o = this.orders.find((x) => x.ticket === ticket);
    if (!o) return this.fail(`Order #${ticket} not found`);
    this.orders = this.orders.filter((x) => x !== o);
    this.log(`order #${ticket} ${typeLabel(o.type)} ${o.lots.toFixed(2)} ${o.symbol} canceled`);
    this.save(); this.emit();
    return { ok: true };
  }

  deposit(amountUsd: number): Result {
    if (!(amountUsd > 0 && amountUsd <= 1e7)) return this.fail("Invalid deposit amount");
    this.demoBalance = round(this.demoBalance + amountUsd, 2);
    this.history.unshift({ ticket: this.nextTicket++, symbol: "", side: "buy", lots: 0, openPrice: 0, closePrice: 0, openTime: Date.now(), closeTime: Date.now(), profit: amountUsd, reason: "deposit" });
    this.log(`Demo balance deposit $${amountUsd.toFixed(2)}`);
    this.save(); this.emit();
    return { ok: true };
  }

  resetAccount() {
    this.demoBalance = DEMO_START_BALANCE; this.positions = []; this.orders = []; this.history = []; this.journal = [];
    this.log(`Demo account reset to $${DEMO_START_BALANCE.toFixed(2)}`);
    this.save(); this.emit();
  }

  private tick() {
    const now = Date.now(); const nowSec = now / 1000; this.tickCount++;
    for (const s of SYMBOLS) {
      const q = this.quotes[s.name]; const rng = mulberry32(this.tickCount ^ s.name.charCodeAt(0));
      const randomMove = gaussFrom(rng) * s.vol;
      let proposedBid = q.bid + randomMove;
      const maxJump = s.vol * 2.5;
      if (Math.abs(proposedBid - q.bid) > maxJump) proposedBid = q.bid + Math.sign(proposedBid - q.bid) * maxJump;
      
      const prev = q.bid;
      const bid = round(Math.max(s.point, proposedBid), s.digits);
      const spreadPts = s.spread; 
      const ask = round(bid + spreadPts * s.point, s.digits);

      q.bid = bid; q.ask = ask; q.dir = bid > prev ? 1 : bid < prev ? -1 : q.dir;
      q.high = Math.max(q.high, bid); q.low = Math.min(q.low, bid); q.time = now;

      for (const tf of Object.keys(TIMEFRAMES) as TF[]) {
        const arr = this.candles[s.name][tf]; const bucket = Math.floor(nowSec / TIMEFRAMES[tf]) * TIMEFRAMES[tf];
        const last = arr[arr.length - 1];
        if (last.t === bucket) { last.h = Math.max(last.h, bid); last.l = Math.min(last.l, bid); last.c = bid; }
        else { arr.push({ t: bucket, o: last.c, h: Math.max(last.c, bid), l: Math.min(last.c, bid), c: bid }); if (arr.length > 1500) arr.shift(); }
      }
    }
    this.processTriggers(); this.emit();
  }

  private processTriggers() {
    for (const o of [...this.orders]) {
      const q = this.quotes[o.symbol];
      const hit = (o.type === "buy_limit" && q.ask <= o.price) || (o.type === "sell_limit" && q.bid >= o.price) || (o.type === "buy_stop" && q.ask >= o.price) || (o.type === "sell_stop" && q.bid <= o.price);
      if (!hit) continue;
      this.orders = this.orders.filter((x) => x !== o);
      this.log(`order #${o.ticket} ${typeLabel(o.type)} triggered`);
      const r = this.openPosition(o.symbol, isBuyType(o.type) ? "buy" : "sell", o.lots, o.sl, o.tp, o.ticket);
      if (!r.ok) this.log(`order #${o.ticket} canceled: ${r.error}`, true);
    }
    
    for (const p of [...this.positions]) {
      const c = this.closePriceOf(p);
      if (p.side === "buy") { if (p.sl && c <= p.sl) this.closePosition(p.ticket, "sl"); else if (p.tp && c >= p.tp) this.closePosition(p.ticket, "tp"); } 
      else { if (p.sl && c >= p.sl) this.closePosition(p.ticket, "sl"); else if (p.tp && c <= p.tp) this.closePosition(p.ticket, "tp"); }
    }
    
    if (this.positions.length) {
      const ml = this.marginLevel;
      if (ml < MARGIN_CALL && !this.marginCallWarned) { this.marginCallWarned = true; this.log(`Margin call: margin level ${ml.toFixed(2)}%`, true); }
      if (ml >= MARGIN_CALL) this.marginCallWarned = false;
      let guard = 0;
      while (this.positions.length && this.marginLevel < STOP_OUT && guard++ < 50) {
        const worst = [...this.positions].sort((a, b) => this.profitOf(a) - this.profitOf(b))[0];
        this.closePosition(worst.ticket, "stopout");
      }
    }
  }
}

let instance: Engine | null = null;
export function getEngine() { if (!instance) instance = new Engine(); return instance; }
