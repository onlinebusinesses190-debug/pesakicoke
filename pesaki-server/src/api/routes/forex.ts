/**
 * PESAKI Forex — HTTP API.
 *
 * Registered under /forex, deliberately separate from the binary prediction
 * game at /games/fx. This module owns its own accounts, orders, positions,
 * fills and ledger, and its own market-data engine.
 *
 * Identity always comes from the verified Supabase session (verifyAuth). The
 * user_id in a request body is never trusted; every query is scoped to the
 * authenticated user and their own account.
 *
 * Live money execution is not wired up. LIVE_TRADING_ENABLED gates it, and
 * while no licensed execution provider is configured the live account cannot
 * be funded, so no real user funds can reach this module.
 */

import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { z } from "zod";
import { verifyAuth } from "../../middleware/auth";
import { supabase } from "../../lib/supabase";
import { logger } from "../../utils/logger";
import { INSTRUMENTS, SYMBOLS, getInstrument, type InstrumentSpec } from "../../services/forex/instruments";
import {
  MarketDataUnavailableError,
  getCandles,
  getQuote,
  getQuotes,
  getMarketDataProvider,
  type Quote,
} from "../../services/forex/marketData";
import {
  calculatePositionSize,
  computePnl,
  marginForLots,
  marginState,
  validateLots,
  validateStopLoss,
  validateTakeProfit,
} from "../../services/forex/risk";

const DEMO_START_BALANCE = 100_000;
const LIVE_TRADING_ENABLED = process.env.LIVE_TRADING_ENABLED === "true";

/**
 * KES value of one unit of the instrument's quote currency, from real rates.
 *
 * The provider publishes cross rates against EUR, so USD/KES is derived from
 * EUR/KES ÷ EUR/USD. No value is assumed or hard-coded: if the provider cannot
 * supply the rates, the caller gets MARKET_DATA_UNAVAILABLE.
 */
const defaultUsdKes = async (): Promise<number> => {
  const provider = getMarketDataProvider();
  const rates = await provider.fetchMids(["EUR/USD", "EUR/KES"]);
  const eurUsd = rates["EUR/USD"];
  const eurKes = rates["EUR/KES"];
  if (!eurUsd || !eurKes) throw new MarketDataUnavailableError("No USD/KES rate");
  return eurKes / eurUsd;
};

const quoteToKes = async (instrument: InstrumentSpec): Promise<number> => {
  if (instrument.quote === "KES") return 1;
  const provider = getMarketDataProvider();
  const rates = await provider.fetchMids([`USD/${instrument.quote}`]);
  const usdQuote = rates[`USD/${instrument.quote}`];
  if (!usdQuote) throw new MarketDataUnavailableError(`No USD/${instrument.quote} rate`);
  const usdKes = await defaultUsdKes();
  return usdKes / usdQuote;
};

/** Resolve the canonical symbol for a DB instrument id. */
const symbolCache = new Map<number, string>();

async function symbolForInstrument(instrumentId: number): Promise<string | undefined> {
  if (instrumentId <= 0) return undefined;
  const cached = symbolCache.get(instrumentId);
  if (cached) return cached;
  const { data } = await supabase
    .from("forex_instruments")
    .select("symbol")
    .eq("id", instrumentId)
    .maybeSingle();
  if (data?.symbol) {
    symbolCache.set(instrumentId, data.symbol);
    return data.symbol;
  }
  return undefined;
}

