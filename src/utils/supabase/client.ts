import { createClient } from '@supabase/supabase-js'

export function createClient() {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL
    const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY

    if (!supabaseUrl || !supabaseAnonKey) {
        console.error('Supabase configuration missing:', { supabaseUrl: !!supabaseUrl, supabaseAnonKey: !!supabaseAnonKey })
        throw new Error('Supabase configuration is missing in environment variables.')
    }

    return createClient(supabaseUrl, supabaseAnonKey)
}
