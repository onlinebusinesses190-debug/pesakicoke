// supabase/functions/mpesa-stk/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ─── Environment Secrets (set in Supabase Dashboard) ──────────────
const CONSUMER_KEY = Deno.env.get("DARAJA_CONSUMER_KEY")!;
const CONSUMER_SECRET = Deno.env.get("DARAJA_CONSUMER_SECRET")!;
const PASSKEY = Deno.env.get("DARAJA_PASSKEY")!;
const SHORTCODE = Deno.env.get("DARAJA_SHORTCODE")!;
const CALLBACK_URL = Deno.env.get("DARAJA_CALLBACK_URL")!; // e.g., https://pesaki-server.onrender.com/api/mpesa/callback
const ENV = Deno.env.get("DARAJA_ENV") || "sandbox";

// ─── Supabase Admin Client (for DB updates) ──────────────────────
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

// ─── Daraja API endpoints ────────────────────────────────────────
const getTokenUrl = ENV === "production"
  ? "https://api.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials"
  : "https://sandbox.safaricom.co.ke/oauth/v1/generate?grant_type=client_credentials";

const stkPushUrl = ENV === "production"
  ? "https://api.safaricom.co.ke/mpesa/stkpush/v1/processrequest"
  : "https://sandbox.safaricom.co.ke/mpesa/stkpush/v1/processrequest";

// ─── Helper: Get OAuth Token ────────────────────────────────────
async function getAccessToken(): Promise<string> {
  const auth = btoa(`${CONSUMER_KEY}:${CONSUMER_SECRET}`);
  const res = await fetch(getTokenUrl, {
    headers: { Authorization: `Basic ${auth}` },
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`Token error: ${data.errorMessage || 'Unknown'}`);
  return data.access_token;
}

// ─── Main handler ────────────────────────────────────────────────
serve(async (req) => {
  // Only allow POST
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  // Check authorization (user must be authenticated)
  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const token = authHeader.split(" ")[1];

  // Validate the user's token with Supabase
  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  // Parse request body
  const { amount, phone, userId } = await req.json();
  if (!amount || !phone || !userId) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  // Ensure userId matches the authenticated user
  if (user.id !== userId) {
    return new Response(JSON.stringify({ error: "User mismatch" }), { status: 403 });
  }

  try {
    // 1. Get access token
    const accessToken = await getAccessToken();

    // 2. Prepare STK request
    const timestamp = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14);
    const password = btoa(`${SHORTCODE}${PASSKEY}${timestamp}`);

    const stkBody = {
      BusinessShortCode: SHORTCODE,
      Password: password,
      Timestamp: timestamp,
      TransactionType: "CustomerPayBillOnline",
      Amount: amount,
      PartyA: phone,
      PartyB: SHORTCODE,
      PhoneNumber: phone,
      CallBackURL: CALLBACK_URL,
      AccountReference: `PESAKI-${userId.slice(0, 8)}`,
      TransactionDesc: `PESAKI deposit ${amount} KES`,
    };

    const stkRes = await fetch(stkPushUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(stkBody),
    });

    const stkData = await stkRes.json();

    if (!stkRes.ok || stkData.ResponseCode !== "0") {
      throw new Error(stkData.ResponseDescription || "STK push failed");
    }

    // 3. Record deposit in mpesa_deposits table
    const { error: insertErr } = await supabase
      .from("mpesa_deposits")
      .insert({
        user_id: userId,
        amount: amount,
        phone: phone,
        checkout_request_id: stkData.CheckoutRequestID,
        status: "pending",
        created_at: new Date().toISOString(),
      });

    if (insertErr) throw insertErr;

    // 4. Return success
    return new Response(JSON.stringify({
      success: true,
      checkout_request_id: stkData.CheckoutRequestID,
      message: "STK push initiated",
    }), { status: 200 });

  } catch (error: any) {
    console.error("Error in mpesa-stk:", error);
    return new Response(JSON.stringify({
      success: false,
      error: error.message || "Internal server error",
    }), { status: 500 });
  }
});
