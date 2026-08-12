import { supabase } from './supabase/client';

const getApiUrl = () => {
    if (import.meta.env.VITE_PESAKI_API_URL) {
        return import.meta.env.VITE_PESAKI_API_URL;
    }
    return 'https://pesaki-server.onrender.com';
};
const API_URL = getApiUrl();

export async function apiRequest(path: string, options: RequestInit = {}) {
    if (typeof window === 'undefined') {
        throw new Error('apiRequest can only be called from client components');
    }

    // ── Use the singleton client ─────────────────────────────────────
    const { data: { session }, error } = await supabase.auth.getSession();

    if (error) {
        console.error('[API] getSession error:', error);
    }

    if (!session?.access_token) {
        const msg = 'Authentication required. Please log in to continue.';
        console.warn(`[API] ${msg} (URL: ${path})`);
        throw new Error(msg);
    }

    const headers = new Headers(options.headers);
    headers.set('Authorization', `Bearer ${session.access_token}`);
    headers.set('Content-Type', 'application/json');

    const fetchUrl = path.startsWith('http') ? path : `${API_URL}${path}`;

    const response = await fetch(fetchUrl, {
        ...options,
        headers,
        cache: 'no-store',
    });

    if (!response.ok) {
        let errorMsg = `HTTP error! status: ${response.status}`;
        try {
            const errorBody = await response.json();
            errorMsg = errorBody.error || errorBody.message || errorMsg;
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
