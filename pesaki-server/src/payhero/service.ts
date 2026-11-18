import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface PayHeroSasaPayRequest {
  amount: number;
  phone_number: string;
  network_code: string;
  external_reference: string;
  callback_url: string;
}

export interface PayHeroSasaPayResponse {
  success: boolean;
  transaction_id?: string;
  status?: string;
  message?: string;
  [key: string]: any;
}

// ─── Network code mapping (Kenya) ─────────────────────────────────
const NETWORK_CODES: Record<string, string> = {
  safaricom: '63902',
  airtel: '63903',
  telkom: '63907',
};

const phonePrefixes: Record<string, string[]> = {
  '63902': ['071', '072', '074', '075', '079', '011', '010', '25471', '25472', '25474', '25475', '25479', '25471'],
  '63903': ['073', '077', '078'],
  '63907': ['070', '076'],
};

export const networkCodeForPhone = (phone: string): string => {
  const digits = phone.replace(/\D/g, '');
  for (const [code, prefixes] of Object.entries(phonePrefixes)) {
    if (prefixes.some((prefix) => digits.startsWith(prefix))) {
      return code;
    }
  }
  return NETWORK_CODES.safaricom;
};

// ─── PayHero Basic Auth ───────────────────────────────────────────
const getPayHeroBasicAuth = (): string => {
  const username = env.PAYHERO_API_USERNAME;
  const password = env.PAYHERO_API_PASSWORD;
  if (!username || !password) {
    throw new Error('PAYHERO_API_USERNAME / PAYHERO_API_PASSWORD environment variables are not set');
  }
  return `Basic ${Buffer.from(`${username}:${password}`).toString('base64')}`;
};

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const fetchWithTimeout = (
  url: string,
  options: RequestInit,
  timeoutMs: number = 30000
): Promise<Response> => {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal }).finally(() => clearTimeout(timeoutId));
};

const shouldRetry = (status: number): boolean => {
  return status === 404 || (status >= 500 && status < 600);
};

// ─── Helper: call PayHero SasaPay B2C withdrawal ──────────────────
export const sasaPayWithdrawToMobile = async (
  amount: number,
  phone: string,
  network_code: string,
  external_reference: string,
  callback_url: string
): Promise<PayHeroSasaPayResponse> => {
  const baseUrl = env.PAYHERO_BASE_URL?.replace(/\/$/, '');
  const accountId = env.PAYHERO_ACCOUNT_ID;
  const withdrawPath = env.PAYHERO_WITHDRAW_ENDPOINT || '/api/v2/withdraw';

  if (!baseUrl) {
    throw new Error('PAYHERO_BASE_URL environment variable is not set');
  }
  if (!accountId) {
    throw new Error('PAYHERO_ACCOUNT_ID environment variable is not set');
  }

  const endpoint = `${baseUrl}${withdrawPath}`;

  const payload: PayHeroSasaPayRequest = {
    amount,
    phone_number: phone,
    network_code,
    external_reference,
    callback_url,
  };

  const authHeader = getPayHeroBasicAuth();

  let response!: Response;
  let responseText = '';
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      logger.info(
        {
          url: endpoint,
          auth: authHeader.slice(0, 20) + '...',
          body: payload,
          attempt: attempts,
        },
        'PAYHERO_SASAPAY_WITHDRAW_REQUEST'
      );

      response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      }, 30000);

      responseText = await response.text();

      logger.info(
        {
          status: response.status,
          body: responseText,
          reference: external_reference,
          attempt: attempts,
        },
        'PAYHERO_SASAPAY_WITHDRAW_RESPONSE'
      );

      if (!shouldRetry(response.status)) {
        break;
      }

      if (attempts < maxAttempts) {
        logger.warn(
          { status: response.status, reference: external_reference, attempt: attempts },
          'PAYHERO_SASAPAY_WITHDRAW_RETRY'
        );
        await sleep(1000);
      }
    } catch (fetchError: any) {
      if (attempts >= maxAttempts) {
        const err = new Error('PayHero request failed after retries');
        (err as any).status = 504;
        (err as any).providerMessage = fetchError.message || 'Request timed out or failed';
        (err as any).responseBody = null;
        throw err;
      }
      logger.warn(
        { reference: external_reference, attempt: attempts, error: fetchError.message },
        'PAYHERO_SASAPAY_WITHDRAW_FETCH_ERROR_RETRY'
      );
      await sleep(1000);
    }
  }

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    logger.error(
      { status: response.status, responseText, reference: external_reference },
      'Invalid JSON from PayHero SasaPay'
    );
    const err = new Error('Invalid response from PayHero');
    (err as any).status = response.status;
    (err as any).responseBody = responseText;
    throw err;
  }

  if (!response.ok || data.success === false) {
    const providerCode = data?.code || data?.error_code;
    const providerMessage =
      data?.message || data?.error_message || data?.description || 'PayHero SasaPay withdrawal failed';
    logger.error(
      { status: response.status, reference: external_reference, providerCode, providerMessage, data },
      'PayHero SasaPay withdrawal failed'
    );
    const err = new Error(providerMessage);
    (err as any).status = response.status;
    (err as any).providerCode = providerCode;
    (err as any).providerMessage = providerMessage;
    (err as any).responseBody = data;
    throw err;
  }

  return data;
};

