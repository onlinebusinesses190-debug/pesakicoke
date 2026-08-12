import { createClient as createBrowserClient } from './supabase/client';

const getApiUrl = () => {
    if (import.meta.env.VITE_PESAKI_API_URL) {
        return import.meta.env.VITE_PESAKI_API_URL;
    }
    return 'https://pesaki-server.onrender.com';
};
const API_URL = getApiUrl();

export async function apiRequest(path: string, options: RequestInit = {}) {
    // Only run in browser
    if (typeof window === 'undefined') {
        throw new Error('apiRequest can only be called from client components');
    }

    const supabase = createBrowserClient();

    // ── Get session once ──────────────────────────────────────────────
    const { data: { session }, error: sessionError } = await supabase.auth.getSession();

    if (sessionError) {
        console.error('[API] getSession error:', sessionError);
    }

    // ── If no token, throw immediately (no retry, no loop) ──────────
    if (!session?.access_token) {
        const errorMsg = 'Authentication required. Please log in to continue.';
        console.warn(`[API] ${errorMsg} (URL: ${path})`);
        throw new Error(errorMsg);
    }

    // ── Build headers ─────────────────────────────────────────────────
    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('Content-Type', 'application/json');

    const fetchUrl = (path.startsWith('http') || path.startsWith('/api/')) ? path : `${API_URL}${path}`;

    // ── Make request ──────────────────────────────────────────────────
    let response = await fetch(fetchUrl, {
        ...options,
        headers,
        cache: 'no-store',
    });

    // ── Handle non-200 responses ──────────────────────────────────────
    if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
            const error = await response.json();
            errorMsg = error.error || error.message || errorMsg;
        } catch (e) {
            try {
                const text = await response.text();
                if (text) errorMsg = text;
            } catch (innerE) {}
        }
        throw new Error(errorMsg);
    }

    return response.json();
}
