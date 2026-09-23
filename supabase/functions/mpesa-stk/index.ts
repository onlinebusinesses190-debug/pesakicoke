// supabase/functions/mpesa-stk/index.ts
import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

// ─── Secrets (names without "SUPABASE_" prefix) ────────────────
const CONSUMER_KEY = Deno.env.get("DARAJA_CONSUMER_KEY")!;
const CONSUMER_SECRET = Deno.env.get("DARAJA_CONSUMER_SECRET")!;
const PASSKEY = Deno.env.get("DARAJA_PASSKEY")!;
const SHORTCODE = Deno.env.get("DARAJA_SHORTCODE")!;
const CALLBACK_URL = Deno.env.get("DARAJA_CALLBACK_URL")!;
const ENV = Deno.env.get("DARAJA_ENV") || "sandbox";

// ✅ Use automatically provided SUPABASE_URL
const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
// ✅ Custom secret name – not starting with "SUPABASE_"
const supabaseServiceKey = Deno.env.get("SERVICE_ROLE_KEY")!;

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
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), { status: 405 });
  }

  const authHeader = req.headers.get("Authorization");
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
  }
  const token = authHeader.split(" ")[1];

  const { data: { user }, error: userError } = await supabase.auth.getUser(token);
  if (userError || !user) {
    return new Response(JSON.stringify({ error: "Invalid token" }), { status: 401 });
  }

  const { amount, phone, userId } = await req.json();
  if (!amount || !phone || !userId) {
    return new Response(JSON.stringify({ error: "Missing required fields" }), { status: 400 });
  }

  if (user.id !== userId) {
    return new Response(JSON.stringify({ error: "User mismatch" }), { status: 403 });
  }

  try {
    const accessToken = await getAccessToken();

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
