import { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";
import { supabase } from "../lib/supabase";
import { logger } from "../utils/logger";

export default async function userRoutes(server: FastifyInstance) {
  logger.info("✅ userRoutes loaded");

  // ─── DELETE /user/delete-account ───────────────────────────────────────
  // GDPR: Anonymize user data and ban the auth account.
  server.delete("/user/delete-account", async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.replace("Bearer ", "");
    if (!token) return reply.status(401).send({ error: "Unauthorized: No token" });

    try {
      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: "Invalid token" });

      const userId = user.id;

      // 1. Anonymize profile
      const anonymizedEmail = `deleted_user_${userId.slice(0, 8)}@pesaki.co.ke`;
      const anonymizedPhone = "0000000000";
      const anonymizedName = "Deleted User";

      await supabase
        .from("profiles")
        .update({
          full_name: anonymizedName,
          email: anonymizedEmail,
          phone: anonymizedPhone,
          date_of_birth: null,
          kyc_status: "deleted",
          banned: true,
          updated_at: new Date().toISOString(),
        })
        .eq("id", userId);

      // 2. Anonymize wallets (zero out balances, mark as deleted)
      await supabase
        .from("wallets")
        .update({
          balance: 0,
          demo_balance: 0,
          locked: 0,
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // 3. Anonymize wallet_ledger entries
      await supabase
        .from("wallet_ledger")
        .update({
          description: "Anonymized",
          user_id: userId, // keep for aggregation but no PII
        })
        .eq("user_id", userId);

      // 4. Anonymize mpesa_deposits
      await supabase
        .from("mpesa_deposits")
        .update({
          phone: anonymizedPhone,
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // 5. Anonymize transactions
      await supabase
        .from("transactions")
        .update({
          description: "Anonymized",
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // 6. Anonymize kazi applications
      await supabase
        .from("applications")
        .update({
          applicant_name: anonymizedName,
          phone: anonymizedPhone,
          email: anonymizedEmail,
          deleted_at: new Date().toISOString(),
        })
        .eq("worker_id", userId);

      // 7. Anonymize kazi job_contracts
      await supabase
        .from("job_contracts")
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("worker_id", userId)
        .or(`employer_id.eq.${userId}`);

      // 8. Anonymize notifications
      await supabase.from("notifications").delete().eq("user_id", userId);

      // 9. Anonymize messages
      await supabase
        .from("messages")
        .delete()
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`);

      // 10. Anonymize savings_goals
      await supabase.from("savings_goals").delete().eq("user_id", userId);

      // 11. Anonymize business_applications
      await supabase
        .from("business_applications")
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // 12. Anonymize business_investments
      await supabase
        .from("business_investments")
        .update({
          deleted_at: new Date().toISOString(),
        })
        .eq("user_id", userId);

      // 13. Ban the user in Supabase Auth (prevents further access)
      try {
        await supabase.auth.admin.updateUserById(userId, { ban_duration: "infinite" });
      } catch (banErr: any) {
        logger.warn({ err: banErr, userId }, "Failed to ban user in Supabase Auth (continuing)");
      }

      // 14. Log to admin_audit_log
      try {
        await supabase.from("admin_audit_log").insert({
          admin_id: userId,
          action: "user_self_delete",
          target_id: userId,
          target_type: "user",
          metadata: JSON.stringify({
            reason: "GDPR right to erasure (self-service)",
            timestamp: new Date().toISOString(),
          }),
        });
      } catch (logErr: any) {
        logger.warn({ err: logErr }, "Failed to log deletion to admin_audit_log");
      }

      logger.info({ userId }, "User account anonymized and banned (GDPR deletion)");

      return reply.send({
        success: true,
        message: "Your account and personal data have been deleted.",
      });
    } catch (err: any) {
      logger.error({ err }, "Delete account failed");
      return reply.status(500).send({ error: err.message || "Internal server error" });
    }
  });
}
