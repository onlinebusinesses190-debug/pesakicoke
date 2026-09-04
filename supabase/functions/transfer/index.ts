import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── CORS Headers ────────────────────────────────────────────────────────
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Max-Age": "86400",
};

// ─── Main Handler ────────────────────────────────────────────────────────
serve(async (req) => {
  // ─── Handle CORS preflight (OPTIONS) ────────────────────────────────
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: corsHeaders,
    });
  }

  // ─── Only POST allowed ──────────────────────────────────────────────
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    // ─── Auth ──────────────────────────────────────────────────────────
    const authHeader = req.headers.get("Authorization");
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const token = authHeader.split(" ")[1];

    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Parse body ────────────────────────────────────────────────────
    const { amount, recipient } = await req.json();
    if (!amount || !recipient) {
      return new Response(JSON.stringify({ error: "Missing amount or recipient" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (isNaN(amount) || amount <= 0) {
      return new Response(JSON.stringify({ error: "Invalid amount" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Find recipient ────────────────────────────────────────────────
    const { data: recipientUser, error: findError } = await supabase
      .from("profiles")
      .select("id")
      .or(`email.eq.${recipient},phone.eq.${recipient}`)
      .single();

    if (findError || !recipientUser) {
      return new Response(JSON.stringify({ error: "Recipient not found" }), {
        status: 404,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Get sender wallet ─────────────────────────────────────────────
    const { data: senderWallet, error: senderError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", user.id)
      .single();

    if (senderError || !senderWallet) {
      return new Response(JSON.stringify({ error: "Sender wallet not found" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    if (senderWallet.balance < amount) {
      return new Response(JSON.stringify({ error: "Insufficient balance" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Deduct sender ──────────────────────────────────────────────────
    const { error: deductError } = await supabase
      .from("wallets")
      .update({ balance: senderWallet.balance - amount })
      .eq("user_id", user.id);

    if (deductError) {
      console.error("Deduct error:", deductError);
      return new Response(JSON.stringify({ error: "Deduction failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Credit recipient ──────────────────────────────────────────────
    const { data: recipientWallet, error: recipError } = await supabase
      .from("wallets")
      .select("balance")
      .eq("user_id", recipientUser.id)
      .single();

    if (recipError || !recipientWallet) {
      // Rollback sender
      await supabase
        .from("wallets")
        .update({ balance: senderWallet.balance })
        .eq("user_id", user.id);
      return new Response(JSON.stringify({ error: "Recipient wallet error" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const { error: creditError } = await supabase
      .from("wallets")
      .update({ balance: recipientWallet.balance + amount })
      .eq("user_id", recipientUser.id);

    if (creditError) {
      // Rollback sender
      await supabase
        .from("wallets")
        .update({ balance: senderWallet.balance })
        .eq("user_id", user.id);
      console.error("Credit error:", creditError);
      return new Response(JSON.stringify({ error: "Credit failed" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Log ledger entries ─────────────────────────────────────────────
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
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (err: any) {
    console.error("Transfer error:", err);
    return new Response(JSON.stringify({ error: err.message || "Internal server error" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
