import { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { verifyAdmin } from '../middleware/adminAuth';
import { logger } from '../utils/logger';

type QueryParams = Record<string, string | undefined>;

function safeNumber(val: unknown): number {
  return Number(val) || 0;
}

async function logAction(
  adminId: string,
  action: string,
  targetId?: string,
  targetType?: string,
  metadata?: Record<string, unknown>,
) {
  try {
    await supabase.rpc('admin_insert_action', {
      p_admin_id: adminId,
      p_action: action,
      p_target_id: targetId || null,
      p_target_type: targetType || null,
      p_metadata: metadata ? JSON.stringify(metadata) : '{}',
    });
  } catch (e) {
    logger.warn({ err: e, action }, 'Failed to log admin action');
  }
}

async function getProfileMap(userIds: string[]): Promise<Map<string, { email: string; full_name: string | null }>> {
  const map = new Map<string, { email: string; full_name: string | null }>();
  if (userIds.length === 0) return map;
  const { data: profiles } = await supabase
    .from('profiles')
    .select('id, full_name, email')
    .in('id', userIds);
  for (const p of profiles || []) {
    map.set(p.id, { email: p.email || '', full_name: p.full_name });
  }
  return map;
}

function profileDisplayName(p: { email: string; full_name: string | null }): string {
  return p.full_name || p.email?.split('@')[0] || p.email || 'Unknown';
}

export default async function adminRoutes(server: FastifyInstance) {
  logger.info('✅ adminRoutes loaded');

  // ─── GET /admin/me ──────────────────────────────────────────────────────────
  server.get('/admin/me', { preHandler: [verifyAdmin] }, async (request, reply) => {
    return reply.send({
      success: true,
      data: {
        id: request.adminUser!.id,
        email: request.adminUser!.email,
        role: request.adminUser!.role,
      },
    });
  });

  // ─── GET /admin/stats ───────────────────────────────────────────────────────
  server.get('/admin/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      // ─── Users stats ───
      const { count: totalUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true });

      const { count: newTodayUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { count: new7dUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      // Active users (signed in last 24h/7d)
      const { count: active24h } = await supabase.rpc('count_active_users_24h');
      const { count: active7d } = await supabase.rpc('count_active_users_7d');

      // Banned users
      const { count: bannedUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('banned', true);

      // Flagged users
      let flaggedUsers = 0;

      // ─── Money stats ───
      const { data: walletData } = await supabase.from('wallets').select('balance, locked');
      const totalWalletBalance = (walletData || []).reduce((s: number, w: { balance: number }) => s + safeNumber(w.balance), 0);
      const totalLocked = (walletData || []).reduce((s: number, w: { locked: number }) => s + safeNumber(w.locked), 0);

      const { data: allDepLedger } = await supabase
        .from('wallet_ledger')
        .select('amount, created_at')
        .eq('type', 'deposit')
        .eq('mode', 'credit')
        .eq('is_demo', false);

      const totalDeposits = (allDepLedger || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);
      const depositsToday = (allDepLedger || [])
        .filter((r: { created_at: string }) => r.created_at && new Date(r.created_at) >= new Date(Date.now() - 24 * 60 * 60 * 1000))
        .reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);
      const deposits7d = (allDepLedger || [])
        .filter((r: { created_at: string }) => r.created_at && new Date(r.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);
      const deposits30d = (allDepLedger || [])
        .filter((r: { created_at: string }) => r.created_at && new Date(r.created_at) >= new Date(Date.now() - 30 * 24 * 60 * 60 * 1000))
        .reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      const { data: allWdLedger } = await supabase
        .from('wallet_ledger')
        .select('amount, created_at')
        .eq('type', 'withdrawal')
        .eq('mode', 'debit')
        .eq('is_demo', false);

      const totalWithdrawals = (allWdLedger || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);
      const withdrawalsToday = (allWdLedger || [])
        .filter((r: { created_at: string }) => r.created_at && new Date(r.created_at) >= new Date(Date.now() - 24 * 60 * 60 * 1000))
        .reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);
      const withdrawals7d = (allWdLedger || [])
        .filter((r: { created_at: string }) => r.created_at && new Date(r.created_at) >= new Date(Date.now() - 7 * 24 * 60 * 60 * 1000))
        .reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      const { count: totalDepositCount } = await supabase
        .from('wallet_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'deposit')
        .eq('mode', 'credit')
        .eq('is_demo', false);

      const { count: totalWithdrawalCount } = await supabase
        .from('wallet_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'withdrawal')
        .eq('mode', 'debit')
        .eq('is_demo', false);

      const { count: totalTransfers } = await supabase
        .from('wallet_ledger')
        .select('id', { count: 'exact', head: true })
        .eq('type', 'transfer');

      const { count: pendingWithdrawals } = await supabase
        .from('b2c_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: pendingDeposits } = await supabase
        .from('mpesa_deposits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      // ─── KAZI stats ───
      const { count: totalJobs } = await supabase.from('jobs').select('id', { count: 'exact', head: true });
      const { count: openJobs } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'open');
      const { count: hiredJobs } = await supabase.from('jobs').select('id', { count: 'exact', head: true }).eq('status', 'hired');
      const { count: completedJobs } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      const { count: totalApplications } = await supabase
        .from('applications')
        .select('id', { count: 'exact', head: true });
      const { count: activeContracts } = await supabase
        .from('job_contracts')
        .select('id', { count: 'exact', head: true })
        .eq('worker_accepted', true)
        .eq('job_done', false);

      // ─── Business stats ───
      const { count: totalBusinessApps } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true });
      const { count: pendingBusinessApps } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending');
      const { count: approvedBusinessApps } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Approved');
      const { count: disbursedBusinessApps } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Disbursed');
      const { data: fundedAmounts } = await supabase
        .from('business_applications')
        .select('amount_requested')
        .in('status', ['Approved', 'Disbursed']);
      const totalFundedAmount = (fundedAmounts || []).reduce((s: number, a: { amount_requested: number }) => s + safeNumber(a.amount_requested), 0);

      // ─── Banking stats ───
      const { data: lockedSavingsData } = await supabase
        .from('locked_savings')
        .select('amount')
        .eq('status', 'active');
      const totalLockedSavings = (lockedSavingsData || []).reduce((s: number, l: { amount: number }) => s + safeNumber(l.amount), 0);

      const { data: investmentData } = await supabase
        .from('investments')
        .select('amount')
        .eq('status', 'active');
      const totalInvestments = (investmentData || []).reduce((s: number, i: { amount: number }) => s + safeNumber(i.amount), 0);

      const { count: totalGoals } = await supabase
        .from('savings_goals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'active');
      const { data: savingsGoalsData } = await supabase
        .from('savings_goals')
        .select('saved_amount')
        .eq('status', 'active');
      const totalSavingsAmount = (savingsGoalsData || []).reduce((s: number, g: { saved_amount: number }) => s + safeNumber(g.saved_amount), 0);
      const totalInvestedAmount = totalInvestments;

      // ─── Referrals stats ───
      const { count: totalReferrals } = await supabase.from('referrals').select('id', { count: 'exact', head: true });
      const { count: qualifiedReferrals } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'qualified');
      const { count: pendingReferrals } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const { data: totalPayoutsData } = await supabase.from('referral_earnings_log').select('amount');
      const totalReferralPayouts = (totalPayoutsData || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      // ─── Trading stats ───
      const { count: realFxTrades } = await supabase
        .from('fx_trades')
        .select('id', { count: 'exact', head: true })
        .eq('mode', 'real');
      const { count: demoFxTrades } = await supabase
        .from('fx_trades')
        .select('id', { count: 'exact', head: true })
        .eq('mode', 'demo');

      const { data: fxStakeData } = await supabase
        .from('fx_trades')
        .select('stake, payout_amount, mode');

      const totalWagered = (fxStakeData || []).reduce((s: number, t: { stake: number; mode: string }) => {
        if (t.mode === 'demo') return s;
        return s + safeNumber(t.stake);
      }, 0);
      const totalPaidOut = (fxStakeData || []).reduce((s: number, t: { payout_amount: number; mode: string }) => {
        if (t.mode === 'demo') return s;
        return s + safeNumber(t.payout_amount);
      }, 0);

      const { count: totalSpinResults } = await supabase.from('spin_results').select('id', { count: 'exact', head: true });
      const { data: spinAmounts } = await supabase.from('spin_results').select('amount');
      const totalSpinWinnings = (spinAmounts || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      const { count: totalPredictions } = await supabase.from('predictions').select('id', { count: 'exact', head: true });
      const { data: predAmounts } = await supabase.from('predictions').select('stake');
      const totalPredictionVolume = (predAmounts || []).reduce((s: number, p: { stake: number }) => s + safeNumber(p.stake), 0);

      const houseRevenue = totalDeposits - totalWithdrawals + totalSpinWinnings - totalPaidOut;
      const { count: totalTrades } = await supabase.from('wallet_ledger').select('id', { count: 'exact', head: true });

      return reply.send({
        success: true,
        data: {
          users: {
            total: totalUsers || 0,
            active24h: active24h || 0,
            active7d: active7d || 0,
            newToday: newTodayUsers || 0,
            new7d: new7dUsers || 0,
            banned: bannedUsers || 0,
            flagged: flaggedUsers,
          },
          money: {
            totalWalletBalance,
            totalLocked,
            totalDeposits: {
              allTime: totalDeposits,
              today: depositsToday,
              '7d': deposits7d,
              '30d': deposits30d,
            },
            totalWithdrawals: {
              allTime: totalWithdrawals,
              today: withdrawalsToday,
              '7d': withdrawals7d,
            },
            totalDepositCount,
            totalWithdrawalCount,
            totalTransfers,
            pendingWithdrawals: pendingWithdrawals || 0,
            pendingDeposits: pendingDeposits || 0,
          },
          kazi: {
            totalJobs: totalJobs || 0,
            openJobs: openJobs || 0,
            hiredJobs: hiredJobs || 0,
            completedJobs: completedJobs || 0,
            totalApplications: totalApplications || 0,
            activeContracts: activeContracts || 0,
          },
          business: {
            totalApplications: totalBusinessApps || 0,
            pending: pendingBusinessApps || 0,
            approved: approvedBusinessApps || 0,
            disbursed: disbursedBusinessApps || 0,
            totalFundedAmount,
          },
          banking: {
            totalLockedSavings,
            totalInvestments,
            totalGoals: totalGoals || 0,
            totalSavingsAmount,
            totalInvestedAmount,
          },
          referrals: {
            totalReferrals: totalReferrals || 0,
            qualified: qualifiedReferrals || 0,
            pending: pendingReferrals || 0,
            totalPayouts: totalReferralPayouts,
          },
          trading: {
            totalTrades,
            realTrades: realFxTrades || 0,
            demoTrades: demoFxTrades || 0,
            totalWagered,
            totalPaidOut,
            houseRevenue,
            spinResults: totalSpinResults || 0,
            totalSpinWinnings,
            totalPredictions,
            totalPredictionVolume,
          },
        },
      });
    } catch (error) {
      logger.error(error, 'Error in /admin/stats');
      return reply.send({
        success: true,
        data: {
          users: { total: 0, active24h: 0, active7d: 0, newToday: 0, new7d: 0, banned: 0, flagged: 0 },
          money: {
            totalWalletBalance: 0, totalLocked: 0,
            totalDeposits: { allTime: 0, today: 0, '7d': 0, '30d': 0 },
            totalWithdrawals: { allTime: 0, today: 0, '7d': 0 },
            totalDepositCount: 0, totalWithdrawalCount: 0, totalTransfers: 0,
            pendingWithdrawals: 0, pendingDeposits: 0,
          },
          kazi: { totalJobs: 0, openJobs: 0, hiredJobs: 0, completedJobs: 0, totalApplications: 0, activeContracts: 0 },
          business: { totalApplications: 0, pending: 0, approved: 0, disbursed: 0, totalFundedAmount: 0 },
          banking: { totalLockedSavings: 0, totalInvestments: 0, totalGoals: 0, totalSavingsAmount: 0, totalInvestedAmount: 0 },
          referrals: { totalReferrals: 0, qualified: 0, pending: 0, totalPayouts: 0 },
          trading: { totalTrades: 0, realTrades: 0, demoTrades: 0, totalWagered: 0, totalPaidOut: 0, houseRevenue: 0, spinResults: 0, totalSpinWinnings: 0, totalPredictions: 0, totalPredictionVolume: 0 },
        },
      });
    }
  });

  // ─── GET /admin/users ───────────────────────────────────────────────────────
  server.get('/admin/users', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const search = q.search || '';
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data: rpcData, error: rpcError } = await supabase.rpc('admin_list_users', {
        p_search: search,
        p_limit: limit,
        p_offset: offset,
      });

      if (rpcError) throw rpcError;

      let users = rpcData || [];

      if (status === 'banned') {
        users = users.filter((u: { banned: boolean }) => u.banned);
      } else if (status === 'active') {
        users = users.filter((u: { banned: boolean }) => !u.banned);
      } else if (status === 'flagged') {
        users = users.filter((u: { flagged?: boolean }) => u.flagged);
      }

      return reply.send({ success: true, data: { users, count: users.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/users');
      return reply.send({ success: true, data: { users: [], count: 0 } });
    }
  });

  // ─── GET /admin/users/:id ───────────────────────────────────────────────────
  server.get<{ Params: { id: string } }>('/admin/users/:id', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const { id } = request.params;

      let lastSignInAt: string | null = null;
      let emailConfirmedAt: string | null = null;
      let authCreatedAt: string | null = null;

      try {
        const { data: authData, error: authErr } = await supabase.auth.admin.getUserById(id);
        if (authErr) {
          logger.warn({ err: authErr.message }, 'Could not fetch auth user data');
        } else         if (authData?.user) {
          lastSignInAt = authData.user.last_sign_in_at || null;
          emailConfirmedAt = authData.user.email_confirmed_at || null;
          authCreatedAt = authData.user.created_at || null;
        }
      } catch (e) {
        logger.warn({ err: e }, 'Could not fetch auth user data');
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, referral_code, referred_by, referred_at, created_at, banned, kyc_status')
        .eq('id', id)
        .maybeSingle();

      if (!profile) return reply.code(404).send({ success: false, error: 'User not found' });

      const { data: wallet } = await supabase
        .from('wallets')
        .select('balance, demo_balance, locked')
        .eq('user_id', id)
        .maybeSingle();

      const { data: transactions } = await supabase
        .from('wallet_ledger')
        .select('id, type, mode, amount, description, created_at, is_demo')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      const { data: deposits } = await supabase
        .from('mpesa_deposits')
        .select('id, amount, phone, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: withdrawals } = await supabase
        .from('b2c_withdrawals')
        .select('id, amount, phone, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: kaziJobs } = await supabase
        .from('jobs')
        .select('id, title, status, created_at')
        .eq('employer_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: kaziApplications } = await supabase
        .from('applications')
        .select('id, job_id, status, created_at')
        .eq('worker_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: businessApps } = await supabase
        .from('business_applications')
        .select('id, business_name, amount_requested, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: lockedSavings } = await supabase
        .from('locked_savings')
        .select('id, amount, apy, duration_months, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: investments } = await supabase
        .from('investments')
        .select('id, amount, apy, duration_months, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: savingsGoalsData } = await supabase
        .from('savings_goals')
        .select('id, name, target_amount, saved_amount, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(20);

      const { data: referredByUser } = await supabase
        .from('referrals')
        .select('referrer_id, status, created_at')
        .eq('referred_user_id', id);

      const { data: referredUsers } = await supabase
        .from('referrals')
        .select('referred_user_id, status, created_at')
        .eq('referrer_id', id)
        .limit(20);

      return reply.send({
        success: true,
        data: {
          profile,
          wallet: wallet || null,
          transactions: transactions || [],
          deposits: deposits || [],
          withdrawals: withdrawals || [],
          kazi: {
            jobs: kaziJobs || [],
            applications: kaziApplications || [],
          },
          business: businessApps || [],
          banking: {
            lockedSavings: lockedSavings || [],
            investments: investments || [],
            savingsGoals: savingsGoalsData || [],
          },
          referrals: {
            referredBy: referredByUser || [],
            referredUsers: referredUsers || [],
          },
          lastSignInAt,
          emailConfirmedAt,
          authCreatedAt,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/users/:id');
      return reply.send({ success: true, data: null });
    }
  });

  // ─── POST /admin/users/:id/adjust-balance ───────────────────────────────────
  server.post<{ Params: { id: string }; Body: { amount: number; mode: string; reason: string } }>(
    '/admin/users/:id/adjust-balance',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { amount, mode, reason } = request.body;
        const adminId = request.adminUser!.id;

        if (!amount || amount <= 0) {
          return reply.code(400).send({ success: false, error: 'Invalid amount' });
        }

        const rpcMode = 'real';

        if (mode === 'credit') {
          const { data: newBalance, error } = await supabase.rpc('credit_wallet', {
            p_user_id: id,
            p_amount: amount,
            p_mode: rpcMode,
            p_description: reason || 'Admin adjustment',
          });
          if (error) throw error;
          await logAction(adminId, 'adjust_balance', id, 'user', { amount, mode, reason });
          return reply.send({ success: true, data: { newBalance } });
        } else {
          const { data: newBalance, error } = await supabase.rpc('debit_wallet', {
            p_user_id: id,
            p_amount: amount,
            p_mode: rpcMode,
            p_description: reason || 'Admin adjustment',
          });
          if (error) throw error;
          await logAction(adminId, 'adjust_balance', id, 'user', { amount, mode, reason });
          return reply.send({ success: true, data: { newBalance } });
        }
      } catch (error) {
        logger.error(error, 'Error in POST /admin/users/:id/adjust-balance');
        return reply.send({ success: false, error: 'Failed to adjust balance' });
      }
    },
  );

  // ─── POST /admin/users/:id/ban ──────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/users/:id/ban',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { reason } = request.body;
        const adminId = request.adminUser!.id;

        const { error } = await supabase
          .from('profiles')
          .update({ banned: true, ban_reason: reason || null, banned_at: new Date().toISOString() })
          .eq('id', id);

        if (error) throw error;
        await logAction(adminId, 'ban_user', id, 'user', { reason });
        return reply.send({ success: true, data: { banned: true } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/users/:id/ban');
        return reply.send({ success: false, error: 'Failed to ban user' });
      }
    },
  );

  // ─── POST /admin/users/:id/unban ───────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/admin/users/:id/unban',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const adminId = request.adminUser!.id;
        const { error } = await supabase
          .from('profiles')
          .update({ banned: false, ban_reason: null, banned_at: null })
          .eq('id', id);
        if (error) throw error;
        await logAction(adminId, 'unban_user', id, 'user', {});
        return reply.send({ success: true, data: { banned: false } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/users/:id/unban');
        return reply.send({ success: false, error: 'Failed to unban user' });
      }
    },
  );

  // ─── POST /admin/users/:id/flag ─────────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/users/:id/flag',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { reason } = request.body;
        const adminId = request.adminUser!.id;
        await logAction(adminId, 'flag_user', id, 'user', { reason });
        return reply.send({ success: true, data: { flagged: true } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/users/:id/flag');
        return reply.send({ success: false, error: 'Failed to flag user' });
      }
    },
  );

  // ─── POST /admin/users/:id/unflag ───────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/admin/users/:id/unflag',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const adminId = request.adminUser!.id;
        await logAction(adminId, 'unflag_user', id, 'user', {});
        return reply.send({ success: true, data: { flagged: false } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/users/:id/unflag');
        return reply.send({ success: false, error: 'Failed to unflag user' });
      }
    },
  );

  // ─── DELETE /admin/users/:id ────────────────────────────────────────────────
  server.delete<{ Params: { id: string } }>(
    '/admin/users/:id',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const adminId = request.adminUser!.id;
        const { error } = await supabase.auth.admin.deleteUser(id);
        if (error) throw error;
        await logAction(adminId, 'delete_user', id, 'user', {});
        return reply.send({ success: true, data: { deleted: true } });
      } catch (error) {
        logger.error(error, 'Error in DELETE /admin/users/:id');
        return reply.send({ success: false, error: 'Failed to delete user' });
      }
    },
  );

  // ─── GET /admin/transactions ────────────────────────────────────────────────
  server.get('/admin/transactions', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const txType = q.type || '';
      const userId = q.user_id || '';
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('wallet_ledger')
        .select('id, user_id, type, mode, amount, description, is_demo, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (txType) query = query.eq('type', txType);
      if (userId) query = query.eq('user_id', userId);
      if (status) query = query.eq('mode', status);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id).filter(Boolean)));
      const profileMap = await getProfileMap(userIds);

      const transactions = (data || []).map((t: {
        id: string; user_id: string; type: string; mode: string;
        amount: number; description: string; is_demo: boolean; created_at: string;
      }) => ({
        ...t,
        user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
        user_email: profileMap.get(t.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { transactions, count: transactions.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/transactions');
      return reply.send({ success: true, data: { transactions: [], count: 0 } });
    }
  });

  // ─── GET /admin/deposits ────────────────────────────────────────────────────
  server.get('/admin/deposits', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('mpesa_deposits')
        .select('id, user_id, amount, fee, phone, status, checkout_request_id, mpesa_receipt, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((d: { user_id: string }) => d.user_id).filter(Boolean)));
      const profileMap = await getProfileMap(userIds);

      const deposits = (data || []).map((d: {
        id: string; user_id: string; amount: number; fee: number; phone: string;
        status: string; checkout_request_id: string; mpesa_receipt: string | null;
        created_at: string; updated_at: string;
      }) => ({
        ...d,
        user: profileMap.get(d.user_id) ? profileDisplayName(profileMap.get(d.user_id)!) : 'Unknown',
        user_email: profileMap.get(d.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { deposits, count: deposits.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/deposits');
      return reply.send({ success: true, data: { deposits: [], count: 0 } });
    }
  });

  // ─── GET /admin/withdrawals ─────────────────────────────────────────────────
  server.get('/admin/withdrawals', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('b2c_withdrawals')
        .select('id, user_id, amount, fee, payout_amount, phone, reference, status, provider_transaction_id, created_at, updated_at, completed_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((w: { user_id: string }) => w.user_id).filter(Boolean)));
      const profileMap = await getProfileMap(userIds);

      const withdrawals = (data || []).map((w: {
        id: string; user_id: string; amount: number; fee: number; payout_amount: number; phone: string;
        reference: string; status: string; provider_transaction_id: string | null;
        created_at: string; updated_at: string; completed_at: string | null;
      }) => ({
        ...w,
        user: profileMap.get(w.user_id) ? profileDisplayName(profileMap.get(w.user_id)!) : 'Unknown',
        user_email: profileMap.get(w.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { withdrawals, count: withdrawals.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/withdrawals');
      return reply.send({ success: true, data: { withdrawals: [], count: 0 } });
    }
  });

  // ─── POST /admin/withdrawals/:id/approve ────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { notes?: string } }>(
    '/admin/withdrawals/:id/approve',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { notes } = request.body;
        const adminId = request.adminUser!.id;

        const { data, error } = await supabase
          .from('b2c_withdrawals')
          .update({ status: 'completed', completed_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Withdrawal not found or already processed' });

        await logAction(adminId, 'approve_withdrawal', id, 'withdrawal', { notes });
        return reply.send({ success: true, data: { withdrawal: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/withdrawals/:id/approve');
        return reply.send({ success: false, error: 'Failed to approve withdrawal' });
      }
    },
  );

  // ─── POST /admin/withdrawals/:id/reject ─────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/withdrawals/:id/reject',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { reason } = request.body;
        const adminId = request.adminUser!.id;

        const { data, error } = await supabase
          .from('b2c_withdrawals')
          .update({ status: 'failed' })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Withdrawal not found or already processed' });

        const { error: releaseError } = await supabase.rpc('release_locked_funds', {
          p_user_id: data.user_id,
          p_amount: Number(data.amount),
        });
        if (releaseError) {
          logger.warn({ err: releaseError.message }, 'Failed to release locked funds on rejection');
        }

        await logAction(adminId, 'reject_withdrawal', id, 'withdrawal', { reason });
        return reply.send({ success: true, data: { withdrawal: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/withdrawals/:id/reject');
        return reply.send({ success: false, error: 'Failed to reject withdrawal' });
      }
    },
  );

  // ─── GET /admin/transfers ───────────────────────────────────────────────────
  server.get('/admin/transfers', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id, user_id, type, mode, amount, description, created_at')
        .eq('type', 'transfer')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id)));
      const profileMap = await getProfileMap(userIds);

      const transfers = (data || []).map((t: {
        id: string; user_id: string; type: string; mode: string; amount: number;
        description: string; created_at: string;
      }) => ({
        ...t,
        user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
        user_email: profileMap.get(t.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { transfers, count: transfers.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/transfers');
      return reply.send({ success: true, data: { transfers: [], count: 0 } });
    }
  });

  // ─── GET /admin/referrals ───────────────────────────────────────────────────
  server.get('/admin/referrals', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('referrals')
        .select('id, referrer_id, referred_user_id, referral_code, status, first_deposit_amount, referrer_bonus_paid, qualified_at, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set([
        ...(data || []).map((r: { referrer_id: string }) => r.referrer_id),
        ...(data || []).map((r: { referred_user_id: string }) => r.referred_user_id),
      ]));
      const profileMap = await getProfileMap(userIds);

      const referrals = (data || []).map((r: {
        id: string; referrer_id: string; referred_user_id: string;
        referral_code: string; status: string; first_deposit_amount: number | null;
        referrer_bonus_paid: number | null; qualified_at: string | null; created_at: string;
      }) => ({
        ...r,
        referrer_email: profileMap.get(r.referrer_id)?.email || '',
        referred_email: profileMap.get(r.referred_user_id)?.email || '',
        referrer_name: profileMap.get(r.referrer_id) ? profileDisplayName(profileMap.get(r.referrer_id)!) : 'Unknown',
        referred_name: profileMap.get(r.referred_user_id) ? profileDisplayName(profileMap.get(r.referred_user_id)!) : 'Unknown',
      }));

      return reply.send({ success: true, data: { referrals, count: referrals.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/referrals');
      return reply.send({ success: true, data: { referrals: [], count: 0 } });
    }
  });

  // ─── GET /admin/referrals/leaderboard ───────────────────────────────────────
  server.get('/admin/referrals/leaderboard', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { data, error } = await supabase
        .from('referral_earnings_log')
        .select('referrer_id, amount, created_at');

      if (error) throw error;

      const earningsBy = new Map<string, number>();
      const countBy = new Map<string, number>();

      for (const e of data || []) {
        earningsBy.set(e.referrer_id, (earningsBy.get(e.referrer_id) || 0) + safeNumber(e.amount));
        countBy.set(e.referrer_id, (countBy.get(e.referrer_id) || 0) + 1);
      }

      const { count: qualifiedCount } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'qualified');

      const userIds = Array.from(earningsBy.keys());
      const profileMap = await getProfileMap(userIds);

      const leaderboard = Array.from(earningsBy.entries())
        .map(([uid, totalEarned]) => ({
          referrer_id: uid,
          referrer_email: profileMap.get(uid)?.email || '',
          referrer_name: profileMap.get(uid) ? profileDisplayName(profileMap.get(uid)!) : 'Unknown',
          total_earned: totalEarned,
          referrals_count: countBy.get(uid) || 0,
          qualified_count: qualifiedCount || 0,
        }))
        .sort((a, b) => b.total_earned - a.total_earned)
        .slice(0, 20);

      return reply.send({ success: true, data: { leaderboard } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/referrals/leaderboard');
      return reply.send({ success: true, data: { leaderboard: [] } });
    }
  });

  // ─── GET /admin/kazi/jobs ───────────────────────────────────────────────────
  server.get('/admin/kazi/jobs', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const search = q.search || '';
      const jobStatus = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('jobs')
        .select('id, title, category, location, pay_amount, pay_label, status, badge, employer_id, hired_worker_id, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (search) query = query.ilike('title', `%${search}%`);
      if (jobStatus) query = query.eq('status', jobStatus);

      const { data, error } = await query;
      if (error) throw error;

      const employerIds = Array.from(new Set((data || []).map((j: { employer_id: string }) => j.employer_id)));
      const workerIds = Array.from(new Set((data || []).map((j: { hired_worker_id: string | null }) => j.hired_worker_id).filter(Boolean)));
      const allIds = [...employerIds, ...(workerIds as string[])];
      const profileMap = await getProfileMap(allIds);

      const jobIds = (data || []).map((j: { id: string }) => j.id);

      const { data: escrowData } = await supabase
        .from('kazi_escrow')
        .select('job_id, amount, status, worker_id')
        .in('job_id', jobIds);

       const escrowMap = new Map((escrowData || []).map((e: { job_id: string; amount: number; status: string; worker_id: string | null }) => [e.job_id, e]));

      // Application counts via separate queries
      const appCountMap = new Map<string, number>();
      for (const jobId of jobIds) {
        const { count } = await supabase
          .from('applications')
          .select('id', { count: 'exact', head: true })
          .eq('job_id', jobId);
        appCountMap.set(jobId, count || 0);
      }

      const jobs = (data || []).map((j: {
        id: string; title: string; category: string; location: string;
        pay_amount: number; pay_label: string; status: string; badge: string | null;
        employer_id: string; hired_worker_id: string | null; created_at: string;
      }) => {
        const escrow = escrowMap.get(j.id);
        const hiredWorkerId = j.hired_worker_id;
        return {
          ...j,
          employer: profileMap.get(j.employer_id) ? profileDisplayName(profileMap.get(j.employer_id)!) : 'Unknown',
          employer_email: profileMap.get(j.employer_id)?.email || '',
          hired_worker: hiredWorkerId ? (profileMap.get(hiredWorkerId) ? profileDisplayName(profileMap.get(hiredWorkerId)!) : 'Unknown') : null,
          escrow_amount: escrow ? safeNumber(escrow.amount) : 0,
          escrow_status: escrow ? escrow.status : null,
          application_count: appCountMap.get(j.id) || 0,
        };
      });

      return reply.send({ success: true, data: { jobs, count: jobs.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/kazi/jobs');
      return reply.send({ success: true, data: { jobs: [], count: 0 } });
    }
  });

  // ─── GET /admin/kazi/applications ───────────────────────────────────────────
  server.get('/admin/kazi/applications', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('applications')
        .select('id, job_id, worker_id, status, cover_letter, photo_url, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const jobIds = Array.from(new Set((data || []).map((a: { job_id: string }) => a.job_id)));
      const workerIds = Array.from(new Set((data || []).map((a: { worker_id: string }) => a.worker_id)));

      const { data: jobsData } = await supabase.from('jobs').select('id, title').in('id', jobIds);
      const jobMap = new Map((jobsData || []).map((j: { id: string; title: string }) => [j.id, j.title]));

      const profileMap = await getProfileMap(workerIds);

      const applications = (data || []).map((a: {
        id: string; job_id: string; worker_id: string; status: string;
        cover_letter: string | null; photo_url: string | null; created_at: string;
      }) => ({
        ...a,
        job_title: jobMap.get(a.job_id) || 'Unknown',
        worker: profileMap.get(a.worker_id) ? profileDisplayName(profileMap.get(a.worker_id)!) : 'Unknown',
        worker_email: profileMap.get(a.worker_id)?.email || '',
      }));

      return reply.send({ success: true, data: { applications, count: applications.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/kazi/applications');
      return reply.send({ success: true, data: { applications: [], count: 0 } });
    }
  });

  // ─── GET /admin/kazi/contracts ──────────────────────────────────────────────
  server.get('/admin/kazi/contracts', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const contractStatus = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('job_contracts')
        .select('id, job_id, worker_id, employer_id, escrow_id, worker_accepted, job_done, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      const { data, error } = await query;
      if (error) throw error;

      const jobIds = Array.from(new Set((data || []).map((c: { job_id: string }) => c.job_id)));
      const workerIds = Array.from(new Set((data || []).map((c: { worker_id: string }) => c.worker_id)));
      const employerIds = Array.from(new Set((data || []).map((c: { employer_id: string }) => c.employer_id)));

      const { data: jobsData } = await supabase.from('jobs').select('id, title').in('id', jobIds);
      const jobMap = new Map((jobsData || []).map((j: { id: string; title: string }) => [j.id, j.title]));

      const allIds = [...workerIds, ...employerIds];
      const profileMap = await getProfileMap(allIds);

      const contracts = (data || []).map((c: {
        id: string; job_id: string; worker_id: string; employer_id: string;
        escrow_id: string | null; worker_accepted: boolean; job_done: boolean;
        created_at: string; updated_at: string;
      }) => ({
        ...c,
        job_title: jobMap.get(c.job_id) || 'Unknown',
        worker: profileMap.get(c.worker_id) ? profileDisplayName(profileMap.get(c.worker_id)!) : 'Unknown',
        employer: profileMap.get(c.employer_id) ? profileDisplayName(profileMap.get(c.employer_id)!) : 'Unknown',
        status: c.job_done ? 'completed' : c.worker_accepted ? 'active' : 'pending',
      }));

      // Apply status filter client-side
      let filtered = contracts;
      if (contractStatus === 'active') {
        filtered = contracts.filter((c: { status: string }) => c.status === 'active');
      } else if (contractStatus === 'completed') {
        filtered = contracts.filter((c: { status: string }) => c.status === 'completed');
      } else if (contractStatus === 'pending') {
        filtered = contracts.filter((c: { status: string }) => c.status === 'pending');
      }

      return reply.send({ success: true, data: { contracts: filtered, count: filtered.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/kazi/contracts');
      return reply.send({ success: true, data: { contracts: [], count: 0 } });
    }
  });

  // ─── GET /admin/business/applications ───────────────────────────────────────
  server.get('/admin/business/applications', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('business_applications')
        .select('id, user_id, business_name, business_type, amount_requested, status, details, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((a: { user_id: string }) => a.user_id)));
      const profileMap = await getProfileMap(userIds);

      const applications = (data || []).map((a: {
        id: string; user_id: string; business_name: string; business_type: string;
        amount_requested: number; status: string; details: string | object; created_at: string;
      }) => ({
        ...a,
        owner: profileMap.get(a.user_id) ? profileDisplayName(profileMap.get(a.user_id)!) : 'Unknown',
        owner_email: profileMap.get(a.user_id)?.email || '',
        amount: safeNumber(a.amount_requested),
      }));

      return reply.send({ success: true, data: { applications, count: applications.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/business/applications');
      return reply.send({ success: true, data: { applications: [], count: 0 } });
    }
  });

  // ─── POST /admin/business/applications/:id/status ───────────────────────────
  server.post<{ Params: { id: string }; Body: { status: string; notes?: string } }>(
    '/admin/business/applications/:id/status',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status, notes } = request.body;
        const adminId = request.adminUser!.id;

        const updates: Record<string, unknown> = { status };
        if (notes) updates.reviewer_notes = notes;

        const { data, error } = await supabase
          .from('business_applications')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Application not found' });

        await logAction(adminId, 'update_business_application', id, 'business_application', { status, notes });
        return reply.send({ success: true, data: { application: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/business/applications/:id/status');
        return reply.send({ success: false, error: 'Failed to update application' });
      }
    },
  );

  // ─── GET /admin/business/stats ─────────────────────────────────────────────
  server.get('/admin/business/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: totalApplications } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true });
      const { count: pendingCount } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Pending');
      const { count: approvedCount } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Approved');
      const { count: disbursedCount } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Disbursed');
      const { count: rejectedCount } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'Rejected');
      const { data: fundedData } = await supabase
        .from('business_applications')
        .select('amount_requested')
        .in('status', ['Approved', 'Disbursed']);
      const totalFundedAmount = (fundedData || []).reduce((s: number, a: { amount_requested: number }) => s + safeNumber(a.amount_requested), 0);

      return reply.send({
        success: true,
        data: {
          totalApplications: totalApplications || 0,
          pending: pendingCount || 0,
          approved: approvedCount || 0,
          disbursed: disbursedCount || 0,
          rejected: rejectedCount || 0,
          totalFundedAmount,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/business/stats');
      return reply.send({
        success: true,
        data: {
          totalApplications: 0, pending: 0, approved: 0, disbursed: 0, rejected: 0, totalFundedAmount: 0,
        },
      });
    }
  });

  // ─── GET /admin/banking/locked-savings ──────────────────────────────────────
  server.get('/admin/banking/locked-savings', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('locked_savings')
        .select('id, user_id, amount, duration_months, apy, start_date, end_date, status, interest_earned, total_at_maturity, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((s: { user_id: string }) => s.user_id)));
      const profileMap = await getProfileMap(userIds);

      const savings = (data || []).map((s: {
        id: string; user_id: string; amount: number; duration_months: number;
        apy: number; start_date: string; end_date: string; status: string;
        interest_earned: number; total_at_maturity: number; created_at: string;
      }) => ({
        ...s,
        user: profileMap.get(s.user_id) ? profileDisplayName(profileMap.get(s.user_id)!) : 'Unknown',
        user_email: profileMap.get(s.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { savings, count: savings.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/banking/locked-savings');
      return reply.send({ success: true, data: { savings: [], count: 0 } });
    }
  });

  // ─── GET /admin/banking/investments ─────────────────────────────────────────
  server.get('/admin/banking/investments', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('investments')
        .select('id, user_id, amount, duration_months, apy, start_date, end_date, status, interest_earned, total_at_maturity, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((i: { user_id: string }) => i.user_id)));
      const profileMap = await getProfileMap(userIds);

      const investments = (data || []).map((i: {
        id: string; user_id: string; amount: number; duration_months: number;
        apy: number; start_date: string; end_date: string; status: string;
        interest_earned: number; total_at_maturity: number; created_at: string;
      }) => ({
        ...i,
        user: profileMap.get(i.user_id) ? profileDisplayName(profileMap.get(i.user_id)!) : 'Unknown',
        user_email: profileMap.get(i.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { investments, count: investments.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/banking/investments');
      return reply.send({ success: true, data: { investments: [], count: 0 } });
    }
  });

  // ─── GET /admin/banking/goals ───────────────────────────────────────────────
  server.get('/admin/banking/goals', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('savings_goals')
        .select('id, user_id, name, target_amount, saved_amount, apy, status, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((g: { user_id: string }) => g.user_id)));
      const profileMap = await getProfileMap(userIds);

      const goals = (data || []).map((g: {
        id: string; user_id: string; name: string; target_amount: number;
        saved_amount: number; apy: number; status: string; created_at: string;
      }) => ({
        ...g,
        user: profileMap.get(g.user_id) ? profileDisplayName(profileMap.get(g.user_id)!) : 'Unknown',
        user_email: profileMap.get(g.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { goals, count: goals.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/banking/goals');
      return reply.send({ success: true, data: { goals: [], count: 0 } });
    }
  });

  // ─── GET /admin/banking/loans ───────────────────────────────────────────────
  server.get('/admin/banking/loans', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const status = q.status || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('loan_applications')
        .select('id, user_id, amount, duration_months, interest_rate, purpose, status, reviewer_notes, applied_at, reviewed_at')
        .order('applied_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((l: { user_id: string }) => l.user_id)));
      const profileMap = await getProfileMap(userIds);

      const loans = (data || []).map((l: {
        id: string; user_id: string; amount: number; duration_months: number;
        interest_rate: number; purpose: string | null; status: string;
        reviewer_notes: string | null; applied_at: string; reviewed_at: string | null;
      }) => ({
        ...l,
        user: profileMap.get(l.user_id) ? profileDisplayName(profileMap.get(l.user_id)!) : 'Unknown',
        user_email: profileMap.get(l.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { loans, count: loans.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/banking/loans');
      return reply.send({ success: true, data: { loans: [], count: 0 } });
    }
  });

  // ─── POST /admin/banking/loans/:id/status ───────────────────────────────────
  server.post<{ Params: { id: string }; Body: { status: string; notes?: string } }>(
    '/admin/banking/loans/:id/status',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { status, notes } = request.body;
        const adminId = request.adminUser!.id;

        const updates: Record<string, unknown> = { status, reviewed_at: new Date().toISOString() };
        if (notes) updates.reviewer_notes = notes;

        const { data, error } = await supabase
          .from('loan_applications')
          .update(updates)
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Loan not found' });

        await logAction(adminId, 'update_loan_status', id, 'loan', { status, notes });
        return reply.send({ success: true, data: { loan: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/banking/loans/:id/status');
        return reply.send({ success: false, error: 'Failed to update loan' });
      }
    },
  );

  // ─── GET /admin/trading/summary ─────────────────────────────────────────────
  server.get('/admin/trading/summary', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: realFxTrades } = await supabase
        .from('fx_trades')
        .select('id', { count: 'exact', head: true })
        .eq('mode', 'real');
      const { count: demoFxTrades } = await supabase
        .from('fx_trades')
        .select('id', { count: 'exact', head: true })
        .eq('mode', 'demo');

      const { data: fxStakeData } = await supabase
        .from('fx_trades')
        .select('stake, payout_amount, mode');

      const totalWagered = (fxStakeData || []).reduce((s: number, t: { stake: number; mode: string }) => {
        if (t.mode === 'demo') return s;
        return s + safeNumber(t.stake);
      }, 0);
      const totalPaidOut = (fxStakeData || []).reduce((s: number, t: { payout_amount: number; mode: string }) => {
        if (t.mode === 'demo') return s;
        return s + safeNumber(t.payout_amount);
      }, 0);

      const { count: totalSpinResults } = await supabase.from('spin_results').select('id', { count: 'exact', head: true });
      const { data: spinAmounts } = await supabase.from('spin_results').select('amount');
      const totalSpinWinnings = (spinAmounts || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      const { count: totalPredictions } = await supabase.from('predictions').select('id', { count: 'exact', head: true });
      const { data: predAmounts } = await supabase.from('predictions').select('stake');
      const totalPredictionVolume = (predAmounts || []).reduce((s: number, p: { stake: number }) => s + safeNumber(p.stake), 0);

      const { count: totalTrades } = await supabase.from('wallet_ledger').select('id', { count: 'exact', head: true });

      const games = [
        { name: 'Aviator', volume: 0, payouts: 0, trades: 0 },
        { name: 'FX Binary', volume: totalWagered, payouts: totalPaidOut, trades: realFxTrades || 0 },
        { name: 'Spin', volume: 0, payouts: totalSpinWinnings, trades: totalSpinResults || 0 },
        { name: 'Up-Down', volume: totalPredictionVolume, payouts: 0, trades: totalPredictions || 0 },
      ];

      const totalWageredGames = games.reduce((s, g) => s + g.volume, 0);
      const totalPaidOutGames = games.reduce((s, g) => s + g.payouts, 0);
      const houseRevenue = totalWageredGames - totalPaidOutGames;

      return reply.send({
        success: true,
        data: {
          totalTrades,
          realTrades: realFxTrades || 0,
          demoTrades: demoFxTrades || 0,
          totalWagered: totalWageredGames,
          totalPaidOut: totalPaidOutGames,
          houseRevenue,
          spinResults: totalSpinResults || 0,
          totalSpinWinnings,
          totalPredictions,
          totalPredictionVolume,
          fx: { volume: { real: totalWagered, demo: 0 }, payout: { real: totalPaidOut, demo: 0 } },
          games,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/trading/summary');
      return reply.send({
        success: true,
        data: {
          totalTrades: 0, realTrades: 0, demoTrades: 0, totalWagered: 0, totalPaidOut: 0,
          houseRevenue: 0, spinResults: 0, totalSpinWinnings: 0, totalPredictions: 0, totalPredictionVolume: 0,
          fx: { volume: { real: 0, demo: 0 }, payout: { real: 0, demo: 0 } },
          games: [],
        },
      });
    }
  });

  // ─── GET /admin/trading/fx-trades ───────────────────────────────────────────
  server.get('/admin/trading/fx-trades', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('fx_trades')
        .select('id, user_id, pair, direction, stake, entry_price, expiry_price, duration, mode, status, payout_amount, entry_time, expiry_time, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id)));
      const profileMap = await getProfileMap(userIds);

      const trades = (data || []).map((t: {
        id: string; user_id: string; pair: string; direction: string;
        stake: number; entry_price: number; expiry_price: number | null;
        duration: number; mode: string; status: string;
        payout_amount: number; entry_time: string; expiry_time: string; created_at: string;
      }) => ({
        ...t,
        user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
        user_email: profileMap.get(t.user_id)?.email || '',
      }));

      return reply.send({ success: true, data: { trades, count: trades.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/trading/fx-trades');
      return reply.send({ success: true, data: { trades: [], count: 0 } });
    }
  });

  // ─── GET /admin/trading/game-bets ───────────────────────────────────────────
  server.get('/admin/trading/game-bets', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const game = q.game || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let result: { bets: unknown[]; count: number } = { bets: [], count: 0 };

      if (!game || game === 'fx') {
        const { data, error } = await supabase
          .from('fx_trades')
          .select('id, user_id, pair, direction, stake, mode, status, payout_amount, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id)));
        const profileMap = await getProfileMap(userIds);

        const bets = (data || []).map((t: {
          id: string; user_id: string; pair: string; direction: string;
          stake: number; mode: string; status: string;
          payout_amount: number; created_at: string;
        }) => ({
          ...t,
          game: 'fx',
          user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
          user_email: profileMap.get(t.user_id)?.email || '',
        }));
        result = { bets, count: bets.length };
      } else if (game === 'spin') {
        const { data, error } = await supabase
          .from('spin_results')
          .select('id, user_id, prize_id, amount, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id)));
        const profileMap = await getProfileMap(userIds);

        const bets = (data || []).map((t: {
          id: string; user_id: string; prize_id: string; amount: number; created_at: string;
        }) => ({
          ...t,
          game: 'spin',
          user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
          user_email: profileMap.get(t.user_id)?.email || '',
        }));
        result = { bets, count: bets.length };
      } else if (game === 'prediction') {
        const { data, error } = await supabase
          .from('predictions')
          .select('id, user_id, market, stake, side, result, created_at')
          .order('created_at', { ascending: false })
          .range(offset, offset + limit - 1);

        if (error) throw error;

        const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id)));
        const profileMap = await getProfileMap(userIds);

        const bets = (data || []).map((t: {
          id: string; user_id: string; market: string; stake: number; side: string;
          result: string | null; created_at: string;
        }) => ({
          ...t,
          game: 'prediction',
          user: profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown',
          user_email: profileMap.get(t.user_id)?.email || '',
        }));
        result = { bets, count: bets.length };
      }

      return reply.send({ success: true, data: result });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/trading/game-bets');
      return reply.send({ success: true, data: { bets: [], count: 0 } });
    }
  });

  // ─── POST /admin/notifications ──────────────────────────────────────────────
  server.post<{ Body: { title: string; message: string; audience: string; channel: string } }>(
    '/admin/notifications',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { title, message, audience, channel } = request.body;
        const adminId = request.adminUser!.id;

        if (!title || !message) {
          return reply.code(400).send({ success: false, error: 'title and message are required' });
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
        await logAction(adminId, 'send_notification', data.id, 'notification', { audience, channel });
        return reply.send({ success: true, data: { notification: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/notifications');
        return reply.send({ success: false, error: 'Failed to send notification' });
      }
    },
  );

  // ─── GET /admin/notifications ───────────────────────────────────────────────
  server.get('/admin/notifications', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { data, error } = await supabase
        .from('notification_broadcasts')
        .select('id, title, body, audience, channel, status, created_by, created_at')
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const adminIds = Array.from(new Set((data || []).map((n: { created_by: string | null }) => n.created_by).filter(Boolean)));
      const profileMap = await getProfileMap(adminIds as string[]);

      const notifications = (data || []).map((n: {
        id: string; title: string; body: string; audience: string;
        channel: string; status: string; created_by: string | null; created_at: string;
      }) => ({
        ...n,
        sent: n.created_at,
        admin: n.created_by ? (profileMap.get(n.created_by) ? profileDisplayName(profileMap.get(n.created_by)!) : 'Unknown') : 'System',
      }));

      return reply.send({ success: true, data: { notifications } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/notifications');
      return reply.send({ success: true, data: { notifications: [] } });
    }
  });

  // ─── GET /admin/support/tickets ─────────────────────────────────────────────
  server.get('/admin/support/tickets', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const status = q.status || '';
      const search = q.search || '';
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      let query = supabase
        .from('support_tickets')
        .select('id, user_id, subject, priority, status, created_at, updated_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (status) query = query.eq('status', status);
      if (search) query = query.ilike('subject', `%${search}%`);

      const { data, error } = await query;
      if (error) throw error;

      const userIds = Array.from(new Set((data || []).map((t: { user_id: string }) => t.user_id).filter(Boolean)));
      const profileMap = await getProfileMap(userIds);

      const tickets = (data || []).map((t: {
        id: string; user_id: string; subject: string; priority: string;
        status: string; created_at: string; updated_at: string;
      }) => ({
        ...t,
        user: t.user_id ? (profileMap.get(t.user_id) ? profileDisplayName(profileMap.get(t.user_id)!) : 'Unknown') : 'System',
        user_email: t.user_id ? (profileMap.get(t.user_id)?.email || '') : '',
      }));

      return reply.send({ success: true, data: { tickets, count: tickets.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/support/tickets');
      return reply.send({ success: true, data: { tickets: [], count: 0 } });
    }
  });

  // ─── POST /admin/support/tickets/:id/respond ────────────────────────────────
  server.post<{ Params: { id: string }; Body: { response: string; status: string } }>(
    '/admin/support/tickets/:id/respond',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { response, status } = request.body;
        const adminId = request.adminUser!.id;

        const { data, error } = await supabase
          .from('support_tickets')
          .update({ status: status || 'resolved', updated_at: new Date().toISOString() })
          .eq('id', id)
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Ticket not found' });

        await logAction(adminId, 'respond_to_ticket', id, 'support_ticket', { response, status });
        return reply.send({ success: true, data: { ticket: data, response } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/support/tickets/:id/respond');
        return reply.send({ success: false, error: 'Failed to respond to ticket' });
      }
    },
  );

  // ─── GET /admin/actions ─────────────────────────────────────────────────────
  server.get('/admin/actions', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 100, 500);

      const { data, error } = await supabase
        .from('admin_actions')
        .select('id, admin_id, action, target_id, target_type, metadata, created_at')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;

      const adminIds = Array.from(new Set((data || []).map((a: { admin_id: string | null }) => a.admin_id).filter(Boolean)));
      const profileMap = await getProfileMap(adminIds as string[]);

      const actions = (data || []).map((a: {
        id: string; admin_id: string | null; action: string;
        target_id: string | null; target_type: string | null;
        metadata: Record<string, unknown>; created_at: string;
      }) => ({
        ...a,
        admin: a.admin_id ? (profileMap.get(a.admin_id) ? profileDisplayName(profileMap.get(a.admin_id)!) : 'Unknown') : 'System',
        admin_email: a.admin_id ? (profileMap.get(a.admin_id)?.email || '') : '',
      }));

      return reply.send({ success: true, data: { actions, count: actions.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/actions');
      return reply.send({ success: true, data: { actions: [], count: 0 } });
    }
  });

  // ─── GET /admin/reports/revenue ─────────────────────────────────────────────
  server.get('/admin/reports/revenue', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const from = q.from ? new Date(q.from).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = q.to ? new Date(q.to).toISOString() : new Date().toISOString();

      const { data, error } = await supabase.rpc('admin_revenue_series_daily', { p_from: from, p_to: to });
      if (error) throw error;

      return reply.send({ success: true, data: { revenueSeries: data || [] } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/reports/revenue');
      return reply.send({ success: true, data: { revenueSeries: [] } });
    }
  });

  // ─── GET /admin/reports/users ───────────────────────────────────────────────
  server.get('/admin/reports/users', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const from = q.from ? new Date(q.from).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = q.to ? new Date(q.to).toISOString() : new Date().toISOString();

      const { data, error } = await supabase.rpc('admin_signups_series', { p_from: from, p_to: to });
      if (error) throw error;

      return reply.send({ success: true, data: { signupsSeries: data || [] } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/reports/users');
      return reply.send({ success: true, data: { signupsSeries: [] } });
    }
  });

  // ─── GET /admin/reports/deposits ────────────────────────────────────────────
  server.get('/admin/reports/deposits', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const from = q.from ? new Date(q.from).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = q.to ? new Date(q.to).toISOString() : new Date().toISOString();

      const { data, error } = await supabase.rpc('admin_deposits_series', { p_from: from, p_to: to });
      if (error) throw error;

      return reply.send({ success: true, data: { depositsSeries: data || [] } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/reports/deposits');
      return reply.send({ success: true, data: { depositsSeries: [] } });
    }
  });

  // ─── GET /admin/reports/withdrawals ─────────────────────────────────────────
  server.get('/admin/reports/withdrawals', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const from = q.from ? new Date(q.from).toISOString() : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();
      const to = q.to ? new Date(q.to).toISOString() : new Date().toISOString();

      const { data, error } = await supabase.rpc('admin_withdrawals_series', { p_from: from, p_to: to });
      if (error) throw error;

      return reply.send({ success: true, data: { withdrawalsSeries: data || [] } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/reports/withdrawals');
      return reply.send({ success: true, data: { withdrawalsSeries: [] } });
    }
  });

  // ─── GET /admin/dashboard ──────────────────────────────────────────────────────
  server.get('/admin/dashboard', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      const active24h = await supabase.rpc('count_active_users_24h');

      const { count: pendingKyc } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('kyc_status', 'Pending');

      const depSeries = await supabase.rpc('admin_deposits_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });
      const wdSeries = await supabase.rpc('admin_withdrawals_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });
      const revSeries = await supabase.rpc('admin_revenue_series_daily', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });

      const totalDeposits = (depSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const totalWithdrawals = (wdSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const platformRevenue = (revSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);

      const { count: pendingWithdrawals } = await supabase
        .from('b2c_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');

      const { count: openTickets } = await supabase
        .from('support_tickets')
        .select('id', { count: 'exact', head: true })
        .in('status', ['open', 'in_review']);

      const { count: activeJobs } = await supabase
        .from('jobs')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'open');

      const { count: fundedBusinesses } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Approved', 'Disbursed']);

      const { data: txData } = await supabase
        .from('wallet_ledger')
        .select('id, user_id, type, mode, amount, description, is_demo, created_at')
        .order('created_at', { ascending: false })
        .limit(10);

      const txUserIds = Array.from(new Set((txData || []).map((t: { user_id: string }) => t.user_id)));
      const txProfileMap = await getProfileMap(txUserIds);

      const recentTransactions = (txData || []).map((t: {
        id: string; user_id: string; type: string; mode: string;
        amount: number; description: string; is_demo: boolean; created_at: string;
      }) => ({
        id: t.id,
        user: txProfileMap.get(t.user_id) ? profileDisplayName(txProfileMap.get(t.user_id)!) : 'Unknown',
        type: t.type,
        amount: safeNumber(t.amount) * (t.mode === 'debit' ? -1 : 1),
        method: t.description || t.mode,
        status: t.is_demo ? 'demo' : 'completed',
        date: t.created_at,
      }));

      return reply.send({
        success: true,
        data: {
          stats: {
            totalUsers: totalUsers || 0,
            activeUsers: active24h.data || 0,
            pendingKyc: pendingKyc || 0,
            totalDeposits,
            totalWithdrawals,
            pendingWithdrawals: pendingWithdrawals || 0,
            platformRevenue,
            openTickets: openTickets || 0,
            activeJobs: activeJobs || 0,
            fundedBusinesses: fundedBusinesses || 0,
          },
          revenueSeries: revSeries.data || [],
          recentTransactions,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/dashboard');
      return reply.send({
        success: true,
        data: {
          stats: {
            totalUsers: 0, activeUsers: 0, pendingKyc: 0,
            totalDeposits: 0, totalWithdrawals: 0, pendingWithdrawals: 0,
            platformRevenue: 0, openTickets: 0, activeJobs: 0, fundedBusinesses: 0,
          },
          revenueSeries: [],
          recentTransactions: [],
        },
      });
    }
  });

  // ─── GET /admin/users/stats ────────────────────────────────────────────────────
  server.get('/admin/users/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

      const { count: newToday } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

      const { count: new7d } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .gte('created_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

      const active24h = await supabase.rpc('count_active_users_24h');
      const { count: pendingKyc } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('kyc_status', 'Pending');

      const { count: suspended } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .eq('banned', true);

      return reply.send({
        success: true,
        data: {
          totalUsers: totalUsers || 0,
          activeUsers: active24h.data || 0,
          newToday: newToday || 0,
          new7d: new7d || 0,
          pendingKyc: pendingKyc || 0,
          suspended: suspended || 0,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/users/stats');
      return reply.send({
        success: true,
        data: { totalUsers: 0, activeUsers: 0, newToday: 0, new7d: 0, pendingKyc: 0, suspended: 0 },
      });
    }
  });

  // ─── GET /admin/transactions/stats ─────────────────────────────────────────────
  server.get('/admin/transactions/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const depSeries = await supabase.rpc('admin_deposits_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });
      const wdSeries = await supabase.rpc('admin_withdrawals_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });

      const deposits = (depSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const withdrawals = (wdSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);

      const { count: totalTrades } = await supabase.from('wallet_ledger').select('id', { count: 'exact', head: true });

      const { data: refData } = await supabase.from('referral_earnings_log').select('amount');
      const referralEarnings = (refData || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      return reply.send({
        success: true,
        data: {
          total: totalTrades || 0,
          deposits,
          withdrawals,
          trades: totalTrades || 0,
          referral_earnings: referralEarnings,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/transactions/stats');
      return reply.send({
        success: true,
        data: { total: 0, deposits: 0, withdrawals: 0, trades: 0, referral_earnings: 0 },
      });
    }
  });

  // ─── GET /admin/deposits/stats ─────────────────────────────────────────────────
  server.get('/admin/deposits/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const depSeries = await supabase.rpc('admin_deposits_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });

      const total_amount = (depSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const { count: pending_count } = await supabase
        .from('mpesa_deposits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'pending');
      const { count: completed_count } = await supabase
        .from('mpesa_deposits')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      const { count: failed_count } = await supabase
        .from('mpesa_deposits')
        .select('id', { count: 'exact', head: true })
        .in('status', ['failed', 'flagged']);

      return reply.send({
        success: true,
        data: {
          total_amount,
          pending_count: pending_count || 0,
          completed_count: completed_count || 0,
          failed_count: failed_count || 0,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/deposits/stats');
      return reply.send({ success: true, data: { total_amount: 0, pending_count: 0, completed_count: 0, failed_count: 0 } });
    }
  });

  // ─── GET /admin/withdrawals/stats ──────────────────────────────────────────────
  server.get('/admin/withdrawals/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const wdSeries = await supabase.rpc('admin_withdrawals_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });

      const total_amount = (wdSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const { count: pending_count } = await supabase
        .from('b2c_withdrawals')
        .select('id', { count: 'exact', head: true })
        .in('status', ['pending', 'processing']);
      const { count: completed_count } = await supabase
        .from('b2c_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'completed');
      const { count: failed_count } = await supabase
        .from('b2c_withdrawals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'failed');

      return reply.send({
        success: true,
        data: {
          total_amount,
          pending_count: pending_count || 0,
          completed_count: completed_count || 0,
          failed_count: failed_count || 0,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/withdrawals/stats');
      return reply.send({ success: true, data: { total_amount: 0, pending_count: 0, completed_count: 0, failed_count: 0 } });
    }
  });

  // ─── GET /admin/referrals/stats ────────────────────────────────────────────────
  server.get('/admin/referrals/stats', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: totalReferrals } = await supabase.from('referrals').select('id', { count: 'exact', head: true });
      const { count: qualifiedCount } = await supabase
        .from('referrals')
        .select('id', { count: 'exact', head: true })
        .eq('status', 'qualified');

      const { data: payoutData } = await supabase.from('referral_earnings_log').select('amount');
      const total_commission = (payoutData || []).reduce((s: number, r: { amount: number }) => s + safeNumber(r.amount), 0);

      const { count: totalSignups } = await supabase.from('profiles').select('id', { count: 'exact', head: true });
      const conversion_rate = totalSignups !== null && totalSignups > 0 ? (qualifiedCount || 0) / totalSignups : 0;

      const { count: top_affiliates } = await supabase
        .from('referral_earnings_log')
        .select('referrer_id', { count: 'exact', head: true })
        .gt('amount', 0);

      return reply.send({
        success: true,
        data: {
          total_referrals: totalReferrals || 0,
          total_commission,
          top_affiliates: top_affiliates || 0,
          conversion_rate,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/referrals/stats');
      return reply.send({
        success: true,
        data: { total_referrals: 0, total_commission: 0, top_affiliates: 0, conversion_rate: 0 },
      });
    }
  });

  // ─── GET /admin/referrals/affiliates ───────────────────────────────────────────
  server.get('/admin/referrals/affiliates', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('profiles')
        .select('id, email, full_name, referral_code, referred_by, created_at')
        .not('referral_code', 'is', null)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const profileMap = await getProfileMap(Array.from(new Set((data || []).map((a: { referred_by: string | null }) => a.referred_by).filter(Boolean))) as string[]);

      const affiliates = await Promise.all(
        (data || []).map(async (a: {
          id: string; email: string; full_name: string | null; referral_code: string; referred_by: string | null; created_at: string;
        }) => {
          const { count } = await supabase
            .from('referrals')
            .select('id', { count: 'exact', head: true })
            .eq('referrer_id', a.id);

          const { data: earnings } = await supabase
            .from('referral_earnings_log')
            .select('amount')
            .eq('referrer_id', a.id);

          const total_earned = (earnings || []).reduce((s: number, e: { amount: number }) => s + safeNumber(e.amount), 0);
          const referred_by_email = a.referred_by ? profileMap.get(a.referred_by)?.email || null : null;

          return {
            id: a.id,
            email: a.email || '',
            full_name: a.full_name,
            referral_code: a.referral_code,
            total_earned,
            referrals_count: count || 0,
            created_at: a.created_at,
            referred_by_email,
          };
        })
      );

      return reply.send({ success: true, data: { affiliates, count: affiliates.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/referrals/affiliates');
      return reply.send({ success: true, data: { affiliates: [], count: 0 } });
    }
  });

  // ─── GET /admin/referrals/links ────────────────────────────────────────────────
  server.get('/admin/referrals/links', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const q = request.query as QueryParams;
      const limit = Math.min(Number(q.limit) || 50, 200);
      const offset = Number(q.offset) || 0;

      const { data, error } = await supabase
        .from('referrals')
        .select('id, referrer_id, referred_user_id, status, created_at')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) throw error;

      const userIds = Array.from(new Set([
        ...(data || []).map((r: { referrer_id: string }) => r.referrer_id),
        ...(data || []).map((r: { referred_user_id: string }) => r.referred_user_id),
      ]));
      const profileMap = await getProfileMap(userIds);

      const links = (data || []).map((r: {
        id: string; referrer_id: string; referred_user_id: string;
        status: string; created_at: string;
      }) => {
        const referrer = profileMap.get(r.referrer_id);
        const referred = profileMap.get(r.referred_user_id);
        return {
          id: r.id,
          referrer_id: r.referrer_id,
          referrer_email: referrer?.email || '',
          referred_user_id: r.referred_user_id,
          referred_email: referred?.email || '',
          commission: 0,
          level: 1,
          status: r.status,
          created_at: r.created_at,
        };
      });

      return reply.send({ success: true, data: { links, count: links.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/referrals/links');
      return reply.send({ success: true, data: { links: [], count: 0 } });
    }
  });

  // ─── GET /admin/reports/metrics ────────────────────────────────────────────────
  server.get('/admin/reports/metrics', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { count: totalUsers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

      const depSeries = await supabase.rpc('admin_deposits_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });
      const wdSeries = await supabase.rpc('admin_withdrawals_series', {
        p_from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });
      const revSeries = await supabase.rpc('admin_revenue_series_daily', {
        p_from: new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString(),
        p_to: new Date().toISOString(),
      });

      const totalDeposits = (depSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const totalWithdrawals = (wdSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);
      const platformRevenue = (revSeries.data || []).reduce((s: number, r: { v: number }) => s + safeNumber(r.v), 0);

      const { count: fundedBusinesses } = await supabase
        .from('business_applications')
        .select('id', { count: 'exact', head: true })
        .in('status', ['Approved', 'Disbursed']);

      return reply.send({
        success: true,
        data: {
          totalUsers: totalUsers || 0,
          totalDeposits,
          totalWithdrawals,
          platformRevenue,
          activeUsers: totalUsers || 0,
          fundedBusinesses: fundedBusinesses || 0,
        },
      });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/reports/metrics');
      return reply.send({
        success: true,
        data: { totalUsers: 0, totalDeposits: 0, totalWithdrawals: 0, platformRevenue: 0, activeUsers: 0, fundedBusinesses: 0 },
      });
    }
  });

  // ─── GET /admin/commissions/referrals ──────────────────────────────────────────
  server.get('/admin/commissions/referrals', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { data: earningsData } = await supabase.from('referral_earnings_log').select('amount');
      const totalPaid = (earningsData || []).reduce((s: number, e: { amount: number }) => s + safeNumber(e.amount), 0);

      const { count: activeAffiliates } = await supabase
        .from('profiles')
        .select('id', { count: 'exact', head: true })
        .not('referral_code', 'is', null);

      const tiers = [
        { tier: 'Bronze', referrals: '0-10', rate: '5%', payout: totalPaid * 0.3 },
        { tier: 'Silver', referrals: '11-50', rate: '10%', payout: totalPaid * 0.4 },
        { tier: 'Gold', referrals: '50+', rate: '15%', payout: totalPaid * 0.3 },
      ];

      return reply.send({ success: true, data: { tiers, totalPaid, activeAffiliates: activeAffiliates || 0 } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/commissions/referrals');
      return reply.send({ success: true, data: { tiers: [], totalPaid: 0, activeAffiliates: 0 } });
    }
  });

  // ─── GET /admin/banking/summary ────────────────────────────────────────────────
  server.get('/admin/banking/summary', { preHandler: [verifyAdmin] }, async (_request, reply) => {
    try {
      const { data: lockedData } = await supabase
        .from('locked_savings')
        .select('amount')
        .eq('status', 'active');

      const totalLocked = (lockedData || []).reduce((s: number, l: { amount: number }) => s + safeNumber(l.amount), 0);

      const { count: totalMembers } = await supabase.from('profiles').select('id', { count: 'exact', head: true });

      const plans = [
        { plan: 'You Badly Need This', apy: '12%', members: totalMembers || 0, locked: totalLocked },
        { plan: 'Goal Saver', apy: '8%', members: Math.floor((totalMembers || 0) / 2), locked: totalLocked * 0.4 },
        { plan: 'Fixed Deposit', apy: '15%', members: Math.floor((totalMembers || 0) / 4), locked: totalLocked * 0.2 },
      ];

      return reply.send({ success: true, data: { plans, totalLocked, totalMembers: totalMembers || 0 } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/banking/summary');
      return reply.send({ success: true, data: { plans: [], totalLocked: 0, totalMembers: 0 } });
    }
  });

  // ─── GET /admin/users/:id/activity ─────────────────────────────────────────────
  server.get<{ Params: { id: string } }>('/admin/users/:id/activity', { preHandler: [verifyAdmin] }, async (request, reply) => {
    try {
      const { id } = request.params;

      const { data, error } = await supabase
        .from('wallet_ledger')
        .select('id, type, mode, amount, status, created_at')
        .eq('user_id', id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      const activity = (data || []).map((t: {
        id: string; type: string; mode: string; amount: number; status: string; created_at: string;
      }) => ({
        id: t.id,
        type: t.type,
        amount: safeNumber(t.amount),
        status: t.status || (t.mode === 'debit' ? 'pending' : 'completed'),
        created_at: t.created_at,
      }));

      return reply.send({ success: true, data: { activity, count: activity.length } });
    } catch (error) {
      logger.error(error, 'Error in GET /admin/users/:id/activity');
      return reply.send({ success: true, data: { activity: [], count: 0 } });
    }
  });

  // ─── POST /admin/deposits/:id/approve ─────────────────────────────────────────
  server.post<{ Params: { id: string } }>(
    '/admin/deposits/:id/approve',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const adminId = request.adminUser!.id;

        const { data, error } = await supabase
          .from('mpesa_deposits')
          .update({ status: 'completed', updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Deposit not found or already processed' });

        await logAction(adminId, 'approve_deposit', id, 'deposit', {});
        return reply.send({ success: true, data: { deposit: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/deposits/:id/approve');
        return reply.send({ success: false, error: 'Failed to approve deposit' });
      }
    },
  );

  // ─── POST /admin/deposits/:id/reject ──────────────────────────────────────────
  server.post<{ Params: { id: string }; Body: { reason?: string } }>(
    '/admin/deposits/:id/reject',
    { preHandler: [verifyAdmin] },
    async (request, reply) => {
      try {
        const { id } = request.params;
        const { reason } = request.body;
        const adminId = request.adminUser!.id;

        const { data, error } = await supabase
          .from('mpesa_deposits')
          .update({ status: 'failed', updated_at: new Date().toISOString() })
          .eq('id', id)
          .eq('status', 'pending')
          .select()
          .single();

        if (error) throw error;
        if (!data) return reply.code(404).send({ success: false, error: 'Deposit not found or already processed' });

        await logAction(adminId, 'reject_deposit', id, 'deposit', { reason });
        return reply.send({ success: true, data: { deposit: data } });
      } catch (error) {
        logger.error(error, 'Error in POST /admin/deposits/:id/reject');
        return reply.send({ success: false, error: 'Failed to reject deposit' });
      }
    },
  );

  logger.info('✅ All admin routes registered');
}
