/**
 * PESAKI Forex — HTTP API.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { verifyAuth } from "../../middleware/auth";
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { INSTRUMENTS, SYMBOLS, getInstrument, type InstrumentSpec } from "../../services/forex/instruments";
import {
  INTERVALS,
  getEngine,
  type Candle,
  type Interval,
  type Quote,
} from "../../services/forex/marketEngine";
import { kesPerUnit } from "../../services/forex/kesRates";
import {
  calculatePositionSize,
  computePnl,
  configuredLeverage,
  marginState,
  minTradeAmount,
  settlementLegs,
  validateStopLoss,
  validateTakeProfit,
} from "../../services/forex/risk";
import { reserveMargin, settleReal } from "../../services/forex/walletBridge";
import { ensureWalletExists, releaseLockedFunds } from "../../wallet/service";

const DEMO_START_BALANCE = 100_000;
const COMMISSION_RATE = 0.005; // 0.5% PESAKI Commission
const PESAKI_CONTRACT_SIZE = 10000; // Custom contract size for $1 margin per 0.01 lot

const REAL_TRADING_ENABLED = process.env.PESAKI_FX_REAL_ENABLED === "true";

export const FX_ERRORS = {
  INVALID_ORDER: 400, UNAUTHORIZED: 401, ACCOUNT_DISABLED: 403, MARKET_UNAVAILABLE: 409,
  INVALID_POSITION_SIZE: 422, INVALID_PRICE: 422, INSUFFICIENT_BALANCE: 403, INSUFFICIENT_MARGIN: 403,
  NOT_FOUND: 404, CONFLICT: 409, INTERNAL: 500,
} as const;

export type FxErrorCode = keyof typeof FX_ERRORS;

class ForexError extends Error {
  readonly statusCode: number;
  constructor(readonly code: FxErrorCode, message: string, readonly detail?: Record<string, unknown>) {
    super(message); this.name = "ForexError"; this.statusCode = FX_ERRORS[code] ?? 500;
  }
}

const quoteToKes = (instrument: InstrumentSpec): number => kesPerUnit(instrument.quote);
const symbolCache = new Map<number, string>();

async function symbolForInstrument(instrumentId: number): Promise<string | undefined> {
  if (instrumentId <= 0) return undefined;
  const cached = symbolCache.get(instrumentId);
  if (cached) return cached;
  const { data } = await supabase.from("forex_instruments").select("symbol").eq("id", instrumentId).maybeSingle();
  if (data?.symbol) { symbolCache.set(instrumentId, data.symbol); return data.symbol; }
  return undefined;
}

async function getOrCreateAccount(userId: string, accountType: "demo" | "live") {
  const { data, error } = await supabase.from("forex_accounts").select("*").eq("user_id", userId).eq("account_type", accountType).maybeSingle();
  if (error) throw error;
  if (data) return data;

  if (accountType === "live" && !REAL_TRADING_ENABLED) throw new ForexError("ACCOUNT_DISABLED", "Real-money trading disabled.", { mode: "live" });

  const { data: created, error: insertError } = await supabase.from("forex_accounts").insert({
    user_id: userId, account_type: accountType, currency: "KES",
    balance: accountType === "demo" ? DEMO_START_BALANCE : 0,
    equity: accountType === "demo" ? DEMO_START_BALANCE : 0,
    leverage: configuredLeverage(), status: "active",
  }).select().single();
  
  if (insertError) throw insertError;
  return created;
}

async function releaseReservation(userId: string, mode: "demo" | "live", margin: number, reason: string): Promise<void> {
  if (mode !== "live" || margin <= 0) return;
  try { await releaseLockedFunds(userId, margin, true); } catch (err) { logger.error({ err, userId, margin, reason }, "Forex margin release failed"); }
}

const orderSchema = z.object({
  symbol: z.string().min(3),
  side: z.enum(["buy", "sell"]),
  trade_amount: z.number().nonnegative().optional(),
  lots: z.number().positive().optional(),
  order_type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  limit_price: z.number().positive().nullable().optional(),
  trigger_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  account_type: z.enum(["demo", "live"]).default("demo"),
  idempotency_key: z.string().min(8).max(120).optional(),
});

const bad = (reply: FastifyReply, error: string, code = 400) => reply.code(code === 403 ? 403 : 400).send({ success: false, error, code: "REJECTED" });

export const forexRoutes = async (fastify: FastifyInstance) => {
  fastify.get("/instruments", async () => {
    const { data } = await supabase.from("forex_instruments").select("*").order("symbol");
    const rows = data?.length ? data : Object.values(INSTRUMENTS).map((s) => ({
      id: 0, symbol: s.symbol, base_currency: s.base, quote_currency: s.quote, digits: s.digits,
      pip_size: s.pipSize, min_lot: s.minLot, max_lot: s.maxLot, lot_step: s.lotStep,
      typical_spread_pips: s.typicalSpreadPips, trading_status: "open",
    }));
    return { success: true, instruments: rows };
  });

  fastify.get("/market", async () => ({ success: true, market: getEngine().describe() }));

  fastify.get("/rates", async () => {
    try {
      const rate = kesPerUnit("USD");
      return { success: true, usdToKes: rate || 130 };
    } catch (err) {
      logger.warn({ err }, "Failed to calculate KES rate, using fallback 130");
      return { success: true, usdToKes: 130 };
    }
  });

  fastify.get("/quotes", async (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ? symbols.split(",") : SYMBOLS).map((s) => s.toUpperCase());
    const engine = getEngine();
    const quotes: Quote[] = engine.quoteAll(list);
    if (quotes.length === 0) return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({ success: false, error: "No supported pairs requested.", code: "MARKET_UNAVAILABLE" });
    return { success: true, quotes, watch: Object.fromEntries(quotes.map((q) => [q.symbol, engine.dailyChange(q.symbol)])), state: engine.state };
  });

  fastify.get("/quote/:symbol", async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!getInstrument(symbol.toUpperCase())) return bad(reply, "Unsupported symbol");
    try { return { success: true, quote: getEngine().quote(symbol.toUpperCase()) }; } 
    catch { return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({ success: false, error: "Market price unavailable.", code: "MARKET_UNAVAILABLE" }); }
  });

  fastify.get("/candles", async (request, reply) => {
    const { symbol, interval, count } = request.query as { symbol?: string; interval?: string; count?: string };
    const sym = (symbol ?? "").toUpperCase();
    if (!sym || !getInstrument(sym)) return bad(reply, "A valid symbol is required.");
    const iv = ((interval ?? "5m") as Interval) in INTERVALS ? ((interval ?? "5m") as Interval) : "5m";
    const n = Math.min(Math.max(Number(count) || 120, 1), 1000);
    try {
      const candles: Candle[] = getEngine().getCandles(sym, iv, n);
      return { success: true, symbol: sym, interval: iv, provider: "pesaki-engine", candles: candles.map((c) => ({ time: c.timestamp, timestamp: c.timestamp, open: c.open, high: c.high, low: c.low, close: c.close, tickVolume: c.tickVolume })) };
    } catch { return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({ success: false, error: "Chart data unavailable.", code: "MARKET_UNAVAILABLE" }); }
  });

  fastify.get("/account", { preHandler: [verifyAuth] }, async (request, reply) => {
    const accountType = ((request.query as { account_type?: string }).account_type ?? "demo") as "demo" | "live";
    try {
      const account = await getOrCreateAccount(request.user!.id, accountType);
      const { data: positions } = await supabase.from("forex_positions").select("*").eq("account_id", account.id).is("closed_at", null);

      let unrealised = 0;
      const enriched = [];
      const marked: { id: string; price: number; q2k: number }[] = [];
      for (const p of positions ?? []) {
        const sym = await symbolForInstrument(p.instrument_id);
        const spec = sym ? getInstrument(sym) : undefined;
        if (!spec) { enriched.push(p); continue; }
        try {
          const quote = getEngine().quote(spec.symbol);
          const mid = quote.mid, q2k = quoteToKes(spec);
          const pnl = computePnl({ side: p.side, lots: Number(p.quantity), entryPrice: Number(p.average_entry_price), exitPrice: mid, instrument: { ...spec, contractSize: PESAKI_CONTRACT_SIZE }, quoteToKes: q2k });
          unrealised += pnl; marked.push({ id: p.id, price: mid, q2k });
          enriched.push({ ...p, current_price: mid, unrealised_pnl: pnl });
        } catch { enriched.push({ ...p, unrealised_pnl: 0, priceStatus: "unavailable" }); }
      }

      if (marked.length > 0) {
        await Promise.all(marked.map((m) => supabase.from("forex_positions").update({ current_price: m.price, quote_to_kes: m.q2k }).eq("id", m.id).eq("user_id", request.user!.id)));
        await supabase.rpc("forex_recalculate_equity", { p_account_id: account.id });
      }

      const isLive = accountType === "live";
      let balance: number, walletLocked = 0, walletBalance = 0;

      if (isLive) {
        const { data: wallet } = await supabase.from("wallets").select("balance, locked").eq("user_id", request.user!.id).maybeSingle();
        walletBalance = Number(wallet?.balance ?? 0);
        walletLocked = Number(wallet?.locked ?? 0);
        balance = walletBalance;
      } else { balance = Number(account.balance ?? 0); }

      const effectiveUsedMargin = Number(account.used_margin ?? 0);
      const state = marginState(balance, unrealised, effectiveUsedMargin);
      const availableBalance = isLive ? Math.max(0, walletBalance - walletLocked) : Math.max(0, state.equity - effectiveUsedMargin);

      const { data: ledger } = await supabase.from("forex_transactions").select("*").eq("account_id", account.id).order("created_at", { ascending: false }).limit(5);

      return {
        success: true,
        account: { id: account.id, account_type: account.account_type, leverage: Number(account.leverage ?? 1), status: account.status, balanceSource: isLive ? "pesaki_wallet" : "forex_demo_account", walletBalance, walletLocked, unrealized_pnl: unrealised, availableBalance, minTradeAmount: minTradeAmount(), ...state },
        positions: enriched, recentTransactions: ledger ?? [], realTradingEnabled: REAL_TRADING_ENABLED,
      };
    } catch (err) {
      if (err instanceof ForexError) return reply.code(err.statusCode).send({ success: false, error: err.message, code: err.code });
      logger.error({ err }, "Forex account load failed");
      return reply.code(500).send({ success: false, error: "Could not load Forex account.", code: "INTERNAL" });
    }
  });

  fastify.post("/deposit", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = z.object({ amount: z.number().positive(), account_type: z.enum(["demo", "live"]).default("demo") }).safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid deposit details");
    const { amount, account_type } = parsed.data;
    const userId = request.user!.id;

    if (amount < 100) return bad(reply, `Minimum deposit is KSh 100`, 400);
    if (amount > 10000) return bad(reply, `Maximum deposit is KSh 10,000`, 400);
    if (account_type === "live" && !REAL_TRADING_ENABLED) return bad(reply, "Real-money trading not enabled.", 403);

    if (account_type === "demo") {
      const account = await getOrCreateAccount(userId, "demo");
      const balance = Number((Number(account.balance ?? 0) + amount).toFixed(4));
      await supabase.from("forex_accounts").update({ balance, equity: balance, updated_at: new Date().toISOString() }).eq("id", account.id).eq("user_id", userId);
      await supabase.from("forex_transactions").insert({ user_id: userId, account_id: account.id, type: "deposit", amount, balance_after: balance, status: "completed", reference: `demo-deposit:${userId}:${amount}`, note: `Demo deposit KSh ${amount}` });
      return { success: true, mode: "demo", amount, balance };
    }

    const wallet = await ensureWalletExists(userId);
    const newBalance = Number(wallet.balance ?? 0) + amount;
    await supabase.from("wallets").update({ balance: newBalance }).eq("user_id", userId);
    await supabase.from("wallet_ledger").insert({ user_id: userId, amount, type: "deposit", mode: "credit", description: `Forex deposit KSh ${amount}` });
    let account = await getOrCreateAccount(userId, "live");
    await supabase.from("forex_accounts").update({ balance: newBalance, equity: newBalance, updated_at: new Date().toISOString() }).eq("id", account.id).eq("user_id", userId);

    return { success: true, mode: "live", amount, balance: newBalance };
  });

  fastify.post("/risk/preview", async (request, reply) => {
    const parsed = z.object({ symbol: z.string(), side: z.enum(["buy", "sell"]), balance: z.number().positive(), risk_percent: z.number().positive().max(100), entry_price: z.number().positive(), stop_loss: z.number().positive() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid risk inputs");
    const { symbol, side, balance, risk_percent, entry_price, stop_loss } = parsed.data;
    let spec = getInstrument(symbol)!;
    if (!spec) return bad(reply, "Instrument not available");
    spec = { ...spec, contractSize: PESAKI_CONTRACT_SIZE };
    if (!validateStopLoss(side, entry_price, stop_loss).ok) return bad(reply, "Invalid stop loss");

    try {
      const q2k = quoteToKes(spec);
      const preview = calculatePositionSize({ balance, riskPercent: risk_percent, entryPrice: entry_price, stopLossPrice: stop_loss, instrument: spec, quoteToKes: q2k });
      const quote = getEngine().quote(symbol);
      const riskDistance = Math.abs(entry_price - stop_loss), rewardDistance = riskDistance * 2;
      return { success: true, preview: { ...preview, entrySpreadPips: quote.spreadPips, riskRewardRatio: riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(2)) : 0, potentialLoss: Number((preview.lots * spec.contractSize * riskDistance * q2k).toFixed(2)), potentialProfit: Number((preview.lots * spec.contractSize * rewardDistance * q2k).toFixed(2)) } };
    } catch { return reply.code(503).send({ success: false, error: "Market data unavailable." }); }
  });

  fastify.post("/orders", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid order details");
    const body = parsed.data;
    const userId = request.user!.id;
    
    let spec = getInstrument(body.symbol);
    if (!spec) return bad(reply, "Instrument not available");
    
    spec = { ...spec, contractSize: PESAKI_CONTRACT_SIZE };

    if (body.account_type === "live" && !REAL_TRADING_ENABLED) return bad(reply, "Live trading unavailable.", 403);

    if (body.idempotency_key) {
      const { data: existing } = await supabase.from("forex_orders").select("*").eq("user_id", userId).eq("idempotency_key", body.idempotency_key).maybeSingle();
      if (existing) return { success: true, order: existing, idempotent: true };
    }

    let account;
    try { account = await getOrCreateAccount(userId, body.account_type); } 
    catch { return reply.code(500).send({ success: false, error: "Live trading unavailable.", code: "REJECTED" }); }
    
    if (account.status !== "active") return bad(reply, "Account not active");

    let dbSymbol = body.symbol;
    if (dbSymbol.length === 6 && !dbSymbol.includes("/")) {
        dbSymbol = `${dbSymbol.slice(0, 3)}/${dbSymbol.slice(3)}`;
    }

    const { data: instrumentRow } = await supabase.from("forex_instruments").select("*").eq("symbol", dbSymbol).maybeSingle();
    if (!instrumentRow) return bad(reply, "Instrument not available");
    if (instrumentRow.trading_status !== "open") return bad(reply, "Instrument closed");

    let quote: Quote;
    try { quote = getEngine().quote(body.symbol); } 
    catch { return reply.code(503).send({ success: false, error: "Market data unavailable.", code: "MARKET_DATA_UNAVAILABLE" }); }

    const entry = body.order_type === "market" ? (body.side === "buy" ? quote.ask : quote.bid) : (body.limit_price ?? body.trigger_price ?? quote.mid);
    if (!validateStopLoss(body.side, entry, body.stop_loss ?? null).ok) return bad(reply, "Invalid stop loss");
    if (!validateTakeProfit(body.side, entry, body.take_profit ?? null).ok) return bad(reply, "Invalid take profit");

    const q2k = quoteToKes(spec);
    const isPending = ["limit", "stop", "stop_limit"].includes(body.order_type);

    let freeMargin = 0;
    if (body.account_type === "live") {
      await ensureWalletExists(userId);
      const { data: wallet } = await supabase.from("wallets").select("balance, locked").eq("user_id", userId).maybeSingle();
      const walletBalance = Number(wallet?.balance ?? 0);
      freeMargin = walletBalance;
      await supabase.from("forex_accounts").update({ balance: walletBalance, equity: walletBalance }).eq("id", account.id);
    } else {
      freeMargin = Number(account.equity ?? account.balance ?? 0) - Number(account.used_margin ?? 0);
    }

   const requestedLots = body.lots || 0.01;
   const marginUsd = requestedLots * 100; 
   const marginKes = marginUsd * q2k;     

   const sizing = {
     tradeAmount: marginKes,
     margin: marginKes,
     lots: requestedLots,
     units: requestedLots * PESAKI_CONTRACT_SIZE,
     exposure: requestedLots * PESAKI_CONTRACT_SIZE * entry * q2k,
     notionalPerLot: PESAKI_CONTRACT_SIZE * entry * q2k
   };

   if (sizing.margin > freeMargin) {
     return bad(reply, `Order rejected: insufficient free margin. You have KSh ${freeMargin.toFixed(2)} available, but need KSh ${sizing.margin.toFixed(2)}.`);
   }

    const executedPrice = body.side === "buy" ? quote.ask : quote.bid;
    const slippage = Number((executedPrice - quote.mid).toFixed(spec.digits));

    let reserved = false;
    if (!isPending) {
      let commissionKes = 0;
      if (body.account_type === "live" && marginKes > 0) {
        commissionKes = marginKes * COMMISSION_RATE;
        await supabase.rpc('debit_wallet', { p_user_id: userId, p_amount: commissionKes, p_mode: 'live', p_description: `Forex Opening Commission` });
      }

      const reservation = await reserveMargin(userId, body.account_type, sizing.margin + commissionKes, `${spec.symbol}:${body.side}:${body.idempotency_key ?? Date.now()}`);
      
      if (!reservation.ok) {
        if (commissionKes > 0) await supabase.rpc('credit_wallet', { p_user_id: userId, p_amount: commissionKes, p_mode: 'live', p_description: `Refund Commission` });
        return reply.code(FX_ERRORS.INSUFFICIENT_BALANCE).send({ success: false, error: reservation.reason ?? "Insufficient funds.", code: "INSUFFICIENT_FUNDS" });
      }
      reserved = true;
    }

    const { data: orderRow, error: orderError } = await supabase.from("forex_orders").insert({
      user_id: userId,
      account_id: account.id,
      instrument_id: instrumentRow.id,
      order_type: body.order_type,
      side: body.side,
      quantity: sizing.lots,
      requested_price: quote.mid,
      executed_price: executedPrice,
      slippage: slippage,
      status: isPending ? "pending" : "filled",
      stop_loss: body.stop_loss ?? null,
      take_profit: body.take_profit ?? null,
      idempotency_key: body.idempotency_key ?? null,
      quote_to_kes: q2k,
    }).select().single();

    if (orderError) {
      logger.error({ err: orderError }, "Order creation failed");
      if (reserved) await releaseReservation(userId, body.account_type, sizing.margin, "insert order failed");
      return reply.code(500).send({ success: false, error: `DB Error: ${orderError.message}`, code: "EXECUTION_FAILED" });
    }

    let positionRow = null;
    if (!isPending) {
      const { data: posRow, error: posError } = await supabase.from("forex_positions").insert({
        user_id: userId,
        account_id: account.id,
        instrument_id: instrumentRow.id,
        side: body.side,
        quantity: sizing.lots,
        average_entry_price: executedPrice,
        margin: sizing.margin,
        quote_to_kes: q2k,
        stop_loss: body.stop_loss ?? null,
        take_profit: body.take_profit ?? null,
        opened_at: new Date().toISOString(),
      }).select().single();

      if (posError) {
        logger.error({ err: posError }, "Position creation failed");
        if (reserved) await releaseReservation(userId, body.account_type, sizing.margin, "insert position failed");
        return reply.code(500).send({ success: false, error: `Position DB Error: ${posError.message}`, code: "EXECUTION_FAILED" });
      }
      positionRow = posRow;

      await supabase.from("forex_accounts").update({
        used_margin: Number(account.used_margin ?? 0) + sizing.margin
      }).eq("id", account.id);
    }

    if (isPending) return { success: true, order: orderRow, message: "Pending order placed" };

    return {
      success: true,
      order: orderRow,
      position: { ...positionRow, unrealised_pnl: 0, current_price: executedPrice, quote_to_kes: q2k, opened_at: new Date().toISOString(), side: body.side, symbol: body.symbol },
      execution: { requestedPrice: quote.mid, executedPrice, slippage, spreadPips: quote.spreadPips },
      accountType: body.account_type
    };
  });

  fastify.get("/orders", { preHandler: [verifyAuth] }, async (request) => {
    const { data } = await supabase.from("forex_orders").select("*").eq("user_id", request.user!.id).order("created_at", { ascending: false }).limit(100);
    return { success: true, orders: data ?? [] };
  });

  fastify.get("/positions", { preHandler: [verifyAuth] }, async (request) => {
    const { mode } = request.query as { mode?: string };
    const accountType = mode === "live" ? "live" : "demo";
    const { data: account } = await supabase.from("forex_accounts").select("id").eq("user_id", request.user!.id).eq("account_type", accountType).maybeSingle();
    if (!account) return { success: true, positions: [] };
    const { data } = await supabase.from("forex_positions").select("*, forex_instruments(symbol)").eq("account_id", account.id).is("closed_at", null).order("opened_at", { ascending: false });
    return { success: true, positions: data ?? [] };
  });

  fastify.post("/orders/:id/cancel", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: order } = await supabase.from("forex_orders").update({ status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).eq("user_id", request.user!.id).in("status", ["pending", "submitted"]).select().maybeSingle();
    if (!order) return reply.code(404).send({ success: false, error: "Order not found" });
    return { success: true, order };
  });

  fastify.post("/positions/:id/close", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { lots } = request.body as { lots?: number };
    return closePosition(request, reply, id, lots);
  });

  fastify.post("/positions/:id/partial-close", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const parsed = z.object({ lots: z.number().positive() }).safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid close size");
    return closePosition(request, reply, id, parsed.data.lots);
  });

  fastify.get("/transactions", { preHandler: [verifyAuth] }, async (request) => {
    const { data } = await supabase.from("forex_transactions").select("*").eq("user_id", request.user!.id).order("created_at", { ascending: false }).limit(100);
    return { success: true, transactions: data ?? [] };
  });

  fastify.get("/analytics", { preHandler: [verifyAuth] }, async (request) => {
    const { data: closed } = await supabase.from("forex_positions").select("*").eq("user_id", request.user!.id).not("closed_at", "is", null);
    const trades = closed ?? [], wins = trades.filter((t) => Number(t.realized_pnl) > 0), losses = trades.filter((t) => Number(t.realized_pnl) < 0);
    const grossProfit = wins.reduce((s, t) => s + Number(t.realized_pnl), 0), grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.realized_pnl), 0));
    return { success: true, analytics: { totalTrades: trades.length, wins: wins.length, losses: losses.length, winRate: trades.length ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0, grossProfit: Number(grossProfit.toFixed(2)), grossLoss: Number(grossLoss.toFixed(2)), netPnl: Number((grossProfit - grossLoss).toFixed(2)), profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null, averageWin: wins.length ? Number((grossProfit / wins.length).toFixed(2)) : 0, averageLoss: losses.length ? Number((grossLoss / losses.length).toFixed(2)) : 0 } };
  });

  fastify.post("/account/reset-demo", { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    const { data: account } = await supabase.from("forex_accounts").select("id").eq("user_id", userId).eq("account_type", "demo").maybeSingle();
    if (!account) return reply.code(404).send({ success: false, error: "No demo account." });

    const { data: open } = await supabase.from("forex_positions").select("id").eq("account_id", account.id).is("closed_at", null);
    for (const p of open ?? []) await supabase.from("forex_positions").update({ closed_at: new Date().toISOString(), close_reason: "reset", updated_at: new Date().toISOString() }).eq("id", p.id);
    await supabase.from("forex_accounts").update({ balance: DEMO_START_BALANCE, equity: DEMO_START_BALANCE, used_margin: 0, updated_at: new Date().toISOString() }).eq("id", account.id);
    return { success: true, balance: DEMO_START_BALANCE };
  });

  fastify.get("/history", { preHandler: [verifyAuth] }, async (request) => {
    const { mode, limit } = request.query as { mode?: string; limit?: string };
    const accountType = mode === "live" ? "live" : "demo";
    const { data: acct } = await supabase.from("forex_accounts").select("id").eq("user_id", request.user!.id).eq("account_type", accountType).maybeSingle();
    if (!acct) return { success: true, history: [] };
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);
    const [{ data: positions }, { data: orders }] = await Promise.all([
      supabase.from("forex_positions").select("*").eq("account_id", acct.id).not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(n),
      supabase.from("forex_orders").select("*").eq("account_id", acct.id).in("status", ["pending", "cancelled", "rejected", "expired"]).order("created_at", { ascending: false }).limit(n),
    ]);
    const enriched: any[] = [];
    for (const p of positions ?? []) enriched.push({ id: p.id, kind: "position", mode: accountType, symbol: await symbolForInstrument(p.instrument_id), side: p.side, quantity: Number(p.quantity), entry: Number(p.average_entry_price), pnl: Number(p.realized_pnl ?? 0), status: "closed", closedAt: p.closed_at });
    for (const o of orders ?? []) enriched.push({ id: o.id, kind: "order", mode: accountType, symbol: await symbolForInstrument(o.instrument_id), side: o.side, quantity: Number(o.quantity), pnl: 0, status: o.status, closedAt: o.created_at });
    enriched.sort((a, b) => new Date(String(b.closedAt)).getTime() - new Date(String(a.closedAt)).getTime());
    return { success: true, history: enriched.slice(0, n) };
  });

  fastify.get("/health", async () => ({ success: true, market: getEngine().describe(), realTradingEnabled: REAL_TRADING_ENABLED, symbols: SYMBOLS.length }));
};

async function closePosition(request: FastifyRequest, reply: FastifyReply, positionId: string, lotsToClose?: number) {
  const userId = request.user!.id;
  try {
    const { data: position } = await supabase.from("forex_positions").select("*").eq("id", positionId).eq("user_id", userId).maybeSingle();
    
    if (!position) return reply.code(404).send({ success: false, error: "Position not found" });
    if (position.closed_at) return reply.code(409).send({ success: false, error: "Position already closed" });

    const sym = await symbolForInstrument(position.instrument_id);
    const baseSpec = sym ? getInstrument(sym) : undefined;
    
    if (!baseSpec) {
      logger.error({ positionId, instrumentId: position.instrument_id }, "Close failed: unknown instrument in DB");
      return reply.code(400).send({ success: false, error: "Unknown instrument. Please contact support.", code: "UNKNOWN_INSTRUMENT" });
    }
    
    const spec = { ...baseSpec, contractSize: PESAKI_CONTRACT_SIZE };

    const remaining = Number(position.quantity);
    if (!remaining || remaining <= 0) {
      return reply.code(400).send({ success: false, error: "Position quantity is invalid or zero.", code: "INVALID_QUANTITY" });
    }

    let fraction = 1;
    if (lotsToClose) {
      fraction = lotsToClose / remaining;
      if (fraction <= 0) return bad(reply, "Close amount must be > 0");
      if (fraction > 1) return bad(reply, "Cannot close more than open position");
    }

    const closeLots = Number((remaining * fraction).toFixed(2));
    if (closeLots <= 0) return bad(reply, "Close amount must be > 0");

    let exitPrice: number, q2k: number;
    try {
      const quote = getEngine().quote(spec.symbol);
      exitPrice = position.side === "buy" ? quote.bid : quote.ask;
      q2k = quoteToKes(spec);
    } catch { 
      return reply.code(503).send({ success: false, error: "Market unavailable.", code: "MARKET_DATA_UNAVAILABLE" }); 
    }

    const { data: result, error: closeError } = await supabase.rpc("forex_close_position", { 
      p_user_id: userId, 
      p_position_id: positionId, 
      p_close_lots: closeLots, 
      p_exit_price: exitPrice, 
      p_quote_to_kes: q2k 
    });

    if (closeError) {
      const reason = closeError.message ?? "";
      logger.error({ err: reason, positionId, closeLots, exitPrice, q2k }, "Forex close RPC failed");
      if (reason.includes("POSITION_NOT_FOUND")) return reply.code(404).send({ success: false, error: "Position not found" });
      if (reason.includes("POSITION_ALREADY_CLOSED")) return reply.code(409).send({ success: false, error: "Position already closed" });
      if (reason.includes("OVER_CLOSE")) return bad(reply, "Cannot close more than open position");
      return reply.code(500).send({ success: false, error: `Close failed: ${reason}`, code: "EXECUTION_FAILED" });
    }

    const { data: updated } = await supabase.from("forex_positions").select("*").eq("id", positionId).maybeSingle();
    const { data: accountRow } = await supabase.from("forex_accounts").select("account_type").eq("id", position.account_id).maybeSingle();
    const positionMode = (accountRow?.account_type === "live" ? "live" : "demo") as "live" | "demo";

    if (positionMode === "live") {
      const closedFraction = closeLots / remaining;
      const releasedMargin = Number((Number(position.margin ?? 0) * closedFraction).toFixed(4));
      const legs = settlementLegs({ 
        side: position.side, 
        units: closeLots * spec.contractSize,
        entryPrice: Number(position.average_entry_price), 
        exitPrice, 
        quoteToKes: q2k, 
        margin: releasedMargin 
      });
      
      const closingCommissionKes = releasedMargin * COMMISSION_RATE; 
      const netProfitAfterCommission = legs.profit - legs.loss - closingCommissionKes;
      
      const settlement = await settleReal(userId, legs.marginRelease, netProfitAfterCommission, `close:${positionId}`);
      
      if (!settlement.ok) {
        logger.error({ err: settlement.reason }, "Live settlement failed");
        return reply.code(502).send({ success: false, error: "Settlement pending.", code: "SETTLEMENT_PENDING", position: updated });
      }
    }

    return { 
      success: true, 
      position: updated, 
      realizedPnl: Number(result?.realized_pnl ?? 0), 
      exitPrice, 
      balance: Number(result?.balance ?? 0), 
      partial: !result?.closed 
    };
  } catch (e: any) {
    logger.error({ err: e?.message, positionId }, "Close position unhandled error");
    return reply.code(500).send({ success: false, error: e?.message || "Close failed", code: "EXECUTION_FAILED" });
  }
}
