import { createClient as createBrowserClient } from './supabase/client';

const getApiUrl = () => {
    if (import.meta.env.VITE_PESAKI_API_URL) {
        return import.meta.env.VITE_PESAKI_API_URL;
    }
    
    // Fallback for development or if env is missing
    return 'https://pesaki-server.onrender.com';
};
const API_URL = getApiUrl();

export async function apiRequest(path: string, options: RequestInit = {}) {
    // SSR safe: only run in browser
    if (typeof window === 'undefined') {
        throw new Error('apiRequest can only be called from client components');
    }
    const supabase = createBrowserClient();
    let { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
        console.error('[API] getSession error:', sessionError);
    }

    // If no session immediately, wait a moment and try again (Supabase hydration)
    if (!session?.access_token) {
        console.log('[API] No session found, waiting for hydration...');
        await new Promise(resolve => setTimeout(resolve, 300)); // Increased delay for stability
        const { data: { session: hydratedSession } } = await supabase.auth.getSession();
        session = hydratedSession;
    }

    if (!session?.access_token) {
        console.log('[API] Still no session, attempting refresh...');
        const { data: { session: refreshedSession }, error: refreshError } = await supabase.auth.refreshSession();
        if (!refreshError && refreshedSession) {
            session = refreshedSession;
        } else if (refreshError) {
            console.error('[API] refreshSession error:', refreshError.message);
        }
    }
    
    if (!session?.access_token) {
        const errorMsg = 'Authentication required. Please log in to continue.';
        console.warn(`[API] ${errorMsg} (URL: ${path})`);
        throw new Error(errorMsg);
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('Content-Type', 'application/json');

    const fetchUrl = (path.startsWith('http') || path.startsWith('/api/')) ? path : `${API_URL}${path}`;

    let response = await fetch(fetchUrl, {
        ...options,
        headers,
        cache: 'no-store',
    });

    // Auto-refresh on 401 and log event for debugging
    if (response.status === 401) {
        try {
            const key = 'pesaki_api_events'
            const prev = JSON.parse(localStorage.getItem(key) || '[]')
            prev.push({ ts: Date.now(), url: fetchUrl, status: response.status, note: 'initial_401' })
            if (prev.length > 50) prev.shift()
            localStorage.setItem(key, JSON.stringify(prev))
        } catch (e) {}

        console.log('[API] 401 detected, refreshing session...');
        const { error: refreshError2 } = await supabase.auth.refreshSession();
        if (!refreshError2) {
            ({ data: { session } } = await supabase.auth.getSession());
            if (session?.access_token) {
                headers.set('Authorization', `Bearer ${session.access_token}`);
                console.log('[API] Retry with new token, length:', session.access_token.length);
                response = await fetch(fetchUrl, {
                    ...options,
                    headers,
                    cache: 'no-store',
                });
            }
        }
    }

    if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
            const error = await response.json();
            // Look for 'error' or 'message' in the JSON body
            errorMsg = error.error || error.message || errorMsg;
        } catch (e) {
            // If not JSON, try text
            try {
                const text = await response.text();
                if (text) errorMsg = text;
            } catch (innerE) {}
        }
        try {
            const key = 'pesaki_api_events'
            const prev = JSON.parse(localStorage.getItem(key) || '[]')
            prev.push({ ts: Date.now(), url: fetchUrl, status: response.status, message: errorMsg })
            if (prev.length > 50) prev.shift()
            localStorage.setItem(key, JSON.stringify(prev))
        } catch (e) {
            // ignore
        }
        throw new Error(errorMsg);
    }

    return response.json();
}
