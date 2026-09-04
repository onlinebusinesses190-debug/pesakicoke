import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export default async function walletRoutes(server: FastifyInstance) {
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

      const { data: pending, error: pendError } = await supabase
        .from('mpesa_deposits')
        .select('id')
        .eq('user_id', user.id)
        .eq('status', 'pending');

      if (pendError) throw pendError;

      const { data: referrals, error: refError } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('user_id', user.id)
        .eq('type', 'referral')
        .eq('mode', 'credit');

      if (refError) throw refError;

      const totalDeposits = deposits?.reduce((sum, d) => sum + d.amount, 0) || 0;
      const totalWithdrawals = withdrawals?.reduce((sum, d) => sum + d.amount, 0) || 0;
      const pendingCount = pending?.length || 0;
      const referralEarnings = referrals?.reduce((sum, r) => sum + r.amount, 0) || 0;

      return reply.send({
        totalDeposits,
        totalWithdrawals,
        pending: pendingCount,
        referralEarnings,
      });
    } catch (err: any) {
      console.error('Stats error:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
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
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;
      if (wallet.balance < amount) {
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

  // ─── POST /wallet/transfer ────────────────────────────────────
  server.post('/wallet/transfer', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      console.log('📌 Transfer route hit');
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

      // Find recipient by email or phone
      const { data: recipientUser, error: findError } = await supabase
        .from('profiles')
        .select('id')
        .or(`email.eq.${recipient},phone.eq.${recipient}`)
        .single();

      if (findError || !recipientUser) {
        return reply.status(404).send({ error: 'Recipient not found' });
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
