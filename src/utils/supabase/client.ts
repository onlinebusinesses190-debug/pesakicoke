// ─── Unified Supabase client ─────────────────────────────────────
// Re-exports the app-wide singleton so there is only ONE GoTrueClient
// instance in the browser, avoiding the "Multiple GoTrueClient instances"
// warning and potential auth sync issues.
export { supabase } from '@/integrations/supabase/client';

// ─── Backward compatibility ──────────────────────────────────────
import { supabase as _supabase } from '@/integrations/supabase/client';
export function createBrowserClient() {
    return _supabase;
}
