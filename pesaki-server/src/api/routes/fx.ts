import { FastifyInstance } from "fastify";
import { z } from "zod";
import { verifyAuth } from "../../middleware/auth";
import { debit, credit } from "../../wallet/service";
import { logger } from "../../utils/logger";
import { createClient } from "@supabase/supabase-js";

// Service-role client for DB writes that bypass RLS (settle endpoint).
const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSupabase = createClient(supabaseUrl, supabaseServiceKey);

const PAYOUT = 0.5; // 50% on win (matches the "50% PAYOUT" badge on the trading floor)
// Win credit = stake + (stake * PAYOUT) = stake * 1.5 total returned.
// payout_amount stored on the row is the net profit portion (stake * PAYOUT).

const tradeSchema = z.object({
  pair: z.string().min(1),
  direction: z.enum(["buy", "sell"]),
  stake: z.number().positive(),
  duration: z.number().int().positive(),
  mode: z.enum(["real", "demo"]),
  entryPrice: z.number(),
});

export const fxRoutes = async (fastify: FastifyInstance) => {
  // ─── POST /games/fx/trade ──────────────────────────────────────────────
  fastify.post("/trade", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = tradeSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ success: false, error: "Invalid payload", code: "BAD_REQUEST" });
    }

    const { pair, direction, stake, duration, mode, entryPrice } = parsed.data;
    const userId = request.user!.id;

    try {
      // Deduct the stake first (real -> wallets.balance, demo -> demo_balance).
      const debitRes = await debit(userId, stake, mode, `Binary FX ${direction} on ${pair}`);
      if (!debitRes.success) {
        return reply.code(400).send({
          success: false,
          error: debitRes.error || "Insufficient funds",
          code: "INSUFFICIENT_FUNDS",
        });
      }

      const entryTime = new Date();
      const expiryTime = new Date(entryTime.getTime() + duration * 1000);

      const { data: trade, error: insertError } = await adminSupabase
        .from("fx_trades")
        .insert({
          user_id: userId,
          pair,
          direction,
          stake,
          entry_price: entryPrice,
          duration,
          mode,
          status: "pending",
          payout_amount: 0,
          entry_time: entryTime.toISOString(),
          expiry_time: expiryTime.toISOString(),
        })
        .select("*")
        .single();

      if (insertError || !trade) {
        logger.error(insertError, "fx_trades insert failed");
        // Refund the stake since the trade row was not persisted.
        await credit(userId, stake, mode, `Refund: Binary FX trade failed to save`);
        return reply
          .code(500)
          .send({ success: false, error: "Failed to save trade", code: "DB_ERROR" });
      }

      return reply.send({
        success: true,
        tradeId: trade.id,
        entryPrice: trade.entry_price,
        expiresAt: trade.expiry_time,
        newBalance: debitRes.newBalance,
      });
    } catch (err: any) {
      logger.error(err, "fx trade placement error");
      return reply
        .code(500)
        .send({
          success: false,
          error: err.message || "Internal server error",
          code: "INTERNAL_ERROR",
        });
    }
  });

  // ─── POST /games/fx/trade/:id/settle ────────────────────────────────────
  fastify.post("/trade/:id/settle", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { id } = request.params as { id: string };
    const { expiryPrice } = request.body as { expiryPrice: number };

    if (typeof expiryPrice !== "number" || !isFinite(expiryPrice)) {
      return reply
        .code(400)
        .send({ success: false, error: "expiryPrice must be a number", code: "BAD_REQUEST" });
    }

    const userId = request.user!.id;

    try {
      const { data: trade, error: fetchError } = await adminSupabase
        .from("fx_trades")
        .select("*")
        .eq("id", id)
        .eq("user_id", userId)
        .single();

      if (fetchError || !trade) {
        return reply
          .code(404)
          .send({ success: false, error: "Trade not found", code: "NOT_FOUND" });
      }

      if (trade.status !== "pending") {
        return reply.code(400).send({
          success: false,
          error: `Trade already ${trade.status}`,
          code: "ALREADY_SETTLED",
          outcome: trade.status,
          payoutAmount: trade.payout_amount,
        });
      }

      // BUY wins if expiry > entry. SELL wins if expiry < entry.
      const won =
        (trade.direction === "buy" && expiryPrice > trade.entry_price) ||
        (trade.direction === "sell" && expiryPrice < trade.entry_price);

      const stake = Number(trade.stake);
      let payoutAmount = 0;
      let newBalance: number | undefined;

      if (won) {
        // Credit stake + (stake * PAYOUT) back to the wallet/demo balance.
        // payout_amount stores the net profit portion (stake * PAYOUT).
        payoutAmount = Number((stake * PAYOUT).toFixed(2));
        const creditRes = await credit(
          userId,
          stake + payoutAmount,
          trade.mode as any,
          `Binary FX win on ${trade.pair}`,
        );
        if (!creditRes.success) {
          logger.error({ trade, expiryPrice }, "fx win credit failed");
          return reply
            .code(500)
            .send({ success: false, error: "Failed to credit win", code: "CREDIT_ERROR" });
        }
        newBalance = creditRes.newBalance;
      }

      const { error: updateError } = await adminSupabase
        .from("fx_trades")
        .update({
          status: won ? "won" : "lost",
          expiry_price: expiryPrice,
          payout_amount: payoutAmount,
        })
        .eq("id", id);

      if (updateError) {
        logger.error(updateError, "fx_trades settle update failed");
      }

      return reply.send({
        success: true,
        outcome: won ? "won" : "lost",
        payoutAmount,
        newBalance,
      });
    } catch (err: any) {
      logger.error(err, "fx trade settle error");
      return reply
        .code(500)
        .send({
          success: false,
          error: err.message || "Internal server error",
          code: "INTERNAL_ERROR",
        });
    }
  });

  // ─── GET /games/fx/trades ───────────────────────────────────────────────
  fastify.get("/trades", { preHandler: [verifyAuth] }, async (request, reply) => {
    const { mode, limit = 50 } = request.query as { mode?: string; limit?: number };
    const userId = request.user!.id;

    try {
      let query = adminSupabase
        .from("fx_trades")
        .select("*")
        .eq("user_id", userId)
        .order("entry_time", { ascending: false })
        .limit(Math.min(Number(limit) || 50, 200));

      if (mode === "real" || mode === "demo") {
        query = query.eq("mode", mode);
      }

      const { data, error } = await query;

      if (error) {
        logger.error(error, "fx_trades list failed");
        return reply.code(500).send({ success: false, error: "Database error", code: "DB_ERROR" });
      }

      return reply.send({ success: true, data: data || [] });
    } catch (err: any) {
      logger.error(err, "fx trades list error");
      return reply
        .code(500)
        .send({
          success: false,
          error: err.message || "Internal server error",
          code: "INTERNAL_ERROR",
        });
    }
  });
};
