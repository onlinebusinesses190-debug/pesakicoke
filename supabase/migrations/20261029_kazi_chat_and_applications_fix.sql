-- ============================================================
-- RUN THIS IMMEDIATELY IN SUPABASE SQL EDITOR
-- ============================================================
-- This ensures the 'applications' table has ALL columns
-- the backend INSERT requires. Without this, the INSERT
-- returns a 500 error and the frontend shows no success.
-- ============================================================

-- 1. Ensure the applications table exists
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

-- 2. Add any missing columns (IF NOT EXISTS makes this safe)
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS id                  uuid PRIMARY KEY DEFAULT gen_random_uuid();
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS job_id              uuid REFERENCES public.jobs(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS worker_id           uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS applicant_name      text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS phone               text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS email               text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS location            text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS experience         text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS availability        text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS photo_url           text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS additional_description text;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS status             text DEFAULT 'Pending' NOT NULL;
ALTER TABLE public.applications ADD COLUMN IF NOT EXISTS applied_at          timestamptz DEFAULT now() NOT NULL;

-- 3. Ensure jobs table has all required columns
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

ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS employer_id       uuid REFERENCES auth.users(id) ON DELETE CASCADE;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS title              text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS category           text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS location           text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_label          text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS pay_amount         numeric(12,2);
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS duration           text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS description        text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS accommodation      boolean DEFAULT false;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS requirements       jsonb DEFAULT '[]'::jsonb;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS status             text DEFAULT 'open';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS badge              text DEFAULT 'Hot';
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS created_at         timestamptz DEFAULT now() NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS escrow_amount      numeric(18,2) DEFAULT 0 NOT NULL;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS escrow_status      text;
ALTER TABLE public.jobs ADD COLUMN IF NOT EXISTS hired_worker_id    uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- 4. Ensure messages table has media/call columns
CREATE TABLE IF NOT EXISTS public.messages (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id       uuid NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  sender_id    uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  receiver_id  uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  message      text DEFAULT '',
  media_url    text,
  media_type   text,
  call_type    text,
  call_status  text,
  call_duration numeric,
  read         boolean DEFAULT false NOT NULL,
  created_at   timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS message       text DEFAULT '';
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_url     text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS media_type    text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_type     text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_status   text;
ALTER TABLE public.messages ADD COLUMN IF NOT EXISTS call_duration numeric;

-- 5. Storage bucket for chat media
INSERT INTO storage.buckets (id, name, public)
VALUES ('kazi-applicant-photos', 'kazi-applicant-photos', true)
ON CONFLICT (id) DO NOTHING;

-- 6. Check if any column is missing (run this query to diagnose):
-- SELECT column_name, data_type FROM information_schema.columns 
-- WHERE table_schema = 'public' AND table_name = 'applications' 
-- ORDER BY ordinal_position;
