import { createClient } from "@supabase/supabase-js";

/**
 * Route guard used by the member-only hubs (KAZI Link, Business Hub,
 * Banking Hub, Trading).
 *
 * Fails CLOSED: if the session cannot be read — including when Supabase env
 * vars are missing — the visitor is treated as a guest and sent to sign up,
 * rather than being shown a broken page.
 */
export async function hasActiveSession(): Promise<boolean> {
  try {
    const url = import.meta.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
    const key =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      import.meta.env.VITE_SUPABASE_ANON_KEY ||
      process.env.SUPABASE_PUBLISHABLE_KEY ||
      process.env.SUPABASE_ANON_KEY;

    if (!url || !key) return false;

    const supabase = createClient(url, key, {
      auth: {
        storage: typeof window !== "undefined" ? localStorage : undefined,
        persistSession: true,
        autoRefreshToken: true,
      },
    });

    const {
      data: { session },
    } = await supabase.auth.getSession();

    return !!session;
  } catch {
    return false;
  }
}
