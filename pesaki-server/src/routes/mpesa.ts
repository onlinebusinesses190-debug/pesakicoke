import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { credit } from '../wallet/service';
import { supabase } from '../lib/supabase';

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

// ─── Generate OAuth token ──────────────────────────────────────────────
const generateAccessToken = async (): Promise<string | null> => {
  try {
    const consumerKey = env.MPESA_CONSUMER_KEY;
    const consumerSecret = env.MPESA_CONSUMER_SECRET;
    if (!consumerKey || !consumerSecret) {
      logger.error('Missing M-Pesa credentials');
      return null;
    }
    const auth = Buffer.from(`${consumerKey}:${consumerSecret}`).toString('base64');
    const baseUrl = env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}/oauth/v1/generate?grant_type=client_credentials`, {
      method: 'GET',
      headers: { 'Authorization': `Basic ${auth}` },
    });
    if (!response.ok) {
      logger.error({ status: response.status }, 'Failed to get access token');
      return null;
    }
    const data = (await response.json()) as AccessTokenResponse;
    return data.access_token;
  } catch (error) {
    logger.error(error, 'Error generating access token');
    return null;
  }
};

const initiateSTKPush = async (
  accessToken: string,
  amount: number,
  phoneNumber: string,
  userId: string,
  checkoutRequestId: string
): Promise<boolean> => {
  try {
    const shortcode = '4574053';              // ✅ Your app shortcode (for auth & password)
    const tillNumber = '5710970';             // ✅ Your Till number (destination)
    const passkey = env.MPESA_PASSKEY;        // Passkey for the shortcode
    const callbackBase = env.MPESA_CALLBACK_URL || '';
    let callbackUrl = callbackBase.replace(/\/+$/, '') + '/api/mpesa/callback';

    if (!shortcode || !passkey || !callbackUrl) {
      logger.error('Missing M-Pesa configuration');
      return false;
    }

    const timestamp = new Date()
      .toISOString()
      .replace(/[-:.TZ]/g, '')
      .slice(0, 14);

    // ✅ Password uses the shortcode + passkey
    const passwordString = `${shortcode}${passkey}${timestamp}`;
    const password = Buffer.from(passwordString).toString('base64');

    const payload: STKPushPayload = {
      BusinessShortCode: shortcode,            // ✅ Shortcode (4574053)
      Password: password,
      Timestamp: timestamp,
      TransactionType: 'CustomerBuyGoodsOnline', // ✅ Till transaction
      Amount: Math.round(amount),
      PartyA: phoneNumber,
      PartyB: tillNumber,                      // ✅ Till number (5710970)
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: `PESAKI-${userId.slice(0, 8)}`,
      TransactionDesc: 'Pesaki Deposit',
    };

    const baseUrl = env.MPESA_ENV === 'production'
      ? 'https://api.safaricom.co.ke'
      : 'https://sandbox.safaricom.co.ke';
    const response = await fetch(`${baseUrl}/mpesa/stkpush/v1/processrequest`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${accessToken}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorData = await response.text();
      logger.error({ status: response.status, errorData, checkoutRequestId }, 'STK Push request failed');
      return false;
    }

    const result = (await response.json()) as STKPushResponse;
    if (result.ResponseCode !== '0') {
      logger.warn({ result, checkoutRequestId }, `STK Push failed: ${result.ResponseDescription}`);
      return false;
    }

    logger.info({ checkoutRequestId }, 'STK Push initiated successfully');
    return true;
  } catch (error) {
    logger.error(error, 'Error initiating STK Push');
    return false;
  }
};

export const mpesaRoutes = async (fastify: FastifyInstance) => {
  // ─── /api/p/deposit ──────────────────────────────────────────────────
  fastify.post('/api/p/deposit', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = request.body as any;
      const { amount, phone, userId } = body;

      if (!amount || !phone || !userId) {
        logger.warn({ body }, 'Missing required fields');
        return reply.code(400).send({
          success: false,
          error: 'Missing required fields: amount, phone, userId'
        });
      }
      if (isNaN(amount) || amount <= 0) {
        return reply.code(400).send({
          success: false,
          error: 'Amount must be a positive number'
        });
      }

      let cleanPhone = phone.toString().replace(/\D/g, '');
      if (cleanPhone.startsWith('0')) cleanPhone = '254' + cleanPhone.slice(1);
      else if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;

      logger.info({ amount, cleanPhone, userId }, 'Deposit request received');

      const accessToken = await generateAccessToken();
      if (!accessToken) {
        return reply.code(500).send({ success: false, error: 'Failed to authenticate with M-Pesa' });
      }

      const checkoutRequestId = `${userId}_${Date.now()}`;

      const { error: insertError } = await supabase.from('mpesa_deposits').insert({
        user_id: userId,
        phone: cleanPhone,
        amount,
        checkout_request_id: checkoutRequestId,
        status: 'pending',
        created_at: new Date().toISOString(),
      });

      if (insertError) {
        logger.error({ insertError, userId }, 'Failed to save pending deposit');
        return reply.code(500).send({ success: false, error: 'Failed to initialize deposit' });
      }

      const stkSuccess = await initiateSTKPush(accessToken, amount, cleanPhone, userId, checkoutRequestId);
      if (!stkSuccess) {
        await supabase
          .from('mpesa_deposits')
          .update({ status: 'failed' })
          .eq('checkout_request_id', checkoutRequestId);
        return reply.code(500).send({ success: false, error: 'Failed to initiate M-Pesa prompt' });
      }

      return reply.code(200).send({
        success: true,
        data: { checkoutRequestId, message: 'STK Push sent. Check your phone.' },
      });
    } catch (error) {
      logger.error(error, 'Error in deposit initiation');
      return reply.code(500).send({ success: false, error: 'Internal server error' });
    }
  });

  // ─── /api/mpesa/callback ─────────────────────────────────────────────
  fastify.post('/api/mpesa/callback', async (request: FastifyRequest, reply: FastifyReply) => {
    const body: any = request.body;
    logger.info({ body }, 'M-Pesa callback received');

    try {
      const stkCallback = body?.Body?.stkCallback;
      if (!stkCallback) {
        logger.warn('Missing stkCallback');
        return reply.code(200).send({ success: true });
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;

      if (!checkoutRequestId) {
        logger.warn('Missing CheckoutRequestID');
        return reply.code(200).send({ success: true });
      }

      if (resultCode !== 0) {
        await supabase
          .from('mpesa_deposits')
          .update({ status: 'failed' })
          .eq('checkout_request_id', checkoutRequestId);
        logger.info({ checkoutRequestId, resultCode, resultDesc }, 'M-Pesa payment failed');
        return reply.code(200).send({ success: true });
      }

      const callbackMetadata = stkCallback.CallbackMetadata;
      let amount = 0;
      let mpesaReceipt = '';
      if (callbackMetadata && callbackMetadata.Item) {
        callbackMetadata.Item.forEach((item: any) => {
          if (item.Name === 'Amount') amount = item.Value;
          if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = item.Value;
        });
      }

      const { data: deposit, error: depositError } = await supabase
        .from('mpesa_deposits')
        .select('user_id, status')
        .eq('checkout_request_id', checkoutRequestId)
        .single();

      if (depositError || !deposit) {
        logger.error({ checkoutRequestId }, 'Deposit record not found');
        return reply.code(200).send({ success: true });
      }

      if (deposit.status === 'completed') {
        logger.info({ checkoutRequestId }, 'Deposit already processed');
        return reply.code(200).send({ success: true });
      }

      await supabase
        .from('mpesa_deposits')
        .update({ status: 'completed' })
        .eq('checkout_request_id', checkoutRequestId);

      const userId = deposit.user_id;
      const creditResult = await credit(userId, amount, 'real', `M-Pesa deposit: ${mpesaReceipt}`);
      if (!creditResult.success) {
        logger.error({ userId, amount, error: creditResult.error }, 'Failed to credit wallet');
      } else {
        logger.info({ userId, amount, mpesaReceipt }, 'Wallet credited successfully');
      }
    } catch (error) {
      logger.error(error, 'Error processing callback');
    }

    return reply.code(200).send({ success: true });
  });

  // ─── /api/p/v and /api/p/c ────────────────────────────────────────────
  fastify.post('/api/p/v', async (request, reply) => {
    logger.info({ body: request.body }, 'M-Pesa Validation received');
    return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });

  fastify.post('/api/p/c', async (request, reply) => {
    const body: any = request.body;
    logger.info({ body }, 'M-Pesa C2B received');
    try {
      const amount = Number(body.TransAmount);
      const mpesaReceipt = body.TransID;
      const phoneNumber = body.MSISDN;

      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phoneNumber)
        .single();

      if (profileError || !profile) {
        logger.warn({ phoneNumber }, 'C2B from unknown phone');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      await credit(profile.id, amount, 'real', `M-Pesa C2B: ${mpesaReceipt}`);
      logger.info({ mpesaReceipt, amount, userId: profile.id }, 'C2B deposit processed');
    } catch (error) {
      logger.error(error, 'Error processing C2B');
    }
    return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });
};