async function getOrCreateAccount(userId: string, accountType: "demo" | "live") {
  const { data, error } = await supabase
    .from("forex_accounts")
    .select("*")
    .eq("user_id", userId)
    .eq("account_type", accountType)
    .maybeSingle();
  if (error) throw error;
  if (data) return data;

  if (accountType === "live" && !LIVE_TRADING_ENABLED) {
    throw Object.assign(new Error("Live trading is not available"), { statusCode: 403 });
  }

  const { data: created, error: insertError } = await supabase
    .from("forex_accounts")
    .insert({
      user_id: userId,
      account_type: accountType,
      currency: "KES",
      balance: accountType === "demo" ? DEMO_START_BALANCE : 0,
      equity: accountType === "demo" ? DEMO_START_BALANCE : 0,
      leverage: 1,
      status: "active",
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

const orderSchema = z.object({
  symbol: z.enum(SYMBOLS as [string, ...string[]]),
  side: z.enum(["buy", "sell"]),
  lots: z.number().positive(),
    order_type: z.enum(["market", "limit", "stop", "stop_limit"]).default("market"),
  limit_price: z.number().positive().nullable().optional(),
  trigger_price: z.number().positive().nullable().optional(),
  stop_loss: z.number().positive().nullable().optional(),
  take_profit: z.number().positive().nullable().optional(),
  account_type: z.enum(["demo", "live"]).default("demo"),
  idempotency_key: z.string().min(8).max(120).optional(),
});

const bad = (reply: FastifyReply, error: string, code = 400) =>
  reply.code(code === 403 ? 403 : 400).send({ success: false, error, code: "REJECTED" });

export const forexRoutes = async (fastify: FastifyInstance) => {
  // ─── Instruments ───────────────────────────────────────────────────────────
  fastify.get("/instruments", async () => {
    const { data } = await supabase
      .from("forex_instruments")
      .select("*")
      .order("symbol");
    const rows =
      data?.length
        ? data
        : Object.values(INSTRUMENTS).map((s) => ({
            id: 0,
            symbol: s.symbol,
            base_currency: s.base,
            quote_currency: s.quote,
            digits: s.digits,
            pip_size: s.pipSize,
            min_lot: s.minLot,
            max_lot: s.maxLot,
            lot_step: s.lotStep,
            typical_spread_pips: s.typicalSpreadPips,
            trading_status: "open",
          }));
    return { success: true, instruments: rows };
  });

  // ─── Quotes ────────────────────────────────────────────────────────────────
  fastify.get("/quotes", async (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ? symbols.split(",") : SYMBOLS).map((s) => s.toUpperCase());
    try {
      const quotes: Quote[] = await getQuotes(list);
      if (quotes.length === 0) {
        return reply
          .code(503)
          .send({ success: false, error: "Market data is currently unavailable." });
      }
      return { success: true, quotes };
    } catch (err) {
      logger.warn({ err: (err as Error).message }, "Forex quotes unavailable");
      return reply.code(503).send({
        success: false,
        error: "Market data is currently unavailable.",
        code: "MARKET_DATA_UNAVAILABLE",
      });
    }
  });

  fastify.get("/quote/:symbol", async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    try {
      return { success: true, quote: await getQuote(symbol.toUpperCase()) };
    } catch {
      return reply
        .code(503)
        .send({ success: false, error: "Market data is currently unavailable." });
    }
  });

  // ─── Candles ───────────────────────────────────────────────────────────────
  fastify.get("/candles/:symbol", async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    const { count } = request.query as { count?: string };
    if (!getInstrument(symbol.toUpperCase())) return bad(reply, "Unsupported symbol");
    try {
      const candles = await getCandles(symbol.toUpperCase(), Math.min(Number(count) || 60, 180));
      return { success: true, candles };
    } catch {
      return reply.code(503).send({
        success: false,
        error: "Chart data is currently unavailable.",
        code: "MARKET_DATA_UNAVAILABLE",
      });
    }
  });

  // ─── Account ───────────────────────────────────────────────────────────────
  fastify.get("/account", { preHandler: [verifyAuth] }, async (request, reply) => {
    const accountType = ((request.query as { account_type?: string }).account_type ??
      "demo") as "demo" | "live";
    try {
      const account = await getOrCreateAccount(request.user!.id, accountType);
      const { data: positions } = await supabase
        .from("forex_positions")
        .select("*")
        .eq("account_id", account.id)
        .is("closed_at", null);

      let unrealised = 0;
      let usedMargin = Number(account.used_margin ?? 0);
      const enriched = [];
      // Positions we managed to price, so the mark-to-market can be persisted.
      const marked: { id: string; price: number; q2k: number }[] = [];
      for (const p of positions ?? []) {
        const sym = await symbolForInstrument(p.instrument_id);
        const spec = sym ? getInstrument(sym) : undefined;
        if (!spec) {
          enriched.push(p);
          continue;
        }
        try {
          const quote = await getQuote(spec.symbol);
          const mid = quote.mid;
          const q2k = await quoteToKes(spec);
          const pnl = computePnl({
            side: p.side,
            lots: Number(p.quantity),
            entryPrice: Number(p.average_entry_price),
            exitPrice: mid,
            instrument: spec,
            quoteToKes: q2k,
          });
          unrealised += pnl;
          // Accumulate across every open position. Assigning here reported only
          // the margin of whichever position happened to be last in the list.
          usedMargin += Number(p.margin ?? 0);
          marked.push({ id: p.id, price: mid, q2k });
          enriched.push({ ...p, current_price: mid, unrealised_pnl: pnl });
        } catch {
          enriched.push({ ...p, unrealised_pnl: 0, priceStatus: "unavailable" });
        }
      }

      // Persist the marks so database-side equity reflects live prices. Without
      // this the stored current_price stays at entry forever and equity never
      // moves between opens and closes.
      if (marked.length > 0) {
        await Promise.all(
          marked.map((m) =>
            supabase
              .from("forex_positions")
              .update({ current_price: m.price, quote_to_kes: m.q2k })
              .eq("id", m.id)
              .eq("user_id", request.user!.id),
          ),
        );
        const { error: equityError } = await supabase.rpc("forex_recalculate_equity", {
          p_account_id: account.id,
        });
        if (equityError) {
          logger.warn({ err: equityError.message }, "Forex equity refresh failed");
        }
      }

      const state = marginState(Number(account.balance), unrealised, usedMargin);
      const { data: ledger } = await supabase
        .from("forex_transactions")
        .select("*")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(5);

      return {
        success: true,
        account: { ...account, ...state },
        positions: enriched,
        recentTransactions: ledger ?? [],
        liveTradingEnabled: LIVE_TRADING_ENABLED,
      };
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply.code(status).send({
        success: false,
        error: status === 403 ? "Live trading is currently unavailable." : "Could not load account.",
      });
    }
  });

  // ─── Risk calculator ───────────────────────────────────────────────────────
  fastify.post("/risk/preview", async (request, reply) => {
    const schema = z.object({
      symbol: z.enum(SYMBOLS as [string, ...string[]]),
      side: z.enum(["buy", "sell"]),
      balance: z.number().positive(),
      risk_percent: z.number().positive().max(100),
      entry_price: z.number().positive(),
      stop_loss: z.number().positive(),
    });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid risk inputs");
    const { symbol, side, balance, risk_percent, entry_price, stop_loss } = parsed.data;
    const spec = getInstrument(symbol)!;

    const slCheck = validateStopLoss(side, entry_price, stop_loss);
    if (!slCheck.ok) return bad(reply, slCheck.error!);

    try {
      const q2k = await quoteToKes(spec);
      const preview = calculatePositionSize({
        balance,
        riskPercent: risk_percent,
        entryPrice: entry_price,
        stopLossPrice: stop_loss,
        instrument: spec,
        quoteToKes: q2k,
      });
      const quote = await getQuote(symbol);
      const riskDistance = Math.abs(entry_price - stop_loss);
      const rewardDistance = riskDistance * 2;
      return {
        success: true,
        preview: {
          ...preview,
          entrySpreadPips: quote.spreadPips,
          riskRewardRatio: riskDistance > 0 ? Number((rewardDistance / riskDistance).toFixed(2)) : 0,
          potentialLoss: Number((preview.lots * spec.contractSize * riskDistance * q2k).toFixed(2)),
          potentialProfit: Number(
            (preview.lots * spec.contractSize * rewardDistance * q2k).toFixed(2),
          ),
        },
      };
    } catch {
      return reply.code(503).send({ success: false, error: "Market data is currently unavailable." });
    }
  });

  // ─── Place order ───────────────────────────────────────────────────────────
  fastify.post("/orders", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = orderSchema.safeParse(request.body);
    if (!parsed.success) return bad(reply, "Invalid order details");
    const body = parsed.data;
    const userId = request.user!.id;
    const spec = getInstrument(body.symbol)!;

    const lotsCheck = validateLots(body.lots, spec);
    if (!lotsCheck.ok) return bad(reply, lotsCheck.error!);

    if (body.account_type === "live" && !LIVE_TRADING_ENABLED) {
      return bad(reply, "Live trading is currently unavailable. Use Demo trading.", 403);
    }

    // Idempotency: a repeated submit must not create a second order.
    if (body.idempotency_key) {
      const { data: existing } = await supabase
        .from("forex_orders")
        .select("*")
        .eq("user_id", userId)
        .eq("idempotency_key", body.idempotency_key)
        .maybeSingle();
      if (existing) return { success: true, order: existing, idempotent: true };
    }

    let account;
    try {
      account = await getOrCreateAccount(userId, body.account_type);
    } catch (err) {
      const status = (err as { statusCode?: number }).statusCode ?? 500;
      return reply
        .code(status)
        .send({ success: false, error: "Live trading is currently unavailable.", code: "REJECTED" });
    }
    if (account.status !== "active") return bad(reply, "Your Forex account is not active");

    const { data: instrumentRow } = await supabase
      .from("forex_instruments")
      .select("*")
      .eq("symbol", body.symbol)
      .maybeSingle();
    if (!instrumentRow) return bad(reply, "This instrument is not available");
    if (instrumentRow.trading_status !== "open") return bad(reply, "This instrument is closed");

    let quote: Quote;
    try {
      quote = await getQuote(body.symbol);
    } catch {
      return reply.code(503).send({
        success: false,
        error: "Market data is currently unavailable. No order was placed.",
        code: "MARKET_DATA_UNAVAILABLE",
      });
    }

    const entry =
      body.order_type === "market"
        ? body.side === "buy"
          ? quote.ask
          : quote.bid
        : (body.limit_price ?? body.trigger_price ?? quote.mid);

    const slCheck = validateStopLoss(body.side, entry, body.stop_loss ?? null);
    if (!slCheck.ok) return bad(reply, slCheck.error!);
    const tpCheck = validateTakeProfit(body.side, entry, body.take_profit ?? null);
    if (!tpCheck.ok) return bad(reply, tpCheck.error!);

    const q2k = await quoteToKes(spec);
    const margin = marginForLots(body.lots, entry, spec, q2k, Number(account.leverage ?? 1) * 100);
    const freeMargin = Number(account.equity ?? account.balance ?? 0) - Number(account.used_margin ?? 0);
    if (margin > freeMargin) {
      return bad(reply, `Order rejected: insufficient free margin. You need KSh ${margin.toFixed(2)}.`);
    }

    const pendingTypes = ["limit", "stop", "stop_limit"];
    const isPending = pendingTypes.includes(body.order_type);
    const executedPrice = body.side === "buy" ? quote.ask : quote.bid;
    const slippage = Number((executedPrice - quote.mid).toFixed(spec.digits));

    // Execution runs entirely inside one database transaction: the order, the
    // position, the fill and the margin reservation either all land or none do.
    // Margin is re-checked under a row lock on the account, so two concurrent
    // orders cannot both spend the same free margin.
    const { data: result, error: execError } = await supabase.rpc("forex_open_market_position", {
      p_user_id: userId,
      p_account_id: account.id,
      p_instrument_id: instrumentRow.id,
      p_order_type: body.order_type,
      p_side: body.side,
      p_quantity: body.lots,
      p_requested_price: quote.mid,
      p_executed_price: executedPrice,
      p_slippage: slippage,
      p_quote_to_kes: q2k,
      p_limit_price: body.limit_price ?? null,
      p_trigger_price: body.trigger_price ?? null,
      p_stop_loss: body.stop_loss ?? null,
      p_take_profit: body.take_profit ?? null,
      p_idempotency_key: body.idempotency_key ?? null,
      p_pending: isPending,
    });

    if (execError) {
      const reason = execError.message ?? "";
      if (reason.includes("INSUFFICIENT_MARGIN")) {
        const needed = Number(reason.split(":")[1] ?? 0);
        return bad(reply, `Order rejected: insufficient free margin. You need KSh ${needed.toFixed(2)}.`);
      }
      if (reason.includes("ACCOUNT_NOT_ACTIVE")) return bad(reply, "Your Forex account is not active");
      if (reason.includes("INSTRUMENT_CLOSED")) return bad(reply, "This instrument is closed");
      logger.error({ err: reason }, "Forex execution failed");
      return reply.code(500).send({
        success: false,
        error: "The order could not be executed. Nothing was charged or opened.",
        code: "EXECUTION_FAILED",
      });
    }

    if (result?.idempotent) {
      const { data: existing } = await supabase
        .from("forex_orders")
        .select("*")
        .eq("id", result.order_id)
        .maybeSingle();
      return { success: true, order: existing, idempotent: true };
    }

    const [{ data: orderRow }, { data: positionRow }] = await Promise.all([
      supabase.from("forex_orders").select("*").eq("id", result.order_id).maybeSingle(),
      result.position_id
        ? supabase.from("forex_positions").select("*").eq("id", result.position_id).maybeSingle()
        : Promise.resolve({ data: null }),
    ]);

    if (isPending) {
      return { success: true, order: orderRow, message: "Pending order placed" };
    }

    return {
      success: true,
      order: orderRow,
      position: positionRow,
      execution: { requestedPrice: quote.mid, executedPrice, slippage, spreadPips: quote.spreadPips },
      accountType: body.account_type,
    };
  });

  // ─── Orders / positions / history ──────────────────────────────────────────
  fastify.get("/orders", { preHandler: [verifyAuth] }, async (request) => {
    const { data } = await supabase
      .from("forex_orders")
      .select("*")
      .eq("user_id", request.user!.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { success: true, orders: data ?? [] };
  });

  fastify.get("/positions", { preHandler: [verifyAuth] }, async (request) => {
    const { data } = await supabase
      .from("forex_positions")
      .select("*")
      .eq("user_id", request.user!.id)
      .is("closed_at", null)
      .order("opened_at", { ascending: false });
    return { success: true, positions: data ?? [] };
  });

  fastify.post("/orders/:id/cancel", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { data: order, error: cancelError } = await supabase
      .from("forex_orders")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", id)
      .eq("user_id", request.user!.id)
      .in("status", ["pending", "submitted"])
      .select()
      .maybeSingle();
    if (cancelError) {
      logger.error({ err: cancelError.message }, "Forex order cancel failed");
      return reply.code(500).send({
        success: false,
        error: "The order could not be cancelled. It may still be pending.",
        code: "CANCEL_FAILED",
      });
    }
    if (!order) return reply.code(404).send({ success: false, error: "Order not found or already processed" });
    return { success: true, order };
  });

  fastify.post("/positions/:id/close", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    return closePosition(request, reply, id, 1);
  });

  fastify.post("/positions/:id/partial-close", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const schema = z.object({ lots: z.number().positive() });
    const parsed = schema.safeParse(request.body);
    if (!parsed.success) return bad(reply, "Enter a valid partial close size");
    return closePosition(request, reply, id, parsed.data.lots);
  });

  fastify.get("/transactions", { preHandler: [verifyAuth] }, async (request) => {
    const { data } = await supabase
      .from("forex_transactions")
      .select("*")
      .eq("user_id", request.user!.id)
      .order("created_at", { ascending: false })
      .limit(100);
    return { success: true, transactions: data ?? [] };
  });

  fastify.get("/analytics", { preHandler: [verifyAuth] }, async (request) => {
    const { data: closed } = await supabase
      .from("forex_positions")
      .select("*")
      .eq("user_id", request.user!.id)
      .not("closed_at", "is", null);

    const trades = closed ?? [];
    const wins = trades.filter((t) => Number(t.realized_pnl) > 0);
    const losses = trades.filter((t) => Number(t.realized_pnl) < 0);
    const grossProfit = wins.reduce((s, t) => s + Number(t.realized_pnl), 0);
    const grossLoss = Math.abs(losses.reduce((s, t) => s + Number(t.realized_pnl), 0));

    return {
      success: true,
      analytics: {
        totalTrades: trades.length,
        wins: wins.length,
        losses: losses.length,
        winRate: trades.length ? Number(((wins.length / trades.length) * 100).toFixed(1)) : 0,
        grossProfit: Number(grossProfit.toFixed(2)),
        grossLoss: Number(grossLoss.toFixed(2)),
        netPnl: Number((grossProfit - grossLoss).toFixed(2)),
        profitFactor: grossLoss > 0 ? Number((grossProfit / grossLoss).toFixed(2)) : null,
        averageWin: wins.length ? Number((grossProfit / wins.length).toFixed(2)) : 0,
        averageLoss: losses.length ? Number((grossLoss / losses.length).toFixed(2)) : 0,
      },
    };
  });

  /** Provider health for diagnostics; never exposes credentials. */
  fastify.get("/health", async () => ({
    success: true,
    provider: getMarketDataProvider().name,
    liveTradingEnabled: LIVE_TRADING_ENABLED,
    symbols: SYMBOLS.length,
  }));
};