// ─── Helper: top up PayHero wallet ─────────────────────────────────
export interface PayHeroTopUpRequest {
  amount: number;
  phone_number: string;
}

export interface PayHeroTopUpResponse {
  success: boolean;
  reference_id?: string;
  status?: string;
  message?: string;
  [key: string]: any;
}

export const topUpWallet = async (
  amount: number,
  phone_number: string
): Promise<PayHeroTopUpResponse> => {
  const baseUrl = env.PAYHERO_BASE_URL?.replace(/\/$/, '');
  const topupPath = env.PAYHERO_TOPUP_ENDPOINT || '/api/v2/topup';

  if (!baseUrl) {
    throw new Error('PAYHERO_BASE_URL environment variable is not set');
  }

  const endpoint = `${baseUrl}${topupPath}`;

  const payload: PayHeroTopUpRequest = {
    amount,
    phone_number,
  };

  const authHeader = getPayHeroBasicAuth();

  let response!: Response;
  let responseText = '';
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    attempts += 1;

    try {
      logger.info(
        {
          url: endpoint,
          auth: authHeader.slice(0, 20) + '...',
          body: payload,
          attempt: attempts,
        },
        'PAYHERO_TOPUP_REQUEST'
      );

      response = await fetchWithTimeout(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: authHeader,
        },
        body: JSON.stringify(payload),
      }, 30000);

      responseText = await response.text();

      logger.info(
        {
          status: response.status,
          body: responseText,
          attempt: attempts,
        },
        'PAYHERO_TOPUP_RESPONSE'
      );

      if (!shouldRetry(response.status)) {
        break;
      }

      if (attempts < maxAttempts) {
        logger.warn(
          { status: response.status, attempt: attempts },
          'PAYHERO_TOPUP_RETRY'
        );
        await sleep(1000);
      }
    } catch (fetchError: any) {
      if (attempts >= maxAttempts) {
        const err = new Error('PayHero request failed after retries');
        (err as any).status = 504;
        (err as any).providerMessage = fetchError.message || 'Request timed out or failed';
        (err as any).responseBody = null;
        throw err;
      }
      logger.warn(
        { attempt: attempts, error: fetchError.message },
        'PAYHERO_TOPUP_FETCH_ERROR_RETRY'
      );
      await sleep(1000);
    }
  }

  let data: any;

  try {
    data = JSON.parse(responseText);
  } catch {
    logger.error(
      { status: response.status, responseText },
      'Invalid JSON from PayHero top-up'
    );
    const err = new Error('Invalid response from PayHero');
    (err as any).status = response.status;
    (err as any).responseBody = responseText;
    throw err;
  }

  if (!response.ok || data.success === false) {
    const providerCode = data?.code || data?.error_code;
    const providerMessage =
      data?.message || data?.error_message || data?.description || 'PayHero top-up failed';
    logger.error(
      { status: response.status, providerCode, providerMessage, data },
      'PayHero top-up failed'
    );
    const err = new Error(providerMessage);
    (err as any).status = response.status;
    (err as any).providerCode = providerCode;
    (err as any).providerMessage = providerMessage;
    (err as any).responseBody = data;
    throw err;
  }

  return data;
};
