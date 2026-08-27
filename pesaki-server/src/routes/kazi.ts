// pesaki-server/src/routes/kazi.ts
import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Helper: Get user from token
async function getUserFromToken(token: string) {
  const { data: { user }, error } = await supabase.auth.getUser(token);
  if (error || !user) throw new Error('Invalid token');
  return user;
}

export default async function kaziRoutes(server: FastifyInstance) {
  // ─── GET /kazi/jobs ──────────────────────────────────────────────────────
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

  // ─── POST /kazi/post-job ────────────────────────────────────────────────
  server.post('/kazi/post-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { title, category, location, pay, payAmount, duration, description, accommodation, requirements } = request.body as any;

      const { data: job, error } = await supabase
        .from('jobs')
        .insert({
          employer_id: user.id,
          title,
          category,
          location,
          pay_label: pay,
          pay_amount: payAmount,
          duration,
          description,
          accommodation,
          requirements,
          status: 'open',
          badge: 'Hot',
        })
        .select()
        .single();

      if (error) throw error;
      return reply.send(job);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── POST /kazi/apply ────────────────────────────────────────────────────
  server.post('/kazi/apply', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { job_id, applicant_name, phone, email, location, experience, availability, photo_url } = request.body as any;

      // Check if already applied
      const { data: existing, error: checkError } = await supabase
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
          photo_url,
          status: 'Pending',
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification for employer
      await supabase.from('notifications').insert({
        user_id: user.id,
        message: `New application from ${applicant_name}`,
        type: 'kazi',
      });

      return reply.send(application);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── GET /kazi/my-applications ──────────────────────────────────────────
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

      // Also fetch contracts for hired applications
      const hiredApps = applications?.filter(a => a.status === 'Hired') || [];
      const contracts = await Promise.all(
        hiredApps.map(async (app) => {
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

  // ─── GET /kazi/my-jobs ───────────────────────────────────────────────────
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

  // ─── GET /kazi/my-job-applicants ────────────────────────────────────────
  server.get('/kazi/my-job-applicants', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);

      // Get all jobs by this employer
      const { data: jobs, error: jobsError } = await supabase
        .from('jobs')
        .select('id')
        .eq('employer_id', user.id);

      if (jobsError) throw jobsError;
      if (!jobs || jobs.length === 0) return reply.send({});

      const jobIds = jobs.map(j => j.id);

      // Get all applications for these jobs
      const { data: applications, error: appsError } = await supabase
        .from('applications')
        .select('*, jobs:job_id ( title, pay_label, pay_amount, employer_id, location )')
        .in('job_id', jobIds)
        .order('applied_at', { ascending: false });

      if (appsError) throw appsError;

      // Group by job_id
      const grouped = applications?.reduce((acc: any, app) => {
        if (!acc[app.job_id]) acc[app.job_id] = [];
        acc[app.job_id].push(app);
        return acc;
      }, {});

      return reply.send(grouped || {});
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── POST /kazi/hire ────────────────────────────────────────────────────
  server.post('/kazi/hire', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { applicationId, jobId } = request.body as any;

      // Get application details
      const { data: app, error: appError } = await supabase
        .from('applications')
        .select('*, jobs!inner ( pay_amount, duration, employer_id )')
        .eq('id', applicationId)
        .single();

      if (appError) throw appError;

      // Verify the employer owns this job
      if (app.jobs.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      // Update application status
      const { error: updateError } = await supabase
        .from('applications')
        .update({ status: 'Hired' })
        .eq('id', applicationId);

      if (updateError) throw updateError;

      // Update job status
      await supabase
        .from('jobs')
        .update({ status: 'filled', hired_worker_id: app.worker_id })
        .eq('id', jobId);

      // Calculate amounts (10% platform fee)
      const totalAmount = app.jobs.pay_amount;
      const platformFee = Math.round(totalAmount * 0.10);
      const workerAmount = totalAmount - platformFee;

      // Create job contract
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
          start_date: new Date().toISOString(),
          end_date: endDate.toISOString(),
          next_payout_date: new Date().toISOString(),
          amount_released: 0,
          amount_held: totalAmount,
        })
        .select()
        .single();

      if (contractError) throw contractError;

      // Create notifications
      await supabase.from('notifications').insert([
        {
          user_id: app.worker_id,
          message: `You have been hired for ${app.jobs.title}!`,
          type: 'kazi',
        },
        {
          user_id: user.id,
          message: `You hired ${app.applicant_name} for ${app.jobs.title}`,
          type: 'kazi',
        },
      ]);

      return reply.send(contract);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── POST /kazi/start-job ──────────────────────────────────────────────
  server.post('/kazi/start-job', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { contractId } = request.body as any;

      // Get contract
      const { data: contract, error: contractError } = await supabase
        .from('job_contracts')
        .select('*, jobs!inner (duration)')
        .eq('id', contractId)
        .single();

      if (contractError) throw contractError;

      // Verify employer
      if (contract.employer_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      // Calculate first payout (pro-rated based on duration)
      const durationMonths = getDurationInMonths(contract.jobs.duration);
      const firstPayout = Math.round(contract.worker_amount / durationMonths);

      // Release first payout
      const { error: updateError } = await supabase
        .from('job_contracts')
        .update({
          amount_released: firstPayout,
          amount_held: contract.amount_held - firstPayout,
          status: 'active',
          next_payout_date: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // Next month
        })
        .eq('id', contractId);

      if (updateError) throw updateError;

      return reply.send({ success: true, released: firstPayout });
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── POST /kazi/withdraw ────────────────────────────────────────────────
  server.post('/kazi/withdraw', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { contractId } = request.body as any;

      // Get contract
      const { data: contract, error: contractError } = await supabase
        .from('job_contracts')
        .select('*')
        .eq('id', contractId)
        .single();

      if (contractError) throw contractError;

      // Verify worker
      if (contract.worker_id !== user.id) {
        return reply.status(403).send({ error: 'Unauthorized' });
      }

      if (contract.amount_released <= 0) {
        return reply.status(400).send({ error: 'No funds available to withdraw' });
      }

      // Credit worker's wallet
      const { data: wallet, error: walletError } = await supabase
        .from('wallets')
        .select('balance')
        .eq('user_id', user.id)
        .single();

      if (walletError) throw walletError;

      const newBalance = (wallet.balance || 0) + contract.amount_released;

      await supabase
        .from('wallets')
        .update({ balance: newBalance })
        .eq('user_id', user.id);

      // Record withdrawal in ledger
      await supabase
        .from('wallet_ledger')
        .insert({
          user_id: user.id,
          amount: contract.amount_released,
          type: 'kazi_payment',
          mode: 'credit',
          description: `KAZI Link payment for job`,
          status: 'completed',
        });

      // Reset released amount
      await supabase
        .from('job_contracts')
        .update({ amount_released: 0 })
        .eq('id', contractId);

      return reply.send({ success: true, amount: contract.amount_released });
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── GET /kazi/contracts ────────────────────────────────────────────────
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

  // ─── GET /kazi/messages ─────────────────────────────────────────────────
  server.get('/kazi/messages', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { jobId } = request.query as any;

      const { data: messages, error } = await supabase
        .from('messages')
        .select('*')
        .eq('job_id', jobId)
        .or(`sender_id.eq.${user.id},receiver_id.eq.${user.id}`)
        .order('created_at', { ascending: false });

      if (error) throw error;

      // Mark messages as read
      if (messages && messages.length > 0) {
        const unreadIds = messages.filter(m => m.receiver_id === user.id && !m.read).map(m => m.id);
        if (unreadIds.length > 0) {
          await supabase
            .from('messages')
            .update({ read: true })
            .in('id', unreadIds);
        }
      }

      return reply.send(messages || []);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── POST /kazi/send-message ──────────────────────────────────────────
  server.post('/kazi/send-message', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const token = request.headers.authorization?.replace('Bearer ', '');
      if (!token) return reply.status(401).send({ error: 'Unauthorized' });

      const user = await getUserFromToken(token);
      const { jobId, receiverId, message } = request.body as any;

      const { data: msg, error } = await supabase
        .from('messages')
        .insert({
          sender_id: user.id,
          receiver_id: receiverId,
          job_id: jobId,
          message,
          read: false,
        })
        .select()
        .single();

      if (error) throw error;

      // Create notification
      await supabase.from('notifications').insert({
        user_id: receiverId,
        message: `New message from ${user.email}`,
        type: 'kazi',
      });

      return reply.send(msg);
    } catch (err) {
      console.error(err);
      return reply.status(500).send({ error: 'Internal server error' });
    }
  });

  // ─── GET /kazi/notifications ───────────────────────────────────────────
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
}

// ─── Helper: Get duration in months ──────────────────────────────────────
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
