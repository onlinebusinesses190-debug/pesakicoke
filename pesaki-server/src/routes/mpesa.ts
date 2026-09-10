import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { env } from '../config/env';
import { credit } from '../wallet/service';
import { calculateDepositFee, MIN_DEPOSIT } from '../utils/fees';
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

/**
 * Get M-Pesa access token
 */
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

    const auth = Buffer.from(
      `${consumerKey}:${consumerSecret}`
    ).toString('base64');

    const baseUrl =
      isProduction()
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    const response = await fetch(
      `${baseUrl}/oauth/v1/generate?grant_type=client_credentials`,
      {
        method: 'GET',
        headers: {
          Authorization: `Basic ${auth}`,
        },
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      logger.error(
        {
          status: response.status,
          error: errorText,
        },
        'Failed to get M-Pesa access token'
      );
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

/**
 * Generate Daraja timestamp in Kenya time
 */
const generateTimestamp = (): string => {
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
    if (part.type !== 'literal') {
      values[part.type] = part.value;
    }
  }

  return (
    values.year +
    values.month +
    values.day +
    values.hour +
    values.minute +
    values.second
  );
};

/**
 * Normalize Kenyan phone number
 */
const normalizePhoneNumber = (phone: string): string => {
  let cleanPhone = phone.toString().replace(/\D/g, '');

  if (cleanPhone.startsWith('0')) {
    cleanPhone = '254' + cleanPhone.slice(1);
  } else if (cleanPhone.startsWith('7') || cleanPhone.startsWith('1')) {
    cleanPhone = '254' + cleanPhone;
  }

  return cleanPhone;
};

/**
 * Initiate STK Push
 */
const initiateSTKPush = async (
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
    const callbackUrl = trimmedBase.endsWith('/api/mpesa/callback')
      ? trimmedBase
      : `${trimmedBase}/api/mpesa/callback`;

    const timestamp = generateTimestamp();

    const passwordString =
      `${businessShortCode}${passkey}${timestamp}`;

    const password = Buffer.from(passwordString).toString('base64');

    const accountReference =
      `PESAKI${userId.replace(/[^a-zA-Z0-9]/g, '').slice(0, 6)}`;

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
      PartyB: tillNumber, // ✅ Now using correct Till
      PhoneNumber: phoneNumber,
      CallBackURL: callbackUrl,
      AccountReference: accountReference,
      TransactionDesc: 'Pesaki Pay',
    };

    logger.info(
      {
        amount: paymentAmount,
        phoneNumber,
        businessShortCode,
        tillNumber,
        accountReference,
        callbackUrl,
        localRequestId,
      },
      'Sending M-Pesa STK Push'
    );

    const baseUrl =
      isProduction()
        ? 'https://api.safaricom.co.ke'
        : 'https://sandbox.safaricom.co.ke';

    const response = await fetch(
      `${baseUrl}/mpesa/stkpush/v1/processrequest`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(payload),
      }
    );

    const responseText = await response.text();
    let result: STKPushResponse;

    try {
      result = JSON.parse(responseText) as STKPushResponse;
    } catch {
      logger.error(
        {
          status: response.status,
          responseText,
          localRequestId,
        },
        'Invalid response received from M-Pesa'
      );
      return null;
    }

    if (!response.ok) {
      logger.error(
        {
          status: response.status,
          result,
          localRequestId,
        },
        'M-Pesa STK Push HTTP request failed'
      );
      return null;
    }

    if (result.ResponseCode !== '0') {
      logger.error(
        {
          result,
          localRequestId,
        },
        'M-Pesa rejected STK Push'
      );
      return null;
    }

    if (result.CheckoutRequestID) {
      const { error: updateError } = await supabase
        .from('mpesa_deposits')
        .update({
          checkout_request_id: result.CheckoutRequestID,
        })
        .eq('checkout_request_id', localRequestId);

      if (updateError) {
        logger.error(
          {
            updateError,
            localRequestId,
            checkoutRequestId: result.CheckoutRequestID,
          },
          'Failed to save Safaricom CheckoutRequestID'
        );
        return null;
      }
    }

    logger.info(
      {
        localRequestId,
        checkoutRequestId: result.CheckoutRequestID,
        merchantRequestId: result.MerchantRequestID,
      },
      'M-Pesa STK Push initiated successfully'
    );

    return result;
  } catch (error) {
    logger.error(error, 'Error initiating M-Pesa STK Push');
    return null;
  }
};

