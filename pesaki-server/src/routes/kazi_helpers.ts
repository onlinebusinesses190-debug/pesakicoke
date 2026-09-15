// M-Pesa access token + STK Push helpers (isolated from the wallet deposit flow)
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

const isProduction = (): boolean => {
  const envMode = process.env.MPESA_ENV;
  return envMode === 'production' || envMode === 'LIVE';
};

export async function generateKaziAccessToken(): Promise<string | null> {
  const consumerKey = process.env.MPESA_CONSUMER_KEY;
  const consumerSecret = process.env.MPESA_CONSUMER_SECRET;
  if (!consumerKey || !consumerSecret) {
    console.error('Missing M-Pesa consumer credentials');
    return null;
  }
  const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
  const baseUrl = isProduction() ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  try {
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) {
      console.error('Failed to get M-Pesa access token', response.status);
      return null;
    }
    const data = (await response.json()) as { access_token: string };
    return data.access_token || null;
  } catch (err) {
    console.error('Error generating M-Pesa access token', err);
    return null;
  }
}

export function generateKaziTimestamp(): string {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return values.year + values.month + values.day + values.hour + values.minute + values.second;
}

export async function initiateKaziSTKPush(
  accessToken: string,
  amount: number,
  phoneNumber: string,
  userId: string,
  _localRequestId: string
): Promise<{ CheckoutRequestID: string; MerchantRequestID: string; CustomerMessage: string } | null> {
  const businessShortCode = process.env.MPESA_SHORTCODE || '4574053';
  const tillNumber = process.env.MPESA_TILL_NUMBER || '3240141';
  const passkey = process.env.MPESA_PASSKEY;
  const callbackBase = process.env.MPESA_CALLBACK_URL;

  if (!businessShortCode || !tillNumber || !passkey) {
    console.error('Missing M-Pesa configuration');
    return null;
  }
  if (!callbackBase) {
    console.error('Missing MPESA_CALLBACK_URL');
    return null;
  }

  const trimmedBase = callbackBase.replace(/\/+$/, '');
  const callbackUrl = trimmedBase.endsWith('/api/kazi/mpesa/job-payment-callback')
    ? trimmedBase
    : `${trimmedBase}/api/kazi/mpesa/job-payment-callback`;

  const timestamp = generateKaziTimestamp();
  const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');
  const accountReference = `PESAKI${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`;
  const paymentAmount = Math.round(Number(amount));

  const payload = {
    BusinessShortCode: businessShortCode,
    Password: password,
    Timestamp: timestamp,
    TransactionType: 'CustomerBuyGoodsOnline',
    Amount: paymentAmount,
    PartyA: phoneNumber,
    PartyB: tillNumber,
    PhoneNumber: phoneNumber,
    CallBackURL: callbackUrl,
    AccountReference: accountReference,
    TransactionDesc: 'PESAKI KAZI Job Payment',
  };

  const baseUrl = isProduction() ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
  try {
    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    const responseText = await response.text();
    let result: any;
    try {
      result = JSON.parse(responseText);
    } catch {
      console.error('Invalid response received from M-Pesa', { status: response.status, responseText });
      return null;
    }

    if (!response.ok || result.ResponseCode !== '0') {
      console.error('M-Pesa rejected STK Push', result);
      return null;
    }

    return {
      CheckoutRequestID: result.CheckoutRequestID,
      MerchantRequestID: result.MerchantRequestID,
      CustomerMessage: result.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
    };
  } catch (err) {
    console.error('Error initiating M-Pesa STK Push', err);
    return null;
  }
}

export async function debitKaziSource(
  source: 'wallet' | 'banking',
  userId: string,
  amount: number
): Promise<{ success: boolean; error?: string }> {
  if (amount <= 0) return { success: false, error: 'Amount must be greater than zero' };

  if (source === 'wallet') {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError) return { success: false, error: walletError.message };
    if (!wallet || Number(wallet.balance) < amount) {
      return { success: false, error: 'Insufficient wallet balance' };
    }

    const { data: newBalance, error: debitError } = await supabase.rpc('debit_wallet', {
      p_user_id: userId,
      p_amount: amount,
      p_mode: 'real',
      p_description: `KAZI Link job post payment`,
    });

    if (debitError || newBalance === null) {
      return { success: false, error: debitError?.message || 'Insufficient funds' };
    }

    return { success: true };
  }

  // banking hub
  const { data: bankWallet, error: bankError } = await supabase
    .from('banking_wallets')
    .select('balance')
    .eq('user_id', userId)
    .maybeSingle();

  if (bankError) return { success: false, error: bankError.message };
  if (!bankWallet || Number(bankWallet.balance) < amount) {
    return { success: false, error: 'Insufficient Banking Hub balance' };
  }

  const { error: updateError } = await supabase
    .from('banking_wallets')
    .update({ balance: Number(bankWallet.balance) - amount })
    .eq('user_id', userId);

  if (updateError) return { success: false, error: updateError.message };

  await supabase.from('banking_ledger').insert({
    user_id: userId,
    amount,
    type: 'kazi_job_post',
    mode: 'debit',
    description: `KAZI Link job post payment`,
    status: 'completed',
    reference: null,
    created_at: new Date().toISOString(),
  });

  return { success: true };
}