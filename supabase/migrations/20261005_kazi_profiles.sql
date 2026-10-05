-- ============================================================================
-- KAZI Link — public worker / service provider profiles
--
-- Adds six new tables and three new storage buckets. No existing KAZI table
-- (jobs, applications, job_contracts, kazi_escrow, kazi_disputes, messages,
-- notifications) is altered.
--
-- The backend (pesaki-server/src/routes/kazi.ts) talks to these tables with
-- the service-role key, so RLS stays enabled and only public reads are granted.
-- ============================================================================

-- ─── kazi_profiles ───────────────────────────────────────────────────────────
create table if not exists public.kazi_profiles (
  id                  uuid primary key default gen_random_uuid(),
  user_id             uuid not null unique references auth.users(id) on delete cascade,
  full_name           text,
  headline            text,
  bio                 text,
  photo_url           text,
  cv_url              text,
  category            text,
  location            text,
  availability        text,
  profile_type        text not null default 'worker'
                        check (profile_type in ('worker', 'service_provider', 'business')),
  service_name        text,
  service_description text,
  hourly_rate         numeric(12, 2),
  daily_rate          numeric(12, 2),
  monthly_rate        numeric(12, 2),
  is_verified         boolean not null default false,
  completeness        integer not null default 0 check (completeness between 0 and 100),
  created_at          timestamptz not null default now(),
  updated_at          timestamptz not null default now()
);

create index if not exists kazi_profiles_user_id_idx on public.kazi_profiles (user_id);

-- ─── kazi_skills ─────────────────────────────────────────────────────────────
create table if not exists public.kazi_skills (
  id               uuid primary key default gen_random_uuid(),
  user_id          uuid not null references auth.users(id) on delete cascade,
  skill_name       text not null,
  proficiency      text check (proficiency in ('beginner', 'intermediate', 'advanced', 'expert')),
  years_experience numeric(4, 1),
  created_at       timestamptz not null default now()
);

create index if not exists kazi_skills_user_id_idx on public.kazi_skills (user_id);

-- ─── kazi_experience ─────────────────────────────────────────────────────────
create table if not exists public.kazi_experience (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  job_title   text not null,
  company     text,
  location    text,
  start_date  text,
  end_date    text,
  is_current  boolean not null default false,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists kazi_experience_user_id_idx on public.kazi_experience (user_id);

-- ─── kazi_education ──────────────────────────────────────────────────────────
create table if not exists public.kazi_education (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references auth.users(id) on delete cascade,
  institution    text not null,
  qualification  text,
  field_of_study text,
  start_year     integer,
  end_year       integer,
  created_at     timestamptz not null default now()
);

create index if not exists kazi_education_user_id_idx on public.kazi_education (user_id);

-- ─── kazi_portfolio ──────────────────────────────────────────────────────────
create table if not exists public.kazi_portfolio (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid not null references auth.users(id) on delete cascade,
  image_url   text,
  title       text,
  description text,
  created_at  timestamptz not null default now()
);

create index if not exists kazi_portfolio_user_id_idx on public.kazi_portfolio (user_id);

-- ─── kazi_reviews ────────────────────────────────────────────────────────────
create table if not exists public.kazi_reviews (
  id          uuid primary key default gen_random_uuid(),
  reviewer_id uuid not null references auth.users(id) on delete cascade,
  reviewee_id uuid not null references auth.users(id) on delete cascade,
  job_id      uuid,
  rating      integer not null check (rating between 1 and 5),
  comment     text,
  created_at  timestamptz not null default now(),
  unique (reviewer_id, reviewee_id, job_id)
);

create index if not exists kazi_reviews_reviewee_id_idx on public.kazi_reviews (reviewee_id);

-- ─── Row level security ──────────────────────────────────────────────────────
-- Service-role requests bypass RLS, so writes stay server-only. Reads are open
-- because these are public profiles rendered at /kazi/public/:userId.
alter table public.kazi_profiles  enable row level security;
alter table public.kazi_skills    enable row level security;
alter table public.kazi_experience enable row level security;
alter table public.kazi_education  enable row level security;
alter table public.kazi_portfolio  enable row level security;
alter table public.kazi_reviews    enable row level security;

drop policy if exists "kazi_profiles_public_read"  on public.kazi_profiles;
drop policy if exists "kazi_skills_public_read"    on public.kazi_skills;
drop policy if exists "kazi_experience_public_read" on public.kazi_experience;
drop policy if exists "kazi_education_public_read" on public.kazi_education;
drop policy if exists "kazi_portfolio_public_read" on public.kazi_portfolio;
drop policy if exists "kazi_reviews_public_read"   on public.kazi_reviews;

create policy "kazi_profiles_public_read"  on public.kazi_profiles  for select using (true);
create policy "kazi_skills_public_read"    on public.kazi_skills    for select using (true);
create policy "kazi_experience_public_read" on public.kazi_experience for select using (true);
create policy "kazi_education_public_read" on public.kazi_education  for select using (true);
create policy "kazi_portfolio_public_read" on public.kazi_portfolio  for select using (true);
create policy "kazi_reviews_public_read"   on public.kazi_reviews    for select using (true);

-- ─── Storage buckets ─────────────────────────────────────────────────────────
-- Public read so profile photos, CVs and portfolio images can be rendered with
-- getPublicUrl. Keep the bucket list in sync with CV_BUCKET / PHOTO_BUCKET /
-- PORTFOLIO_BUCKET in pesaki-server/src/routes/kazi.ts.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values
  ('kazi-cvs',        'kazi-cvs',        true, 5242880,
   array['application/pdf',
         'application/msword',
         'application/vnd.openxmlformats-officedocument.wordprocessingml.document']),
  ('kazi-photos',     'kazi-photos',     true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif']),
  ('kazi-portfolio',  'kazi-portfolio',  true, 5242880,
   array['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/heic', 'image/heif'])
on conflict (id) do update
  set public              = excluded.public,
      file_size_limit     = excluded.file_size_limit,
      allowed_mime_types  = excluded.allowed_mime_types;