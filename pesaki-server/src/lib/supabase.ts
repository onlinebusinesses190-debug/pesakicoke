import { createClient } from '@supabase/supabase-js';
import { env } from '../config/env';

// Service role key used for all server-side operations requiring auth bypass
export const supabase = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});
