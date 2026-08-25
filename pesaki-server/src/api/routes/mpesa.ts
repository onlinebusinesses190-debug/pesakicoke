import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { logger } from '../../utils/logger';
import { credit } from '../../wallet/service';
import { supabase } from '../../lib/supabase';

export const mpesaRoutes = async (fastify: FastifyInstance) => {
  fastify.post('/k', async (request: FastifyRequest, reply: FastifyReply) => {
    const body: any = request.body;
    logger.info({ body }, 'M-Pesa STK webhook received');
    
    try {
      const stkCallback = body?.Body?.stkCallback;
      if (!stkCallback) return reply.code(200).send({ success: true });

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = stkCallback.ResultCode;
      const resultDesc = stkCallback.ResultDesc;
      
      if (!checkoutRequestId) {
        logger.warn('Received M-Pesa webhook missing CheckoutRequestID');
        return reply.code(200).send({ success: true });
      }

      // Failed or cancelled callbacks have non-zero result codes. Log full context to aid debugging.
      if (resultCode !== 0) {
        try {
          const { data: depositRecord, error: depositRecordError } = await supabase
            .from('mpesa_deposits')
            .select('user_id, phone, amount, status')
            .eq('checkout_request_id', checkoutRequestId)
            .single();

          if (depositRecordError || !depositRecord) {
            logger.info({ resultCode, reason: resultDesc, checkoutRequestId, stkCallback }, `M-Pesa STK callback failed/cancelled: ${resultDesc} (Code: ${resultCode}) - No matching deposit found`);
          } else {
            logger.info({ resultCode, reason: resultDesc, checkoutRequestId, deposit: depositRecord }, `M-Pesa STK callback failed/cancelled for pending deposit: ${resultDesc} (Code: ${resultCode})`);
          }

          await supabase.from('mpesa_deposits').update({ status: 'failed' }).eq('checkout_request_id', checkoutRequestId);
        } catch (err) {
          logger.error({ err, checkoutRequestId, resultCode, stkCallback }, 'Error while handling failed M-Pesa STK callback');
        }

        return reply.code(200).send({ success: true }); // Always 200 for Safaricom
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

      // Look up user_id from mpesa_deposits
      const { data: depositData, error: depositError } = await supabase
        .from('mpesa_deposits')
        .select('user_id, status')
        .eq('checkout_request_id', checkoutRequestId)
        .single();
        
      if (depositError || !depositData) {
        logger.error({ error: depositError, checkoutRequestId }, 'Could not find pending deposit entry for webhook');
        return reply.code(200).send({ success: true });
      }

      if (depositData.status === 'completed') {
        logger.info({ checkoutRequestId }, 'Deposit already processed and credited');
        return reply.code(200).send({ success: true });
      }

      // Update to completed
      await supabase.from('mpesa_deposits').update({ status: 'completed' }).eq('checkout_request_id', checkoutRequestId);

      // Perform real credit
      await credit(depositData.user_id, amount, 'real', `M-Pesa Deposit: ${mpesaReceipt}`);
      logger.info({ mpesaReceipt, amount, userId: depositData.user_id }, 'Processed accepted M-PESA deposit');

    } catch (error) {
      logger.error(error, 'Error processing M-Pesa webhook');
    }

    return reply.code(200).send({ success: true });
  });

  // Validation URL
  fastify.post('/v', async (request: FastifyRequest, reply: FastifyReply) => {
    logger.info({ body: request.body }, 'M-Pesa Validation received');
    return reply.code(200).send({
      ResultCode: 0,
      ResultDesc: 'Accepted'
    });
  });


  
  // Confirmation URL
  fastify.post('/c', async (request: FastifyRequest, reply: FastifyReply) => {
    const body: any = request.body;
    logger.info({ body }, 'M-Pesa Confirmation received');

    try {
      const amount = Number(body.TransAmount);
      const mpesaReceipt = body.TransID;
      const phoneNumber = body.MSISDN; // Format: 2547XXXXXXXX

      // Find user by phone number in profiles
      const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', phoneNumber)
        .single();

      if (profileError || !profile) {
        // Try normalized phone if direct match fails (e.g. if stored as 07...)
        // But MSISDN is usually 254...
        logger.error({ phoneNumber, mpesaReceipt }, 'C2B received for unknown phone number');
        return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      // Credit the wallet
      await credit(profile.id, amount, 'real', `M-Pesa C2B Deposit: ${mpesaReceipt}`);
      logger.info({ mpesaReceipt, amount, userId: profile.id }, 'Processed accepted M-PESA C2B deposit');

    } catch (error) {
      logger.error(error, 'Error processing M-Pesa C2B confirmation');
    }

    return reply.code(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
  });
};
