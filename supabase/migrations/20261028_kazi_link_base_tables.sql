-- KAZI Link — base tables (jobs, applications, job_contracts, notifications, messages)
--
-- The escrow migration (20260915_kazi_link_escrow.sql) uses ALTER TABLE on these
-- tables, which fails if they do not exist.  These tables were originally created
-- ad-hoc in the live Supabase dashboard; this migration creates them with ALL
-- columns (including the ones 20260915 tries to add) so that:
--   1. A fresh database gets the complete schema.
--   2. An existing database that already ran 20260915 is left untouched
--      (CREATE TABLE IF NOT EXISTS / ADD COLUMN IF NOT EXISTS are no-ops).
--
-- Without these tables the POST /kazi/apply endpoint returns 500 because the
-- INSERT hits a non-existent relation or a missing column.

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ─── jobs ─────────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.jobs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  employer_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title             text NOT NULL,
  category          text,
  location          text,
  pay_label         text,
  pay_amount        numeric(12,2),
  duration          text,
  description       text,
  accommodation     boolean DEFAULT false,
  requirements      jsonb DEFAULT '[]'::jsonb,
  status            text NOT NULL DEFAULT 'open',
  badge             text DEFAULT 'Hot',
  created_at        timestamptz NOT NULL DEFAULT now(),
  escrow_amount     numeric(18,2) DEFAULT 0 NOT NULL,
  escrow_status     text,
  hired_worker_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL
);

-- Backfill any missing columns on pre-existing tables.
-- The columns below are in the CREATE TABLE above; these ALTERs make the
-- migration safe when the table already exists (ad-hoc creation) but is
-- missing columns that the backend code expects.
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS employer_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS title             text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category          text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location          text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_label         text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_amount         numeric(12,2);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS duration          text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS description       text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS accommodation     boolean DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requirements      jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status            text DEFAULT 'open';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS badge             text DEFAULT 'Hot';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS escrow_amount      numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS escrow_status      text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS hired_worker_id   uuid REFERENCES auth.users(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_employer      ON public.jobs(employer_id);
CREATE INDEX IF NOT EXISTS idx_jobs_status        ON public.jobs(status);
CREATE INDEX IF NOT EXISTS idx_jobs_hired_worker  ON public.jobs(hired_worker_id);

-- ─── applications ─────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.applications (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id                 uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  worker_id              uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  applicant_name         text NOT NULL,
  phone                  text NOT NULL,
  email                  text NOT NULL,
  location               text NOT NULL,
  experience             text NOT NULL,
  availability           text NOT NULL,
  photo_url              text,
  additional_description text,
  status                 text NOT NULL DEFAULT 'Pending',
  applied_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS job_id                 uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS worker_id              uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS applicant_name         text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS phone                  text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS email                  text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS location               text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS experience             text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS availability           text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS photo_url              text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS additional_description text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS status                 text DEFAULT 'Pending' NOT NULL;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS applied_at             timestamptz DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS idx_applications_job_id     ON public.applications(job_id);
CREATE INDEX IF NOT EXISTS idx_applications_worker_id  ON public.applications(worker_id);
CREATE INDEX IF NOT EXISTS idx_applications_status     ON public.applications(status);
CREATE INDEX IF NOT EXISTS idx_applications_applied_at  ON public.applications(applied_at DESC);

-- ─── job_contracts ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.job_contracts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id            uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  employer_id       uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  worker_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  status            text NOT NULL DEFAULT 'active',
  total_amount      numeric(18,2) NOT NULL,
  platform_fee      numeric(18,2) DEFAULT 0 NOT NULL,
  worker_amount     numeric(18,2) DEFAULT 0 NOT NULL,
  start_date        timestamptz,
  end_date          timestamptz,
  next_payout_date  timestamptz,
  amount_released   numeric(18,2) DEFAULT 0 NOT NULL,
  amount_held       numeric(18,2) DEFAULT 0 NOT NULL,
  escrow_id         uuid REFERENCES public.kazi_escrow(id) ON DELETE SET NULL,
  worker_accepted   boolean DEFAULT false NOT NULL,
  job_done          boolean DEFAULT false NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS job_id            uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS employer_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS worker_id         uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS status            text DEFAULT 'active' NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS total_amount      numeric(18,2);
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS platform_fee      numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS worker_amount     numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS start_date        timestamptz;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS end_date          timestamptz;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS next_payout_date  timestamptz;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS amount_released   numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS amount_held       numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS created_at        timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS escrow_id         uuid REFERENCES public.kazi_escrow(id) ON DELETE SET NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS worker_accepted   boolean DEFAULT false NOT NULL;
ALTER TABLE public.job_contracts ADD COLUMN IF NOT EXISTS job_done          boolean DEFAULT false NOT NULL;

CREATE INDEX IF NOT EXISTS idx_job_contracts_job_id        ON public.job_contracts(job_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_worker_id     ON public.job_contracts(worker_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_employer_id   ON public.job_contracts(employer_id);
CREATE INDEX IF NOT EXISTS idx_job_contracts_status        ON public.job_contracts(status);

-- ─── notifications ────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.notifications (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id         uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  title           text,
  body            text,
  related_job_id  uuid REFERENCES public.jobs(id) ON DELETE SET NULL,
  read            boolean DEFAULT false NOT NULL,
  kazi_type       text,
  created_at      timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS user_id        uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS title          text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS body           text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS related_job_id uuid REFERENCES public.jobs(id) ON DELETE SET NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS read           boolean DEFAULT false NOT NULL;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS kazi_type      text;
ALTER TABLE public.notifications ADD COLUMN IF NOT EXISTS created_at     timestamptz DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS idx_notifications_user_id      ON public.notifications(user_id);
CREATE INDEX IF NOT EXISTS idx_notifications_created_at   ON public.notifications(created_at DESC);

-- ─── messages (chat) ──────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.messages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id      uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  contract_id uuid REFERENCES public.job_contracts(id) ON DELETE SET NULL,
  sender_id   uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message     text NOT NULL,
  read        boolean DEFAULT false NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS job_id      uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS contract_id uuid REFERENCES public.job_contracts(id) ON DELETE SET NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS sender_id   uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS receiver_id uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message     text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url    text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type   text CHECK (media_type IN ('image','video','audio','document'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_type    text CHECK (call_type IN ('audio','video'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_status  text CHECK (call_status IN ('ringing','answered','missed','ended'));
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_duration numeric;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS read         boolean DEFAULT false NOT NULL;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS created_at   timestamptz DEFAULT now() NOT NULL;

CREATE INDEX IF NOT EXISTS idx_messages_job       ON public.messages(job_id);
CREATE INDEX IF NOT EXISTS idx_messages_contract  ON public.messages(contract_id);
CREATE INDEX IF NOT EXISTS idx_messages_sender    ON public.messages(sender_id);
CREATE INDEX IF NOT EXISTS idx_messages_receiver  ON public.messages(receiver_id);
CREATE INDEX IF NOT EXISTS idx_messages_created   ON public.messages(created_at);

-- ─── Storage bucket for applicant photos (used by POST /kazi/apply multipart) ─
INSERT INTO storage.buckets (id, name, public)
VALUES ('kazi-applicant-photos', 'kazi-applicant-photos', true)
ON CONFLICT (id) DO NOTHING;

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
