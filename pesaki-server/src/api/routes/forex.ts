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
  marginForLots,
  marginState,
  minTradeAmount,
  sizeFromTradeAmount,
  settlementLegs,
  validateLots,
  validateStopLoss,
  validateTakeProfit,
  validateTradeAmount,
} from "../../services/forex/risk";
import { reserveMargin, settleReal } from "../../services/forex/walletBridge";
import { ensureWalletExists, releaseLockedFunds } from "../../wallet/service";

const DEMO_START_BALANCE = 100_000;
const COMMISSION_RATE = 0.005; // 0.5% PESAKI Commission

const REAL_TRADING_ENABLED = process.env.PESAKI_FX_REAL_ENABLED === "true";

export const FX_ERRORS = {
  INVALID_ORDER: 400,
  UNAUTHORIZED: 401,
  ACCOUNT_DISABLED: 403,
  MARKET_UNAVAILABLE: 409,
  INVALID_POSITION_SIZE: 422,
  INVALID_PRICE: 422,
  INSUFFICIENT_BALANCE: 403,
  INSUFFICIENT_MARGIN: 403,
  NOT_FOUND: 404,
  CONFLICT: 409,
  INTERNAL: 500,
} as const;

export type FxErrorCode = keyof typeof FX_ERRORS;

class ForexError extends Error {
  readonly statusCode: number;

  constructor(
    readonly code: FxErrorCode,
    message: string,
    readonly detail?: Record<string, unknown>,
  ) {
    super(message);
    this.name = "ForexError";
    this.statusCode = FX_ERRORS[code] ?? 500;
  }
}

/** KES value of one unit of the instrument's quote currency. */
const quoteToKes = (instrument: InstrumentSpec): number => kesPerUnit(instrument.quote);

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

  if (accountType === "live" && !REAL_TRADING_ENABLED) {
    throw new ForexError(
      "ACCOUNT_DISABLED",
      "Real-money forex trading is not enabled on this deployment.",
      { mode: "live" },
    );
  }

  const { data: created, error: insertError } = await supabase
    .from("forex_accounts")
    .insert({
      user_id: userId,
      account_type: accountType,
      currency: "KES",
      balance: accountType === "demo" ? DEMO_START_BALANCE : 0,
      equity: accountType === "demo" ? DEMO_START_BALANCE : 0,
      leverage: configuredLeverage(),
      status: "active",
    })
    .select()
    .single();
  if (insertError) throw insertError;
  return created;
}

async function releaseReservation(
  userId: string,
  mode: "demo" | "live",
  margin: number,
  reason: string,
): Promise<void> {
  if (mode !== "live" || margin <= 0) return;
  try {
    await releaseLockedFunds(userId, margin, true);
  } catch (err) {
    logger.error({ err, userId, margin, reason }, "Forex margin release failed — needs reconciliation");
  }
}

