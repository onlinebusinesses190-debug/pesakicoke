import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface FinoqResponse {
  success: boolean;
  transactionId?: string;
  referenceId?: string;
  status?: string;
  message?: string;
  [key: string]: any;
}

export const formatFinoqPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('254') && digits.length === 12) return digits;
  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (digits.length === 9) return `254${digits}`;
  throw new Error('Invalid phone number');
};

export const networkCodeForPhone = (phone: string): string => {
  const digits = formatFinoqPhone(phone);
  if (/^254(73|77|78)/.test(digits)) return '63903';
  if (/^254(70|76)/.test(digits)) return '63907';
  return '63902';
};

export const buildFinoqCallbackUrl = (configuredBase: string): string => {
  const trimmed = configuredBase.replace(/\/+$/, '');
  return trimmed.endsWith('/api/webhooks/finoq') ? trimmed : `${trimmed}/api/webhooks/finoq`;
};

const getHeaders = (): Record<string, string> => {
  const key = env.FINOQ_KEY?.trim();
  const secret = env.FINOQ_SECRET?.trim();
  if (!key || !secret) {
    throw new Error('FINOQ_KEY / FINOQ_SECRET environment variables are not set');
  }
  return {
    'Content-Type': 'application/json',
    Authorization: `Basic ${Buffer.from(`${key}:${secret}`).toString('base64')}`,
  };
};

// ─── Startup validation: confirm Finoq auth env vars are present ─────────────
export const validateFinoqAuth = (): void => {
  const key = env.FINOQ_KEY?.trim();
  const secret = env.FINOQ_SECRET?.trim();
  const baseUrl = env.FINOQ_BASE_URL?.trim();
  console.log(
    `[FINOQ_AUTH] configured=${!!key && !!secret && !!baseUrl} key_len=${key ? key.length : 0} secret_len=${secret ? secret.length : 0} base_url=${baseUrl ? baseUrl.slice(0, 30) : 'missing'}`
  );
};

validateFinoqAuth();

const postToFinoq = async (endpoint: string, payload: any, operation: string): Promise<FinoqResponse> => {
  let response!: Response;
  let responseText = '';

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    try {
      logger.info({ url: endpoint, reference: payload.externalReference }, `${operation}_REQUEST`);
      response = await fetch(endpoint, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload), signal: controller.signal });
    } finally {
      clearTimeout(timeout);
    }
    responseText = await response.text();
    logger.info({ status: response.status, reference: payload.externalReference }, `${operation}_RESPONSE`);

    let data: any;
    try { data = JSON.parse(responseText); } catch {
      const err = new Error('Invalid JSON response from Finoq') as any;
      err.status = response.status;
      err.responseBody = responseText;
      throw err;
    }

    if (!response.ok || data.success === false) {
      const providerMessage = data.message || data.errorMessage || data.error_message || data.description || 'Finoq request rejected';
      const err = new Error(providerMessage) as any;
      err.status = response.status;
      err.providerCode = data.code || data.errorCode || data.error_code;
      err.providerMessage = providerMessage;
      err.responseBody = data;
      throw err;
    }
    return data;
  } catch (error: any) {
    const errorInfo = {
      name: error?.name,
      message: error?.message,
      cause: error?.cause,
      code: error?.code,
      stack: error?.stack,
    };
    logger.error({ ...errorInfo, reference: payload.externalReference }, 'FINOQ_REQUEST_ERROR');

    const isNetworkError = error?.name === 'AbortError' ||
      error?.code === 'ECONNREFUSED' ||
      error?.code === 'ETIMEDOUT' ||
      error?.code === 'ENOTFOUND' ||
      error?.code === 'ECONNRESET' ||
      error?.message === 'fetch failed';

    if (isNetworkError) {
      const err = new Error('Finoq connection terminated without provider response') as any;
      err.status = 502;
      err.providerCode = 'FINOQ_NETWORK_ERROR';
      err.providerMessage = 'Connection terminated without confirmed provider response';
      err.responseBody = null;
      err.errorInfo = errorInfo;
      err.isNetworkError = true;
      throw err;
    }

    throw error;
  }
};

export const finoqWithdrawToMobile = async (amount: number, phone: string, externalReference: string, callbackUrl: string): Promise<FinoqResponse> => {
  const baseUrl = env.FINOQ_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('FINOQ_BASE_URL environment variable is not set');
  const accountId = env.FINOQ_ACCOUNT_ID?.trim();
  if (!accountId) throw new Error('FINOQ_ACCOUNT_ID environment variable is not set');
  const withdrawPath = env.FINOQ_WITHDRAW_ENDPOINT || '/api/v2/withdraw';
  const endpoint = `${baseUrl}${withdrawPath.startsWith('/') ? withdrawPath : `/${withdrawPath}`}`;
  const formattedPhone = formatFinoqPhone(phone);
  const networkCode = networkCodeForPhone(formattedPhone);
  return postToFinoq(endpoint, {
    account_id: Number(accountId),
    amount: Number(amount),
    phone_number: formattedPhone,
    network_code: networkCode,
    channel: 'mobile',
    external_reference: externalReference,
    callback_url: callbackUrl,
  }, 'FINOQ_WITHDRAW');
};

export const finoqTopUpWallet = async (amount: number, phone: string): Promise<FinoqResponse> => {
  const baseUrl = env.FINOQ_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('FINOQ_BASE_URL environment variable is not set');
  const topupPath = env.FINOQ_TOPUP_ENDPOINT || '/api/v1/topups';
  const endpoint = `${baseUrl}${topupPath.startsWith('/') ? topupPath : `/${topupPath}`}`;
  const callbackBase = env.FINOQ_CALLBACK_URL || env.MPESA_CALLBACK_URL || 'https://pesaki-server.onrender.com';
  return postToFinoq(endpoint, { amount: Number(amount), phoneNumber: formatFinoqPhone(phone), externalReference: `TOPUP-${Date.now()}`, callbackUrl: buildFinoqCallbackUrl(callbackBase) }, 'FINOQ_TOPUP');
};
