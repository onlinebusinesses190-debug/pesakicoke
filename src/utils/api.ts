import { supabase } from "./supabase/client";

export class ApiError extends Error {
  constructor(
    message: string,
    public statusCode: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export function isApiError(err: unknown): err is ApiError {
  return err instanceof ApiError;
}

const getApiUrl = () => {
  if (import.meta.env.VITE_PESAKI_API_URL) {
    return import.meta.env.VITE_PESAKI_API_URL;
  }
  return "https://pesaki-server.onrender.com";
};
const API_URL = getApiUrl();

export async function apiFetch(path: string, options: RequestInit = {}): Promise<Response> {
  if (typeof window === "undefined") {
    throw new Error("apiFetch can only be called from client components");
  }

  const {
    data: { session },
    error,
  } = await supabase.auth.getSession();

  if (error) {
    console.error("[API] getSession error:", error);
  }

  const headers = new Headers(options.headers);
  if (session?.access_token) {
    headers.set("Authorization", `Bearer ${session.access_token}`);
  }
  headers.set("Content-Type", "application/json");

  const fetchUrl = path.startsWith("http") ? path : `${API_URL}${path}`;

  return fetch(fetchUrl, {
    ...options,
    headers,
    cache: "no-store",
  });
}

export async function apiRequest<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  if (typeof window === "undefined") {
    throw new Error("apiRequest can only be called from client components");
  }

  // Protected endpoints require an authenticated session. Public endpoints can
  // still be reached via `apiFetch` directly, which sends a token only when one
  // is available rather than rejecting the request.
  const {
    data: { session },
  } = await supabase.auth.getSession();

  if (!session?.access_token) {
    const msg = "Authentication required. Please log in to continue.";
    console.warn(`[API] ${msg} (URL: ${path})`);
    throw new Error(msg);
  }

  const response = await apiFetch(path, options);

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
    throw new ApiError(errorMsg, response.status);
  }

  return response.json();
}
