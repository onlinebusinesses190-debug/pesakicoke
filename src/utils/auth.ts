import { createClient } from './supabase/client';

export async function getCurrentUser() {
    const supabase = createClient();
    const { data: { session } } = await supabase.auth.getSession();
    return session?.user || null;
}

export async function signOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
}
