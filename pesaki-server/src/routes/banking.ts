import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { calculateWithdrawalFee, MIN_DEPOSIT, MIN_WITHDRAWAL } from '../utils/fees';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const adminSupabase = require('@supabase/supabase-js').createClient(supabaseUrl, supabaseServiceKey);

// ─── M-Pesa Helpers (duplicated for banking isolation) ──────────────────────
interface AccessTokenResponse {
  access_token: string;
  expires_in: number;
}

interface STKPushPayload {
  BusinessShortCode: string;
  Password: string;
  Timestamp: string;
  TransactionType: string;
  Amount: number;
  PartyA: string;
  PartyB: string;
  PhoneNumber: string;
  CallBackURL: string;
  AccountReference: string;
  TransactionDesc: string;
}

interface STKPushResponse {
  MerchantRequestID: string;
  CheckoutRequestID: string;
  ResponseCode: string;
  ResponseDescription: string;
  CustomerMessage: string;
}

const isProduction = (): boolean => {
  const envMode = env.MPESA_ENV;
  return envMode === 'production' || envMode === 'LIVE';
};

const generateAccessToken = async (): Promise<string | null> => {
  try {
    const consumerKey = env.MPESA_CONSUMER_KEY;
    const consumerSecret = env.MPESA_CONSUMER_SECRET;
    if (!consumerKey || !consumerSecret) {
      logger.error('Missing M-Pesa consumer credentials');
      return null;
    }
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = isProduction() ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { Authorization: `Basic ${auth}` },
    });
    if (!response.ok) {
      const errorText = await response.text();
      logger.error({ status: response.status, error: errorText }, 'Failed to get M-Pesa access token');
      return null;
    }
    const data = (await response.json()) as AccessTokenResponse;
    if (!data.access_token) {
      logger.error('M-Pesa access token missing from response');
      return null;
    }
    return data.access_token;
  } catch (error) {
    logger.error(error, 'Error generating M-Pesa access token');
    return null;
  }
};

const generateTimestamp = (): string => {
  const now = new Date();
  const formatter = new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Africa/Nairobi',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
  });
  const parts = formatter.formatToParts(now);
  const values: Record<string, string> = {};
  for (const part of parts) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return values.year + values.month + values.day + values.hour + values.minute + values.second;
};

const normalizePhoneNumber = (phone: string): string => {
  let cleanPhone = phone.toString().replace(/\D/g, '');
  if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
  else if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) cleanPhone = '254' + cleanPhone;
  return cleanPhone;
};

const initiateBankingSTKPush = async (
  accessToken: string,
  amount: number,
  phoneNumber: string,
  userId: string,
  localRequestId: string
): Promise<STKPushResponse | null> => {
  try {
    const businessShortCode = env.MPESA_SHORTCODE || '4574053';
    const tillNumber = env.MPESA_TILL_NUMBER || '3240141';
    const passkey = env.MPESA_PASSKEY;
    if (!businessShortCode || !tillNumber || !passkey) {
      logger.error('Missing M-Pesa configuration: shortcode, till number, or passkey');
      return null;
    }
    const callbackBase = env.MPESA_CALLBACK_URL;
    if (!callbackBase) {
      logger.error('Missing MPESA_CALLBACK_URL');
      return null;
    }
    const trimmedBase = callbackBase.replace(/\/+$/, '');
    const callbackUrl = trimmedBase.endsWith('/api/p/banking/callback')
      ? trimmedBase
      : `${trimmedBase}/api/p/banking/callback`;
    const timestamp = generateTimestamp();
    const password = Buffer.from(`${businessShortCode}${passkey}${timestamp}`).toString('base64');
    const accountReference = `PESAKI${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`;
    const paymentAmount = Math.round(Number(amount));
    if (!Number.isFinite(paymentAmount) || paymentAmount <= 0) {
      logger.error({ amount }, 'Invalid M-Pesa payment amount');
      return null;
    }
    const payload: STKPushPayload = {
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
      TransactionDesc: 'Pesaki Pay',
    };
    logger.info({ amount: paymentAmount, phoneNumber, accountReference, callbackUrl, localRequestId }, 'Sending Banking M-Pesa STK Push');
    const baseUrl = isProduction() ? 'https://api.safaricom.co.ke' : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    const responseText = await response.text();
    let result: STKPushResponse;
    try {
      result = JSON.parse(responseText) as STKPushResponse;
    } catch {
      logger.error({ status: response.status, responseText, localRequestId }, 'Invalid response from M-Pesa');
      return null;
    }
    if (!response.ok || result.ResponseCode !== '0') {
      logger.error({ status: response.status, result, localRequestId }, 'M-Pesa STK Push failed');
      return null;
    }
    if (result.CheckoutRequestID) {
      const { error: updateError } = await adminSupabase
        .from('banking_deposits')
        .update({ checkout_request_id: result.CheckoutRequestID })
        .eq('checkout_request_id', localRequestId);
      if (updateError) {
        logger.error({ updateError, localRequestId, checkoutRequestId: result.CheckoutRequestID }, 'Failed to save banking CheckoutRequestID');
        return null;
      }
    }
    logger.info({ localRequestId, checkoutRequestId: result.CheckoutRequestID, merchantRequestId: result.MerchantRequestID }, 'Banking M-Pesa STK Push initiated');
    return result;
  } catch (error) {
    logger.error(error, 'Error initiating banking M-Pesa STK Push');
    return null;
  }
};

