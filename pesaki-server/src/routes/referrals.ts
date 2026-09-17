import type { FastifyInstance } from 'fastify';
import { supabase } from '../lib/supabase';
import { verifyAuth } from '../middleware/auth';
import { logger } from '../utils/logger';

const REFERRER_REWARD = 20;

type ReferralRow = {
  id: string;
  referrer_id: string;
  referred_user_id: string;
  referral_code: string;
  status: 'pending' | 'qualified' | 'rejected';
  first_deposit_amount: number;
  referrer_bonus_paid: number;
  welcome_bonus_paid: number;
  qualified_at: string | null;
  created_at: string;
};

type ProfileRow = {
  id: string;
  full_name?: string | null;
  email?: string | null;
  phone?: string | null;
  referral_code?: string | null;
  referred_by?: string | null;
  created_at?: string | null;
};

const normalizeCode = (code: string) => code.trim().toUpperCase();

const normalizeEmail = (email?: string | null) => email?.trim().toLowerCase() || '';

const normalizePhone = (phone?: string | null) => {
  const digits = phone?.replace(/\D/g, '') || '';

  if (digits.startsWith('0') && digits.length === 10) return `254${digits.slice(1)}`;
  if (/^[71]\d{8}$/.test(digits)) return `254${digits}`;
  return digits || null;
};

const isDuplicateIdentity = (referrer: ProfileRow, referred: ProfileRow) => {
  const referrerEmail = normalizeEmail(referrer.email);
  const referredEmail = normalizeEmail(referred.email);
  const referrerPhone = normalizePhone(referrer.phone);
  const referredPhone = normalizePhone(referred.phone);

  return (
    referrer.id === referred.id ||
    (referrerEmail !== '' && referrerEmail === referredEmail) ||
    (referrerPhone !== null && referrerPhone === referredPhone)
  );
};

const getReferralName = (profile?: ProfileRow | null) => {
  if (!profile) return 'PESAKI member';
  if (profile.full_name) return profile.full_name;
  if (profile.email) return profile.email.split('@')[0];
  if (profile.phone) return profile.phone;
  return 'PESAKI member';
};

const getProfileForUser = async (userId: string) => {
  const { data, error } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, referral_code, referred_by, created_at')
    .eq('id', userId)
    .single();

  return { data: data as ProfileRow | null, error };
};

const validateReferralCode = async (userId: string, code: string) => {
  const normalizedCode = normalizeCode(code);
  const { data: referrer, error: referrerError } = await supabase
    .from('profiles')
    .select('id, full_name, email, phone, referral_code')
    .eq('referral_code', normalizedCode)
    .maybeSingle();

  if (referrerError || !referrer) {
    return { valid: false };
  }

  const { data: caller, error: callerError } = await supabase
    .from('profiles')
    .select('id, email, phone, referred_by')
    .eq('id', userId)
    .maybeSingle();

  if (callerError || !caller) {
    return { valid: false };
  }

  if (caller.referred_by || isDuplicateIdentity(referrer as ProfileRow, caller as ProfileRow)) {
    return { valid: false };
  }

  const { data: existingReferral, error: existingError } = await supabase
    .from('referrals')
    .select('id')
    .eq('referred_user_id', userId)
    .maybeSingle();

  if (existingError || existingReferral) {
    return { valid: false };
  }

  return {
    valid: true,
    referrerName: getReferralName(referrer as ProfileRow),
  };
};

export const processReferralOnDeposit = async (
  userId: string,
  amount: number,
  depositId: string | null
) => {
  const numericAmount = Number(amount);

  if (!userId || !Number.isFinite(numericAmount) || numericAmount <= 0) {
    return { success: false, error: 'A valid user id and deposit amount are required' };
  }

  const { data, error } = await supabase.rpc('process_referral_deposit', {
    p_referred_user_id: userId,
    p_deposit_amount: numericAmount,
    p_deposit_id: depositId,
  });

  if (error) {
    logger.error({ error, userId, amount: numericAmount }, 'Referral deposit processing failed');
    return { success: false, error: error.message };
  }

  const result = data as { processed?: boolean; reason?: string; error?: string } | null;

  return {
    success: true,
    processed: Boolean(result?.processed),
    reason: result?.reason,
    error: result?.error,
  };
};

