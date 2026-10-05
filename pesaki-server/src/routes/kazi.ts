import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';
import {
  generateKaziAccessToken,
  initiateKaziSTKPush,
  debitKaziSource,
} from './kazi_helpers';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function getUserFromToken(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid token');
  return user;
}

function getDurationInMonths(duration: string): number {
  const map: Record<string, number> = {
    '1 day': 0.03,
    '3 days': 0.1,
    '1 week': 0.25,
    '2 weeks': 0.5,
    '3 weeks': 0.75,
    '1 month': 1,
    '3 months': 3,
    '6 months': 6,
    'Ongoing': 3,
  };
  return map[duration] || 1;
}

// ─── Helpers ──────────────────────────────────────────────────────
async function notifyUser(
  userId: string,
  title: string,
  body: string,
  opts: { jobId?: string; type?: string } = {}
) {
  try {
    await supabase.from('notifications').insert({
      user_id: userId,
      title,
      body,
      related_job_id: opts.jobId || null,
      read: false,
      kazi_type: opts.type || 'kazi',
      created_at: new Date().toISOString(),
    });
  } catch (err) {
    console.error('notifyUser failed', err);
  }
}

const FEE_RATE = 0.10;

// ─── KAZI Profile helpers ─────────────────────────────────────────────────────
// Every profile endpoint answers with { success: true, data } or
// { success: false, error } and never with a 5xx, so a missing table or a
// storage failure degrades to a readable message instead of breaking the page.

const PROFILE_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;
const PROFILE_CV_TYPES = /^(application\/pdf|application\/msword|application\/vnd\.openxmlformats-officedocument\.wordprocessingml\.document)$/i;
const PROFILE_IMAGE_TYPES = /^image\/(jpeg|png|webp|gif|heic|heif)$/i;

const CV_BUCKET = 'kazi-cvs';
const PHOTO_BUCKET = 'kazi-photos';
const PORTFOLIO_BUCKET = 'kazi-portfolio';

type ProfileReply = FastifyReply;

function profileFail(reply: ProfileReply, status: number, error: string) {
  return reply.status(status).send({ success: false, error });
}

/**
 * Reads the bearer token and resolves the user. Returns null (and already
 * replied) when the caller is not authenticated.
 */
async function requireKaziUser(
  request: FastifyRequest,
  reply: ProfileReply
) {
  const token = request.headers.authorization?.replace('Bearer ', '');
  if (!token) {
    profileFail(reply, 401, 'Unauthorized: no token provided');
    return null;
  }
  try {
    return await getUserFromToken(token);
  } catch {
    profileFail(reply, 401, 'Unauthorized: invalid or expired token');
    return null;
  }
}

function isMissingTable(err: any): boolean {
  const code = err?.code || '';
  const message = String(err?.message || '');
  return (
    code === '42P01' ||
    code === 'PGRST205' ||
    /Could not find the table|schema cache|does not exist/i.test(message)
  );
}

/**
 * Turns a Supabase failure into a user-facing message. Missing relations are
 * reported plainly so the UI can show a "not set up yet" state.
 */
function profileDbError(reply: ProfileReply, err: any, fallback: string) {
  console.error('[kazi/profile]', fallback, err?.message || err);
  if (isMissingTable(err)) {
    return profileFail(
      reply,
      200,
      'KAZI profiles are not set up on this database yet. Please run the kazi_profiles migration.'
    );
  }
  return profileFail(reply, 200, err?.message || fallback);
}

function trimOrNull(value: unknown): string | null {
  if (value === undefined || value === null) return null;
  const s = String(value).trim();
  return s.length ? s : null;
}