async function closePosition(  request: FastifyRequest,
  reply: FastifyReply,
  positionId: string,
  fraction: number,
) {
  const userId = request.user!.id;
  const { data: position } = await supabase
    .from("forex_positions")
    .select("*")
    .eq("id", positionId)
    .eq("user_id", userId)
    .maybeSingle();
  if (!position) {
    return reply.code(404).send({ success: false, error: "Position not found" });
  }
  if (position.closed_at) {
    return reply.code(409).send({ success: false, error: "Position is already closed" });
  }

  const sym = await symbolForInstrument(position.instrument_id);
  const spec = sym ? getInstrument(sym) : undefined;
  if (!spec) return reply.code(400).send({ success: false, error: "Unknown instrument" });

  const remaining = Number(position.quantity);
  const closeLots = Number((remaining * fraction).toFixed(2));
  if (closeLots <= 0) return bad(reply, "Close amount must be greater than zero");
  if (closeLots > remaining) return bad(reply, "Cannot close more than the open position");

  let exitPrice: number;
  let q2k: number;
  try {
    const quote = await getQuote(spec.symbol);
    // Closing a long means selling into the bid; closing a short means buying
    // back at the ask. Using the bid for both systematically under-paid a
    // short position.
    exitPrice = position.side === "buy" ? quote.bid : quote.ask;
    q2k = await quoteToKes(spec);
  } catch {
    return reply.code(503).send({
      success: false,
      error: "Market data is currently unavailable. The position was not closed.",
      code: "MARKET_DATA_UNAVAILABLE",
    });
  }

  // The transaction, ledger entry, position close and margin release all happen
  // inside one database transaction, and the realised P/L is computed there from
  // the stored entry price — never accepted from this process.
  const { data: result, error: closeError } = await supabase.rpc("forex_close_position", {
    p_user_id: userId,
    p_position_id: positionId,
    p_close_lots: closeLots,
    p_exit_price: exitPrice,
    p_quote_to_kes: q2k,
  });

  if (closeError) {
    const reason = closeError.message ?? "";
    if (reason.includes("POSITION_NOT_FOUND")) {
      return reply.code(404).send({ success: false, error: "Position not found" });
    }
    if (reason.includes("POSITION_ALREADY_CLOSED")) {
      return reply.code(409).send({ success: false, error: "Position is already closed" });
    }
    if (reason.includes("OVER_CLOSE")) {
      return bad(reply, "Cannot close more than the open position");
    }
    logger.error({ err: reason }, "Forex close failed");
    return reply.code(500).send({
      success: false,
      error: "The position could not be closed. No balance was changed.",
      code: "EXECUTION_FAILED",
    });
  }

  const { data: updated } = await supabase
    .from("forex_positions")
    .select("*")
    .eq("id", positionId)
    .maybeSingle();

  return {
    success: true,
    position: updated,
    realizedPnl: Number(result?.realized_pnl ?? 0),
    exitPrice,
    balance: Number(result?.balance ?? 0),
    partial: !result?.closed,
  };
}
