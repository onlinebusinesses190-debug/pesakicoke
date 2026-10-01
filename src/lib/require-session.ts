import { supabase } from "@/utils/supabase/client";

/**
 * Route guard used by the member-only hubs (KAZI Link, Business Hub,
 * Banking Hub, Trading).
 *
 * Fails CLOSED: if the session cannot be read — including when Supabase env
 * vars are missing — the visitor is treated as a guest and sent to sign up,
 * rather than being shown a broken page.
 *
 * Reads the shared client. Constructing a dedicated one here added another
 * GoTrueClient to the same browser context, which duplicated auth listeners.
 */
export async function hasActiveSession(): Promise<boolean> {
  try {
    const {
      data: { session },
    } = await supabase.auth.getSession();

    return !!session;
  } catch {
    return false;
  }
}
