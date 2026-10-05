export type KaziProfileType = "worker" | "service_provider" | "business";

export type KaziProficiency = "beginner" | "intermediate" | "advanced" | "expert";

export interface KaziProfile {
  id: string;
  user_id: string;
  full_name: string | null;
  headline: string | null;
  bio: string | null;
  photo_url: string | null;
  cv_url: string | null;
  category: string | null;
  location: string | null;
  availability: string | null;
  profile_type: KaziProfileType;
  service_name: string | null;
  service_description: string | null;
  hourly_rate: number | null;
  daily_rate: number | null;
  monthly_rate: number | null;
  is_verified: boolean;
  completeness: number;
  created_at: string;
  updated_at: string;
}

export interface KaziSkill {
  id: string;
  user_id: string;
  skill_name: string;
  proficiency: KaziProficiency | null;
  years_experience: number | null;
  created_at: string;
}

export interface KaziExperience {
  id: string;
  user_id: string;
  job_title: string;
  company: string | null;
  location: string | null;
  start_date: string | null;
  end_date: string | null;
  is_current: boolean;
  description: string | null;
  created_at: string;
}

export interface KaziEducation {
  id: string;
  user_id: string;
  institution: string;
  qualification: string | null;
  field_of_study: string | null;
  start_year: number | null;
  end_year: number | null;
  created_at: string;
}

export interface KaziPortfolioItem {
  id: string;
  user_id: string;
  image_url: string | null;
  title: string | null;
  description: string | null;
  created_at: string;
}

export interface KaziReview {
  id: string;
  reviewer_id: string;
  reviewee_id: string;
  job_id: string | null;
  rating: number;
  comment: string | null;
  created_at: string;
  jobs?: { title: string } | null;
}

export interface KaziProfileRating {
  rating: number | null;
  reviewCount: number;
}

export interface KaziProfileBundle {
  profile: KaziProfile;
  rating: KaziProfileRating;
  skills: KaziSkill[];
  experience: KaziExperience[];
  education: KaziEducation[];
  portfolio: KaziPortfolioItem[];
}

export interface KaziProfileBasic {
  full_name?: string | null;
  headline?: string | null;
  bio?: string | null;
  photo_url?: string | null;
  cv_url?: string | null;
  category?: string | null;
  location?: string | null;
  availability?: string | null;
  profile_type?: KaziProfileType;
  service_name?: string | null;
  service_description?: string | null;
  hourly_rate?: number | null;
  daily_rate?: number | null;
  monthly_rate?: number | null;
}

export const KAZI_PROFILE_TYPES: { value: KaziProfileType; label: string; hint: string }[] = [
  { value: "worker", label: "Worker", hint: "I am available for work" },
  { value: "service_provider", label: "Service Provider", hint: "I offer a service" },
  { value: "business", label: "Business", hint: "I run a registered business" },
];

export const KAZI_PROFICIENCIES: { value: KaziProficiency; label: string }[] = [
  { value: "beginner", label: "Beginner" },
  { value: "intermediate", label: "Intermediate" },
  { value: "advanced", label: "Advanced" },
  { value: "expert", label: "Expert" },
];

export const KAZI_AVAILABILITY = [
  "Available",
  "Busy",
  "Unavailable",
] as const;

export type KaziAvailability = (typeof KAZI_AVAILABILITY)[number];

/** Older rows may hold the longer free-text values; normalise for the badge. */
export function availabilityTone(value?: string | null): {
  label: string;
  tone: "success" | "warning" | "neutral";
} {
  const raw = (value || "").trim();
  const v = raw.toLowerCase();
  if (!v) return { label: "Not set", tone: "neutral" };
  if (v.includes("unavailable") || v.includes("not available")) {
    return { label: "Unavailable", tone: "neutral" };
  }
  if (v.includes("busy")) return { label: "Busy", tone: "warning" };
  if (v.includes("available")) return { label: "Available", tone: "success" };
  return { label: raw, tone: "neutral" };
}

export type KaziSearchResult = {
  userId: string;
  name: string;
  headline: string | null;
  category: string | null;
  location: string | null;
  photoUrl: string | null;
  profileType: KaziProfileType;
  serviceName: string | null;
  availability: string | null;
  ratingAverage: number | null;
  ratingCount: number;
  jobsCompleted: number;
  verified: boolean;
  matchedBySkill: boolean;
};

export const KAZI_CATEGORIES = [
  "House Help",
  "Cleaner",
  "Tutor",
  "Gardener",
  "Driver",
  "Plumber",
  "Electrician",
  "Security Guard",
  "Event Worker",
  "Cook",
  "Other",
];

export const KAZI_MAX_UPLOAD_BYTES = 5 * 1024 * 1024;

export const KAZI_CV_ACCEPT =
  ".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export const KAZI_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

export const profileTypeLabel = (type?: KaziProfileType | null) =>
  KAZI_PROFILE_TYPES.find((t) => t.value === type)?.label ?? "Worker";

/** True when the profile carries no user-authored content yet. */
export function isProfileEmpty(bundle: KaziProfileBundle | null): boolean {
  if (!bundle) return true;
  const p = bundle.profile;
  const filled = [
    p.headline,
    p.bio,
    p.photo_url,
    p.cv_url,
    p.category,
    p.location,
    p.service_name,
    p.service_description,
  ].some((v) => Boolean(v && String(v).trim()));
  return (
    !filled &&
    bundle.skills.length === 0 &&
    bundle.experience.length === 0 &&
    bundle.education.length === 0 &&
    bundle.portfolio.length === 0
  );
}

export function formatKaziDate(value?: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return value;
  return d.toLocaleDateString("en-KE", { month: "short", year: "numeric" });
}

export function formatKaziDateRange(start?: string | null, end?: string | null, isCurrent?: boolean): string {
  const from = formatKaziDate(start);
  const to = isCurrent ? "Present" : formatKaziDate(end);
  if (from && to) return `${from} – ${to}`;
  if (from) return from;
  if (to) return to;
  return "";
}