export const mpesaRoutes = async (fastify: FastifyInstance) => {
  /**
   * =========================================================
   * DEPOSIT / STK PUSH
   * =========================================================
   */
  fastify.post(
    '/api/p/deposit',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as any;
        const { amount, phone, userId } = body;

        if (!amount || !phone || !userId) {
          logger.warn({ body }, 'Missing required deposit fields');
          return reply.code(400).send({
            success: false,
            error: 'Missing required fields: amount, phone, userId',
          });
        }

        const numericAmount = Number(amount);

        if (!Number.isFinite(numericAmount) || numericAmount <= 0) {
          return reply.code(400).send({
            success: false,
            error: 'Amount must be a positive number',
          });
        }

        if (numericAmount < MIN_DEPOSIT) {
          return reply.code(400).send({
            success: false,
            error: `Minimum deposit is KES ${MIN_DEPOSIT}`,
            minimum: MIN_DEPOSIT,
            requestedAmount: numericAmount,
          });
        }

        const cleanPhone = normalizePhoneNumber(phone);

        if (!/^254[71]\d{8}$/.test(cleanPhone)) {
          return reply.code(400).send({
            success: false,
            error: 'Invalid Kenyan phone number. Use 07XXXXXXXX or 2547XXXXXXXX.',
          });
        }

        const fee = calculateDepositFee(numericAmount);
        const creditedAmount = Math.max(0, numericAmount - fee);

        logger.info(
          { amount: numericAmount, fee, creditedAmount, phone: cleanPhone, userId },
          'Deposit request received'
        );

        const accessToken = await generateAccessToken();

        if (!accessToken) {
          return reply.code(500).send({
            success: false,
            error: 'Failed to authenticate with M-Pesa',
          });
        }

        const localRequestId = `${userId}_${Date.now()}`;

        const { error: insertError } = await supabase
          .from('mpesa_deposits')
          .insert({
            user_id: userId,
            phone: cleanPhone,
            amount: Math.round(numericAmount),
            fee,
            credited_amount: Math.round(creditedAmount),
            checkout_request_id: localRequestId,
            status: 'pending',
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          logger.error({ insertError, userId }, 'Failed to save pending deposit');
          return reply.code(500).send({
            success: false,
            error: 'Failed to initialize deposit',
          });
        }

        const stkResult = await initiateSTKPush(
          accessToken,
          numericAmount,
          cleanPhone,
          userId,
          localRequestId
        );

        if (!stkResult) {
          await supabase
            .from('mpesa_deposits')
            .update({ status: 'failed' })
            .eq('checkout_request_id', localRequestId);

          return reply.code(500).send({
            success: false,
            error: 'Failed to initiate M-Pesa prompt',
          });
        }

        return reply.code(200).send({
          success: true,
          data: {
            checkoutRequestId: stkResult.CheckoutRequestID,
            merchantRequestId: stkResult.MerchantRequestID,
            customerMessage:
              stkResult.CustomerMessage || 'Check your phone and enter your M-Pesa PIN.',
            message: 'STK Push sent. Check your phone.',
            fee,
            creditedAmount,
          },
        });
      } catch (error) {
        logger.error(error, 'Error in deposit initiation');
        return reply.code(500).send({
          success: false,
          error: 'Internal server error',
        });
      }
    }
  );

  /**
   * =========================================================
   * M-PESA STK CALLBACK
   * =========================================================
   */
  fastify.post(
    '/api/mpesa/callback',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body: any = request.body;
        logger.info({ body }, 'M-Pesa callback received');

        const stkCallback = body?.Body?.stkCallback;

        if (!stkCallback) {
          logger.warn('Missing stkCallback in M-Pesa callback');
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const checkoutRequestId = stkCallback.CheckoutRequestID;
        const resultCode = Number(stkCallback.ResultCode);
        const resultDesc = stkCallback.ResultDesc;

        if (!checkoutRequestId) {
          logger.warn('Missing CheckoutRequestID in callback');
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        if (resultCode !== 0) {
          await supabase
            .from('mpesa_deposits')
            .update({ status: 'failed' })
            .eq('checkout_request_id', checkoutRequestId);

          logger.info({ checkoutRequestId, resultCode, resultDesc }, 'M-Pesa payment failed');
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const callbackMetadata = stkCallback.CallbackMetadata;
        let callbackAmount = 0;
        let mpesaReceipt = '';

        if (callbackMetadata && Array.isArray(callbackMetadata.Item)) {
          for (const item of callbackMetadata.Item) {
            if (item.Name === 'Amount') {
              callbackAmount = Number(item.Value);
            }
            if (item.Name === 'MpesaReceiptNumber') {
              mpesaReceipt = String(item.Value);
            }
          }
        }

        const { data: deposit, error: depositError } = await supabase
          .from('mpesa_deposits')
          .select('user_id, amount, fee, credited_amount, status')
          .eq('checkout_request_id', checkoutRequestId)
          .single();

        if (depositError || !deposit) {
          logger.error({ checkoutRequestId, depositError }, 'Deposit record not found');
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        if (deposit.status === 'completed') {
          logger.info({ checkoutRequestId }, 'Deposit already processed');
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const finalAmount = callbackAmount > 0 ? callbackAmount : Number(deposit.amount);

        if (!Number.isFinite(finalAmount) || finalAmount <= 0) {
          logger.error(
            { checkoutRequestId, callbackAmount, depositAmount: deposit.amount },
            'Invalid payment amount in callback'
          );
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        const depositFee = Number(deposit.fee) || calculateDepositFee(finalAmount);
        const netAmount = Math.max(0, finalAmount - depositFee);

        const creditResult = await credit(
          deposit.user_id,
          netAmount,
          'real',
          `M-Pesa deposit: ${mpesaReceipt || checkoutRequestId} (Fee: ${depositFee})`
        );

        if (!creditResult.success) {
          logger.error(
            {
              userId: deposit.user_id,
              amount: finalAmount,
              checkoutRequestId,
              error: creditResult.error,
            },
            'Failed to credit wallet'
          );
          return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
        }

        await supabase
          .from('mpesa_deposits')
          .update({ status: 'completed' })
          .eq('checkout_request_id', checkoutRequestId)
          .eq('status', 'pending');

        logger.info(
          { userId: deposit.user_id, amount: finalAmount, mpesaReceipt, checkoutRequestId },
          'M-Pesa payment successful and wallet credited'
        );

        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      } catch (error) {
        logger.error(error, 'Error processing M-Pesa callback');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }
    }
  );

  /**
   * =========================================================
   * C2B VALIDATION
   * =========================================================
   */
  fastify.post(
    '/api/p/v',
    async (request: FastifyRequest, reply: FastifyReply) => {
      logger.info({ body: request.body }, 'M-Pesa Validation received');
      return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
  );

  /**
   * =========================================================
   * C2B CONFIRMATION
   * =========================================================
   */
  fastify.post(
    '/api/p/c',
    async (request: FastifyRequest, reply: FastifyReply) => {
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
    }
  );

  fastify.get(
    '/wallet/deposit/status/:checkoutRequestId',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const token = request.headers.authorization?.replace('Bearer ', '');
        if (!token) {
          return reply.status(401).send({ error: 'Unauthorized' });
        }

        const { data: { user }, error: userError } = await supabase.auth.getUser(token);
        if (userError || !user) {
          return reply.status(401).send({ error: 'Invalid token' });
        }

        const { checkoutRequestId } = request.params as { checkoutRequestId: string };

        const { data: deposit, error: depositError } = await supabase
          .from('mpesa_deposits')
          .select('status, amount')
          .eq('checkout_request_id', checkoutRequestId)
          .eq('user_id', user.id)
          .maybeSingle();

        if (depositError || !deposit) {
          return reply.status(404).send({ error: 'Deposit not found' });
        }

        return reply.send({
          success: true,
          data: {
            status: deposit.status,
            amount: deposit.amount,
          },
        });
      } catch (error) {
        logger.error(error, 'Error in /wallet/deposit/status');
        return reply.status(500).send({ error: 'Internal server error' });
      }
    }
  );
};
