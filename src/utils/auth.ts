import { supabase } from './supabase/client';

// Uses the shared singleton rather than constructing a client per call. Building
// one here created extra GoTrueClient instances in the same browser context,
// which duplicated auth listeners and produced the "Multiple GoTrueClient
// instances detected" warning. It also imported a `createClient` export that
// this module never had, so both helpers were broken at runtime.
export async function getCurrentUser() {
  const {
    data: { session },
  } = await supabase.auth.getSession();
  return session?.user ?? null;
}

export async function signOut() {
  await supabase.auth.signOut();
}