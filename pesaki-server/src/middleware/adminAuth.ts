import { FastifyReply, FastifyRequest } from "fastify";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";

declare module "fastify" {
  interface FastifyRequest {
    adminUser?: { id: string; email?: string; role: string };
  }
}

export const verifyAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    const authHeader = request.headers.authorization;

    if (!authHeader) {
      logger.warn("No Authorization header provided");
      return reply
        .code(401)
        .send({ success: false, error: "Missing Authorization header", code: "MISSING_HEADER" });
    }

    if (!authHeader.startsWith("Bearer ")) {
      logger.warn("Invalid Authorization format");
      return reply
        .code(401)
        .send({
          success: false,
          error: "Invalid Authorization format (expected Bearer token)",
          code: "INVALID_FORMAT",
        });
    }

    const token = authHeader.slice(7);

    const {
      data: { user },
      error,
    } = await supabase.auth.getUser(token);

    if (error || !user) {
      logger.warn({ message: error?.message }, "Token verification failed");
      return reply
        .code(401)
        .send({ success: false, error: "Invalid or expired token", code: "UNAUTHORIZED" });
    }

    const { data: adminUser, error: adminError } = await supabase
      .from("admin_users")
      .select("id, email, role")
      .eq("id", user.id)
      .single();

    if (adminError || !adminUser) {
      logger.warn({ message: adminError?.message }, "Admin user not found");
      return reply
        .code(403)
        .send({
          success: false,
          error: "Access denied. Admin privileges required.",
          code: "FORBIDDEN",
        });
    }

    request.adminUser = { id: adminUser.id, email: adminUser.email, role: adminUser.role };
  } catch (error) {
    logger.error(error, "Admin auth middleware error");
    return reply
      .code(500)
      .send({
        success: false,
        error: "Internal server error during authentication",
        code: "INTERNAL_ERROR",
      });
  }
};