const orderSchema = z.object({
  symbol: z.enum(SYMBOLS as [string, ...string[]]),
  side: z.enum(["buy", "sell"]),
  trade_amount: z.number().positive().optional(),
  lots: z.number().positive().optional(),
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

  // ─── Market ─────────────────────────────────────────────────────────────────
  fastify.get("/market", async () => {
    const engine = getEngine();
    return { success: true, market: engine.describe() };
  });

  // ─── KES exchange rates ────────────────────────────────────────────────────
  fastify.get("/rates", async () => {
    return { success: true, usdToKes: kesPerUnit("USD") };
  });

  // ─── Quotes ────────────────────────────────────────────────────────────────
  fastify.get("/quotes", async (request, reply) => {
    const { symbols } = request.query as { symbols?: string };
    const list = (symbols ? symbols.split(",") : SYMBOLS).map((s) => s.toUpperCase());
    const engine = getEngine();
    const quotes: Quote[] = engine.quoteAll(list);
    if (quotes.length === 0) {
      return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({
        success: false,
        error: "No supported pairs were requested.",
        code: "MARKET_UNAVAILABLE",
      });
    }
    return {
      success: true,
      quotes,
      watch: Object.fromEntries(quotes.map((q) => [q.symbol, engine.dailyChange(q.symbol)])),
      state: engine.state,
    };
  });

  fastify.get("/quote/:symbol", async (request, reply) => {
    const { symbol } = request.params as { symbol: string };
    if (!getInstrument(symbol.toUpperCase())) {
      return bad(reply, "Unsupported symbol");
    }
    try {
      return { success: true, quote: getEngine().quote(symbol.toUpperCase()) };
    } catch (err) {
      logger.error({ err: (err as Error).message }, "Forex quote failed");
      return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({
        success: false,
        error: "Market price is currently unavailable.",
        code: "MARKET_UNAVAILABLE",
      });
    }
  });

  // ─── Candles ───────────────────────────────────────────────────────────────
  fastify.get("/candles", async (request, reply) => {
    const { symbol, interval, count } = request.query as {
      symbol?: string;
      interval?: string;
      count?: string;
    };
    const sym = (symbol ?? "").toUpperCase();
    if (!sym || !getInstrument(sym)) {
      return bad(reply, "A valid symbol is required, e.g. ?symbol=EUR%2FUSD");
    }
    const iv = ((interval ?? "5m") as Interval) in INTERVALS ? ((interval ?? "5m") as Interval) : "5m";
    const n = Math.min(Math.max(Number(count) || 120, 1), 1000);

    try {
      const candles: Candle[] = getEngine().getCandles(sym, iv, n);
      return {
        success: true,
        symbol: sym,
        interval: iv,
        provider: "pesaki-engine",
        candles: candles.map((c) => ({
          time: c.timestamp,
          timestamp: c.timestamp,
          open: c.open,
          high: c.high,
          low: c.low,
          close: c.close,
          tickVolume: c.tickVolume,
        })),
      };
    } catch (err) {
      logger.error({ err: (err as Error).message, symbol: sym }, "Forex candles failed");
      return reply.code(FX_ERRORS.MARKET_UNAVAILABLE).send({
        success: false,
        error: "Chart data is currently unavailable.",
        code: "MARKET_UNAVAILABLE",
      });
    }
  });

  fastify.get("/candles/*", async (_request, reply) =>
    reply.code(FX_ERRORS.INVALID_ORDER).send({
      success: false,
      error: "Use /forex/candles?symbol=EUR%2FUSD&interval=5m&count=120",
      code: "INVALID_ORDER",
    }),
  );

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
      const enriched = [];
      const marked: { id: string; price: number; q2k: number }[] = [];
      for (const p of positions ?? []) {
        const sym = await symbolForInstrument(p.instrument_id);
        const spec = sym ? getInstrument(sym) : undefined;
        if (!spec) {
          enriched.push(p);
          continue;
        }
        try {
          const quote = getEngine().quote(spec.symbol);
          const mid = quote.mid;
          const q2k = quoteToKes(spec);
          const pnl = computePnl({
            side: p.side,
            lots: Number(p.quantity),
            entryPrice: Number(p.average_entry_price),
            exitPrice: mid,
            instrument: spec,
            quoteToKes: q2k,
          });
          unrealised += pnl;
          marked.push({ id: p.id, price: mid, q2k });
          enriched.push({ ...p, current_price: mid, unrealised_pnl: pnl });
        } catch {
          enriched.push({ ...p, unrealised_pnl: 0, priceStatus: "unavailable" });
        }
      }

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

      const isLive = accountType === "live";
      let balance: number;
      let walletLocked = 0;
      let walletBalance = 0;

      if (isLive) {
        const { data: wallet, error: walletError } = await supabase
          .from("wallets")
          .select("balance, locked")
          .eq("user_id", request.user!.id)
          .maybeSingle();
        if (walletError) {
          logger.error({ err: walletError.message }, "Forex account: wallet read failed");
          return reply.code(500).send({
            success: false,
            error: "Could not read your PESAKI wallet balance.",
            code: "WALLET_UNAVAILABLE",
          });
        }
        walletBalance = Number(wallet?.balance ?? 0);
        walletLocked = Number(wallet?.locked ?? 0);
        balance = walletBalance;
      } else {
        balance = Number(account.balance ?? 0);
      }

      const effectiveUsedMargin = Number(account.used_margin ?? 0);
      const state = marginState(balance, unrealised, effectiveUsedMargin);
      const availableBalance = isLive
        ? Math.max(0, walletBalance - walletLocked)
        : Math.max(0, state.equity - effectiveUsedMargin);

      const { data: ledger } = await supabase
        .from("forex_transactions")
        .select("*")
        .eq("account_id", account.id)
        .order("created_at", { ascending: false })
        .limit(5);

      return {
        success: true,
        account: {
          id: account.id,
          account_type: account.account_type,
          leverage: Number(account.leverage ?? 1),
          status: account.status,
          balanceSource: isLive ? "pesaki_wallet" : "forex_demo_account",
          walletBalance,
          walletLocked,
          unrealized_pnl: unrealised,
          availableBalance,
          minTradeAmount: minTradeAmount(),
          ...state,
        },
        positions: enriched,
        recentTransactions: ledger ?? [],
        realTradingEnabled: REAL_TRADING_ENABLED,
      };
    } catch (err) {
      if (err instanceof ForexError) {
        if (err.statusCode >= 500) {
          logger.error({ err: err.message, code: err.code }, "Forex account load failed");
        }
        return reply.code(err.statusCode).send({
          success: false,
          error: err.message,
          code: err.code,
        });
      }

      logger.error({ err }, "Forex account load failed");
      return reply.code(500).send({
        success: false,
        error: "Could not load your Forex account.",
        code: "INTERNAL",
      });
    }
  });

  // ─── Deposit funds ───────────────────────────────────────────────────────────
  fastify.post("/deposit", { preHandler: [verifyAuth] }, async (request, reply) => {
    const MIN_DEPOSIT = 100;
    const MAX_DEPOSIT = 10_000;

    const parsed = z
      .object({
        amount: z.number().positive(),
        account_type: z.enum(["demo", "live"]).default("demo"),
      })
      .safeParse(request.body);

    if (!parsed.success) return bad(reply, "Invalid deposit details");
    const { amount, account_type } = parsed.data;
    const userId = request.user!.id;

    if (amount < MIN_DEPOSIT) return bad(reply, `Minimum deposit is KSh ${MIN_DEPOSIT}`, 400);
    if (amount > MAX_DEPOSIT) return bad(reply, `Maximum deposit is KSh ${MAX_DEPOSIT}`, 400);
    if (account_type === "live" && !REAL_TRADING_ENABLED) return bad(reply, "Real-money trading is not enabled on this deployment.", 403);

    if (account_type === "demo") {
      const account = await getOrCreateAccount(userId, "demo");
      const balance = Number((Number(account.balance ?? 0) + amount).toFixed(4));
      const { error: updateError } = await supabase
        .from("forex_accounts")
        .update({ balance, equity: balance, updated_at: new Date().toISOString() })
        .eq("id", account.id)
        .eq("user_id", userId);
      if (updateError) {
        logger.error({ err: updateError.message, userId, amount }, "Forex demo deposit failed");
        return reply.code(500).send({ success: false, error: "Could not deposit funds.", code: "INTERNAL" });
      }

      await supabase.from("forex_transactions").insert({
        user_id: userId,
        account_id: account.id,
        type: "deposit",
        amount,
        balance_after: balance,
        status: "completed",
        reference: `demo-deposit:${userId}:${amount}`,
        note: `Demo deposit KSh ${amount}`,
      });

      return { success: true, mode: "demo", amount, balance };
    }

    const wallet = await ensureWalletExists(userId);
    const newBalance = Number(wallet.balance ?? 0) + amount;
    const { error: creditError } = await supabase
      .from("wallets")
      .update({ balance: newBalance })
      .eq("user_id", userId);
    if (creditError) {
      logger.error({ err: creditError.message, userId, amount }, "Forex real deposit failed");
      return reply.code(500).send({ success: false, error: "Could not deposit funds.", code: "INTERNAL" });
    }

    await supabase.from("wallet_ledger").insert({
      user_id: userId,
      amount,
      type: "deposit",
      mode: "credit",
      description: `Forex deposit KSh ${amount}`,
    });

    let account = await getOrCreateAccount(userId, "live");
    await supabase
      .from("forex_accounts")
      .update({ balance: newBalance, equity: newBalance, updated_at: new Date().toISOString() })
      .eq("id", account.id)
      .eq("user_id", userId);

    return { success: true, mode: "live", amount, balance: newBalance };
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
      const q2k = quoteToKes(spec);
      const preview = calculatePositionSize({
        balance,
        riskPercent: risk_percent,
        entryPrice: entry_price,
        stopLossPrice: stop_loss,
        instrument: spec,
        quoteToKes: q2k,
      });
      const quote = getEngine().quote(symbol);
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
    const spec = getInstrument(body.symbol);
    if (!spec) return bad(reply, "This instrument is not available");

    if (body.account_type === "live" && !REAL_TRADING_ENABLED) {
      return bad(reply, "Live trading is currently unavailable. Use Demo trading.", 403);
    }

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
      quote = getEngine().quote(body.symbol);
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

    const q2k = quoteToKes(spec);
    const leverage = configuredLeverage();
    const isPending = ["limit", "stop", "stop_limit"].includes(body.order_type);

    // ─── FIX: FETCH EXACT WALLET BALANCE FOR LIVE ───
    let freeMargin = 0;
    if (body.account_type === "live") {
      const { data: wallet } = await supabase
        .from("wallets")
        .select("balance, locked")
        .eq("user_id", userId)
        .maybeSingle();
      const walletBalance = Number(wallet?.balance ?? 0);
      const walletLocked = Number(wallet?.locked ?? 0);
      freeMargin = walletBalance - walletLocked;
      
      logger.info({ userId, walletBalance, walletLocked, freeMargin }, "Forex Live Order: Wallet Check");
    } else {
      freeMargin = Number(account.equity ?? account.balance ?? 0) - Number(account.used_margin ?? 0);
    }

    // ─── CONVERT USD TO KES FOR SIZING ───
    const tradeAmountUsd = body.trade_amount || 0;
    const tradeAmountKes = tradeAmountUsd * q2k; 

    const sizing = (() => {
      if (body.trade_amount != null) {
        return sizeFromTradeAmount({
          tradeAmount: tradeAmountKes,
          entryPrice: entry,
          instrument: spec,
          quoteToKes: q2k,
          leverage,
        });
      }
      const lots = body.lots!;
      return {
        tradeAmount: 0,
        exposure: lots * spec.contractSize * entry * q2k,
        units: lots * spec.contractSize,
        margin: marginForLots(lots, entry, spec, q2k, 100 / leverage),
        lots,
        notionalPerLot: spec.contractSize * entry * q2k,
      };
    })();

    if (body.trade_amount != null) {
      const amountCheck = validateTradeAmount(tradeAmountKes, freeMargin);
      if (!amountCheck.ok) return bad(reply, amountCheck.error!);
    } else {
      const lotsCheck = validateLots(body.lots!, spec);
      if (!lotsCheck.ok) return bad(reply, lotsCheck.error!);
      if (sizing.margin > freeMargin) {
        return bad(
          reply,
          `Order rejected: insufficient free margin. You have KSh ${freeMargin.toFixed(2)} available, but need KSh ${sizing.margin.toFixed(2)}.`,
        );
      }
    }

    if (isPending) {
      // A pending order reserves no margin, so it is not exposure yet.
    } else {
      const { data: config } = await supabase
        .from("forex_market_config")
        .select("max_exposure_per_account, max_exposure_per_symbol, max_total_exposure")
        .eq("id", 1)
        .maybeSingle();

      const { data: openPositions } = await supabase
        .from("forex_positions")
        .select("instrument_id, quantity, average_entry_price, quote_to_kes")
        .eq("account_id", account.id)
        .is("closed_at", null);

      let accountExposure = 0;
      let symbolExposure = 0;
      for (const p of openPositions ?? []) {
        const notional = Number(p.quantity) * spec.contractSize * Number(p.average_entry_price) * Number(p.quote_to_kes ?? q2k);
        accountExposure += notional;
        if (p.instrument_id === instrumentRow.id) symbolExposure += notional;
      }

      const proposed = accountExposure + sizing.exposure;
      const perAccount = Number(config?.max_exposure_per_account ?? 0);
      const perSymbol = Number(config?.max_exposure_per_symbol ?? 0);
      const total = Number(config?.max_total_exposure ?? 0);

      if (perAccount > 0 && proposed > perAccount) {
        return bad(reply, `Order rejected: this would raise your exposure to KSh ${proposed.toFixed(2)}, above the per-account limit of KSh ${perAccount.toFixed(2)}.`);
      }
      if (perSymbol > 0 && symbolExposure + sizing.exposure > perSymbol) {
        return bad(reply, `Order rejected: this would exceed the exposure limit for ${spec.symbol}.`);
      }
      if (total > 0) {
        const { data: allOpen } = await supabase
          .from("forex_positions")
          .select("quantity, average_entry_price, quote_to_kes")
          .is("closed_at", null);
        let platformExposure = 0;
        for (const p of allOpen ?? []) {
          platformExposure += Number(p.quantity) * spec.contractSize * Number(p.average_entry_price) * Number(p.quote_to_kes ?? q2k);
        }
        if (platformExposure + sizing.exposure > total) {
          return bad(reply, "Order rejected: platform exposure limit reached. Please try again later.");
        }
      }
    }

    const executedPrice = body.side === "buy" ? quote.ask : quote.bid;
    const slippage = Number((executedPrice - quote.mid).toFixed(spec.digits));

    // ── REAL: reserve margin and deduct commission ────────────
    let reserved = false;
    if (!isPending) {
      
      // DEDUCT 0.5% OPENING COMMISSION (Calculated in USD, converted to KES)
      let commissionKes = 0;
      if (body.account_type === "live" && tradeAmountUsd > 0) {
        const commissionUsd = tradeAmountUsd * COMMISSION_RATE; 
        commissionKes = commissionUsd * q2k; 
        
        const { error: commError } = await supabase.rpc('debit_wallet', {
          p_user_id: userId,
          p_amount: commissionKes,
          p_mode: 'live',
          p_description: `Forex Opening Commission (0.5%)`
        });
        if (commError) {
          logger.error({ err: commError.message, userId }, "Failed to deduct opening commission");
          return bad(reply, "Could not deduct trading commission. Please try again.");
        }
      }

      const totalToReserveKes = sizing.margin + commissionKes;

      const reservation = await reserveMargin(
        userId,
        body.account_type,
        totalToReserveKes, 
        `${spec.symbol}:${body.side}:${body.idempotency_key ?? Date.now()}`,
      );
      if (!reservation.ok) {
        // Refund the commission if margin fails
        if (commissionKes > 0) {
          await supabase.rpc('credit_wallet', {
            p_user_id: userId,
            p_amount: commissionKes,
            p_mode: 'live',
            p_description: `Refund Commission - Margin Failed`
          });
        }
        return reply.code(FX_ERRORS.INSUFFICIENT_BALANCE).send({
          success: false,
          error: reservation.reason ?? "Insufficient funds to open this position.",
          code: "INSUFFICIENT_FUNDS",
        });
      }
      reserved = true;
    }

    // Execution runs entirely inside one database transaction
    const { data: result, error: execError } = await supabase.rpc("forex_open_market_position", {
      p_user_id: userId,
      p_account_id: account.id,
      p_instrument_id: instrumentRow.id,
      p_order_type: body.order_type,
      p_side: body.side,
      p_quantity: sizing.lots,
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
      if (reserved) {
        await releaseReservation(userId, body.account_type, sizing.margin, "open failed");
        if (body.account_type === "live" && tradeAmountUsd > 0) {
           await supabase.rpc('credit_wallet', {
            p_user_id: userId,
            p_amount: tradeAmountUsd * COMMISSION_RATE * q2k,
            p_mode: 'live',
            p_description: `Refund Commission - Execution Failed`
          });
        }
        reserved = false;
      }

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
      if (reserved) {
        await releaseReservation(userId, body.account_type, sizing.margin, "idempotent replay");
        if (body.account_type === "live" && tradeAmountUsd > 0) {
           await supabase.rpc('credit_wallet', {
            p_user_id: userId,
            p_amount: tradeAmountUsd * COMMISSION_RATE * q2k,
            p_mode: 'live',
            p_description: `Refund Commission - Idempotent`
          });
        }
      }
      const { data: existing } = await supabase
        .from("forex_orders")
        .select("*")
        .eq("id", result.order_id)
        .maybeSingle();
      return { success: true, order: existing, idempotent: true };
    }

    const [{ data: orderRow }, { data: positionRow }] = await Promise.all([
      supabase.from("forex_orders").select("*").eq("id", result.order_id).maybeSingle(),
      result.position_id ? supabase.from("forex_positions").select("*").eq("id", result.position_id).maybeSingle() : Promise.resolve({ data: null }),
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
    const { mode } = request.query as { mode?: string };
    const accountType = mode === "live" ? "live" : "demo";

    const { data: account } = await supabase
      .from("forex_accounts")
      .select("id")
      .eq("user_id", request.user!.id)
      .eq("account_type", accountType)
      .maybeSingle();

    if (!account) return { success: true, positions: [] };

    const { data } = await supabase
      .from("forex_positions")
      .select("*")
      .eq("account_id", account.id)
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
      return reply.code(500).send({ success: false, error: "The order could not be cancelled.", code: "CANCEL_FAILED" });
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

  fastify.post("/account/reset-demo", { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    const { data: account, error } = await supabase
      .from("forex_accounts")
      .select("id")
      .eq("user_id", userId)
      .eq("account_type", "demo")
      .maybeSingle();

    if (error || !account) {
      return reply.code(FX_ERRORS.NOT_FOUND).send({ success: false, error: "No demo account to reset.", code: "NOT_FOUND" });
    }

    const { data: open } = await supabase
      .from("forex_positions")
      .select("id")
      .eq("account_id", account.id)
      .is("closed_at", null);

    for (const p of open ?? []) {
      await supabase
        .from("forex_positions")
        .update({ closed_at: new Date().toISOString(), close_reason: "reset", updated_at: new Date().toISOString() })
        .eq("id", p.id);
    }

    const { error: resetError } = await supabase
      .from("forex_accounts")
      .update({ balance: DEMO_START_BALANCE, equity: DEMO_START_BALANCE, used_margin: 0, updated_at: new Date().toISOString() })
      .eq("id", account.id);

    if (resetError) {
      logger.error({ userId, err: resetError.message }, "Demo reset failed");
      return reply.code(FX_ERRORS.INTERNAL).send({ success: false, error: "Could not reset the demo account.", code: "INTERNAL" });
    }

    logger.info({ userId, closedPositions: open?.length ?? 0 }, "Forex demo account reset");
    return { success: true, balance: DEMO_START_BALANCE };
  });

  fastify.get("/history", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { mode, limit } = request.query as { mode?: string; limit?: string };
    const accountType = mode === "live" ? "live" : "demo";
    const userId = request.user!.id;
    const n = Math.min(Math.max(Number(limit) || 100, 1), 500);

    let accountId: string | null = null;
    {
      const { data: acct } = await supabase
        .from("forex_accounts")
        .select("id")
        .eq("user_id", userId)
        .eq("account_type", accountType)
        .maybeSingle();
      accountId = acct?.id ?? null;
    }

    if (!accountId) return { success: true, history: [], account_type: accountType };

    const [{ data: positions, error: posErr }, { data: orders, error: ordErr }] = await Promise.all([
      supabase.from("forex_positions").select("id,instrument_id,side,quantity,average_entry_price,closed_at,opened_at,realized_pnl,close_reason").eq("account_id", accountId).not("closed_at", "is", null).order("closed_at", { ascending: false }).limit(n),
      supabase.from("forex_orders").select("id,instrument_id,side,quantity,order_type,status,reject_reason,created_at").eq("account_id", accountId).in("status", ["pending", "cancelled", "rejected", "expired"]).order("created_at", { ascending: false }).limit(n),
    ]);

    if (posErr || ordErr) {
      logger.error({ userId, mode: accountType, posErr: posErr?.message, ordErr: ordErr?.message }, "Forex history query failed");
      return reply.code(FX_ERRORS.INTERNAL).send({ success: false, error: "Trade history is temporarily unavailable.", code: "INTERNAL" });
    }

    const enriched: Record<string, unknown>[] = [];
    for (const p of positions ?? []) {
      const symbol = await symbolForInstrument(p.instrument_id);
      enriched.push({ id: p.id, kind: "position", mode: accountType, symbol, side: p.side, quantity: Number(p.quantity), entry: Number(p.average_entry_price), exit: null, pnl: Number(p.realized_pnl ?? 0), status: "closed", closeReason: p.close_reason ?? "manual", openedAt: p.opened_at, closedAt: p.closed_at });
    }
    for (const o of orders ?? []) {
      const symbol = await symbolForInstrument(o.instrument_id);
      enriched.push({ id: o.id, kind: "order", mode: accountType, symbol, side: o.side, quantity: Number(o.quantity), orderType: o.order_type, entry: null, exit: null, pnl: 0, status: o.status, reason: o.reject_reason, openedAt: o.created_at, closedAt: o.created_at });
    }

    enriched.sort((a, b) => new Date(String(b.closedAt)).getTime() - new Date(String(a.closedAt)).getTime());

    return { success: true, mode: accountType, history: enriched.slice(0, n) };
  });

  fastify.get("/health", async () => ({
    success: true,
    market: getEngine().describe(),
    realTradingEnabled: REAL_TRADING_ENABLED,
    symbols: SYMBOLS.length,
  }));

  fastify.get("/diagnostics", { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user!.id;
    const required = ["forex_accounts", "forex_instruments", "forex_orders", "forex_positions", "forex_fills", "forex_transactions", "forex_market_config", "forex_symbol_state"];
    const requiredFns = ["forex_open_market_position", "forex_close_position", "forex_recalculate_equity", "forex_account_upnl"];

    const problems: string[] = [];
    const { data: tables, error: tableErr } = await supabase.from("information_schema.tables").select("table_name").eq("table_schema", "public").in("table_name", required);
    if (tableErr) return reply.code(500).send({ success: false, error: tableErr.message, code: "DIAGNOSTICS_FAILED" });

    const present = new Set((tables ?? []).map((t: { table_name: string }) => t.table_name));
    const missingTables = required.filter((t) => !present.has(t));
    if (missingTables.length) problems.push(`Missing tables: ${missingTables.join(", ")}`);

    const { data: routines } = await supabase.from("information_schema.routines").select("routine_name").eq("routine_schema", "public").in("routine_name", requiredFns);
    const presentFns = new Set((routines ?? []).map((r: { routine_name: string }) => r.routine_name));
    const missingFns = requiredFns.filter((f) => !presentFns.has(f));
    if (missingFns.length) problems.push(`Missing database functions: ${missingFns.join(", ")}. Apply the Forex migrations in supabase/migrations.`);

    const { data: accounts, error: acctErr } = await supabase.from("forex_accounts").select("id, account_type, balance, equity, used_margin, leverage, status").eq("user_id", userId);
    if (acctErr) problems.push(`forex_accounts unreadable: ${acctErr.message}`);

    return reply.code(200).send({
      success: true,
      requiredFunctions: requiredFns,
      missingTables,
      problems,
      accounts: accounts ?? [],
      leverageDefault: configuredLeverage(),
      minTradeAmount: minTradeAmount(),
      realTradingEnabled: REAL_TRADING_ENABLED,
    });
  });
};

async function closePosition(
  request: FastifyRequest,
  reply: FastifyReply,
  positionId: string,
  fraction: number,
) {
  const userId = request.user!.id;
  const { data: position } = await supabase.from("forex_positions").select("*").eq("id", positionId).eq("user_id", userId).maybeSingle();
  if (!position) return reply.code(404).send({ success: false, error: "Position not found" });
  if (position.closed_at) return reply.code(409).send({ success: false, error: "Position is already closed" });

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
    const quote = getEngine().quote(spec.symbol);
    exitPrice = position.side === "buy" ? quote.bid : quote.ask;
    q2k = quoteToKes(spec);
  } catch {
    return reply.code(503).send({ success: false, error: "Market data is currently unavailable. The position was not closed.", code: "MARKET_DATA_UNAVAILABLE" });
  }

  const { data: result, error: closeError } = await supabase.rpc("forex_close_position", {
    p_user_id: userId,
    p_position_id: positionId,
    p_close_lots: closeLots,
    p_exit_price: exitPrice,
    p_quote_to_kes: q2k,
  });

  if (closeError) {
    const reason = closeError.message ?? "";
    if (reason.includes("POSITION_NOT_FOUND")) return reply.code(404).send({ success: false, error: "Position not found" });
    if (reason.includes("POSITION_ALREADY_CLOSED")) return reply.code(409).send({ success: false, error: "Position is already closed" });
    if (reason.includes("OVER_CLOSE")) return bad(reply, "Cannot close more than the open position");
    logger.error({ err: reason }, "Forex close failed");
    return reply.code(500).send({ success: false, error: "The position could not be closed. No balance was changed.", code: "EXECUTION_FAILED" });
  }

  const { data: updated } = await supabase.from("forex_positions").select("*").eq("id", positionId).maybeSingle();

  const { data: accountRow } = await supabase.from("forex_accounts").select("account_type").eq("id", position.account_id).maybeSingle();
  const positionMode = (accountRow?.account_type === "live" ? "live" : "demo") as "live" | "demo";

  if (positionMode === "live") {
    const closedFraction = remaining > 0 ? closeLots / remaining : 1;
    const releasedMargin = Number((Number(position.margin ?? 0) * closedFraction).toFixed(4));
    const legs = settlementLegs({
      side: position.side,
      units: closeLots * spec.contractSize,
      entryPrice: Number(position.average_entry_price),
      exitPrice,
      quoteToKes: q2k,
      margin: releasedMargin,
    });

    // DEDUCT 0.5% CLOSING COMMISSION
    const closingCommissionKes = releasedMargin * COMMISSION_RATE; 
    
    const netProfitAfterCommission = legs.profit - legs.loss - closingCommissionKes;

    const settlement = await settleReal(
      userId,
      legs.marginRelease,
      netProfitAfterCommission,
      `close:${positionId}`,
    );
    
    if (!settlement.ok) {
      logger.error({ userId, positionId, releasedMargin, reason: settlement.reason }, "Forex settlement failed after close — needs reconciliation");
      return reply.code(502).send({
        success: false,
        error: "The position was closed but the wallet settlement did not complete. Support has been notified.",
        code: "SETTLEMENT_PENDING",
        position: updated,
      });
    }
  }

  return {
    success: true,
    position: updated,
    realizedPnl: Number(result?.realized_pnl ?? 0),
    exitPrice,
    balance: Number(result?.balance ?? 0),
    partial: !result?.closed,
  };
}
