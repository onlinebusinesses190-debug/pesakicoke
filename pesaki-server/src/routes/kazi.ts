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

      const { data: creditData, error: creditError } = await supabase.rpc('credit_wallet', {
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

      const { data: creditData, error: creditError } = await supabase.rpc('credit_wallet', {
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

  // GET /kazi/escrow/:jobId
  server.get('/kazi/escrow/:jobId', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
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
        console.error('Supabase insert error:', insertError);
        return reply.status(500).send({ error: 'Database error: ' + insertError.message });
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

        const { data: mpesaDeposit, error: mpesaError } = await supabase
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
      console.error('Error in /kazi/post-job:', err);
      return reply.status(500).send({ error: err.message || 'Internal server error' });
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
      const { data: escrow, error: escrowError } = await supabase
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
}