export default async function referralRoutes(fastify: FastifyInstance) {
  fastify.post<{ Body: { code?: string } }>(
    '/referrals/validate-code',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const userId = request.user?.id;

      if (!userId) {
        return reply.code(401).send({ valid: false });
      }

      const result = await validateReferralCode(userId, request.body?.code || '');
      return reply.send(result);
    }
  );

  fastify.post<{ Body: { code?: string } }>(
    '/referrals/apply',
    { preHandler: [verifyAuth] },
    async (request, reply) => {
      const userId = request.user?.id;
      const code = normalizeCode(request.body?.code || '');

      if (!userId) {
        return reply.code(401).send({ success: false, error: 'Unauthorized' });
      }

      if (!code) {
        return reply.code(400).send({ success: false, error: 'Referral code is required' });
      }

      const { data, error } = await supabase.rpc('apply_referral_code', {
        p_user_id: userId,
        p_code: code,
      });

      if (error) {
        logger.error({ error, userId, code }, 'Referral application failed');
        return reply.code(500).send({ success: false, error: 'Unable to apply referral code' });
      }

      const result = data as { ok?: boolean; error?: string; referrerName?: string } | null;

      if (!result?.ok) {
        const statusByReason: Record<string, number> = {
          profile_not_found: 404,
          invalid_code: 400,
          already_referred: 409,
          self_referral: 400,
          duplicate_identity: 400,
          referral_already_used: 409,
        };

        return reply.code(statusByReason[result?.error || 'apply_failed'] || 400).send({
          success: false,
          error: result?.error || 'Unable to apply referral code',
        });
      }

      return reply.send({
        success: true,
        referrerName: result.referrerName,
      });
    }
  );

  fastify.get('/referrals/me', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const profileResult = await getProfileForUser(userId);

    if (profileResult.error || !profileResult.data) {
      return reply.code(404).send({ error: 'Profile not found' });
    }

    const { data: referralRows, error: referralError } = await supabase
      .from('referrals')
      .select('id, referrer_id, referred_user_id, referral_code, status, first_deposit_amount, referrer_bonus_paid, welcome_bonus_paid, qualified_at, created_at')
      .eq('referrer_id', userId)
      .order('created_at', { ascending: false });

    if (referralError) {
      logger.error({ error: referralError, userId }, 'Failed to load referrals');
      return reply.code(500).send({ error: 'Unable to load referrals' });
    }

    const referrals = (referralRows || []) as ReferralRow[];
    const referredIds = referrals.map((referral) => referral.referred_user_id);
    const referredProfilesById = new Map<string, ProfileRow>();

    if (referredIds.length > 0) {
      const { data: referredProfiles, error: referredProfilesError } = await supabase
        .from('profiles')
        .select('id, full_name, email, phone, created_at')
        .in('id', referredIds);

      if (!referredProfilesError && referredProfiles) {
        for (const profile of referredProfiles as ProfileRow[]) {
          referredProfilesById.set(profile.id, profile);
        }
      }
    }

    const qualifiedReferrals = referrals.filter((referral) => referral.status === 'qualified');
    const pendingReferrals = referrals.filter((referral) => referral.status === 'pending');
    const totalEarnings = qualifiedReferrals.reduce(
      (total, referral) => total + Number(referral.referrer_bonus_paid || 0),
      0
    );

    const referralCode = profileResult.data.referral_code || '';

    return reply.send({
      referralCode,
      referralLink: `https://pesaki.co.ke/auth?ref=${referralCode}`,
      totalReferrals: referrals.length,
      qualifiedReferrals: qualifiedReferrals.length,
      pendingReferrals: pendingReferrals.length,
      totalEarnings,
      referrals: referrals.map((referral) => ({
        name: getReferralName(referredProfilesById.get(referral.referred_user_id)),
        joinedAt: referral.created_at,
        status: referral.status,
        earned: referral.status === 'qualified' ? Number(referral.referrer_bonus_paid || 0) : 0,
      })),
    });
  });

  fastify.get('/referrals/earnings', { preHandler: [verifyAuth] }, async (request, reply) => {
    const userId = request.user?.id;

    if (!userId) {
      return reply.code(401).send({ error: 'Unauthorized' });
    }

    const { data: earningsRows, error } = await supabase
      .from('referral_earnings_log')
      .select('id, referrer_id, referred_user_id, amount, source, description, created_at')
      .or(`referrer_id.eq.${userId},referred_user_id.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(50);

    if (error) {
      logger.error({ error, userId }, 'Failed to load referral earnings');
      return reply.code(500).send({ error: 'Unable to load referral earnings' });
    }

    const earnings = (earningsRows || []).map((entry) => ({
      id: entry.id,
      referrerId: entry.referrer_id,
      referredUserId: entry.referred_user_id,
      amount: Number(entry.amount),
      source: entry.source,
      description: entry.description,
      createdAt: entry.created_at,
    }));

    const totalEarnings = earnings
      .filter((entry) => entry.referrerId === userId && entry.amount === REFERRER_REWARD)
      .reduce((total, entry) => total + entry.amount, 0);

    return reply.send({
      earnings,
      totalEarnings,
      count: earnings.length,
    });
  });

  fastify.post<{ Body: { userId?: string; amount?: number; depositId?: string | null } }>(
    '/referrals/on-deposit',
    async (request, reply) => {
      const { userId, amount, depositId = null } = request.body || {};

      if (!userId || amount === undefined || amount === null) {
        return reply.code(400).send({
          success: false,
          error: 'userId, amount, and depositId are required',
        });
      }

      const result = await processReferralOnDeposit(userId, Number(amount), depositId || null);

      if (!result.success) {
        return reply.code(500).send({ success: false, error: result.error });
      }

      return reply.send(result);
    }
  );
}
