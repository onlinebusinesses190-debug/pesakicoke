-- Auto-assign admin role to the platform owner on signup
CREATE OR REPLACE FUNCTION public.make_owner_admin()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.email = 'onlinebusinesses190@gmail.com' THEN
    INSERT INTO public.admin_users (user_id, role, email)
    SELECT NEW.id, 'admin', NEW.email
    WHERE NOT EXISTS (
      SELECT 1 FROM public.admin_users WHERE user_id = NEW.id
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_make_owner_admin ON auth.users;
CREATE TRIGGER trg_make_owner_admin
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.make_owner_admin();

-- Backfill if the user already exists
INSERT INTO public.admin_users (user_id, role, email)
SELECT id, 'admin', 'onlinebusinesses190@gmail.com'
FROM auth.users
WHERE email = 'onlinebusinesses190@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.admin_users WHERE user_id = auth.users.id
  );
