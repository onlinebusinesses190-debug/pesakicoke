import { supabase } from "@/integrations/supabase/client";
import type {
  KaziProfileBasic,
  KaziProfileBundle,
  KaziProfileRating,
  KaziProfile,
  KaziSkill,
  KaziExperience,
  KaziEducation,
  KaziPortfolioItem,
  KaziReview,
} from "./types";

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

export interface KaziApiResult<T> {
  success: boolean;
  data?: T;
  error?: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  return token ? { Authorization: `Bearer ${token}` } : {};
}

/**
 * JSON request against the KAZI profile endpoints. Every endpoint answers with
 * { success, data } / { success, error } and never a 5xx, so a non-ok status
 * still carries a readable message.
 */
export async function kaziApi<T>(
  path: string,
  options: { method?: string; body?: unknown } = {}
): Promise<KaziApiResult<T>> {
  try {
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      ...(await authHeaders()),
    };

    const res = await fetch(`${API_BASE}${path}`, {
      method: options.method || "GET",
      headers,
      cache: "no-store",
      ...(options.body === undefined ? {} : { body: JSON.stringify(options.body) }),
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!json || typeof json.success !== "boolean") {
      return {
        success: false,
        error: json?.error || `Request failed (HTTP ${res.status})`,
      };
    }
    if (!json.success) {
      return { success: false, error: json.error || "Request failed" };
    }
    return { success: true, data: json.data as T };
  } catch (err: any) {
    return { success: false, error: err?.message || "Network error" };
  }
}

/** Multipart upload used for the CV, profile photo and portfolio images. */
export async function kaziUpload<T>(
  path: string,
  file: File,
  field = "file"
): Promise<KaziApiResult<T>> {
  try {
    const form = new FormData();
    form.append(field, file);

    const res = await fetch(`${API_BASE}${path}`, {
      method: "POST",
      headers: await authHeaders(),
      body: form,
    });

    let json: any = null;
    try {
      json = await res.json();
    } catch {
      json = null;
    }

    if (!json || json.success !== true) {
      return {
        success: false,
        error: json?.error || `Upload failed (HTTP ${res.status})`,
      };
    }
    return { success: true, data: json.data as T };
  } catch (err: any) {
    return { success: false, error: err?.message || "Upload failed" };
  }
}

export interface UploadedFile {
  url: string;
  path: string;
  bucket: string;
  size: number;
  mimetype: string;
}

// ─── Profile ──────────────────────────────────────────────────────────────────

export const fetchMyProfile = () =>
  kaziApi<KaziProfileBundle & { completeness: number }>("/kazi/profile/me");

export const updateMyProfile = (patch: KaziProfileBasic) =>
  kaziApi<{ profile: KaziProfile; completeness: number }>("/kazi/profile/me", {
    method: "PUT",
    body: patch,
  });

export const fetchPublicProfile = (userId: string) =>
  kaziApi<KaziProfileBundle>(`/kazi/profile/${userId}`);

export const uploadCv = (file: File) => kaziUpload<UploadedFile>("/kazi/upload-cv", file);
export const uploadPhoto = (file: File) => kaziUpload<UploadedFile>("/kazi/upload-photo", file);
export const uploadPortfolioImage = (file: File) =>
  kaziUpload<UploadedFile>("/kazi/upload-portfolio", file, "image");

// ─── Skills ───────────────────────────────────────────────────────────────────

export const addSkill = (body: {
  skill_name: string;
  proficiency?: string | null;
  years_experience?: number | null;
}) => kaziApi<{ skill: KaziSkill; completeness: number }>("/kazi/skills", { method: "POST", body });

export const removeSkill = (id: string) =>
  kaziApi<{ id: string; completeness: number }>(`/kazi/skills/${id}`, { method: "DELETE" });

// ─── Experience ───────────────────────────────────────────────────────────────

export const addExperience = (body: {
  job_title: string;
  company?: string | null;
  location?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  is_current?: boolean;
  description?: string | null;
}) => kaziApi<{ experience: KaziExperience; completeness: number }>("/kazi/experience", {
  method: "POST",
  body,
});

export const removeExperience = (id: string) =>
  kaziApi<{ id: string; completeness: number }>(`/kazi/experience/${id}`, { method: "DELETE" });

// ─── Education ────────────────────────────────────────────────────────────────

export const addEducation = (body: {
  institution: string;
  qualification?: string | null;
  field_of_study?: string | null;
  start_year?: number | null;
  end_year?: number | null;
}) => kaziApi<{ education: KaziEducation; completeness: number }>("/kazi/education", {
  method: "POST",
  body,
});

export const removeEducation = (id: string) =>
  kaziApi<{ id: string; completeness: number }>(`/kazi/education/${id}`, { method: "DELETE" });

// ─── Portfolio ────────────────────────────────────────────────────────────────

export const addPortfolioItem = (body: {
  image_url: string;
  title?: string | null;
  description?: string | null;
}) => kaziApi<{ portfolio: KaziPortfolioItem; completeness: number }>("/kazi/portfolio", {
  method: "POST",
  body,
});

export const removePortfolioItem = (id: string) =>
  kaziApi<{ id: string; completeness: number }>(`/kazi/portfolio/${id}`, { method: "DELETE" });

// ─── Reviews ──────────────────────────────────────────────────────────────────

export const addReview = (body: {
  reviewee_id: string;
  job_id?: string | null;
  rating: number;
  comment?: string | null;
}) => kaziApi<{ review: KaziReview }>("/kazi/review", { method: "POST", body });

export const fetchReviews = (userId: string) =>
  kaziApi<{ reviews: KaziReview[]; rating: number | null; reviewCount: number }>(
    `/kazi/reviews/${userId}`
  );

export type { KaziProfileRating };