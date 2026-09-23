import { env } from '../config/env';
import { logger } from '../utils/logger';

export interface PalplussPayoutRequest {
  amount: number;
  phone: string;
  reference: string;
  description: string;
}

export interface PalplussPayoutResponse {
  success: boolean;
  data: {
    transactionId: string;
    status: string;
    amount: number;
    currency: string;
    phone: string;
    reference: string;
    description: string;
    providerCheckoutId?: string;
  };
}

export const initiateB2CPayout = async (
  payload: PalplussPayoutRequest
): Promise<PalplussPayoutResponse | null> => {
  try {
    const apiKey = env.PALPLUSS_API_KEY;
    const baseUrl = env.PALPLUSS_API_URL || 'https://api.palpluss.com/v1';

    if (!apiKey) {
      logger.error('Missing PALPLUSS_API_KEY');
      return null;
    }

    const response = await fetch(`${baseUrl}/b2c/payouts`, {
      method: 'POST',
      headers: {
        'Authorization': `Basic ${Buffer.from(`${apiKey}:`).toString('base64')}`,
        'Content-Type': 'application/json',
        'Idempotency-Key': payload.reference,
      },
      body: JSON.stringify({
        amount: payload.amount,
        phone: payload.phone,
        currency: 'KES',
        reference: payload.reference,
        description: payload.description,
      }),
    });

    const text = await response.text();
    let result: PalplussPayoutResponse;

    try {
      result = JSON.parse(text) as PalplussPayoutResponse;
    } catch {
      logger.error(
        {
          status: response.status,
          responseText: text,
          reference: payload.reference,
        },
        'Invalid response from Palpluss B2C'
      );
      return null;
    }

    if (!response.ok || !result.success) {
      logger.error(
        {
          status: response.status,
          result,
          reference: payload.reference,
        },
        'Palpluss B2C payout failed'
      );
      return null;
    }

    logger.info(
      {
        reference: payload.reference,
        transactionId: result.data.transactionId,
        status: result.data.status,
      },
      'Palpluss B2C payout initiated'
    );

    return result;
  } catch (error) {
    logger.error(error, 'Error initiating Palpluss B2C payout');
    return null;
  }
};
