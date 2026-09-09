import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logger } from '../utils/logger';
import { supabase } from '../lib/supabase';

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Release funds that were locked for a withdrawal.
 *
 * If returnToBalance = true:
 *   locked -= amount
 *   balance += amount
 *
 * If returnToBalance = false:
 *   locked -= amount
 *   balance stays unchanged
 */
const releaseLockedFunds = async (
  userId: string,
  amount: number,
  returnToBalance: boolean
): Promise<void> => {
  try {
    const { data: wallet, error: walletError } = await supabase
      .from('wallets')
      .select('locked, balance')
      .eq('user_id', userId)
      .maybeSingle();

    if (walletError || !wallet) {
      logger.error(
        { userId, amount, walletError },
        'Failed to fetch wallet for locked funds release'
      );
      return;
    }

    const currentLocked = Number(wallet.locked) || 0;
    const currentBalance = Number(wallet.balance) || 0;

    const newLocked = Math.max(0, currentLocked - amount);
    const newBalance = returnToBalance
      ? currentBalance + amount
      : currentBalance;

    const { error: updateError } = await supabase
      .from('wallets')
      .update({
        locked: newLocked,
        balance: newBalance,
      })
      .eq('user_id', userId);

    if (updateError) {
      logger.error(
        {
          userId,
          amount,
          returnToBalance,
          updateError,
        },
        'Failed to release locked funds'
      );
    }
  } catch (error) {
    logger.error(error, 'Exception releasing locked funds');
  }
};

/**
 * Add wallet ledger entry.
 */
const addLedgerEntry = async (
  userId: string,
  amount: number,
  type: string,
  mode: string,
  description: string
) => {
  try {
    const { error } = await supabase.from('wallet_ledger').insert({
      user_id: userId,
      amount,
      type,
      mode,
      description,
    });

    if (error) {
      logger.error(
        {
          userId,
          amount,
          type,
          mode,
          description,
          error,
        },
        'Failed to add ledger entry'
      );
    }
  } catch (error) {
    logger.error(error, 'Exception adding ledger entry');
  }
};

// ============================================================================
// PALPLUSS B2C API
// ============================================================================