// ─── Palpluss Helper (duplicated for banking isolation) ─────────────────────
const callPalplussB2C = async (
  amount: number,
  phone: string,
  reference: string,
  callbackUrl: string
) => {
  const apiKey = env.PALPLUSS_API_KEY;
  const apiUrl = env.PALPLUSS_API_URL || 'https://api.palplus.com/v1';
  if (!apiKey) throw new Error('PALPLUSS_API_KEY environment variable is not set');
  const baseUrl = apiUrl.replace(/\/$/, '');
  const endpoint = `${baseUrl}/b2c/payouts`;
  const payload = {
    amount,
    phone,
    reference,
    description: 'Received from PESAKI',
    callbackUrl,
  };
  const authHeader = `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`;
  logger.info({ url: endpoint, auth: authHeader.slice(0, 20) + '...', body: payload }, 'PALPLUSS_B2C_REQUEST');
  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
      'Idempotency-Key': reference,
    },
    body: JSON.stringify(payload),
  });
  const responseText = await response.text();
  logger.info({ status: response.status, body: responseText }, 'PALPLUSS_B2C_RESPONSE');
  let data: any;
  try {
    data = JSON.parse(responseText);
  } catch {
    const err = new Error('Invalid response from Palpluss');
    (err as any).status = response.status;
    (err as any).responseBody = responseText;
    throw err;
  }
  if (!response.ok || !data.success) {
    const providerCode = data?.code || data?.error_code;
    const providerMessage = data?.message || data?.error_description || data?.description;
    logger.error({ status: response.status, reference, providerCode, providerMessage, data }, 'Palpluss B2C request failed');
    const err = new Error(providerMessage || 'Palpluss B2C request failed');
    (err as any).status = response.status;
    (err as any).providerCode = providerCode;
    (err as any).providerMessage = providerMessage;
    (err as any).responseBody = data;
    throw err;
  }
  return data.data;
};