function positiveNumberOrNull(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Completeness score:
 * +10 headline, +10 bio, +10 photo, +10 CV, +10 category, +10 location,
 * +5 per skill (max 15), +10 experience, +10 education,
 * +5 portfolio (max 15). Capped at 100.
 */
function computeCompleteness(profile: any, counts: {
  skills: number;
  experience: number;
  education: number;
  portfolio: number;
}) {
  let score = 0;
  if (trimOrNull(profile?.headline)) score += 10;
  if (trimOrNull(profile?.bio)) score += 10;
  if (trimOrNull(profile?.photo_url)) score += 10;
  if (trimOrNull(profile?.cv_url)) score += 10;
  if (trimOrNull(profile?.category)) score += 10;
  if (trimOrNull(profile?.location)) score += 10;
  score += Math.min(counts.skills * 5, 15);
  if (counts.experience > 0) score += 10;
  if (counts.education > 0) score += 10;
  score += Math.min(counts.portfolio * 5, 15);
  return Math.min(100, score);
}

async function getProfileCounts(userId: string) {
  const [skills, experience, education, portfolio] = await Promise.all([
    supabase.from('kazi_skills').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('kazi_experience').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('kazi_education').select('id', { count: 'exact', head: true }).eq('user_id', userId),
    supabase.from('kazi_portfolio').select('id', { count: 'exact', head: true }).eq('user_id', userId),
  ]);
  const firstError = skills.error || experience.error || education.error || portfolio.error;
  if (firstError) throw firstError;
  return {
    skills: skills.count || 0,
    experience: experience.count || 0,
    education: education.count || 0,
    portfolio: portfolio.count || 0,
  };
}

/**
 * Fetches the caller's profile, creating a blank one on first visit so the
 * Profile tab always has something to edit.
 */
async function ensureOwnProfile(userId: string, email?: string | null) {
  const existing = await supabase
    .from('kazi_profiles')
    .select('*')
    .eq('user_id', userId)
    .maybeSingle();

  if (existing.error) throw existing.error;
  if (existing.data) return existing.data;

  const created = await supabase
    .from('kazi_profiles')
    .insert({
      user_id: userId,
      full_name: trimOrNull(email?.split('@')[0]),
      profile_type: 'worker',
      is_verified: false,
      completeness: 0,
    })
    .select('*')
    .single();

  if (created.error) throw created.error;
  return created.data;
}

/** Average rating + review count for a user, derived from kazi_reviews. */
async function getRating(userId: string) {
  const { data, error } = await supabase
    .from('kazi_reviews')
    .select('rating')
    .eq('reviewee_id', userId);
  if (error) throw error;
  const ratings = (data || []).map((r: any) => Number(r.rating)).filter((n: number) => Number.isFinite(n));
  if (ratings.length === 0) return { rating: null, reviewCount: 0 };
  const avg = ratings.reduce((a, b) => a + b, 0) / ratings.length;
  return { rating: Math.round(avg * 10) / 10, reviewCount: ratings.length };
}

async function loadProfileSections(userId: string) {
  const [skills, experience, education, portfolio] = await Promise.all([
    supabase.from('kazi_skills').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
    supabase.from('kazi_experience').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('kazi_education').select('*').eq('user_id', userId).order('created_at', { ascending: false }),
    supabase.from('kazi_portfolio').select('*').eq('user_id', userId).order('created_at', { ascending: true }),
  ]);
  const err = skills.error || experience.error || education.error || portfolio.error;
  if (err) throw err;
  return {
    skills: skills.data || [],
    experience: experience.data || [],
    education: education.data || [],
    portfolio: portfolio.data || [],
  };
}

/**
 * Stores one multipart file in a public-read bucket and returns its URL.
 * Rejects unknown content types and oversized files with a readable message.
 */
async function storeUploadedFile(options: {
  request: FastifyRequest;
  reply: ProfileReply;
  bucket: string;
  folder: string;
  userId: string;
  accept: RegExp;
  label: string;
  field?: string;
}) {
  const { request, reply, bucket, folder, userId, accept, label, field = 'file' } = options;

  if (!request.isMultipart?.()) {
    profileFail(reply, 400, `${label} upload must be sent as multipart/form-data`);
    return null;
  }

  let buffer: Buffer | null = null;
  let mimetype = '';
  let originalName = '';

  try {
    for await (const part of request.parts()) {
      if (part.type !== 'file') continue;
      if (part.fieldname !== field) continue;
      mimetype = String(part.mimetype || '');
      originalName = String(part.filename || 'upload');
      buffer = await part.toBuffer();
      // @fastify/multipart caps the stream globally; `truncated` tells us the
      // server stopped reading before the client finished sending.
      if ((part.file as any).truncated) {
        profileFail(
          reply,
          400,
          `${label} is larger than the server upload limit. Please use a file under 1 MB.`
        );
        return null;
      }
    }
  } catch (err: any) {
    const tooLarge = err?.code === 'FST_REQ_FILE_TOO_LARGE' || /too large/i.test(String(err?.message || ''));
    console.error('[kazi/upload]', err?.message || err);
    profileFail(
      reply,
      400,
      tooLarge
        ? `${label} is larger than the server upload limit. Please use a file under 1 MB.`
        : `Could not read the ${label.toLowerCase()} file.`
    );
    return null;
  }

  if (!buffer || buffer.length === 0) {
    profileFail(reply, 400, `No ${label.toLowerCase()} file was received`);
    return null;
  }
  if (buffer.length > PROFILE_MAX_UPLOAD_BYTES) {
    profileFail(reply, 400, `${label} must be 5 MB or smaller`);
    return null;
  }
  if (!accept.test(mimetype)) {
    profileFail(reply, 400, `Unsupported ${label.toLowerCase()} file type: ${mimetype || 'unknown'}`);
    return null;
  }

  const safeName = originalName.replace(/[^a-zA-Z0-9.\-]/g, '_') || 'file';
  const path = `${folder}/${userId}-${Date.now()}-${safeName}`;

  const { error: uploadError } = await supabase.storage
    .from(bucket)
    .upload(path, buffer, { contentType: mimetype, upsert: true });

  if (uploadError) {
    console.error('[kazi/upload] storage error', uploadError);
    const missing = /not found|bucket/i.test(uploadError.message);
    return profileFail(
      reply,
      400,
      missing
        ? `The "${bucket}" storage bucket does not exist yet. Please create it in Supabase Storage.`
        : `Could not save the ${label.toLowerCase()}.`
    );
  }

  const { data: urlData } = supabase.storage.from(bucket).getPublicUrl(path);
  return { url: urlData.publicUrl, path, bucket, size: buffer.length, mimetype };
}

export default async function kaziRoutes(server: FastifyInstance) {  // GET /kazi/jobs
  server.get('/kazi/jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('status', 'open')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return reply.send(jobs);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/my-jobs
  server.get('/kazi/my-jobs', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: jobs, error } = await supabase
        .from('jobs')
        .select('*')
        .eq('employer_id', user.id)
        .order('created_at', { ascending: false });

      if (error) throw error;
      return reply.send(jobs);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/my-job-applicants
  server.get('/kazi/my-job-applicants', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id')
        .eq('employer_id', user.id);

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return reply.send({});

      const jobIds = jobs.map((j: any) => j.id);

      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('*, jobs:job_id ( title, pay_label, pay_amount, employer_id, location )')
        .in('job_id', jobIds)
        .order('applied_at', { ascending: false });

      if (appsError) throw appsError;

      const grouped = (applications || []).reduce((acc: any, app: any) => {
        if (!acc[app.job_id]) acc[app.job_id] = [];
        acc[app.job_id].push(app);
        return acc;
      }, {});

      return reply.send(grouped);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/my-applications
  server.get('/kazi/my-applications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: applications, error } = await supabase
        .from('applications')
        .select('*, jobs:job_id ( title, pay_label, pay_amount, employer_id, location, duration )')
        .eq('worker_id', user.id)
        .order('applied_at', { ascending: false });

      if (error) throw error;

      const hiredApps = (applications || []).filter((a: any) => a.status === 'Hired');
      const contracts = await Promise.all(
        hiredApps.map(async (app: any) => {
          const { data: contract } = await supabase
            .from('job_contracts')
            .select('*')
            .eq('job_id', app.job_id)
            .eq('worker_id', user.id)
            .single();
          return { ...app, contract };
        })
      );

      return reply.send(contracts);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/contracts
  server.get('/kazi/contracts', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: contracts, error } = await supabase
        .from('job_contracts')
        .select('*, jobs!inner (title)')
        .or(`employer_id.eq.${user.id},worker_id.eq.${user.id}`)
        .eq('status', 'active')
        .order('created_at', { ascending: false });

      if (error) throw error;
      return reply.send(contracts);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
  // POST /kazi/apply — accepts photoFile (multipart) OR photoUrl + additionalDescription
  server.post('/kazi/apply', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const isMultipart = (request.headers['content-type'] || '').includes('multipart/form-data');
      let body: any = {};
      let photoUrl: string | null = null;
      let additionalDescription: string | null = null;

      if (isMultipart && request.isMultipart?.()) {
        const parts = request.parts();
        for await (const part of parts) {
          if (part.type === 'field') {
            const field = part.fieldname;
            let value: any;
            try {
              value = JSON.parse(String(part.value));
            } catch {
              value = String(part.value);
            }
            body[field] = value;
            if (field === 'photoUrl') photoUrl = String(part.value);
            if (field === 'additionalDescription') additionalDescription = String(part.value);
          } else if (part.type === 'file') {
            if (part.fieldname === 'photoFile') {
              const fileBuffer = await part.toBuffer();
              const filename = `kazi-photos/${user.id}-${Date.now()}-${part.filename?.replace(/[^a-zA-Z0-9.\-]/g, '_') || 'photo.jpg'}`;
              const { data: uploadData, error: uploadError } = await supabase.storage
                .from('kazi-applicant-photos')
                .upload(filename, fileBuffer, {
                  contentType: part.mimetype || 'image/jpeg',
                  upsert: true,
                });
              if (uploadError) {
                console.error('Photo upload failed', uploadError);
                return reply.status(500).send({ error: 'Failed to upload photo: ' + uploadError.message });
              }
              const { data: urlData } = supabase.storage
                .from('kazi-applicant-photos')
                .getPublicUrl(uploadData.path);
              photoUrl = urlData.publicUrl;
            }
          }
        }
      } else {
        body = (request.body as any) || {};
        photoUrl = body.photoUrl || null;
        additionalDescription = body.additionalDescription || null;
      }

      const { job_id, applicant_name, phone, email, location, experience, availability } = body;

      if (!job_id || !applicant_name || !phone || !email || !location || !experience || !availability) {
        return reply.status(400).send({
          error: 'Missing required fields',
          required: ['job_id', 'applicant_name', 'phone', 'email', 'location', 'experience', 'availability'],
        });
      }

      const { data: existing } = await supabase
        .from('applications')
        .select('id')
        .eq('job_id', job_id)
        .eq('worker_id', user.id)
        .single();

      if (existing) {
        return reply.status(400).send({ error: 'You have already applied to this job' });
      }

      const { data: application, error } = await supabase
        .from('applications')
        .insert({
          job_id,
          worker_id: user.id,
          applicant_name,
          phone,
          email,
          location,
          experience,
          availability,
          photo_url: photoUrl,
          additional_description: additionalDescription,
          status: 'Pending',
        })
        .select()
        .single();

      if (error) throw error;

      const { data: jobData } = await supabase
        .from('jobs')
        .select('employer_id, title')
        .eq('id', job_id)
        .single();
      if (jobData?.employer_id) {
        await notifyUser(
          jobData.employer_id,
          'New Application',
          `New application from ${applicant_name} for "${jobData.title}"`,
          { jobId: job_id, type: 'application' }
        );
      }

      return reply.send(application);
    } catch (err: any) {
      console.error('Error in /kazi/apply:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
  // POST /kazi/hire — employer hires an applicant; creates escrow + contract
  server.post('/kazi/hire', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { applicationId, jobId } = body;

      const { data: app, error: appError } = await supabase
        .from('applications')
        .select('*, jobs!inner ( pay_amount, duration, employer_id, title )')
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      if (app.jobs.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      await supabase
        .from('applications')
        .update({ status: 'Hired' })
        .eq('id', applicationId);

      // Move job to hired state (removed from public listings)
      await supabase
        .from('jobs')
        .update({ status: 'hired', hired_worker_id: app.worker_id })
        .eq('id', jobId);

      const totalAmount = Number(app.jobs.pay_amount);
      const platformFee = Math.round(totalAmount * FEE_RATE);
      const workerAmount = totalAmount - platformFee;

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .insert({
          job_id: jobId,
          employer_id: user.id,
          worker_id: app.worker_id,
          amount: totalAmount,
          status: 'held',
          source: 'wallet',
          released_amount: 0,
          fee_amount: platformFee,
        })
        .select()
        .single();

      if (escrowError) throw escrowError;

      const durationMonths = getDurationInMonths(app.jobs.duration);
      const endDate = new Date();
      endDate.setMonth(endDate.getMonth() + durationMonths);

      const { data: contract, error: contractError } = await supabase
        .from('job_contracts')
        .insert({
          job_id: jobId,
          employer_id: user.id,
          worker_id: app.worker_id,
          status: 'active',
          total_amount: totalAmount,
          platform_fee: platformFee,
          worker_amount: workerAmount,
          escrow_id: escrow.id,
          worker_accepted: false,
          job_done: false,
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          next_payout_date: new Date().toISOString(),
          amount_released: 0,
          amount_held: totalAmount,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      await notifyUser(
        app.worker_id,
        'You have been hired!',
        `You have been selected for "${app.jobs.title}". Accept to proceed.`,
        { jobId, type: 'hired' }
      );
      await notifyUser(
        user.id,
        'Worker hired',
        `You hired ${app.applicant_name} for "${app.jobs.title}"`,
        { jobId, type: 'hired' }
      );

      return reply.send({ contract, escrow });
    } catch (err: any) {
      console.error('Error in /kazi/hire:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /kazi/accept-job — worker accepts; escrow becomes locked permanently
  server.post('/kazi/accept-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { jobId } = body;

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;
      if (job.hired_worker_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized: not the hired worker' });
      }

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .update({ status: 'locked', updated_at: new Date().toISOString() })
        .eq('job_id', jobId)
        .eq('employer_id', job.employer_id)
        .select()
        .single();
      if (escrowError) throw escrowError;

      await supabase
        .from('job_contracts')
        .update({ worker_accepted: true })
        .eq('job_id', jobId)
        .eq('worker_id', user.id);

      await notifyUser(
        job.employer_id,
        'Job accepted',
        `The worker has accepted "${job.title}". Escrow is now locked.`,
        { jobId, type: 'accepted' }
      );

      return reply.send({ success: true, escrow });
    } catch (err: any) {
      console.error('Error in /kazi/accept-job:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
  // POST /kazi/confirm-done — employer confirms job done; releases 90% to worker
  server.post('/kazi/confirm-done', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { jobId } = body;

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;
      if (job.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized: not the employer' });
      }

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .select('*')
        .eq('job_id', jobId)
        .single();
      if (escrowError) throw escrowError;
      if (!escrow) return reply.status(404).send({ error: 'Escrow not found' });
      if (escrow.status !== 'locked') {
        return reply.status(400).send({ error: 'Escrow must be locked before confirming done' });
      }

      const workerAmount = Math.round(Number(escrow.amount) * (1 - FEE_RATE));
      const feeAmount = Number(escrow.amount) - workerAmount;

      const { data: _creditData, error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id: escrow.worker_id,
        p_amount: workerAmount,
        p_mode: 'real',
        p_description: `KAZI Link payment for job ${jobId} (10% fee: ${feeAmount})`,
      });
      if (creditError) {
        console.error('Failed to credit worker', creditError);
        return reply.status(500).send({ error: 'Failed to credit worker wallet' });
      }

      await supabase
        .from('kazi_escrow')
        .update({
          status: 'released',
          released_amount: workerAmount,
          fee_amount: feeAmount,
          released_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq('id', escrow.id);

      await supabase
        .from('job_contracts')
        .update({ job_done: true, status: 'completed', amount_released: workerAmount })
        .eq('job_id', jobId)
        .eq('worker_id', escrow.worker_id);

      await supabase
        .from('jobs')
        .update({ status: 'completed' })
        .eq('id', jobId);

      await notifyUser(
        escrow.worker_id,
        'Job confirmed done',
        `Job "${job.title}" confirmed done. You can now withdraw KES ${workerAmount}.`,
        { jobId, type: 'done' }
      );

return reply.send({ success: true, workerAmount, feeAmount });
    } catch (err: any) {
      console.error('Error in /kazi/confirm-done:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /kazi/start-job — employer starts the job; marks contract as active for payout schedule
  server.post('/kazi/start-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { jobId } = body;

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;
      if (job.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized: not the employer' });
      }

      const { data: contract, error: contractError } = await supabase
        .from('job_contracts')
        .select('*')
        .eq('job_id', jobId)
        .single();
      if (contractError) throw contractError;
      if (!contract) return reply.status(404).send({ error: 'Contract not found' });
      if (!contract.worker_accepted) {
        return reply.status(400).send({ error: 'Worker must accept the job before starting' });
      }
      if (contract.status !== 'active') {
        return reply.status(400).send({ error: 'Contract must be active' });
      }

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .select('*')
        .eq('job_id', jobId)
        .single();
      if (escrowError) throw escrowError;
      if (!escrow) return reply.status(404).send({ error: 'Escrow not found' });
      if (escrow.status !== 'locked') {
        return reply.status(400).send({ error: 'Escrow must be locked before starting job' });
      }

      await supabase
        .from('job_contracts')
        .update({ start_date: new Date().toISOString() })
        .eq('id', contract.id);

      await notifyUser(
        contract.worker_id,
        'Job started',
        `The employer has started "${job.title}". Payout schedule is now active.`,
        { jobId, type: 'started' }
      );

      return reply.send({ success: true });
    } catch (err: any) {
      console.error('Error in /kazi/start-job:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /kazi/withdraw — worker withdraws released funds from escrow
  server.post('/kazi/withdraw', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { contractId } = body;

      const { data: contract, error: contractError } = await supabase
        .from('job_contracts')
        .select('*, kazi_escrow!inner (*)')
        .eq('id', contractId)
        .eq('worker_id', user.id)
        .single();
      if (contractError) throw contractError;
      if (!contract) return reply.status(404).send({ error: 'Contract not found' });

      const escrow = contract.kazi_escrow;
      if (!escrow) return reply.status(404).send({ error: 'Escrow not found' });
      if (escrow.status !== 'released') {
        return reply.status(400).send({ error: 'Funds not released yet' });
      }
      if (Number(escrow.released_amount) <= 0) {
        return reply.status(400).send({ error: 'No funds available to withdraw' });
      }

const { data: _creditData, error: creditError } = await supabase.rpc('credit_wallet', {
        p_user_id: user.id,
        p_amount: Number(escrow.released_amount),
        p_mode: 'real',
        p_description: `KAZI Link withdrawal for contract ${contractId}`,
      });
      if (creditError) {
        console.error('Failed to credit worker wallet', creditError);
        return reply.status(500).send({ error: 'Failed to credit wallet' });
      }

      await supabase
        .from('kazi_escrow')
        .update({ released_amount: 0, updated_at: new Date().toISOString() })
        .eq('id', escrow.id);

      await supabase
        .from('job_contracts')
        .update({ amount_released: 0 })
        .eq('id', contractId);

      return reply.send({ success: true, amount: Number(escrow.released_amount) });
    } catch (err: any) {
      console.error('Error in /kazi/withdraw:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // POST /kazi/request-refund — employer requests early reversal after acceptance
  server.post('/kazi/request-refund', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { jobId, reason } = body;

      if (!reason) return reply.status(400).send({ error: 'Reason is required' });

      const { data: job, error: jobError } = await supabase
        .from('jobs')
        .select('*')
        .eq('id', jobId)
        .single();
      if (jobError) throw jobError;
      if (job.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized: not the employer' });
      }

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .select('*')
        .eq('job_id', jobId)
        .single();
      if (escrowError) throw escrowError;
      if (!escrow) return reply.status(404).send({ error: 'Escrow not found' });
      if (escrow.status !== 'locked') {
        return reply.status(400).send({ error: 'Can only request refund when escrow is locked' });
      }

      const autoReleaseAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

      const { data: dispute, error: disputeError } = await supabase
        .from('kazi_disputes')
        .insert({
          job_id: jobId,
          escrow_id: escrow.id,
          employer_id: user.id,
          worker_id: escrow.worker_id,
          employer_reason: reason,
          auto_release_at: autoReleaseAt,
        })
        .select()
        .single();
      if (disputeError) throw disputeError;

      await supabase
        .from('kazi_escrow')
        .update({ status: 'disputed', reason, refund_requested_at: new Date().toISOString(), updated_at: new Date().toISOString() })
        .eq('id', escrow.id);

      await notifyUser(
        escrow.worker_id,
        'Employer requests withdrawal',
        `${user.email} requested to withdraw from "${job.title}". Reason: ${reason}. Please respond within 7 days.`,
        { jobId, type: 'dispute' }
      );

      return reply.send({ success: true, dispute, autoReleaseAt });
    } catch (err: any) {
      console.error('Error in /kazi/request-refund:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });
  // POST /kazi/dispute/:id/respond — worker accepts or declines the employer refund request
  server.post('/kazi/dispute/:id/respond', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { id } = request.params as { id: string };
      const body = request.body as any;
      const { response, reason } = body;

      if (response !== 'accepted' && response !== 'declined') {
        return reply.status(400).send({ error: 'response must be "accepted" or "declined"' });
      }
      if (response === 'declined' && !reason) {
        return reply.status(400).send({ error: 'Reason required when declining' });
      }

      const { data: dispute, error: disputeError } = await supabase
        .from('kazi_disputes')
        .select('*, kazi_escrow!inner (*)')
        .eq('id', id)
        .single();
      if (disputeError) throw disputeError;
      if (!dispute) return reply.status(404).send({ error: 'Dispute not found' });
      if (dispute.worker_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized: not the worker' });
      }
      if (dispute.worker_response) {
        return reply.status(400).send({ error: 'Dispute already responded to' });
      }

      const escrow = dispute.kazi_escrow;
      const now = new Date().toISOString();

      await supabase
        .from('kazi_disputes')
        .update({ worker_response: response, worker_reason: reason || null, worker_responded_at: now })
        .eq('id', id);

      if (response === 'accepted') {
        const employerAmount = Math.round(Number(escrow.amount) * (1 - FEE_RATE));
        const feeAmount = Number(escrow.amount) - employerAmount;

        await supabase
          .from('kazi_escrow')
          .update({
            status: 'refunded',
            released_amount: employerAmount,
            fee_amount: feeAmount,
            released_at: now,
            updated_at: now,
          })
          .eq('id', escrow.id);

        await supabase
          .from('jobs')
          .update({ status: 'cancelled' })
          .eq('id', dispute.job_id);

        await notifyUser(
          dispute.employer_id,
          'Refund approved',
          `The worker accepted your withdrawal request. You will receive KES ${employerAmount} (10% service fee retained).`,
          { jobId: dispute.job_id, type: 'dispute_resolved' }
        );
      } else {
        await supabase
          .from('kazi_escrow')
          .update({ status: 'locked', updated_at: now })
          .eq('id', escrow.id);

        await notifyUser(
          dispute.employer_id,
          'Refund declined',
          `The worker declined your withdrawal request. Reason: ${reason}. Escrow remains locked.`,
          { jobId: dispute.job_id, type: 'dispute_declined' }
        );
      }

      return reply.send({ success: true, response });
    } catch (err: any) {
      console.error('Error in /kazi/dispute/:id/respond:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
    }
  });

  // GET /kazi/notifications
  server.get('/kazi/notifications', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: notifications, error } = await supabase
        .from('notifications')
        .select('*')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;
      return reply.send(notifications || []);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /kazi/notifications/:id/read
  server.post('/kazi/notifications/:id/read', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { id } = request.params as { id: string };

      await supabase
        .from('notifications')
        .update({ read: true })
        .eq('id', id)
        .eq('user_id', user.id);

      return reply.send({ success: true });
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/disputes
  server.get('/kazi/disputes', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      const { data: disputes, error } = await supabase
        .from('kazi_disputes')
        .select('*, kazi_escrow!inner (amount, status, job_id, jobs!inner (title))')
        .or(`employer_id.eq.${user.id},worker_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;
return reply.send(disputes || []);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/messages — fetch chat messages for a job
  server.get('/kazi/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { jobId } = request.query as { jobId: string };

      if (!jobId) return reply.status(400).send({ error: 'jobId is required' });

      // Verify user is part of this job (either employer or hired worker)
      const { data: job } = await supabase
        .from('jobs')
        .select('employer_id, hired_worker_id')
        .eq('id', jobId)
        .single();

      if (!job || (job.employer_id !== user.id && job.hired_worker_id !== user.id)) {
        return reply.status(403).send({ error: 'Unauthorized: not part of this job' });
      }

      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('job_id', jobId)
        .order('created_at', { ascending: true });

      if (error) throw error;
      return reply.send(messages || []);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // POST /kazi/send-message — send a chat message
  server.post('/kazi/send-message', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { jobId, receiverId, message } = body;

      if (!jobId || !receiverId || !message) {
        return reply.status(400).send({ error: 'jobId, receiverId, and message are required' });
      }

      // Verify user is part of this job
      const { data: job } = await supabase
        .from('jobs')
        .select('employer_id, hired_worker_id')
        .eq('id', jobId)
        .single();

      if (!job || (job.employer_id !== user.id && job.hired_worker_id !== user.id)) {
        return reply.status(403).send({ error: 'Unauthorized: not part of this job' });
      }

      const { data: newMessage, error } = await supabase
        .from('messages')
        .insert({
          job_id: jobId,
          sender_id: user.id,
          receiver_id: receiverId,
          message,
          read: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Notify receiver
      await notifyUser(
        receiverId,
        'New message',
        `You have a new message regarding job ${jobId}`,
        { jobId, type: 'message' }
      );

      return reply.send(newMessage);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // GET /kazi/escrow/:jobId
server.get('/kazi/escrow/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const { jobId } = request.params as { jobId: string };

      const { data: escrow, error } = await supabase
        .from('kazi_escrow')
        .select('*')
        .eq('job_id', jobId)
        .single();

      if (error && error.code !== 'PGRST116') throw error;
      return reply.send(escrow || null);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });
// POST /kazi/post-job â€” employer pays upfront before the job is posted
  server.post('/kazi/post-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) {
        return reply.status(401).send({ error: 'Unauthorized: No token provided' });
      }

      const user = await getUserFromToken(token);
      const body = request.body as any;
      const { title, category, location, pay, payAmount, duration, description, accommodation, requirements, paymentSource } = body;

      if (!title || !category || !location || !pay || !payAmount || !duration || !description) {
        return reply.status(400).send({
          error: 'Missing required fields',
          required: ['title', 'category', 'location', 'pay', 'payAmount', 'duration', 'description'],
        });
      }

      const amount = parseInt(payAmount);
      if (!Number.isFinite(amount) || amount <= 0) {
        return reply.status(400).send({ error: 'Invalid pay amount' });
      }

      const source = paymentSource || 'wallet';
      if (!['wallet', 'banking', 'mpesa'].includes(source)) {
        return reply.status(400).send({ error: 'paymentSource must be wallet, banking, or mpesa' });
      }

      // Create the job row in a pending state (not visible publicly until paid)
      const { data: job, error: insertError } = await supabase
        .from('jobs')
        .insert({
          employer_id: user.id,
          title,
          category,
          location,
          pay_label: pay,
          pay_amount: amount,
          duration,
          description,
          accommodation: accommodation || false,
          requirements: requirements || [],
          status: 'open',
          escrow_amount: amount,
          escrow_status: 'held',
          badge: 'Hot',
          created_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (insertError) {
        console.error('[kazi/post-job] Supabase insert error:', {
          message: insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
          columns: Object.keys({
            employer_id: user.id,
            title,
            category,
            location,
            pay_label: pay,
            pay_amount: amount,
            duration,
            description,
            accommodation: accommodation || false,
            requirements: requirements || [],
            status: 'open',
            escrow_amount: amount,
            escrow_status: 'held',
            badge: 'Hot',
            created_at: new Date().toISOString(),
          }),
        });
        return reply.status(500).send({ 
          error: 'Database error: ' + insertError.message,
          code: insertError.code,
          details: insertError.details,
          hint: insertError.hint,
        });
      }

      if (source === 'mpesa') {
        const phone = body.phone;
        if (!phone) {
          await supabase.from('jobs').delete().eq('id', job.id);
          return reply.status(400).send({ error: 'Phone number required for M-Pesa payment' });
        }

        const cleanPhone = String(phone).replace(/\D/g, '');
        let normalized = cleanPhone;
        if (normalized.startsWith('0')) normalized = '254' + normalized.slice(1);
        if (!normalized.startsWith('254')) normalized = '254' + normalized;
        if (!/^254[71]\d{8}$/.test(normalized)) {
          await supabase.from('jobs').delete().eq('id', job.id);
          return reply.status(400).send({ error: 'Invalid Kenyan phone number' });
        }

        const localRequestId = 'kazi_' + user.id + '_' + job.id + '_' + Date.now();

        const { data: _mpesaDeposit, error: mpesaError } = await supabase
          .from('mpesa_deposits')
          .insert({
            user_id: user.id,
            phone: normalized,
            amount,
            checkout_request_id: localRequestId,
            status: 'pending',
            kazi_job_id: job.id,
            created_at: new Date().toISOString(),
          })
          .select()
          .single();

        if (mpesaError) {
          console.error('Failed to create mpesa deposit', mpesaError);
          await supabase.from('jobs').delete().eq('id', job.id);
          return reply.status(500).send({ error: 'Failed to initialize M-Pesa payment' });
        }

        const accessToken = await generateKaziAccessToken();
        if (!accessToken) {
          await supabase.from('jobs').delete().eq('id', job.id);
          return reply.status(500).send({ error: 'Failed to authenticate with M-Pesa' });
        }

        const stkResult = await initiateKaziSTKPush(accessToken, amount, normalized, user.id, localRequestId);
        if (!stkResult) {
          await supabase
            .from('mpesa_deposits')
            .update({ status: 'failed' })
            .eq('checkout_request_id', localRequestId);
          await supabase.from('jobs').delete().eq('id', job.id);
          return reply.status(500).send({ error: 'Failed to initiate M-Pesa prompt' });
        }

        return reply.status(202).send({
          job,
          payment: {
            source: 'mpesa',
            checkoutRequestId: stkResult.CheckoutRequestID,
            merchantRequestId: stkResult.MerchantRequestID,
            customerMessage: stkResult.CustomerMessage,
            message: 'STK Push sent. Check your phone and enter your M-Pesa PIN.',
          },
        });
      }

      // wallet or banking
      const debitResult = await debitKaziSource(source, user.id, amount);
      if (!debitResult.success) {
        await supabase.from('jobs').delete().eq('id', job.id);
        return reply.status(400).send({ error: debitResult.error || 'Payment failed' });
      }

      const { data: escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .insert({
          job_id: job.id,
          employer_id: user.id,
          amount,
          status: 'held',
          source,
          released_amount: 0,
          fee_amount: Math.round(amount * FEE_RATE),
        })
        .select()
        .single();

      if (escrowError) {
        console.error('Failed to create escrow', escrowError);
        return reply.status(500).send({ error: 'Failed to create escrow record' });
      }

      return reply.status(201).send({ job, escrow });
    } catch (err: any) {
      console.error('[kazi/post-job] ERROR:', {
        message: err.message,
        code: err.code,
        details: err.details,
        hint: err.hint,
        stack: err.stack,
        body: request.body,
      });
      return reply.status(500).send({
        error: err.message || 'Internal server error',
        details: err.toString(),
        stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
      });
    }
  });
// POST /kazi/mpesa/job-payment-callback â€” M-Pesa callback for KAZI job payments
  server.post('/kazi/mpesa/job-payment-callback', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const body: any = request.body;
      const stkCallback = body?.Body?.stkCallback;

      if (!stkCallback) {
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      const checkoutRequestId = stkCallback.CheckoutRequestID;
      const resultCode = Number(stkCallback.ResultCode);

      if (!checkoutRequestId) {
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      if (resultCode !== 0) {
        await supabase
          .from('mpesa_deposits')
          .update({ status: 'failed' })
          .eq('checkout_request_id', checkoutRequestId);
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      const callbackMetadata = stkCallback.CallbackMetadata;
      let callbackAmount = 0;
      let mpesaReceipt = '';

      if (callbackMetadata && Array.isArray(callbackMetadata.Item)) {
        for (const item of callbackMetadata.Item) {
          if (item.Name === 'Amount') callbackAmount = Number(item.Value);
          if (item.Name === 'MpesaReceiptNumber') mpesaReceipt = String(item.Value);
        }
      }

      const { data: deposit, error: depositError } = await supabase
        .from('mpesa_deposits')
        .select('*')
        .eq('checkout_request_id', checkoutRequestId)
        .single();

      if (depositError || !deposit) {
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      if (deposit.status === 'completed') {
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      const finalAmount = callbackAmount > 0 ? callbackAmount : Number(deposit.amount);
      const jobId = deposit.kazi_job_id;

      if (!jobId) {
        await supabase
          .from('mpesa_deposits')
          .update({ status: 'completed', mpesa_receipt: mpesaReceipt || null })
          .eq('checkout_request_id', checkoutRequestId);
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      // Create the escrow record now that payment has cleared
      const { data: _escrow, error: escrowError } = await supabase
        .from('kazi_escrow')
        .insert({
          job_id: jobId,
          employer_id: deposit.user_id,
          amount: finalAmount,
          status: 'held',
          source: 'mpesa',
          released_amount: 0,
          fee_amount: Math.round(finalAmount * FEE_RATE),
          checkout_request_id: checkoutRequestId,
          mpesa_receipt: mpesaReceipt || null,
        })
        .select()
        .single();

      if (escrowError) {
        console.error('Failed to create escrow on M-Pesa callback', escrowError);
        return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
      }

      await supabase
        .from('mpesa_deposits')
        .update({ status: 'completed', mpesa_receipt: mpesaReceipt || null })
        .eq('checkout_request_id', checkoutRequestId);

      await supabase
        .from('jobs')
        .update({ escrow_amount: finalAmount, escrow_status: 'held' })
        .eq('id', jobId);

      return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    } catch (err) {
      console.error('Error in /kazi/mpesa/job-payment-callback:', err);
      return reply.status(200).send({ ResultCode: 0, ResultDesc: 'Accepted' });
    }
  });

  // GET /kazi/mpesa/job-status/:checkoutRequestId — check kazi job payment status
  server.get('/kazi/mpesa/job-status/:checkoutRequestId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { checkoutRequestId } = request.params as { checkoutRequestId: string };

      const { data: deposit, error } = await supabase
        .from('mpesa_deposits')
        .select('*, jobs!kazi_job_id (id, status)')
        .eq('checkout_request_id', checkoutRequestId)
        .eq('user_id', user.id)
        .single();

      if (error || !deposit) {
        return reply.status(404).send({ error: 'Payment not found' });
      }

      return reply.send({ status: deposit.status });
    } catch (err) {
      console.error('Error in /kazi/mpesa/job-status:', err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ═══════════════════════════════════════════════════════════════════════════
  // KAZI PROFILE — public worker / service provider profile
  // Added after the existing endpoints above; nothing above is modified.
  // ═══════════════════════════════════════════════════════════════════════════

  // GET /kazi/profile/me — own profile, auto-created on first call
  server.get('/kazi/profile/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const profile = await ensureOwnProfile(user.id, user.email);
      const [counts, sections, rating] = await Promise.all([
        getProfileCounts(user.id),
        loadProfileSections(user.id),
        getRating(user.id),
      ]);
      const completeness = computeCompleteness(profile, counts);
      if (completeness !== profile.completeness) {
        await supabase.from('kazi_profiles').update({ completeness }).eq('id', profile.id);
        profile.completeness = completeness;
      }
      return reply.send({
        success: true,
        data: { profile: { ...profile, completeness }, rating, ...sections },
      });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not load your profile');
    }
  });

  // PUT /kazi/profile/me — update the basic fields
  server.put('/kazi/profile/me', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};

      const profileType = body.profile_type ?? 'worker';
      if (!['worker', 'service_provider', 'business'].includes(profileType)) {
        return profileFail(reply, 400, 'profile_type must be worker, service_provider or business');
      }

      const patch: Record<string, any> = {
        profile_type: profileType,
        updated_at: new Date().toISOString(),
      };

      if ('full_name' in body) patch.full_name = trimOrNull(body.full_name);
      if ('headline' in body) patch.headline = trimOrNull(body.headline);
      if ('bio' in body) patch.bio = trimOrNull(body.bio);
      if ('photo_url' in body) patch.photo_url = trimOrNull(body.photo_url);
      if ('cv_url' in body) patch.cv_url = trimOrNull(body.cv_url);
      if ('category' in body) patch.category = trimOrNull(body.category);
      if ('location' in body) patch.location = trimOrNull(body.location);
      if ('availability' in body) patch.availability = trimOrNull(body.availability);
      if ('service_name' in body) patch.service_name = trimOrNull(body.service_name);
      if ('service_description' in body) patch.service_description = trimOrNull(body.service_description);
      if ('hourly_rate' in body) patch.hourly_rate = positiveNumberOrNull(body.hourly_rate);
      if ('daily_rate' in body) patch.daily_rate = positiveNumberOrNull(body.daily_rate);
      if ('monthly_rate' in body) patch.monthly_rate = positiveNumberOrNull(body.monthly_rate);

      const profile = await ensureOwnProfile(user.id, user.email);

      const { data: updated, error: updateError } = await supabase
        .from('kazi_profiles')
        .update(patch)
        .eq('id', profile.id)
        .eq('user_id', user.id)
        .select('*')
        .single();

      if (updateError) throw updateError;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(updated, counts);
      if (completeness !== updated.completeness) {
        await supabase.from('kazi_profiles').update({ completeness }).eq('id', updated.id);
        updated.completeness = completeness;
      }

      return reply.send({ success: true, data: { profile: updated, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not save your profile');
    }
  });

  // GET /kazi/profile/:userId — public, read-only profile
  server.get('/kazi/profile/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };
      if (!userId) return profileFail(reply, 400, 'userId is required');

      const { data: profile, error } = await supabase
        .from('kazi_profiles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();

      if (error) throw error;
      if (!profile) return profileFail(reply, 404, 'Profile not found');

      const [sections, rating] = await Promise.all([
        loadProfileSections(userId),
        getRating(userId),
      ]);

      return reply.send({ success: true, data: { profile, rating, ...sections } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not load this profile');
    }
  });

  // POST /kazi/upload-cv — multipart PDF/DOC/DOCX into kazi-cvs
  server.post('/kazi/upload-cv', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const stored = await storeUploadedFile({
        request,
        reply,
        bucket: CV_BUCKET,
        folder: 'cvs',
        userId: user.id,
        accept: PROFILE_CV_TYPES,
        label: 'CV',
      });
      if (!stored || !('url' in stored)) return;
      return reply.send({ success: true, data: stored });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not upload the CV');
    }
  });

  // POST /kazi/upload-photo — multipart image into kazi-photos
  server.post('/kazi/upload-photo', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const stored = await storeUploadedFile({
        request,
        reply,
        bucket: PHOTO_BUCKET,
        folder: 'photos',
        userId: user.id,
        accept: PROFILE_IMAGE_TYPES,
        label: 'Photo',
      });
      if (!stored || !('url' in stored)) return;
      return reply.send({ success: true, data: stored });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not upload the photo');
    }
  });

  // POST /kazi/upload-portfolio — multipart image into kazi-portfolio
  server.post('/kazi/upload-portfolio', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const stored = await storeUploadedFile({
        request,
        reply,
        bucket: PORTFOLIO_BUCKET,
        folder: 'portfolio',
        userId: user.id,
        accept: PROFILE_IMAGE_TYPES,
        label: 'Portfolio image',
        field: 'image',
      });
      if (!stored || !('url' in stored)) return;
      return reply.send({ success: true, data: stored });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not upload the portfolio image');
    }
  });

  // POST /kazi/skills
  server.post('/kazi/skills', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};
      const skillName = trimOrNull(body.skill_name);
      if (!skillName) return profileFail(reply, 400, 'skill_name is required');

      const proficiency = trimOrNull(body.proficiency);
      if (proficiency && !['beginner', 'intermediate', 'advanced', 'expert'].includes(proficiency)) {
        return profileFail(reply, 400, 'proficiency must be beginner, intermediate, advanced or expert');
      }

      const years = body.years_experience === undefined || body.years_experience === null || body.years_experience === ''
        ? null
        : Number(body.years_experience);
      if (years !== null && (!Number.isFinite(years) || years < 0 || years > 80)) {
        return profileFail(reply, 400, 'years_experience must be between 0 and 80');
      }

      await ensureOwnProfile(user.id, user.email);

      const { data: skill, error } = await supabase
        .from('kazi_skills')
        .insert({
          user_id: user.id,
          skill_name: skillName,
          proficiency,
          years_experience: years,
        })
        .select('*')
        .single();

      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { skill, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not add the skill');
    }
  });

  // DELETE /kazi/skills/:id
  server.delete('/kazi/skills/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const { id } = request.params as { id: string };
      const { error } = await supabase
        .from('kazi_skills')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { id, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not remove the skill');
    }
  });

  // POST /kazi/experience
  server.post('/kazi/experience', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};
      const jobTitle = trimOrNull(body.job_title);
      if (!jobTitle) return profileFail(reply, 400, 'job_title is required');

      const isCurrent = Boolean(body.is_current);

      await ensureOwnProfile(user.id, user.email);

      const { data: item, error } = await supabase
        .from('kazi_experience')
        .insert({
          user_id: user.id,
          job_title: jobTitle,
          company: trimOrNull(body.company),
          location: trimOrNull(body.location),
          start_date: trimOrNull(body.start_date),
          end_date: isCurrent ? null : trimOrNull(body.end_date),
          is_current: isCurrent,
          description: trimOrNull(body.description),
        })
        .select('*')
        .single();

      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { experience: item, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not add the experience entry');
    }
  });

  // DELETE /kazi/experience/:id
  server.delete('/kazi/experience/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const { id } = request.params as { id: string };
      const { error } = await supabase
        .from('kazi_experience')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { id, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not remove the experience entry');
    }
  });

  // POST /kazi/education
  server.post('/kazi/education', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};
      const institution = trimOrNull(body.institution);
      if (!institution) return profileFail(reply, 400, 'institution is required');

      const year = (value: unknown) => {
        if (value === undefined || value === null || value === '') return null;
        const n = Number(value);
        return Number.isInteger(n) && n >= 1900 && n <= 2200 ? n : null;
      };

      await ensureOwnProfile(user.id, user.email);

      const { data: item, error } = await supabase
        .from('kazi_education')
        .insert({
          user_id: user.id,
          institution,
          qualification: trimOrNull(body.qualification),
          field_of_study: trimOrNull(body.field_of_study),
          start_year: year(body.start_year),
          end_year: year(body.end_year),
        })
        .select('*')
        .single();

      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { education: item, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not add the education entry');
    }
  });

  // DELETE /kazi/education/:id
  server.delete('/kazi/education/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const { id } = request.params as { id: string };
      const { error } = await supabase
        .from('kazi_education')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { id, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not remove the education entry');
    }
  });

  // POST /kazi/portfolio
  server.post('/kazi/portfolio', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};
      const imageUrl = trimOrNull(body.image_url);
      if (!imageUrl) return profileFail(reply, 400, 'image_url is required');

      await ensureOwnProfile(user.id, user.email);

      const { data: item, error } = await supabase
        .from('kazi_portfolio')
        .insert({
          user_id: user.id,
          image_url: imageUrl,
          title: trimOrNull(body.title),
          description: trimOrNull(body.description),
        })
        .select('*')
        .single();

      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { portfolio: item, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not add the portfolio item');
    }
  });

  // DELETE /kazi/portfolio/:id
  server.delete('/kazi/portfolio/:id', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const { id } = request.params as { id: string };
      const { error } = await supabase
        .from('kazi_portfolio')
        .delete()
        .eq('id', id)
        .eq('user_id', user.id);
      if (error) throw error;

      const counts = await getProfileCounts(user.id);
      const completeness = computeCompleteness(await ensureOwnProfile(user.id, user.email), counts);
      await supabase.from('kazi_profiles').update({ completeness }).eq('user_id', user.id);

      return reply.send({ success: true, data: { id, completeness } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not remove the portfolio item');
    }
  });

  // POST /kazi/review — only between two users who completed a contract
  server.post('/kazi/review', async (request: FastifyRequest, reply: FastifyReply) => {
    const user = await requireKaziUser(request, reply);
    if (!user) return;
    try {
      const body = (request.body as any) || {};
      const revieweeId = trimOrNull(body.reviewee_id);
      if (!revieweeId) return profileFail(reply, 400, 'reviewee_id is required');
      if (revieweeId === user.id) return profileFail(reply, 400, 'You cannot review yourself');

      const rating = Number(body.rating);
      if (!Number.isFinite(rating) || rating < 1 || rating > 5) {
        return profileFail(reply, 400, 'rating must be a number between 1 and 5');
      }

      const comment = trimOrNull(body.comment);

      // Only a completed KAZI contract between the two parties unlocks a review.
      let contractQuery = supabase
        .from('job_contracts')
        .select('id, job_id')
        .eq('status', 'completed')
        .or(`employer_id.eq.${user.id},worker_id.eq.${user.id}`)
        .limit(200);
      if (body.job_id) contractQuery = contractQuery.eq('job_id', body.job_id);

      const { data: contracts, error: contractError } = await contractQuery;
      if (contractError) throw contractError;

      const other = String(body.job_id || '');
      const shared = (contracts || []).filter((c: any) => {
        const matches = body.job_id ? c.job_id === body.job_id : true;
        const counterpart = c.employer_id === user.id ? c.worker_id : c.employer_id;
        return matches && counterpart === revieweeId;
      });

      if (shared.length === 0) {
        return profileFail(
          reply,
          403,
          'You can only review someone you completed a KAZI contract with'
        );
      }
      if (other && body.job_id) {
        const { data: existing } = await supabase
          .from('kazi_reviews')
          .select('id')
          .eq('reviewee_id', revieweeId)
          .eq('reviewer_id', user.id)
          .eq('job_id', body.job_id)
          .maybeSingle();
        if (existing) return profileFail(reply, 400, 'You have already reviewed this person for this job');
      }

      const { data: review, error } = await supabase
        .from('kazi_reviews')
        .insert({
          reviewer_id: user.id,
          reviewee_id: revieweeId,
          job_id: body.job_id || null,
          rating: Math.round(rating),
          comment,
        })
        .select('*')
        .single();

      if (error) throw error;

      return reply.send({ success: true, data: { review } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not save the review');
    }
  });

  // GET /kazi/reviews/:userId — reviews written about a user
  server.get('/kazi/reviews/:userId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { userId } = request.params as { userId: string };
      if (!userId) return profileFail(reply, 400, 'userId is required');

      const { data, error } = await supabase
        .from('kazi_reviews')
        .select('*, jobs:job_id (title)')
        .eq('reviewee_id', userId)
        .order('created_at', { ascending: false })
        .limit(100);

      if (error) throw error;

      const reviews = data || [];
      const ratings = reviews.map((r: any) => Number(r.rating)).filter(Number.isFinite);
      const rating = ratings.length
        ? Math.round((ratings.reduce((a: number, b: number) => a + b, 0) / ratings.length) * 10) / 10
        : null;

      return reply.send({ success: true, data: { reviews, rating, reviewCount: ratings.length } });
    } catch (err: any) {
      return profileDbError(reply, err, 'Could not load the reviews');
    }
  });
}
