import { FastifyInstance } from "fastify";
import { z } from "zod";
import { placeOrder, realizeGain } from "../../games/aviator/engine";
import { verifyAuth } from "../../middleware/auth";

const betSchema = z.object({
  amount: z.number().positive(),
  mode: z.enum(["real", "demo"]),
  slot: z.number().int().min(1).max(2).default(1),
});

export const aviatorRoutes = async (fastify: FastifyInstance) => {
  fastify.post("/bet", { preHandler: [verifyAuth] }, async (request, reply) => {
    const parsed = betSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply
        .code(400)
        .send({ success: false, error: "Invalid payload", code: "BAD_REQUEST" });
    }

    try {
      const result = await placeOrder(
        request.user!.id,
        parsed.data.amount,
        parsed.data.mode,
        parsed.data.slot,
      );
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message, code: "AVIATOR_ERROR" });
    }
  });

  // Explicit REST cashout — mirrors the zero-latency socket path but lets the
  // client specify which allocation slot to cash out.
  fastify.post("/cashout", { preHandler: [verifyAuth] }, async (request, reply) => {
    const body = request.body as { slot?: number };
    const slot = body?.slot === 2 ? 2 : 1;
    try {
      const result = await realizeGain(request.user!.id, slot);
      return reply.send({ success: true, data: result });
    } catch (err: any) {
      return reply.code(400).send({ success: false, error: err.message, code: "AVIATOR_ERROR" });
    }
  });

  // CASHOUT is also handled natively via Socket IO directly to reduce latency.
};