const callPalplussB2C = async (
  amount: number,
  phone: string,
  reference: string,
  callbackUrl: string
) => {
  const apiKey = process.env.PALPLUSS_API_KEY;

  const apiBaseUrl =
    process.env.PALPLUSS_API_URL ||
    'https://api.palpluss.com/v1';

  if (!apiKey) {
    throw new Error(
      'PALPLUSS_API_KEY environment variable is not configured'
    );
  }

  // PalPluss uses HTTP Basic Auth:
  // username = API key
  // password = empty
  //
  // Therefore:
  // base64(`${apiKey}:`)
  const auth = Buffer.from(`${apiKey}:`).toString('base64');

  const url = `${apiBaseUrl.replace(/\/$/, '')}/b2c/payouts`;

  const payload = {
    amount,
    phone,
    currency: 'KES',
    reference,
    description: 'PESAKI withdrawal',
    callback_url: callbackUrl,
  };

  logger.info(
    {
      url,
      amount,
      phone,
      reference,
      callbackUrl,
    },
    'Calling PalPluss B2C API'
  );

  const response = await fetch(url, {
    method: 'POST',

    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Basic ${auth}`,

      // Prevent duplicate payout if the same request is retried.
      'Idempotency-Key': reference,
    },

    body: JSON.stringify(payload),
  });

  const responseText = await response.text();

  let data: any;

  try {
    data = responseText ? JSON.parse(responseText) : {};
  } catch {
    logger.error(
      {
        status: response.status,
        responseText,
      },
      'PalPluss returned non-JSON response'
    );

    throw new Error(
      `PalPluss API returned HTTP ${response.status}: ${responseText}`
    );
  }

  logger.info(
    {
      status: response.status,
      body: data,
    },
    'PalPluss B2C response'
  );

  // ---------------------------------------------------------
  // PALPLUSS ERROR
  // ---------------------------------------------------------

  if (!response.ok) {
    const errorObject = data?.error || {};

    const errorCode =
      errorObject?.code ||
      data?.code ||
      'PALPLUSS_API_ERROR';

    const errorMessage =
      errorObject?.message ||
      data?.message ||
      data?.error ||
      data?.detail ||
      `PalPluss returned HTTP ${response.status}`;

    const requestId =
      data?.requestId ||
      data?.request_id ||
      errorObject?.requestId ||
      null;

    logger.error(
      {
        httpStatus: response.status,
        errorCode,
        errorMessage,
        requestId,
        response: data,
      },
      'PalPluss B2C request rejected'
    );

    const error: any = new Error(errorMessage);

    error.httpStatus = response.status;
    error.code = errorCode;
    error.requestId = requestId;
    error.details = errorObject?.details || data?.details;

    throw error;
  }

  // ---------------------------------------------------------
  // PALPLUSS SUCCESS
  // ---------------------------------------------------------

  const result = data?.data || data;

  const transactionId =
    result?.transactionId ||
    result?.transaction_id ||
    result?.id;

  if (!transactionId) {
    logger.error(
      {
        response: data,
      },
      'PalPluss response did not contain a transaction ID'
    );

    throw new Error(
      'PalPluss response missing transactionId'
    );
  }

  return {
    ...result,
    transactionId,
    rawResponse: data,
  };
};

// ============================================================================
// ROUTES
// ============================================================================

export const palplussRoutes = async (fastify: FastifyInstance) => {
  // ==========================================================================
  // PALPLUSS WEBHOOK
  // ==========================================================================

  fastify.post(
    '/api/webhooks/palpluss',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const body: any = request.body || {};

        // Log everything so we can see the exact PalPluss payload
        // during the first real callback.
        logger.info(
          {
            headers: request.headers,
            body,
          },
          'PALPLUSS WEBHOOK RECEIVED'
        );

        // ---------------------------------------------------------------
        // PalPluss webhook structure:
        //
        // {
        //   event_type: "transaction.success",
        //   transaction: {
        //      id: "...",
        //      status: "SUCCESS",
        //      amount: 100,
        //      phone_number: "2547...",
        //      external_reference: "WD-..."
        //   }
        // }
        // ---------------------------------------------------------------

        const transaction = body?.transaction || body?.data?.transaction || {};

        const eventType =
          body?.event_type ||
          body?.event ||
          body?.data?.event_type ||
          null;

        const reference =
          transaction?.external_reference ||
          transaction?.reference ||
          body?.reference ||
          body?.data?.reference ||
          null;

        const status =
          transaction?.status ||
          body?.status ||
          body?.data?.status ||
          null;

        const providerTransactionId =
          transaction?.id ||
          transaction?.transaction_id ||
          body?.transactionId ||
          body?.providerTransactionId ||
          body?.data?.transactionId ||
          null;

        const providerCheckoutId =
          transaction?.provider_checkout_id ||
          body?.providerCheckoutId ||
          body?.data?.providerCheckoutId ||
          null;

        const amount =
          transaction?.amount ||
          body?.amount ||
          body?.data?.amount ||
          null;

        const mpesaReceipt =
          transaction?.mpesa_receipt ||
          body?.mpesa_receipt ||
          null;

        // ---------------------------------------------------------------
        // ALWAYS ACKNOWLEDGE THE WEBHOOK
        // ---------------------------------------------------------------

        if (!reference) {
          logger.warn(
            {
              eventType,
              status,
              providerTransactionId,
              body,
            },
            'PalPluss webhook received without external reference'
          );

          return reply.code(200).send({
            received: true,
          });
        }

        // ---------------------------------------------------------------
        // FIND LOCAL WITHDRAWAL
        // ---------------------------------------------------------------

        const { data: withdrawal, error: withdrawalError } =
          await supabase
            .from('b2c_withdrawals')
            .select('*')
            .eq('reference', reference)
            .maybeSingle();

        if (withdrawalError || !withdrawal) {
          logger.warn(
            {
              reference,
              withdrawalError,
            },
            'PalPluss webhook: local withdrawal not found'
          );

          return reply.code(200).send({
            received: true,
          });
        }

        // ---------------------------------------------------------------
        // IMPORTANT:
        //
        // Your previous code only processed "pending".
        //
        // But after the API accepts the payout, your initiation route
        // changes the local status to "processing".
        //
        // Therefore a legitimate successful webhook was being ignored.
        //
        // We now accept both pending and processing.
        // ---------------------------------------------------------------

        if (
          withdrawal.status !== 'pending' &&
          withdrawal.status !== 'processing'
        ) {
          logger.info(
            {
              reference,
              localStatus: withdrawal.status,
              webhookStatus: status,
            },
            'Webhook ignored because withdrawal is already finalized'
          );

          return reply.code(200).send({
            received: true,
          });
        }

        const normalizedStatus = String(status || '').toUpperCase();

        // ---------------------------------------------------------------
        // STATUS CLASSIFICATION
        // ---------------------------------------------------------------

        const isSuccess =
          normalizedStatus === 'SUCCESS' ||
          normalizedStatus === 'COMPLETED' ||
          normalizedStatus === 'PAID';

        const isFailed =
          normalizedStatus === 'FAILED' ||
          normalizedStatus === 'CANCELLED' ||
          normalizedStatus === 'EXPIRED' ||
          normalizedStatus === 'REVERSED' ||
          normalizedStatus === 'TIMEOUT';

        // ---------------------------------------------------------------
        // INTERMEDIATE STATUS
        // ---------------------------------------------------------------

        if (!isSuccess && !isFailed) {
          logger.info(
            {
              reference,
              eventType,
              normalizedStatus,
            },
            'PalPluss webhook: intermediate status'
          );

          await supabase
            .from('b2c_withdrawals')
            .update({
              status:
                normalizedStatus.toLowerCase() || 'processing',

              provider_transaction_id:
                providerTransactionId ||
                withdrawal.provider_transaction_id,

              provider_checkout_id:
                providerCheckoutId ||
                withdrawal.provider_checkout_id,

              metadata: {
                ...(withdrawal.metadata || {}),
                last_webhook: body,
              },
            })
            .eq('id', withdrawal.id);

          return reply.code(200).send({
            received: true,
          });
        }

        const withdrawalAmount =
          Number(amount) || Number(withdrawal.amount);

        // ==========================================================================
        // FAILED
        // ==========================================================================

        if (isFailed) {
          const { error: updateError } = await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',

              provider_transaction_id:
                providerTransactionId ||
                withdrawal.provider_transaction_id,

              provider_checkout_id:
                providerCheckoutId ||
                withdrawal.provider_checkout_id,

              metadata: {
                ...(withdrawal.metadata || {}),
                webhook: body,
              },
            })
            .eq('id', withdrawal.id);

          if (updateError) {
            logger.error(
              {
                updateError,
                reference,
              },
              'Failed to update failed withdrawal'
            );

            // Still return 200 to prevent unnecessary webhook retries.
            return reply.code(200).send({
              received: true,
            });
          }

          // Return the reserved money to the user's available balance.
          await releaseLockedFunds(
            withdrawal.user_id,
            withdrawalAmount,
            true
          );

          // Record the reversal in the ledger.
          await addLedgerEntry(
            withdrawal.user_id,
            withdrawalAmount,
            'withdrawal',
            'credit',
            `Withdrawal failed/reversed (${reference})`
          );

          logger.info(
            {
              reference,
              userId: withdrawal.user_id,
              amount: withdrawalAmount,
              status: normalizedStatus,
            },
            'PalPluss B2C withdrawal failed - funds returned'
          );

          return reply.code(200).send({
            received: true,
          });
        }

        // ==========================================================================
        // SUCCESS
        // ==========================================================================

        const { error: successUpdateError } =
          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'completed',

              provider_transaction_id:
                providerTransactionId ||
                withdrawal.provider_transaction_id,

              provider_checkout_id:
                providerCheckoutId ||
                withdrawal.provider_checkout_id,

              metadata: {
                ...(withdrawal.metadata || {}),
                webhook: body,
                mpesa_receipt: mpesaReceipt,
              },

              completed_at: new Date().toISOString(),
            })
            .eq('id', withdrawal.id);

        if (successUpdateError) {
          logger.error(
            {
              successUpdateError,
              reference,
            },
            'Failed to mark withdrawal completed'
          );

          return reply.code(200).send({
            received: true,
          });
        }

        // Remove the lock.
        // Do NOT return money to balance because the money has been paid out.
        await releaseLockedFunds(
          withdrawal.user_id,
          withdrawalAmount,
          false
        );

        // Record successful debit.
        await addLedgerEntry(
          withdrawal.user_id,
          withdrawalAmount,
          'withdrawal',
          'debit',
          `Withdrawal to ${withdrawal.phone} (${reference})`
        );

        logger.info(
          {
            reference,
            userId: withdrawal.user_id,
            amount: withdrawalAmount,
            providerTransactionId,
            mpesaReceipt,
          },
          'PALPLUSS B2C WITHDRAWAL COMPLETED'
        );

        return reply.code(200).send({
          received: true,
        });
      } catch (error) {
        logger.error(
          error,
          'Error processing PalPluss webhook'
        );

        // Important:
        // Acknowledge the webhook so PalPluss does not endlessly retry.
        return reply.code(200).send({
          received: true,
        });
      }
    }
  );

  // ==========================================================================
  // MANUAL STATUS CHECK
  // ==========================================================================

  fastify.get(
    '/wallet/withdrawals/check/:reference',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const token =
          request.headers.authorization?.replace(
            'Bearer ',
            ''
          );

        if (!token) {
          return reply
            .status(401)
            .send({
              error: 'Unauthorized',
            });
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(token);

        if (userError || !user) {
          return reply
            .status(401)
            .send({
              error: 'Invalid token',
            });
        }

        const { reference } =
          request.params as {
            reference: string;
          };

        const {
          data: withdrawal,
          error: withdrawalError,
        } = await supabase
          .from('b2c_withdrawals')
          .select('*')
          .eq('reference', reference)
          .eq('user_id', user.id)
          .single();

        if (withdrawalError || !withdrawal) {
          return reply
            .status(404)
            .send({
              error: 'Withdrawal not found',
            });
        }

        // Already finalized locally.
        if (
          withdrawal.status !== 'processing' &&
          withdrawal.status !== 'pending'
        ) {
          return reply.send({
            success: true,
            data: {
              reference,
              status: withdrawal.status,
              amount: withdrawal.amount,
              phone: withdrawal.phone,
            },
          });
        }

        const apiKey =
          process.env.PALPLUSS_API_KEY;

        const apiBaseUrl =
          process.env.PALPLUSS_API_URL ||
          'https://api.palpluss.com/v1';

        if (!apiKey) {
          return reply
            .status(500)
            .send({
              error: 'PalPluss API key is not configured',
            });
        }

        const transactionId =
          withdrawal.provider_transaction_id;

        if (!transactionId) {
          return reply
            .status(400)
            .send({
              error:
                'No PalPluss transaction ID available yet',
            });
        }

        const auth = Buffer
          .from(`${apiKey}:`)
          .toString('base64');

        // Current PalPluss transaction endpoint.
        const statusUrl =
          `${apiBaseUrl.replace(/\/$/, '')}/transactions/${transactionId}`;

        const statusRes = await fetch(statusUrl, {
          method: 'GET',
          headers: {
            Accept: 'application/json',
            Authorization: `Basic ${auth}`,
          },
        });

        const statusText =
          await statusRes.text();

        let statusData: any;

        try {
          statusData = statusText
            ? JSON.parse(statusText)
            : {};
        } catch {
          logger.error(
            {
              status: statusRes.status,
              statusText,
            },
            'PalPluss status returned invalid JSON'
          );

          return reply
            .status(500)
            .send({
              error:
                'Invalid response from PalPluss',
            });
        }

        if (!statusRes.ok) {
          logger.error(
            {
              status: statusRes.status,
              statusData,
            },
            'Failed to query PalPluss transaction status'
          );

          return reply
            .status(statusRes.status)
            .send({
              error:
                statusData?.error?.message ||
                statusData?.message ||
                'Failed to query PalPluss status',
            });
        }

        const transaction =
          statusData?.data ||
          statusData?.transaction ||
          statusData;

        const currentStatus =
          transaction?.status;

        if (!currentStatus) {
          return reply
            .status(500)
            .send({
              error:
                'PalPluss returned no transaction status',
            });
        }

        const normalized =
          String(currentStatus).toUpperCase();

        // ---------------------------------------------------------
        // SUCCESS
        // ---------------------------------------------------------

        if (
          normalized === 'SUCCESS' ||
          normalized === 'COMPLETED' ||
          normalized === 'PAID'
        ) {
          // Only process if still pending/processing.
          if (
            withdrawal.status === 'pending' ||
            withdrawal.status === 'processing'
          ) {
            await supabase
              .from('b2c_withdrawals')
              .update({
                status: 'completed',
                completed_at:
                  new Date().toISOString(),

                metadata: {
                  ...(withdrawal.metadata || {}),
                  manual_check: statusData,
                },
              })
              .eq('id', withdrawal.id);

            await releaseLockedFunds(
              withdrawal.user_id,
              Number(withdrawal.amount),
              false
            );

            await addLedgerEntry(
              withdrawal.user_id,
              Number(withdrawal.amount),
              'withdrawal',
              'debit',
              `Withdrawal to ${withdrawal.phone} (${reference}) [manual check]`
            );
          }

          return reply.send({
            success: true,
            data: {
              reference,
              status: 'completed',
              amount: withdrawal.amount,
            },
          });
        }

        // ---------------------------------------------------------
        // FAILED
        // ---------------------------------------------------------

        if (
          normalized === 'FAILED' ||
          normalized === 'CANCELLED' ||
          normalized === 'EXPIRED' ||
          normalized === 'REVERSED'
        ) {
          if (
            withdrawal.status === 'pending' ||
            withdrawal.status === 'processing'
          ) {
            await supabase
              .from('b2c_withdrawals')
              .update({
                status: 'failed',

                metadata: {
                  ...(withdrawal.metadata || {}),
                  manual_check: statusData,
                },
              })
              .eq('id', withdrawal.id);

            await releaseLockedFunds(
              withdrawal.user_id,
              Number(withdrawal.amount),
              true
            );

            await addLedgerEntry(
              withdrawal.user_id,
              Number(withdrawal.amount),
              'withdrawal',
              'credit',
              `Withdrawal failed/reversed (${reference}) [manual check]`
            );
          }

          return reply.send({
            success: true,
            data: {
              reference,
              status: 'failed',
              amount: withdrawal.amount,
            },
          });
        }

        // ---------------------------------------------------------
        // STILL PROCESSING
        // ---------------------------------------------------------

        return reply.send({
          success: true,
          data: {
            reference,
            status: withdrawal.status,
            provider_status: normalized,
            amount: withdrawal.amount,
          },
        });
      } catch (error) {
        logger.error(
          error,
          'Manual PalPluss status check error'
        );

        return reply
          .status(500)
          .send({
            error: 'Internal server error',
          });
      }
    }
  );

  // ==========================================================================
  // INITIATE B2C WITHDRAWAL
  // ==========================================================================

  fastify.post(
    '/wallet/withdraw/b2c',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        // ---------------------------------------------------------------
        // AUTH
        // ---------------------------------------------------------------

        const token =
          request.headers.authorization?.replace(
            'Bearer ',
            ''
          );

        if (!token) {
          return reply
            .status(401)
            .send({
              error: 'Unauthorized',
            });
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(token);

        if (userError || !user) {
          return reply
            .status(401)
            .send({
              error: 'Invalid token',
            });
        }

        // ---------------------------------------------------------------
        // REQUEST BODY
        // ---------------------------------------------------------------

        const body =
          (request.body || {}) as {
            amount?: number | string;
            phone?: string;
          };

        const amount =
          Number(body.amount);

        const phone =
          String(body.phone || '').trim();

        if (
          !Number.isFinite(amount) ||
          amount < 10
        ) {
          return reply
            .status(400)
            .send({
              error:
                'Withdrawal amount must be at least KES 10',
            });
        }

        // B2C API expects a valid KES amount.
        if (!Number.isInteger(amount)) {
          return reply
            .status(400)
            .send({
              error:
                'Withdrawal amount must be a whole number',
            });
        }

        if (!phone) {
          return reply
            .status(400)
            .send({
              error:
                'Phone number is required',
            });
        }

        // ---------------------------------------------------------------
        // PHONE NORMALIZATION
        //
        // Accept:
        // 0712345678
        // 0112345678
        // 254712345678
        // +254712345678
        // ---------------------------------------------------------------

        let cleanPhone =
          phone.replace(/\D/g, '');

        if (
          cleanPhone.startsWith('0') &&
          cleanPhone.length === 10
        ) {
          cleanPhone =
            `254${cleanPhone.substring(1)}`;
        }

        if (
          !cleanPhone.startsWith('254') ||
          cleanPhone.length !== 12
        ) {
          return reply
            .status(400)
            .send({
              error:
                'Phone must be a valid Kenyan number, e.g. 254712345678',
            });
        }

        // ---------------------------------------------------------------
        // WALLET
        // ---------------------------------------------------------------

        const {
          data: wallet,
          error: walletError,
        } = await supabase
          .from('wallets')
          .select('balance, locked')
          .eq('user_id', user.id)
          .single();

        if (walletError || !wallet) {
          logger.error(
            {
              userId: user.id,
              walletError,
            },
            'Wallet not found'
          );

          return reply
            .status(400)
            .send({
              error: 'Wallet not found',
            });
        }

        const balance =
          Number(wallet.balance) || 0;

        const locked =
          Number(wallet.locked) || 0;

        const availableBalance =
          balance - locked;

        if (availableBalance < amount) {
          return reply
            .status(400)
            .send({
              error: 'Insufficient balance',
              availableBalance,
              requestedAmount: amount,
            });
        }

        // ---------------------------------------------------------------
        // REFERENCE
        // ---------------------------------------------------------------

        const reference =
          `WD-${user.id.slice(0, 8)}-${Date.now()}`;

        // ---------------------------------------------------------------
        // RESERVE FUNDS
        // ---------------------------------------------------------------

        const newBalance =
          balance - amount;

        const newLocked =
          locked + amount;

        const {
          error: reserveError,
        } = await supabase
          .from('wallets')
          .update({
            balance: newBalance,
            locked: newLocked,
          })
          .eq('user_id', user.id);

        if (reserveError) {
          logger.error(
            reserveError,
            'Failed to reserve withdrawal funds'
          );

          return reply
            .status(500)
            .send({
              error:
                'Failed to reserve withdrawal funds',
            });
        }

        // ---------------------------------------------------------------
        // CREATE LOCAL WITHDRAWAL RECORD
        // ---------------------------------------------------------------

        const {
          data: withdrawal,
          error: insertError,
        } = await supabase
          .from('b2c_withdrawals')
          .insert({
            user_id: user.id,
            amount,
            phone: cleanPhone,
            reference,

            status: 'pending',

            idempotency_key:
              reference,
          })
          .select()
          .single();

        if (insertError || !withdrawal) {
          logger.error(
            {
              insertError,
              reference,
            },
            'Failed to create withdrawal record'
          );

          // Return reserved money.
          await supabase
            .from('wallets')
            .update({
              balance,
              locked,
            })
            .eq('user_id', user.id);

          return reply
            .status(500)
            .send({
              error:
                'Failed to create withdrawal record',
            });
        }

        // ---------------------------------------------------------------
        // CALLBACK URL
        // ---------------------------------------------------------------

        const callbackUrl =
          process.env.PALPLUSS_CALLBACK_URL ||
          'https://pesaki-server.onrender.com/api/webhooks/palpluss';

        // ---------------------------------------------------------------
        // CALL PALPLUSS
        // ---------------------------------------------------------------

        let palplussResponse: any;

        try {
          palplussResponse =
            await callPalplussB2C(
              amount,
              cleanPhone,
              reference,
              callbackUrl
            );
        } catch (apiError: any) {
          logger.error(
            {
              message: apiError?.message,
              code: apiError?.code,
              httpStatus: apiError?.httpStatus,
              requestId: apiError?.requestId,
              details: apiError?.details,
            },
            'PalPluss B2C API call failed'
          );

          // Return funds because payout was not accepted.
          await releaseLockedFunds(
            user.id,
            amount,
            true
          );

          await supabase
            .from('b2c_withdrawals')
            .update({
              status: 'failed',

              metadata: {
                error:
                  apiError?.message ||
                  'PalPluss API error',

                code:
                  apiError?.code || null,

                request_id:
                  apiError?.requestId || null,

                details:
                  apiError?.details || null,
              },
            })
            .eq('id', withdrawal.id);

          // Give frontend the real PalPluss error.
          return reply
            .status(
              apiError?.httpStatus &&
              apiError.httpStatus >= 400 &&
              apiError.httpStatus < 500
                ? apiError.httpStatus
                : 502
            )
            .send({
              error:
                apiError?.message ||
                'PalPluss API error',

              code:
                apiError?.code || 'PALPLUSS_ERROR',

              requestId:
                apiError?.requestId || null,
            });
        }

        // ---------------------------------------------------------------
        // SAVE PALPLUSS TRANSACTION
        // ---------------------------------------------------------------

        const providerTransactionId =
          palplussResponse.transactionId;

        const providerCheckoutId =
          palplussResponse.providerCheckoutId ||
          null;

        await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'processing',

            provider_transaction_id:
              providerTransactionId,

            provider_checkout_id:
              providerCheckoutId,

            metadata: {
              palpluss_response:
                palplussResponse.rawResponse ||
                palplussResponse,
            },
          })
          .eq('id', withdrawal.id);

        logger.info(
          {
            reference,
            userId: user.id,
            amount,
            phone: cleanPhone,
            transactionId:
              providerTransactionId,
          },
          'B2C withdrawal initiated successfully'
        );

        // ---------------------------------------------------------------
        // SUCCESS RESPONSE TO FRONTEND
        // ---------------------------------------------------------------

        return reply.send({
          success: true,

          data: {
            reference,

            status: 'processing',

            transactionId:
              providerTransactionId,

            amount,

            phone: cleanPhone,

            message:
              'Withdrawal initiated successfully. Awaiting M-Pesa confirmation.',
          },
        });
      } catch (error) {
        logger.error(
          error,
          'Error in /wallet/withdraw/b2c'
        );

        return reply
          .status(500)
          .send({
            error:
              'Internal server error',
          });
      }
    }
  );

  // ==========================================================================
  // GET WITHDRAWAL STATUS
  // ==========================================================================

  fastify.get(
    '/wallet/withdrawals/status/:reference',
    async (
      request: FastifyRequest,
      reply: FastifyReply
    ) => {
      try {
        const token =
          request.headers.authorization?.replace(
            'Bearer ',
            ''
          );

        if (!token) {
          return reply
            .status(401)
            .send({
              error: 'Unauthorized',
            });
        }

        const {
          data: { user },
          error: userError,
        } = await supabase.auth.getUser(token);

        if (userError || !user) {
          return reply
            .status(401)
            .send({
              error: 'Invalid token',
            });
        }

        const { reference } =
          request.params as {
            reference: string;
          };

        const {
          data: withdrawal,
          error: withdrawalError,
        } = await supabase
          .from('b2c_withdrawals')
          .select(
            `
              status,
              amount,
              phone,
              reference,
              created_at,
              completed_at,
              provider_transaction_id,
              provider_checkout_id,
              metadata
            `
          )
          .eq('reference', reference)
          .eq('user_id', user.id)
          .maybeSingle();

        if (withdrawalError || !withdrawal) {
          return reply
            .status(404)
            .send({
              error:
                'Withdrawal not found',
            });
        }

        return reply.send({
          success: true,

          data: {
            reference:
              withdrawal.reference,

            status:
              withdrawal.status,

            amount:
              withdrawal.amount,

            phone:
              withdrawal.phone,

            created_at:
              withdrawal.created_at,

            completed_at:
              withdrawal.completed_at,

            provider_transaction_id:
              withdrawal.provider_transaction_id,

            provider_checkout_id:
              withdrawal.provider_checkout_id,

            metadata:
              withdrawal.metadata,
          },
        });
      } catch (error) {
        logger.error(
          error,
          'Error in withdrawal status route'
        );

        return reply
          .status(500)
          .send({
            error:
              'Internal server error',
          });
      }
    }
  );
};
