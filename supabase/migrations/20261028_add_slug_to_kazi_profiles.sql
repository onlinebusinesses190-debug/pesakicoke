-- Adds the missing `slug` column to kazi_profiles.
-- Required by:
--   - PUT /kazi/profile/me (auto-generates slug from full_name)
--   - GET /kazi/profile/by-slug/:slug
--   - GET /kazi/sitemap
--   - Frontend route /kazi/m/$slug
-- This column was introduced in commit fc37ccd but the migration
-- that created kazi_profiles (20261005_kazi_profiles.sql) did not add it.

-- ── 1. Add the column (nullable so legacy profiles without a name are unaffected)
ALTER TABLE public.kazi_profiles
  ADD COLUMN IF NOT EXISTS slug text UNIQUE;

CREATE INDEX IF NOT EXISTS kazi_profiles_slug_idx ON public.kazi_profiles (slug);

-- ── 2. Backfill slugs for existing profiles that already have a full_name
DO $$
DECLARE
  rec  RECORD;
  base_slug text;
  final_slug text;
  counter int;
BEGIN
  FOR rec IN
    SELECT id, full_name
    FROM public.kazi_profiles
    WHERE full_name IS NOT NULL
      AND trim(full_name) <> ''
      AND slug IS NULL
  LOOP
    -- Build a base slug from the user's name
    base_slug := trim(both '-' from lower(regexp_replace(coalesce(rec.full_name, ''), '[^a-zA-Z0-9]+', '-', 'g')));
    final_slug := base_slug;
    counter := 1;

    -- Ensure uniqueness: append -2, -3, etc. on collision
    WHILE EXISTS (
      SELECT 1 FROM public.kazi_profiles p
      WHERE p.slug = final_slug AND p.id <> rec.id
    ) LOOP
      counter := counter + 1;
      final_slug := base_slug || '-' || counter;
    END LOOP;

    UPDATE public.kazi_profiles
    SET slug = final_slug
    WHERE id = rec.id;
  END LOOP;
END $$;

-- ── 3. Allow new profiles to auto-generate their slug on first save
--    (no NOT NULL constraint — slug is populated lazily by the PUT handler.)
-- ── 4. Refresh the Supabase type cache hint (no-op at runtime; for docs)
