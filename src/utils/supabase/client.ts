import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
    throw new Error('Missing Supabase environment variables');
}

// ─── Singleton client (no auto‑refresh, no listeners) ────────────
export const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    auth: {
        autoRefreshToken: false, // prevents automatic refresh loops
        persistSession: true,
        detectSessionInUrl: false,
    },
});

// ─── Keep the original function name for backward compatibility ──
export function createBrowserClient() {
    return supabase;
}
