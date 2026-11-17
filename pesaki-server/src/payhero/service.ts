import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface PayHeroSasaPayRequest {
  amount: number;
  phone: string;
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
// PayHero SasaPay requires a network code per carrier. Safaricom = "63902".
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
  const withdrawPath = env.PAYHERO_WITHDRAW_ENDPOINT || '/sasa-pay/withdraw';

  if (!baseUrl) {
    throw new Error('PAYHERO_BASE_URL environment variable is not set');
  }
  if (!accountId) {
    throw new Error('PAYHERO_ACCOUNT_ID environment variable is not set');
  }

  const endpoint = `${baseUrl}${withdrawPath}`;

  const payload: PayHeroSasaPayRequest = {
    amount,
    phone,
    network_code,
    external_reference,
    callback_url,
  };

  const authHeader = getPayHeroBasicAuth();

  logger.info(
    {
      url: endpoint,
      auth: authHeader.slice(0, 20) + '...',
      body: payload,
    },
    'PAYHERO_SASAPAY_WITHDRAW_REQUEST'
  );

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: authHeader,
    },
    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  logger.info(
    {
      status: response.status,
      body: responseText,
      reference: external_reference,
    },
    'PAYHERO_SASAPAY_WITHDRAW_RESPONSE'
  );

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
