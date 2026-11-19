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

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

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
  const apiKey = env.FINOQ_API_KEY;
  if (!apiKey) throw new Error('FINOQ_API_KEY environment variable is not set');
  return { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` };
};

const postToFinoq = async (endpoint: string, payload: any, operation: string): Promise<FinoqResponse> => {
  let response!: Response;
  let responseText = '';

  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 120000);
      try {
        logger.info({ url: endpoint, reference: payload.externalReference, attempt }, `${operation}_REQUEST`);
        response = await fetch(endpoint, { method: 'POST', headers: getHeaders(), body: JSON.stringify(payload), signal: controller.signal });
      } finally {
        clearTimeout(timeout);
      }
      responseText = await response.text();
      logger.info({ status: response.status, reference: payload.externalReference, attempt }, `${operation}_RESPONSE`);
      if (response.status !== 404 && response.status < 500) break;
      if (attempt < 3) await sleep(1000);
    } catch (error: any) {
      if (attempt >= 3) {
        const err = new Error('Finoq request failed after retries') as any;
        err.status = 504;
        err.providerMessage = error.message || 'Request timed out or failed';
        throw err;
      }
      await sleep(1000);
    }
  }

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
};

export const finoqWithdrawToMobile = async (amount: number, phone: string, externalReference: string, callbackUrl: string): Promise<FinoqResponse> => {
  const baseUrl = env.FINOQ_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('FINOQ_BASE_URL environment variable is not set');
  const withdrawPath = env.FINOQ_WITHDRAW_ENDPOINT || '/api/v1/withdrawals';
  const endpoint = `${baseUrl}${withdrawPath.startsWith('/') ? withdrawPath : `/${withdrawPath}`}`;
  return postToFinoq(endpoint, { amount: Number(amount), phoneNumber: formatFinoqPhone(phone), externalReference, callbackUrl }, 'FINOQ_WITHDRAW');
};

export const finoqTopUpWallet = async (amount: number, phone: string): Promise<FinoqResponse> => {
  const baseUrl = env.FINOQ_BASE_URL?.replace(/\/$/, '');
  if (!baseUrl) throw new Error('FINOQ_BASE_URL environment variable is not set');
  const topupPath = env.FINOQ_TOPUP_ENDPOINT || '/api/v1/topups';
  const endpoint = `${baseUrl}${topupPath.startsWith('/') ? topupPath : `/${topupPath}`}`;
  const callbackBase = env.FINOQ_CALLBACK_URL || env.MPESA_CALLBACK_URL || 'https://pesaki-server.onrender.com';
  return postToFinoq(endpoint, { amount: Number(amount), phoneNumber: formatFinoqPhone(phone), externalReference: `TOPUP-${Date.now()}`, callbackUrl: buildFinoqCallbackUrl(callbackBase) }, 'FINOQ_TOPUP');
};
