-- Supabase migration: KAZI Link escrow + dispute flow
-- Adds the escrow/dispute tables and extends the existing KAZI tables
-- (jobs, applications, job_contracts, messages, notifications) which were
-- created ad-hoc in the live database.  All statements are idempotent
-- (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS) so this can be
-- re-run safely.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- --------------------------------------------------------------------------------
-- 1. kazi_escrow (new) - must exist before job_contracts.escrow_id FK
-- --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kazi_escrow (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id              uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id           uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  amount              numeric(18,2) NOT NULL CHECK (amount > 0),
  status              text NOT NULL DEFAULT 'held'
                        CHECK (status IN ('held', 'locked', 'released', 'refunded', 'disputed')),
  source              text NOT NULL CHECK (source IN ('wallet', 'banking', 'mpesa')),
  released_amount     numeric(18,2) DEFAULT 0 NOT NULL,
  fee_amount          numeric(18,2) DEFAULT 0 NOT NULL,
  reason              text,
  created_at          timestamptz DEFAULT now() NOT NULL,
  updated_at          timestamptz DEFAULT now() NOT NULL,
  released_at         timestamptz,
  refund_requested_at timestamptz,
  checkout_request_id text,
  mpesa_receipt       text
);

CREATE INDEX IF NOT EXISTS idx_kazi_escrow_job ON public.kazi_escrow(job_id);
CREATE INDEX IF NOT EXISTS idx_kazi_escrow_employer ON public.kazi_escrow(employer_id);
CREATE INDEX IF NOT EXISTS idx_kazi_escrow_worker ON public.kazi_escrow(worker_id);
CREATE INDEX IF NOT EXISTS idx_kazi_escrow_status ON public.kazi_escrow(status);

-- --------------------------------------------------------------------------------
-- 2. kazi_disputes (new)
-- --------------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.kazi_disputes (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id               uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  escrow_id            uuid NOT NULL REFERENCES public.kazi_escrow(id) ON DELETE CASCADE,
  employer_id          uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id            uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  employer_reason      text NOT NULL,
  worker_response      text CHECK (worker_response IN ('accepted', 'declined', 'timeout')),
  worker_reason        text,
  created_at           timestamptz DEFAULT now() NOT NULL,
  worker_responded_at  timestamptz,
  auto_release_at      timestamptz NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_kazi_disputes_escrow ON public.kazi_disputes(escrow_id);
CREATE INDEX IF NOT EXISTS idx_kazi_disputes_auto_release
  ON public.kazi_disputes(auto_release_at)
  WHERE worker_responded_at IS NULL;

-- --------------------------------------------------------------------------------
-- 3. jobs (extend existing)
-- --------------------------------------------------------------------------------
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS escrow_amount   numeric(18,2) DEFAULT 0 NOT NULL,
  ADD COLUMN IF NOT EXISTS escrow_status   text,
  ADD COLUMN IF NOT EXISTS hired_worker_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- status enum support: 'open', 'hired', 'in_progress', 'completed', 'cancelled', 'disputed'
-- (kept as plain text so existing rows with arbitrary values keep working)
CREATE INDEX IF NOT EXISTS idx_jobs_employer ON public.jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_hired_worker ON public.jobs(hired_worker_id);

-- --------------------------------------------------------------------------------
-- 4. applications (extend existing)
-- --------------------------------------------------------------------------------
ALTER TABLE public.applications
  ADD COLUMN IF NOT EXISTS photo_url             text,
  ADD COLUMN IF NOT EXISTS additional_description text;

-- --------------------------------------------------------------------------------
-- 5. job_contracts (extend existing)
-- --------------------------------------------------------------------------------
ALTER TABLE public.job_contracts
  ADD COLUMN IF NOT EXISTS escrow_id uuid REFERENCES public.kazi_escrow(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS worker_accepted  boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS job_done        boolean DEFAULT false NOT NULL;

-- --------------------------------------------------------------------------------
-- 6. messages (extend existing - ensure contract_id exists for contract chat)
-- --------------------------------------------------------------------------------
ALTER TABLE public.messages
  ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.job_contracts(id) ON DELETE SET NULL;

-- --------------------------------------------------------------------------------
-- 7. notifications (extend existing)
-- --------------------------------------------------------------------------------
ALTER TABLE public.notifications
  ADD COLUMN IF NOT EXISTS title          text,
  ADD COLUMN IF NOT EXISTS body           text,
  ADD COLUMN IF NOT EXISTS related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS read           boolean DEFAULT false NOT NULL,
  ADD COLUMN IF NOT EXISTS kazi_type      text;

-- --------------------------------------------------------------------------------
-- 8. Storage bucket for applicant photos
-- --------------------------------------------------------------------------------
INSERT INTO storage.buckets (id, name, public)
VALUES ('kazi-applicant-photos', 'kazi-applicant-photos', true)
ON CONFLICT (id) DO NOTHING;

-- Public read access for applicant photos (object level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    WHERE pol.polname = 'kazi_applicant_photos_public_read' AND pol.polcmd = 'r'
  ) THEN
    CREATE POLICY kazi_applicant_photos_public_read
      ON storage.objects
      FOR SELECT
      USING (bucket_id = 'kazi-applicant-photos');
  END IF;
END
$$;

-- Allow authenticated users to upload to the bucket (object level)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policy pol
    WHERE pol.polname = 'kazi_applicant_photos_upload' AND pol.polcmd = 'a'
  ) THEN
    CREATE POLICY kazi_applicant_photos_upload
      ON storage.objects
      FOR INSERT
      WITH CHECK (bucket_id = 'kazi-applicant-photos' AND auth.role() = 'authenticated');
  END IF;
END
$$;