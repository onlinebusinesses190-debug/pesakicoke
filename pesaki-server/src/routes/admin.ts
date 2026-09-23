import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { supabase } from '../lib/supabase';
import { verifyAdmin } from '../middleware/adminAuth';
import { logger } from '../utils/logger';

export default async function adminRoutes(server: FastifyInstance) {
  logger.info('✅ adminRoutes loaded');

  // ─── GET /admin/me — verify admin status ──────────────────────────────
  server.get('/admin/me', { preHandler: [verifyAdmin] }, async (request: FastifyRequest, reply: FastifyReply) => {
    return reply.send({
      success: true,
      user: {
        id: request.adminUser!.id,
        email: request.adminUser!.email,
        role: request.adminUser!.role,
      },
    });
  });

  // ─── GET /admin/dashboard ─────────────────────────────────────────────
  server.get('/admin/dashboard', { preHandler: [verifyAdmin] }, async (_request: FastifyRequest, reply: FastifyReply) => {
    try {
      // Total users
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      // Active users (last 30 days via last_sign_in_at on auth.users)
      const { count: activeUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      // Pending KYC = users without email confirmation
      const { count: pendingKyc } = await supabase.rpc('count_unconfirmed_users');

      // Total deposits (wallet_ledger credits of type deposit)
      const { data: depRows } = await supabase
        .from('wallet_ledger')
        .select('amount', { count: 'exact' })
        .eq('type', 'deposit')
        .eq('mode', 'credit')
        .eq('is_demo', false);

      // Total withdrawals
      const { data: wdRows } = await supabase
        .from('wallet_ledger')
        .select('amount', { count: 'exact' })
        .eq('type', 'withdrawal')
        .eq('mode', 'debit')
        .eq('is_demo', false);

      // Pending withdrawals (b2c_withdrawals pending)
      const { data: pendingWdRows } = await supabase
        .from('b2c_withdrawals')
        .select('amount')
        .eq('status', 'pending');

      // Total deposits via mpesa_deposits
      const { data: mpesaDepRows } = await supabase
        .from('mpesa_deposits')
        .select('amount')
        .eq('status', 'completed');

      // Active jobs
      const { count: activeJobs } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');

      // Funded businesses (business_applications approved/disbursed)
      const { count: fundedBusinesses } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Approved', 'Disbursed']);

      // Open tickets
      const { count: openTickets } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .neq('status', 'resolved');

      const totalDeposits = (depRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0) +
        (mpesaDepRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
      const totalWithdrawals = (wdRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
      const pendingWithdrawals = (pendingWdRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);

      // Revenue = deposit fees + withdrawal fees (approximate as sum of wallet_ledger referral credits)
      const { data: revRows } = await supabase
        .from('wallet_ledger')
        .select('amount')
        .eq('type', 'referral')
        .eq('mode', 'credit');

      const platformRevenue = (revRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);

      // Revenue series: aggregate deposits by month (last 12 months)
      const { data: revenueSeries } = await supabase.rpc('admin_revenue_series');

      // Recent transactions (wallet_ledger joined with profiles)
      const { data: recentTx } = await supabase.rpc('admin_recent_transactions', { p_limit: 10 });

      return reply.send({
        success: true,
        stats: {
          totalUsers: totalUsers || 0,
          activeUsers: activeUsers || 0,
          pendingKyc: pendingKyc || 0,
          totalDeposits,
          totalWithdrawals,
          pendingWithdrawals,
          platformRevenue,
          openTickets: openTickets || 0,
          activeJobs: activeJobs || 0,
          fundedBusinesses: fundedBusinesses || 0,
        },
        revenueSeries: revenueSeries || [],
        recentTransactions: recentTx || [],
      });
    } catch (error: any) {
      logger.error(error, 'Error in /admin/dashboard');
      return reply.status(500).send({ success: false, error: 'Internal server error' });
    }
  });

  // ─── GET /admin/users ─────────────────────────────────────────────────
  server.get(
    '/admin/users',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { search?: string; limit?: string; offset?: string };
        const search = query.search || '';
        const limit = Math.min(Number(query.limit) || 50, 100);
        const offset = Number(query.offset) || 0;

        const { data, error } = await supabase.rpc('admin_list_users', {
          p_search: search,
          p_limit: limit,
          p_offset: offset,
        });

        if (error) throw error;

        return reply.send({ success: true, users: data || [] });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/users');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/users/:id ─────────────────────────────────────────────
  server.get<{ Params: { id: string } }>(
    '/admin/users/:id',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;

        const { data: profile, error: profileError } = await supabase
          .from('profiles')
          .select('id, full_name, email, phone, referral_code, referred_by, referred_at, created_at, banned')
          .eq('id', id)
          .maybeSingle();

        if (profileError) throw profileError;
        if (!profile) return reply.status(404).send({ success: false, error: 'User not found' });

        const { data: wallet } = await supabase
          .from('wallets')
          .select('balance, demo_balance, locked')
          .eq('user_id', id)
          .maybeSingle();

        const { data: referralRows } = await supabase
          .from('referrals')
          .select('id, referred_user_id, status, first_deposit_amount, referrer_bonus_paid, qualified_at, created_at')
          .eq('referrer_id', id);

        return reply.send({
          success: true,
          user: {
            id: profile.id,
            email: profile.email,
            full_name: profile.full_name,
            phone: profile.phone,
            referral_code: profile.referral_code,
            referred_by: profile.referred_by,
            referred_at: profile.referred_at,
            created_at: profile.created_at,
            banned: profile.banned,
            wallet: wallet || null,
            referrals: referralRows || [],
          },
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/users/:id');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── PATCH /admin/users/:id/ban ───────────────────────────────────────
  server.patch<{ Params: { id: string }; Body: { banned: boolean } }>(
    '/admin/users/:id/ban',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { banned: boolean } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { banned } = request.body;

        const { error } = await supabase
          .from('profiles')
          .update({ banned: Boolean(banned) })
          .eq('id', id);

        if (error) {
          if (error.message.includes('column') && error.message.includes('does not exist')) {
            return reply.status(400).send({ success: false, error: 'banned column does not exist on profiles', code: 'COLUMN_MISSING' });
          }
          throw error;
        }

        return reply.send({ success: true, banned: Boolean(banned) });
      } catch (error: any) {
        logger.error(error, 'Error in PATCH /admin/users/:id/ban');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/finance/withdrawals ────────────────────────────────────
  server.get(
    '/admin/finance/withdrawals',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('b2c_withdrawals')
          .select('id, user_id, amount, phone, reference, status, provider_transaction_id, created_at, updated_at')
          .eq('status', 'pending')
          .order('created_at', { ascending: false });

        if (error) throw error;

        // Join with profiles for user display name
        const userIds = Array.from(new Set((data || []).map((w: { user_id: string }) => w.user_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
          p.id,
          p.full_name || p.email?.split('@')[0] || 'Unknown',
        ]));

        const withdrawals = (data || []).map((w: any) => ({
          ...w,
          user: profileMap.get(w.user_id) || 'Unknown',
        }));

        return reply.send({ success: true, withdrawals });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/finance/withdrawals');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/finance/withdrawal/:id/approve ────────────────────────
  server.post<{ Params: { id: string } }>(
    '/admin/finance/withdrawal/:id/approve',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { data, error } = await supabase
          .from('b2c_withdrawals')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.status(404).send({ success: false, error: 'Withdrawal not found or already processed' });

        return reply.send({ success: true, withdrawal: data });
      } catch (error: any) {
        logger.error(error, 'Error approving withdrawal');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/finance/withdrawal/:id/reject ─────────────────────────
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/finance/withdrawal/:id/reject',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { reason } = request.body || {};

        const { data, error } = await supabase
          .from('b2c_withdrawals')
          .update({
            status: 'failed',
            metadata: { rejection_reason: reason || 'Rejected by admin' },
          })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.status(404).send({ success: false, error: 'Withdrawal not found or already processed' });

        const { error: releaseError } = await supabase.rpc('release_locked_funds', {
          p_user_id: data.user_id,
          p_amount: Number(data.amount),
        });

        if (releaseError) {
          logger.warn({ error: releaseError.message, withdrawalId: id }, 'Failed to release locked funds on rejection');
        }

        return reply.send({ success: true, withdrawal: data });
      } catch (error: any) {
        logger.error(error, 'Error rejecting withdrawal');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/finance/transactions ───────────────────────────────────
  server.get(
    '/admin/finance/transactions',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase.rpc('admin_recent_transactions', { p_limit: 50 });
        if (error) throw error;
        return reply.send({ success: true, transactions: data || [] });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/finance/transactions');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/finance/deposits ───────────────────────────────────────
  server.get(
    '/admin/finance/deposits',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('mpesa_deposits')
          .select('id, user_id, amount, phone, status, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(50);

        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((d: { user_id: string }) => d.user_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
          p.id,
          p.full_name || p.email?.split('@')[0] || 'Unknown',
        ]));

        const deposits = (data || []).map((d: any) => ({
          ...d,
          user: profileMap.get(d.user_id) || 'Unknown',
        }));

        return reply.send({ success: true, deposits });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/finance/deposits');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/kazi/jobs ─────────────────────────────────────────────
  server.get(
    '/admin/kazi/jobs',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { search?: string; limit?: string };
        const search = query.search || '';
        const limit = Math.min(Number(query.limit) || 50, 100);

        let queryBuilder = supabase
          .from('jobs')
          .select('id, title, category, location, pay_amount, pay_label, status, badge, created_at, employer_id')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (search) {
          queryBuilder = queryBuilder.ilike('title', `%${search}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        const employerIds = Array.from(new Set((data || []).map((j: { employer_id: string }) => j.employer_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', employerIds);

        const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
          p.id,
          p.full_name || p.email?.split('@')[0] || 'Unknown',
        ]));

        const jobs = (data || []).map((j: any) => ({
          ...j,
          employer: profileMap.get(j.employer_id) || 'Unknown',
          pay: j.pay_label || Number(j.pay_amount),
        }));

        return reply.send({ success: true, jobs });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/kazi/jobs');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/kazi/disputes ─────────────────────────────────────────
  server.get(
    '/admin/kazi/disputes',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('kazi_disputes')
          .select('*, kazi_escrow!inner (amount, status, job_id, jobs!inner (title, employer_id))')
          .order('created_at', { ascending: false });

        if (error) throw error;

        const employerIds = Array.from(new Set(
          (data || []).map((d: any) => d.kazi_escrow?.jobs?.employer_id).filter(Boolean)
        ));
        const workerIds = Array.from(new Set(
          (data || []).map((d: any) => d.worker_id).filter(Boolean)
        ));
        const allIds = Array.from(new Set([...employerIds, ...workerIds]));

        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', allIds);

        const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
          p.id,
          p.full_name || p.email?.split('@')[0] || 'Unknown',
        ]));

        const disputes = (data || []).map((d: any) => ({
          ...d,
          jobTitle: d.kazi_escrow?.jobs?.title || 'Untitled',
          employer: profileMap.get(d.kazi_escrow?.jobs?.employer_id) || 'Unknown',
          worker: profileMap.get(d.worker_id) || 'Unknown',
          amount: Number(d.kazi_escrow?.amount || 0),
          status: d.worker_response ? 'responded' : 'open',
        }));

        return reply.send({ success: true, disputes });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/kazi/disputes');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/kazi/dispute/:id/resolve ──────────────────────────────
  server.post<{ Params: { id: string }; Body: { resolution: string; refund_to: 'employer' | 'worker' } }>(
    '/admin/kazi/dispute/:id/resolve',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { resolution: string; refund_to: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { resolution, refund_to } = request.body;

        const { data: dispute, error: disputeError } = await supabase
          .from('kazi_disputes')
          .select('*, kazi_escrow!inner (id, amount, worker_id)')
          .eq('id', id)
          .single();

        if (disputeError || !dispute) {
          return reply.status(404).send({ success: false, error: 'Dispute not found' });
        }

        const escrow = dispute.kazi_escrow;
        const amount = Number(escrow.amount);
        const fee = Math.round(amount * 0.10);
        const now = new Date().toISOString();

        if (refund_to === 'employer') {
          const employerAmount = Math.round(amount * 0.90);
          const { error: creditError } = await supabase.rpc('credit_wallet', {
            p_user_id: dispute.employer_id,
            p_amount: employerAmount,
            p_mode: 'real',
            p_description: `Dispute ${id} resolution - refund`,
          });

          if (creditError) throw creditError;

          await supabase
            .from('kazi_escrow')
            .update({ status: 'refunded', released_amount: employerAmount, fee_amount: fee, released_at: now, updated_at: now })
            .eq('id', escrow.id);

          await supabase
            .from('kazi_disputes')
            .update({ resolved_at: now, resolution: resolution || null, resolved_by: request.adminUser!.id })
            .eq('id', id);
        } else {
          const workerAmount = Math.round(amount * 0.90);
          const { error: creditError } = await supabase.rpc('credit_wallet', {
            p_user_id: dispute.worker_id,
            p_amount: workerAmount,
            p_mode: 'real',
            p_description: `Dispute ${id} resolution - payout`,
          });

          if (creditError) throw creditError;

          await supabase
            .from('kazi_escrow')
            .update({ status: 'released', released_amount: workerAmount, fee_amount: fee, released_at: now, updated_at: now })
            .eq('id', escrow.id);

          await supabase
            .from('kazi_disputes')
            .update({ resolved_at: now, resolution: resolution || null, resolved_by: request.adminUser!.id })
            .eq('id', id);
        }

        return reply.send({ success: true, resolution, refund_to });
      } catch (error: any) {
        logger.error(error, 'Error resolving dispute');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/business/applications ────────────────────────────────
  server.get(
    '/admin/business/applications',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { search?: string; limit?: string };
        const search = query.search || '';
        const limit = Math.min(Number(query.limit) || 50, 100);

        let queryBuilder = supabase
          .from('business_applications')
          .select('id, user_id, business_name, business_type, amount_requested, status, details, created_at')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (search) {
          queryBuilder = queryBuilder.ilike('business_name', `%${search}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((a: { user_id: string }) => a.user_id)));
        const { data: profiles } = await supabase
          .from('profiles')
          .select('id, full_name, email')
          .in('id', userIds);

        const profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
          p.id,
          p.full_name || p.email?.split('@')[0] || 'Unknown',
        ]));

        const applications = (data || []).map((a: any) => ({
          ...a,
          owner: profileMap.get(a.user_id) || 'Unknown',
          amount: Number(a.amount_requested),
          repaid: 0,
        }));

        return reply.send({ success: true, applications });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/business/applications');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/business/application/:id/status ───────────────────────
  server.post<{ Params: { id: string }; Body: { status: string } }>(
    '/admin/business/application/:id/status',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string }; Body: { status: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { status } = request.body;

        const { data, error } = await supabase
          .from('business_applications')
          .update({ status })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.status(404).send({ success: false, error: 'Application not found' });

        return reply.send({ success: true, application: data });
      } catch (error: any) {
        logger.error(error, 'Error updating business application status');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/banking/summary ───────────────────────────────────────
  server.get(
    '/admin/banking/summary',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Aggregate locked savings by duration_months + apy (plan tiers)
        const { data: savings, error: savingsError } = await supabase
          .from('locked_savings')
          .select('apy, duration_months, amount')
          .eq('status', 'active');

        if (savingsError) throw savingsError;

        // Aggregate investments
        const { data: investments, error: invError } = await supabase
          .from('investments')
          .select('apy, amount')
          .eq('status', 'active');

        if (invError) throw invError;

        const totalLocked = [...(savings || []), ...(investments || [])]
          .reduce((s: number, item: { amount: number }) => s + Number(item.amount), 0);

        // Group savings by apy tier
        const tierMap = new Map<string, { members: number; locked: number }>();
        for (const s of savings || []) {
          const apy = Number(s.apy);
          const key = `${apy}`;
          const existing = tierMap.get(key) || { members: 0, locked: 0 };
          existing.members += 1;
          existing.locked += Number(s.amount);
          tierMap.set(key, existing);
        }

        const plans = Array.from(tierMap.entries()).map(([apy, val]) => ({
          plan: `PESAKI Save ${apy}%`,
          apy: `${apy}%`,
          members: val.members,
          locked: val.locked,
        }));

        // Add a default tier if none
        if (plans.length === 0) {
          plans.push({ plan: 'No active plans', apy: '0%', members: 0, locked: 0 });
        }

        return reply.send({
          success: true,
          plans,
          totalLocked,
          totalMembers: plans.reduce((s: number, p: { members: number }) => s + p.members, 0),
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/banking/summary');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/trading/summary ───────────────────────────────────────
  server.get(
    '/admin/trading/summary',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Aggregate fx_trades by pair
        const { data: trades, error: tradesError } = await supabase
          .from('fx_trades')
          .select('pair, user_id, amount, stake, mode, status');

        if (tradesError) throw tradesError;

        const productMap = new Map<string, { users: Set<string>; volume: number; status: string }>();
        for (const t of trades || []) {
          const pair = t.pair;
          const existing = productMap.get(pair) || { users: new Set(), volume: 0, status: 'Live' };
          existing.users.add(t.user_id);
          existing.volume += Number(t.stake);
          productMap.set(pair, existing);
        }

        const products = Array.from(productMap.entries()).map(([pair, val]) => ({
          product: pair,
          users: val.users.size,
          volume: val.volume,
          status: val.status,
        }));

        if (products.length === 0) {
          products.push({ product: 'No active trading', users: 0, volume: 0, status: 'Paused' });
        }

        const totalVolume = products.reduce((s: number, p: { volume: number }) => s + p.volume, 0);
        const totalUsers = products.reduce((s: number, p: { users: number }) => s + p.users, 0);

        return reply.send({
          success: true,
          products,
          totalVolume,
          totalUsers,
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/trading/summary');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/notifications ─────────────────────────────────────────
  server.get(
    '/admin/notifications',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase
          .from('notification_broadcasts')
          .select('id, title, body, audience, channel, status, created_at')
          .order('created_at', { ascending: false })
          .limit(20);

        if (error) throw error;

        const broadcasts = (data || []).map((n: any) => ({
          ...n,
          sent: n.created_at,
        }));

        return reply.send({ success: true, notifications: broadcasts });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/notifications');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/notifications ────────────────────────────────────────
  server.post<{ Body: { title: string; message: string; audience: string; channel: string } }>(
    '/admin/notifications',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Body: { title: string; message: string; audience: string; channel: string } }>, reply: FastifyReply) => {
      try {
        const { title, message, audience, channel } = request.body;
        const adminId = request.adminUser!.id;

        if (!title || !message) {
          return reply.status(400).send({ success: false, error: 'title and message are required' });
        }

        const { data, error } = await supabase
          .from('notification_broadcasts')
          .insert({
            title,
            body: message,
            audience: audience || 'all',
            channel: channel || 'in_app',
            status: 'sent',
            created_by: adminId,
          })
          .select()
          .single();

        if (error) throw error;

        return reply.send({ success: true, notification: data });
      } catch (error: any) {
        logger.error(error, 'Error creating notification');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/support/tickets ───────────────────────────────────────
  server.get(
    '/admin/support/tickets',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const query = request.query as { search?: string; limit?: string };
        const search = query.search || '';
        const limit = Math.min(Number(query.limit) || 50, 100);

        let queryBuilder = supabase
          .from('support_tickets')
          .select('id, user_id, subject, priority, status, created_at, updated_at')
          .order('created_at', { ascending: false })
          .limit(limit);

        if (search) {
          queryBuilder = queryBuilder.ilike('subject', `%${search}%`);
        }

        const { data, error } = await queryBuilder;
        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id).filter(Boolean)));
        let profileMap = new Map<string, string>();

        if (userIds.length > 0) {
          const { data: profiles } = await supabase
            .from('profiles')
            .select('id, full_name, email')
            .in('id', userIds);
          profileMap = new Map((profiles || []).map((p: { id: string; full_name: string | null; email: string | null }) => [
            p.id,
            p.full_name || p.email?.split('@')[0] || 'Unknown',
          ]));
        }

        const tickets = (data || []).map((t: any) => ({
          ...t,
          user: profileMap.get(t.user_id) || 'Unknown',
        }));

        return reply.send({ success: true, tickets });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/support/tickets');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── POST /admin/support/ticket/:id/resolve ────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/admin/support/ticket/:id/resolve',
    { preHandler: [verifyAdmin] },
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const { id } = request.params;
        const { data, error } = await supabase
          .from('support_tickets')
          .update({ status: 'resolved', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.status(404).send({ success: false, error: 'Ticket not found' });

        return reply.send({ success: true, ticket: data });
      } catch (error: any) {
        logger.error(error, 'Error resolving ticket');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/commissions/referrals ─────────────────────────────────
  server.get(
    '/admin/commissions/referrals',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data: earnings, error } = await supabase
          .from('referral_earnings_log')
          .select('referrer_id, amount, source, created_at');

        if (error) throw error;

        const { data: referralRows, error: qrError } = await supabase
          .from('referrals')
          .select('referrer_id, status, created_at');

        if (qrError) throw qrError;

        // Calculate tier-based stats
        const referrerStats = new Map<string, { count: number; payout: number }>();
        for (const e of earnings || []) {
          const stat = referrerStats.get(e.referrer_id) || { count: 0, payout: 0 };
          stat.payout += Number(e.amount);
          referrerStats.set(e.referrer_id, stat);
        }
        for (const r of referralRows || []) {
          if (r.status === 'qualified') {
            const stat = referrerStats.get(r.referrer_id) || { count: 0, payout: 0 };
            stat.count += 1;
            referrerStats.set(r.referrer_id, stat);
          }
        }

        // Group referrals into tiers
        const tiers = [
          { tier: 'Bronze', referrals: '1–10', rate: '5%', payout: 0, count: 0 },
          { tier: 'Silver', referrals: '11–50', rate: '7%', payout: 0, count: 0 },
          { tier: 'Gold', referrals: '51–200', rate: '10%', payout: 0, count: 0 },
          { tier: 'Platinum', referrals: '200+', rate: '15%', payout: 0, count: 0 },
        ];

        let totalPayout = 0;
        let totalReferrers = 0;
        for (const [, stat] of referrerStats) {
          totalPayout += stat.payout;
          totalReferrers += 1;
          if (stat.count <= 10) {
            tiers[0].payout += stat.payout;
            tiers[0].count += 1;
          } else if (stat.count <= 50) {
            tiers[1].payout += stat.payout;
            tiers[1].count += 1;
          } else if (stat.count <= 200) {
            tiers[2].payout += stat.payout;
            tiers[2].count += 1;
          } else {
            tiers[3].payout += stat.payout;
            tiers[3].count += 1;
          }
        }

        return reply.send({
          success: true,
          tiers,
          totalPaid: totalPayout,
          activeAffiliates: totalReferrers,
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/commissions/referrals');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/reports/revenue ───────────────────────────────────────
  server.get(
    '/admin/reports/revenue',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data, error } = await supabase.rpc('admin_revenue_series');
        if (error) throw error;
        return reply.send({ success: true, revenueSeries: data || [] });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/reports/revenue');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/reports/metrics ───────────────────────────────────────
  server.get(
    '/admin/reports/metrics',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data: depRows } = await supabase
          .from('mpesa_deposits')
          .select('amount', { count: 'exact' })
          .eq('status', 'completed');

        const { data: wdRows } = await supabase
          .from('b2c_withdrawals')
          .select('amount', { count: 'exact' });

        const { count: totalUsers } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        const { count: fundedBusinesses } = await supabase
          .from('business_applications')
          .select('id', { count: 'exact', head: true })
          .in('status', ['Approved', 'Disbursed']);

        const totalDeposits = (depRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
        const totalWithdrawals = (wdRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);

        return reply.send({
          success: true,
          metrics: {
            platformRevenue: totalDeposits - totalWithdrawals,
            totalDeposits,
            totalWithdrawals,
            activeUsers: totalUsers || 0,
            fundedBusinesses: fundedBusinesses || 0,
          },
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/reports/metrics');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/users/stats ───────────────────────────────────────────
  server.get(
    '/admin/users/stats',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { count: totalUsers } = await supabase
          .from('profiles')
          .select('id', { count: 'exact', head: true });

        const { count: pendingKyc } = await supabase.rpc('count_unconfirmed_users');

        let suspendedCount = 0;
        try {
          const { count: bannedCount } = await supabase
            .from('profiles')
            .select('banned', { count: 'exact', head: true })
            .eq('banned', true);
          suspendedCount = bannedCount || 0;
        } catch {
          // banned column may not exist yet; tolerate absence
        }

        return reply.send({
          success: true,
          stats: {
            totalUsers: totalUsers || 0,
            activeUsers: (totalUsers || 0) - suspendedCount,
            pendingKyc: pendingKyc || 0,
            suspended: suspendedCount,
          },
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/users/stats');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );

  // ─── GET /admin/finance/stats ─────────────────────────────────────────
  server.get(
    '/admin/finance/stats',
    { preHandler: [verifyAdmin] },
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { data: depRows } = await supabase
          .from('wallet_ledger')
          .select('amount', { count: 'exact' })
          .eq('type', 'deposit')
          .eq('mode', 'credit')
          .eq('is_demo', false);

        const { data: wdRows } = await supabase
          .from('wallet_ledger')
          .select('amount', { count: 'exact' })
          .eq('type', 'withdrawal')
          .eq('mode', 'debit')
          .eq('is_demo', false);

        const { data: pendingWdRows } = await supabase
          .from('b2c_withdrawals')
          .select('amount')
          .eq('status', 'pending');

        const { data: revRows } = await supabase
          .from('wallet_ledger')
          .select('amount')
          .eq('type', 'referral')
          .eq('mode', 'credit');

        const totalDeposits = (depRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
        const totalWithdrawals = (wdRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
        const pendingWithdrawals = (pendingWdRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);
        const platformRevenue = (revRows || []).reduce((s: number, r: { amount: number }) => s + Number(r.amount), 0);

        return reply.send({
          success: true,
          stats: {
            totalDeposits,
            totalWithdrawals,
            pendingWithdrawals,
            platformRevenue,
          },
        });
      } catch (error: any) {
        logger.error(error, 'Error in /admin/finance/stats');
        return reply.status(500).send({ success: false, error: 'Internal server error' });
      }
    }
  );
}
