import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function walletRoutes(server: FastifyInstance) {
  console.log('✅ walletRoutes loaded');

  // ─── Test route ────────────────────────────────────────────────
  server.get('/wallet/ping', async (_request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({ pong: true });
  });

  // ─── GET /wallet/balance ──────────────────────────────────────
  server.get('/wallet/balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized: No token' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, demo_balance, locked')
        .eq('user_id', user.id)
        .single();

      if (walletError) {
        if (walletError.code === 'PGRST116') {
          const { data: newWallet, error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: user.id, balance: 0, demo_balance: 10000, locked: 0 })
            .select('balance, demo_balance, locked')
            .single();

          if (createError) {
            console.error('Create wallet error:', createError);
            return reply.status(500).send({ error: 'Failed to create wallet' });
          }
          return reply.send(newWallet);
        }
        console.error('Wallet fetch error:', walletError);
        return reply.status(500).send({ error: 'Database error' });
      }

      return reply.send(wallet);
    } catch (err: any) {
      console.error('Unexpected error in /wallet/balance:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── GET /wallet/transactions ─────────────────────────────────
  server.get('/wallet/transactions', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { data: transactions, error: txError } = await supabase
        .from('wallet_ledger')
        .select('id, type, amount, mode, description, created_at')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (txError) {
        console.error('Transaction fetch error:', txError);
        return reply.status(500).send({ error: 'Database error' });
      }

      const txWithStatus = transactions?.map(tx => ({ ...tx, status: 'completed' })) || [];

      return reply.send(txWithStatus);
    } catch (err: any) {
      console.error('Unexpected error in /wallet/transactions:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── GET /wallet/stats ────────────────────────────────────────
  server.get('/wallet/stats', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { data: deposits, error: depError } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('user_id', user.id)
        .eq('mode', 'credit')
        .eq('type', 'deposit');

      if (depError) throw depError;

      const { data: withdrawals, error: wdError } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('user_id', user.id)
        .eq('mode', 'debit')
        .eq('type', 'withdrawal');

      if (wdError) throw wdError;

      let pendingCount = 0;
      try {
        const { data: pending, error: pendError } = await supabase
          .from('mpesa_deposits')
          .select('id')
          .eq('user_id', user.id)
          .eq('status', 'pending');

        if (!pendError) pendingCount = pending?.length || 0;
      } catch (e) { /* ignore */ }

      const { data: referrals, error: refError } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'referral')
        .eq('mode', 'credit');

      if (refError) throw refError;

      const totalDeposits = deposits?.reduce((sum, d) => sum + d.amount, 0) || 0;
      const totalWithdrawals = withdrawals?.reduce((sum, d) => sum + d.amount, 0) || 0;
      const referralEarnings = referrals?.reduce((sum, r) => sum + r.amount, 0) || 0;

      return reply.send({
        totalDeposits,
        totalWithdrawals,
        pending: pendingCount,
        referralEarnings,
      });
    } catch (err: any) {
      console.error('Stats error:', err);
      return reply.send({
        totalDeposits: 0,
        totalWithdrawals: 0,
        pending: 0,
        referralEarnings: 0,
      });
    }
  });

  // ─── POST /wallet/withdraw ────────────────────────────────────
  server.post('/wallet/withdraw', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { amount, phone } = request.body as { amount: number; phone: string };

      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, locked')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;
      const available = (wallet.balance || 0) - (Number(wallet.locked) || 0);
      if (available < amount) {
        return reply.status(400).send({ error: 'Insufficient balance' });
      }

      const newBalance = wallet.balance - amount;
      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      await supabase.from('wallet_ledger').insert({
        user_id: user.id,
        amount,
        type: 'withdrawal',
        mode: 'debit',
        description: `Withdrawal to ${phone}`,
      });

      return reply.send({ success: true, newBalance });
    } catch (err: any) {
      console.error('Withdraw error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── GET /wallet/available-balance ────────────────────────────
  server.get('/wallet/available-balance', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const mode = (request.query as any).mode as 'real' | 'demo' | undefined;
      if (!mode || (mode !== 'real' && mode !== 'demo')) {
        return reply.status(400).send({ error: 'Valid mode required' });
      }

      const balanceField = mode === 'real' ? 'balance' : 'demo_balance';

      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select(`${balanceField}, locked`)
        .eq('user_id', user.id)
        .single();

      if (walletError) {
        if (walletError.code === 'PGRST116') {
          const initial = mode === 'real' ? 0 : 10000;
          const { error: createError } = await supabase
            .from('wallets')
            .insert({ user_id: user.id, balance: 0, demo_balance: 10000, locked: 0 })
            .select(`${balanceField}, locked`)
            .single();

          if (createError) {
            console.error('Create wallet error:', createError);
            return reply.status(500).send({ error: 'Failed to create wallet' });
          }
          return reply.send({ available: initial });
        }
        console.error('Wallet fetch error:', walletError);
        return reply.status(500).send({ error: 'Database error' });
      }

      const total = (wallet as any)[balanceField] || 0;
      const locked = Number((wallet as any).locked) || 0;
      const available = Math.max(0, total - locked);

      return reply.send({ available });
    } catch (err: any) {
      console.error('Available balance error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── POST /wallet/withdraw/b2c ────────────────────────────────
  server.post('/wallet/withdraw/b2c', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { amount, phone } = request.body as { amount: number; phone: string };

      if (!amount || amount <= 0) {
        return reply.status(400).send({ error: 'Valid amount is required' });
      }

      const digits = String(phone).replace(/\D/g, '');
      let cleanPhone = digits;
      if (digits.startsWith('0')) cleanPhone = '254' + digits.slice(1);
      if (!cleanPhone.startsWith('254')) cleanPhone = '254' + cleanPhone;
      if (cleanPhone.length !== 12) {
        return reply.status(400).send({ error: 'Invalid phone number' });
      }

      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance, locked')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;
      const available = (wallet.balance || 0) - (Number(wallet.locked) || 0);
      if (available < amount) {
        return reply.status(400).send({ error: 'Insufficient available balance' });
      }

      const { data: reserved, error: reserveError } = await supabase.rpc('reserve_locked_funds', {
        p_user_id: user.id,
        p_amount: amount,
      });

      if (reserveError || reserved !== true) {
        return reply.status(400).send({ error: 'Failed to reserve funds' });
      }

      const reference = `PESAKI-WD-${Date.now()}-${user.id.slice(0, 8)}`;

      const { data: withdrawalRecord, error: insertError } = await supabase
        .from('b2c_withdrawals')
        .insert({
          user_id: user.id,
          amount,
          phone: cleanPhone,
          reference,
          status: 'pending',
        })
        .select('id, reference, status')
        .single();

      if (insertError || !withdrawalRecord) {
        await supabase.rpc('release_locked_funds', {
          p_user_id: user.id,
          p_amount: amount,
        });
        console.error('B2C withdrawal insert error:', insertError);
        return reply.status(500).send({ error: 'Failed to initialize withdrawal' });
      }

      const apiKey = process.env.PALPLUSS_API_KEY;
      const baseUrl = process.env.PALPLUSS_BASE_URL || 'https://api.palpluss.com/v1';

      if (!apiKey) {
        await supabase
          .from('b2c_withdrawals')
          .update({ status: 'failed', metadata: { error: 'Payout not configured' } })
          .eq('id', withdrawalRecord.id);
        await supabase.rpc('release_locked_funds', { p_user_id: user.id, p_amount: amount });
        return reply.status(500).send({ error: 'Payout service not configured' });
      }

      const authHeader = Buffer.from(apiKey).toString('base64');

      let payoutResult: any;
      try {
        const response = await fetch(`${baseUrl}/b2c/payouts`, {
          method: 'POST',
          headers: {
            'Authorization': `Basic ${authHeader}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            amount,
            phone: cleanPhone,
            reference,
            description: 'PESAKI withdrawal',
          }),
        });

        const text = await response.text();
        try {
          payoutResult = JSON.parse(text);
        } catch {
          console.error('Invalid Palpluss response:', text);
          payoutResult = null;
        }
      } catch (err) {
        console.error('Palpluss API error:', err);
        payoutResult = null;
      }

      if (!payoutResult || !payoutResult.success) {
        await supabase
          .from('b2c_withdrawals')
          .update({ status: 'failed', metadata: { error: 'Payout initiation failed', raw: payoutResult } })
          .eq('id', withdrawalRecord.id);

        await supabase.rpc('release_locked_funds', {
          p_user_id: user.id,
          p_amount: amount,
        });

        return reply.status(500).send({ error: 'Failed to initiate B2C payout' });
      }

      await supabase
        .from('b2c_withdrawals')
        .update({
          provider_transaction_id: payoutResult.data?.transactionId,
          provider_checkout_id: payoutResult.data?.providerCheckoutId,
          metadata: payoutResult.data || {},
        })
        .eq('id', withdrawalRecord.id);

      return reply.send({
        success: true,
        data: {
          reference,
          status: payoutResult.data?.status || 'PROCESSING',
          transactionId: payoutResult.data?.transactionId,
          providerCheckoutId: payoutResult.data?.providerCheckoutId,
          amount,
          phone: cleanPhone,
        },
      });
    } catch (err: any) {
      console.error('B2C withdraw error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── GET /wallet/withdrawals/status/:reference ────────────────
  server.get('/wallet/withdrawals/status/:reference', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) return reply.status(401).send({ error: 'Invalid token' });

      const { reference } = request.params as { reference: string };

      const { data: withdrawal, error } = await supabase
        .from('b2c_withdrawals')
        .select('id, amount, phone, status, provider_transaction_id, provider_checkout_id, created_at, updated_at')
        .eq('reference', reference)
        .eq('user_id', user.id)
        .maybeSingle();

      if (error || !withdrawal) {
        return reply.status(404).send({ error: 'Withdrawal not found' });
      }

      return reply.send(withdrawal);
    } catch (err: any) {
      console.error('Withdrawal status error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // ─── POST /wallet/transfer ────────────────────────────────────
  server.post('/wallet/transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('📌 Transfer route HIT');
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized' });
      }

      const { data: { user }, error: userError } = await supabase.auth.getUser(token);
      if (userError || !user) {
        return reply.status(401).send({ error: 'Invalid token' });
      }

      const { amount, recipient } = request.body as { amount: number; recipient: string };

      if (!amount || !recipient) {
        return reply.status(400).send({ error: 'Missing amount or recipient' });
      }

      // ─── Normalize recipient lookup ──────────────────────────────────
      const trimmed = recipient.trim();

      // Normalize phone: 0712... → 254712..., +254712... → 254712...
      const normalizedPhone = (() => {
        const digits = trimmed.replace(/\D/g, '');
        if (digits.startsWith('254') && digits.length === 12) return digits;
        if (digits.startsWith('0') && digits.length === 10) return '254' + digits.slice(1);
        if (digits.length === 9) return '254' + digits;
        return digits;
      })();

      // Try phone lookup first
      let recipientUser: { id: string } | null = null;
      const { data: byPhone } = await supabase
        .from('profiles')
        .select('id')
        .eq('phone', normalizedPhone)
        .maybeSingle();

      if (byPhone?.id) {
        recipientUser = byPhone;
      } else {
        // Fall back to case-insensitive email lookup
        const { data: byEmail } = await supabase
          .from('profiles')
          .select('id')
          .ilike('email', trimmed)
          .maybeSingle();
        recipientUser = byEmail;
      }

      if (!recipientUser) {
        return reply.status(404).send({ error: 'Recipient not found. Check the phone number or email and try again.' });
      }

      // Get sender balance
      const { data: senderWallet, error: senderError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (senderError) throw senderError;
      if (senderWallet.balance < amount) {
        return reply.status(400).send({ error: 'Insufficient balance' });
      }

      // Deduct from sender
      await supabase
        .from('wallets')
        .update({ balance: senderWallet.balance - amount })
        .eq('user_id', user.id);

      // Credit recipient
      const { data: recipientWallet, error: recipError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', recipientUser.id)
        .single();

      if (recipError) throw recipError;

      await supabase
        .from('wallets')
        .update({ balance: (recipientWallet.balance || 0) + amount })
        .eq('user_id', recipientUser.id);

      // Ledger entries
      await supabase.from('wallet_ledger').insert([
        {
          user_id: user.id,
          amount,
          type: 'transfer',
          mode: 'debit',
          description: `Transfer to ${recipient}`,
        },
        {
          user_id: recipientUser.id,
          amount,
          type: 'transfer',
          mode: 'credit',
          description: `Transfer from ${user.email || user.id}`,
        },
      ]);

      return reply.send({ success: true, message: 'Transfer completed' });
    } catch (err: any) {
      console.error('Transfer error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
}