// ─── Banking Routes ─────────────────────────────────────────────────────────
export const bankingRoutes = async (fastify: FastifyInstance) => {
  const ensureBankingWallet = async (userId: string) => {
    const { data, error } = await adminSupabase
      .from('banking_wallets')
      .select('id, balance, locked')
      .eq('user_id', userId)
      .maybeSingle();
    if (!error && data) return data;
    if (error && error.code !== 'PGRST116') throw error;
    const { data: created, error: createError } = await adminSupabase
      .from('banking_wallets')
      .insert({ user_id: userId, balance: 0, locked: 0 })
      .select('id, balance, locked')
      .single();
    if (createError) throw createError;
    return created;
  };

  const getUser = async (request: FastifyRequest, reply: FastifyReply) => {
    const token = request.headers.authorization?.replace('Bearer ', '');
    if (!token) return reply.status(401).send({ error: 'Unauthorized' });
    const { data: { user }, error: userError } = await adminSupabase.auth.getUser(token);
    if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });
    return user;
  };

  // 1. GET /banking/summary
  fastify.get('/banking/summary', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const wallet = await ensureBankingWallet(user.id);
      const { data: activeSavings } = await adminSupabase
        .from('locked_savings')
        .select('amount, apy, duration_months')
        .eq('user_id', user.id)
        .eq('status', 'active');
      const { data: activeInvestments } = await adminSupabase
        .from('investments')
        .select('amount, apy, duration_months')
        .eq('user_id', user.id)
        .eq('status', 'active');
      const totalLocked = Number(wallet.locked) || 0;
      const availableBalance = Number(wallet.balance) || 0;
      const totalSavings = availableBalance + totalLocked;
      let totalInterestEarned = 0;
      let totalProjectedAnnual = 0;
      const allActive = [...(activeSavings || []), ...(activeInvestments || [])];
      if (allActive.length > 0) {
        const avgApy = allActive.reduce((sum, item) => sum + Number(item.apy), 0) / allActive.length;
        totalProjectedAnnual = totalSavings * (avgApy / 100);
      }
      return reply.send({
        success: true,
        data: {
          totalSavings,
          interestEarned: totalInterestEarned,
          projectedAnnual: Math.round(totalProjectedAnnual),
          lockedTotal: totalLocked,
          availableBalance,
          avgApy: allActive.length > 0 ? Math.round(allActive.reduce((sum, item) => sum + Number(item.apy), 0) / allActive.length) : 0,
        },
      });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/summary');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 2. GET /banking/ledger
  fastify.get('/banking/ledger', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { data: entries, error } = await adminSupabase
        .from('banking_ledger')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return reply.send({ success: true, data: entries || [] });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/ledger');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 3. GET /banking/locked-savings
  fastify.get('/banking/locked-savings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { data: savings, error } = await adminSupabase
        .from('locked_savings')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('end_date', { ascending: true });
      if (error) throw error;
      return reply.send({ success: true, data: savings || [] });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/locked-savings');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // 4. POST /banking/lock-savings
  fastify.post('/banking/lock-savings', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount, durationMonths } = request.body as { amount: number; durationMonths: number };
      if (!amount || amount <= 0 || !durationMonths || ![1, 2, 3, 6, 12, 24].includes(durationMonths)) {
        return reply.status(400).send({ error: 'Invalid amount or duration. Allowed: 1,2,3,6,12,24 months' });
      }
      const wallet = await ensureBankingWallet(user.id);
      const balance = Number(wallet.balance) || 0;
      if (balance < amount) {
        return reply.status(400).send({ error: 'Insufficient banking balance', availableBalance: balance, requestedAmount: amount });
      }
      const interest = amount * (10 / 100) * (durationMonths / 12);
      const totalAtMaturity = amount + interest;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      const { data: lock, error: lockError } = await adminSupabase
        .from('locked_savings')
        .insert({
          user_id: user.id,
          amount,
          duration_months: durationMonths,
          apy: 10,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'active',
          interest_earned: interest,
          total_at_maturity: totalAtMaturity,
        })
        .select()
        .single();
      if (lockError) throw lockError;
      const newBalance = balance - amount;
      const currentLocked = Number(wallet.locked) || 0;
      await adminSupabase
        .from('banking_wallets')
        .update({ balance: newBalance, locked: currentLocked + amount })
        .eq('user_id', user.id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'savings_lock',
        mode: 'debit',
        description: `Locked KES ${amount} for ${durationMonths} months`,
        status: 'completed',
        reference: lock.id,
      });
      return reply.send({ success: true, data: lock });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/lock-savings');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 5. GET /banking/investments
  fastify.get('/banking/investments', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { data: investments, error } = await adminSupabase
        .from('investments')
        .select('*')
        .eq('user_id', user.id)
        .eq('status', 'active')
        .order('end_date', { ascending: true });
      if (error) throw error;
      return reply.send({ success: true, data: investments || [] });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/investments');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  })

  // 6. POST /banking/invest
  fastify.post('/banking/invest', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount, durationMonths } = request.body as { amount: number; durationMonths: number };
      if (!amount || amount <= 0 || ![12, 24].includes(durationMonths)) {
        return reply.status(400).send({ error: 'Invalid amount or duration. Allowed: 12 or 24 months' });
      }
      const wallet = await ensureBankingWallet(user.id);
      const balance = Number(wallet.balance) || 0;
      if (balance < amount) {
        return reply.status(400).send({ error: 'Insufficient banking balance', availableBalance: balance, requestedAmount: amount });
      }
      const interest = amount * (12 / 100) * (durationMonths / 12);
      const totalAtMaturity = amount + interest;
      const startDate = new Date();
      const endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
      const { data: investment, error: investError } = await adminSupabase
        .from('investments')
        .insert({
          user_id: user.id,
          amount,
          duration_months: durationMonths,
          apy: 12,
          start_date: startDate.toISOString(),
          end_date: endDate.toISOString(),
          status: 'active',
          interest_earned: interest,
          total_at_maturity: totalAtMaturity,
        })
        .select()
        .single();
      if (investError) throw investError;
      const newBalance = balance - amount;
      const currentLocked = Number(wallet.locked) || 0;
      await adminSupabase
        .from('banking_wallets')
        .update({ balance: newBalance, locked: currentLocked + amount })
        .eq('user_id', user.id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'investment',
        mode: 'debit',
        description: `Invested KES ${amount} for ${durationMonths} months`,
        status: 'completed',
        reference: investment.id,
      });
      return reply.send({ success: true, data: investment });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/invest');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 7. GET /banking/goals
  fastify.get('/banking/goals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { data: goals, error } = await adminSupabase
        .from('savings_goals')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false });
      if (error) throw error;
      return reply.send({ success: true, data: goals || [] });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/goals');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  })

  // 8. POST /banking/goals
  fastify.post('/banking/goals', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { name, targetAmount, apy } = request.body as { name: string; targetAmount: number; apy?: number };
      if (!name || !targetAmount || targetAmount <= 0) {
        return reply.status(400).send({ error: 'Invalid goal details' });
      }
      const { data: goal, error } = await adminSupabase
        .from('savings_goals')
        .insert({
          user_id: user.id,
          name,
          target_amount: targetAmount,
          saved_amount: 0,
          apy: apy || 8,
          status: 'active',
        })
        .select()
        .single();
      if (error) throw error;
      return reply.send({ success: true, data: goal });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/goals');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 9. POST /banking/goals/:id/fund
  fastify.post('/banking/goals/:id/fund', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { id } = request.params as { id: string };
      const { amount } = request.body as { amount: number };
      if (!amount || amount <= 0) return reply.status(400).send({ error: 'Invalid amount' });
      const wallet = await ensureBankingWallet(user.id);
      const balance = Number(wallet.balance) || 0;
      if (balance < amount) return reply.status(400).send({ error: 'Insufficient banking balance' });
      const { data: goal, error: goalError } = await adminSupabase
        .from('savings_goals')
        .select('saved_amount, target_amount')
        .eq('id', id)
        .eq('user_id', user.id)
        .single();
      if (goalError || !goal) return reply.status(404).send({ error: 'Goal not found' });
      const newSaved = Number(goal.saved_amount) + amount;
      if (newSaved > Number(goal.target_amount)) {
        return reply.status(400).send({ error: 'Funding would exceed target amount' });
      }
      await adminSupabase
        .from('savings_goals')
        .update({ saved_amount: newSaved })
        .eq('id', id);
      await adminSupabase
        .from('banking_wallets')
        .update({ balance: balance - amount })
        .eq('user_id', user.id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'goal_fund',
        mode: 'debit',
        description: `Funded goal: ${id}`,
        status: 'completed',
        reference: id,
      });
      return reply.send({ success: true, data: { saved_amount: newSaved } });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/goals/:id/fund');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 10. GET /banking/loans
  fastify.get('/banking/loans', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { data: loans, error } = await adminSupabase
        .from('loan_applications')
        .select('*')
        .eq('user_id', user.id)
        .order('applied_at', { ascending: false });
      if (error) throw error;
      return reply.send({ success: true, data: loans || [] });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/loans');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  })

  // 11. POST /banking/loans
  fastify.post('/banking/loans', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount, durationMonths, purpose } = request.body as { amount: number; durationMonths: number; purpose?: string };
      if (!amount || amount <= 0 || ![3, 6, 12, 24].includes(durationMonths)) {
        return reply.status(400).send({ error: 'Invalid loan details. Duration: 3,6,12,24 months' });
      }
      const { data: loan, error } = await adminSupabase
        .from('loan_applications')
        .insert({
          user_id: user.id,
          amount,
          duration_months: durationMonths,
          interest_rate: 20,
          purpose: purpose || '',
          status: 'pending',
          applied_at: new Date().toISOString(),
        })
        .select()
        .single();
      if (error) throw error;
      return reply.send({ success: true, data: loan });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/loans');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 12. POST /banking/deposit
  fastify.post('/banking/deposit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount, phone } = request.body as { amount: number; phone: string };
      if (!amount || amount <= 0 || amount < MIN_DEPOSIT) return reply.status(400).send({ error: `Minimum deposit amount is KES ${MIN_DEPOSIT}` });
      const cleanPhone = normalizePhoneNumber(phone);
      if (!/^254[71]\d{8}$/.test(cleanPhone)) {
        return reply.status(400).send({ error: 'Invalid Kenyan phone number. Use 07XXXXXXXX or 2547XXXXXXXX.' });
      }
      const localRequestId = `${user.id}_${Date.now()}`;
      const { error: insertError } = await adminSupabase
        .from('banking_deposits')
        .insert({
          user_id: user.id,
          phone: cleanPhone,
          amount: Math.round(amount),
          checkout_request_id: localRequestId,
          status: 'pending',
          created_at: new Date().toISOString(),
        });
      if (insertError) {
        logger.error({ insertError, userId: user.id }, 'Failed to save pending banking deposit');
        return reply.status(500).send({ error: 'Failed to initialize deposit' });
      }
      const accessToken = await generateAccessToken();
      if (!accessToken) return reply.status(500).send({ error: 'Failed to authenticate with M-Pesa' });
      const stkResult = await initiateBankingSTKPush(accessToken, amount, cleanPhone, user.id, localRequestId);
      if (!stkResult) {
        await adminSupabase.from('banking_deposits').update({ status: 'failed' }).eq('checkout_request_id', localRequestId);
        return reply.status(500).send({ error: 'Failed to initiate M-Pesa prompt' });
      }
      return reply.send({
        success: true,
        data: {
          checkoutRequestId: stkResult.CheckoutRequestID,
          merchantRequestId: stkResult.MerchantRequestID,
          customerMessage: stkResult.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
        },
      });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/deposit');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  })

  // 13. POST /api/p/banking/callback
  fastify.post('/api/p/banking/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body: any = request.body;
      logger.info({ body }, 'Banking M-Pesa callback received');
      const stkCallback = body?.Body?.stkCallback;
      if (!stkCallback) {
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = Number(stkCallback.ResultCode);
      const resultDesc = stkCallback.ResultDesc;
      if (!checkoutRequestId) {
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      if (resultCode !== 0) {
        await adminSupabase.from('banking_deposits').update({ status: 'failed' }).eq('checkout_request_id', checkoutRequestId);
        logger.info({ checkoutRequestId, resultCode, resultDesc }, 'Banking M-Pesa payment failed');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      const callbackMetadata = stkCallback.CallbackMetadata;
      let callbackAmount = 0;
      let mpesaReceipt = '';
      if (callbackMetadata && Array.isArray(callbackMetadata.Item)) {
        for (const item of callbackMetadata.Item) {
          if (item.Name === 'Amount') callbackAmount = Number(item.Value);
          if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value);
        }
      }
      const { data: deposit, error: depositError } = await adminSupabase
        .from('banking_deposits')
        .select('user_id, amount, status')
        .eq('checkout_request_id', checkoutRequestId)
        .single();
      if (depositError || !deposit) {
        logger.error({ checkoutRequestId, depositError }, 'Banking deposit record not found');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      if (deposit.status === 'completed') {
        logger.info({ checkoutRequestId }, 'Banking deposit already processed');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      const finalAmount = callbackAmount > 0 ? callbackAmount : Number(deposit.amount);
      if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
        logger.error({ checkoutRequestId, callbackAmount, depositAmount: deposit.amount }, 'Invalid payment amount in banking callback');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
      const wallet = await ensureBankingWallet(deposit.user_id);
      const currentBalance = Number(wallet.balance) || 0;
      await adminSupabase
        .from('banking_wallets')
        .update({ balance: currentBalance + finalAmount })
        .eq('user_id', deposit.user_id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: deposit.user_id,
        amount: finalAmount,
        type: 'deposit',
        mode: 'credit',
        description: `M-Pesa deposit: ${mpesaReceipt || checkoutRequestId}`,
        status: 'completed',
        reference: checkoutRequestId,
      });
      await adminSupabase
        .from('banking_deposits')
        .update({ status: 'completed', mpesa_receipt: mpesaReceipt || null })
        .eq('checkout_request_id', checkoutRequestId)
        .eq('status', 'pending');
      logger.info({ userId: deposit.user_id, amount: finalAmount, mpesaReceipt, checkoutRequestId }, 'Banking M-Pesa payment successful');
      return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (error) {
      logger.error(error, 'Error processing banking M-Pesa callback');
      return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
  })

  fastify.get('/banking/deposit/status/:checkoutRequestId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { checkoutRequestId } = request.params as { checkoutRequestId: string };
      const { data: deposit, error } = await adminSupabase
        .from('banking_deposits')
        .select('status, amount, phone')
        .eq('checkout_request_id', checkoutRequestId)
        .single();
      if (error || !deposit) {
        return reply.send({ data: { status: 'not_found' } });
      }
      return reply.send({ data: { status: deposit.status } });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/deposit/status/:checkoutRequestId');
      return reply.status(500).send({ data: { status: 'error' } });
    }
  })

  // 14. POST /banking/withdraw-to-wallet
  fastify.post('/banking/withdraw-to-wallet', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount } = request.body as { amount: number };
      if (!amount || amount <= 0) return reply.status(400).send({ error: 'Invalid amount' });
      const bankingWallet = await ensureBankingWallet(user.id);
      const bankingBalance = Number(bankingWallet.balance) || 0;
      if (bankingBalance < amount) return reply.status(400).send({ error: 'Insufficient banking balance' });
      await adminSupabase.from('banking_wallets').update({ balance: bankingBalance - amount }).eq('user_id', user.id);
      const { error: creditError } = await adminSupabase.rpc('credit_wallet', {
        p_user_id: user.id,
        p_amount: amount,
        p_mode: 'real',
        p_description: 'From Banking Hub',
      });
      if (creditError) {
        await adminSupabase.from('banking_wallets').update({ balance: bankingBalance }).eq('user_id', user.id);
        return reply.status(500).send({ error: 'Failed to credit general wallet' });
      }
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'withdraw_to_wallet',
        mode: 'debit',
        description: `Withdrawn KES ${amount} to general wallet`,
        status: 'completed',
      });
      return reply.send({ success: true, message: 'Withdrawn to wallet successfully' });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/withdraw-to-wallet');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 15. POST /banking/fund-from-wallet
  fastify.post('/banking/fund-from-wallet', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount } = request.body as { amount: number };
      if (!amount || amount <= 0) return reply.status(400).send({ error: 'Invalid amount' });
      const { data: generalWallet, error: walletError } = await adminSupabase.from('wallets').select('balance').eq('user_id', user.id).single();
      if (walletError && walletError.code !== 'PGRST116') throw walletError;
      const generalBalance = Number(generalWallet?.balance) || 0;
      if (generalBalance < amount) return reply.status(400).send({ error: 'Insufficient general wallet balance' });
      const { error: debitError } = await adminSupabase.rpc('debit_wallet', {
        p_user_id: user.id,
        p_amount: amount,
        p_mode: 'real',
        p_description: 'To Banking Hub',
      });
      if (debitError) return reply.status(500).send({ error: 'Failed to debit general wallet' });
      const bankingWallet = await ensureBankingWallet(user.id);
      const bankingBalance = Number(bankingWallet.balance) || 0;
      await adminSupabase.from('banking_wallets').update({ balance: bankingBalance + amount }).eq('user_id', user.id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'fund_from_wallet',
        mode: 'credit',
        description: `Funded from general wallet KES ${amount}`,
        status: 'completed',
      });
      return reply.send({ success: true, message: 'Funded from wallet successfully' });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/fund-from-wallet');
      return reply.status(500).send({ error: error.message || 'Internal server error' });
    }
  })

  // 16. POST /banking/withdraw-to-mpesa
  fastify.post('/banking/withdraw-to-mpesa', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const user = await getUser(request, reply);
      if (!user || reply.statusCode !== 200) return;
      const { amount, phone } = request.body as { amount: number; phone: string };
      if (!amount || amount <= 0) return reply.status(400).send({ error: 'Invalid amount' });
      const digits = phone.replace(/\D/g, '');
      if (!digits || digits.length < 10) return reply.status(400).send({ error: 'Invalid phone number' });
      const bankingWallet = await ensureBankingWallet(user.id);
      const bankingBalance = Number(bankingWallet.balance) || 0;
      if (bankingBalance < amount) return reply.status(400).send({ error: 'Insufficient banking balance' });
      if (amount < MIN_WITHDRAWAL) return reply.status(400).send({ error: `Minimum withdrawal amount is KES ${MIN_WITHDRAWAL}` });
      const fee = calculateWithdrawalFee(amount);
      const payoutAmount = Math.max(0, amount - fee);
      if (payoutAmount < 10) return reply.status(400).send({ error: 'After fee deduction, payout must be at least KES 10' });
      const reference = `WD-BANK-${user.id.slice(0, 8)}-${Date.now()}`;
      const callbackBase = env.MPESA_CALLBACK_URL || 'https://pesaki-server.onrender.com';
      const callbackUrl = `${callbackBase.replace(/\/$/, '')}/api/webhooks/palpluss`;
      try {
        await callPalplussB2C(payoutAmount, digits, reference, callbackUrl);
      } catch (apiError: any) {
        return reply.status(500).send({
          success: false,
          error: 'Withdrawal provider rejected the payout',
          status: apiError.status,
          providerCode: apiError.providerCode,
          providerMessage: apiError.providerMessage,
          responseBody: apiError.responseBody,
        });
      }
      await adminSupabase.from('banking_wallets').update({ balance: bankingBalance - amount }).eq('user_id', user.id);
      await adminSupabase.from('banking_ledger').insert({
        user_id: user.id,
        amount,
        type: 'withdrawal',
        mode: 'debit',
        description: `Banking withdrawal to M-Pesa: ${reference} (Fee: ${fee}, Payout: ${payoutAmount})`,
        status: 'completed',
        reference,
      });
      return reply.send({
        success: true,
        data: { reference, status: 'completed', fee, payoutAmount, message: 'Withdrawal successful.' },
      });
    } catch (error: any) {
      logger.error(error, 'Error in /banking/withdraw-to-mpesa');
      return reply.status(500).send({ error: 'Internal server error' });
    }
  })
};
