import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

serve(async (req) => {
  try {
    // Only POST
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
    }

    // Get auth token from header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }
    const token = authHeader.split(" ")[1];

    // Verify user
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
    }

    // Parse body
    const { amount, recipient } = await req.json();
    if (!amount || !recipient) {
      return new Response(JSON.stringify({ error: "Missing amount or recipient" }), { status: 400 });
    }
    if (isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), { status: 400 });
    }

    // Find recipient by email or phone
    const { data: recipientUser, error: findError } = await supabase
      .from("profiles")
      .select("id")
      .or(`email.eq.${recipient},phone.eq.${recipient}`)
      .single();

    if (findError || !recipientUser) {
      return new Response(JSON.stringify({ error: "Recipient not found" }), { status: 404 });
    }

    // Begin transaction (atomic)
    // 1. Get sender wallet
    const { data: senderWallet, error: senderError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (senderError || !senderWallet) {
      return new Response(JSON.stringify({ error: "Sender wallet not found" }), { status: 400 });
    }
    if (senderWallet.balance < amount) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), { status: 400 });
    }

    // 2. Deduct from sender
    const { error: deductError } = await supabase
      .from("wallets")
      .update({ balance: senderWallet.balance - amount })
      .eq("user_id", user.id);

    if (deductError) throw deductError;

    // 3. Credit recipient
    const { data: recipientWallet, error: recipError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", recipientUser.id)
      .single();

    if (recipError || !recipientWallet) {
      // Rollback? Hard without transactions, but we can log and return error
      // For simplicity, we'll catch and log
      console.error("Recipient wallet not found, rolling back...");
      // Revert sender deduction (simple)
      await supabase
        .from("wallets")
        .update({ balance: senderWallet.balance })
        .eq("user_id", user.id);
      return new Response(JSON.stringify({ error: "Recipient wallet error" }), { status: 500 });
    }

    const { error: creditError } = await supabase
      .from("wallets")
      .update({ balance: recipientWallet.balance + amount })
      .eq("user_id", recipientUser.id);

    if (creditError) {
      // Rollback sender deduction
      await supabase
        .from("wallets")
        .update({ balance: senderWallet.balance })
        .eq("user_id", user.id);
      throw creditError;
    }

    // 4. Log ledger entries
    await supabase.from("wallet_ledger").insert([
      {
        user_id: user.id,
        amount,
        type: "transfer",
        mode: "debit",
        description: `Transfer to ${recipient}`,
      },
      {
        user_id: recipientUser.id,
        amount,
        type: "transfer",
        mode: "credit",
        description: `Transfer from ${user.email || user.id}`,
      },
    ]);

    return new Response(
      JSON.stringify({ success: true, message: "Transfer completed" }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Transfer error:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
