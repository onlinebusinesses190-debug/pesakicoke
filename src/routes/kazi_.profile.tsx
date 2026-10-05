import { createFileRoute, Link, rootRouteId, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  CheckCircle2,
  FileText,
  GraduationCap,
  Images,
  Loader2,
  LogIn,
  Plus,
  Trash2,
  Upload,
  User as UserIcon,
  UserPlus,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Badge, Card, Progress, SectionTitle } from "@/components/ui-bits";
import { useRequireAuth } from "@/hooks/useRequireAuth";
import {
  addEducation,
  addExperience,
  addPortfolioItem,
  addSkill,
  fetchMyProfile,
  removeEducation,
  removeExperience,
  removePortfolioItem,
  removeSkill,
  updateMyProfile,
  uploadCv,
  uploadPhoto,
  uploadPortfolioImage,
  type UploadedFile,
} from "@/components/kazi/api";
import {
  KAZI_AVAILABILITY,
  KAZI_CATEGORIES,
  KAZI_CV_ACCEPT,
  KAZI_IMAGE_ACCEPT,
  KAZI_MAX_UPLOAD_BYTES,
  KAZI_PROFICIENCIES,
  KAZI_PROFILE_TYPES,
  type KaziEducation,
  type KaziExperience,
  type KaziPortfolioItem,
  type KaziProfile,
  type KaziProfileBasic,
  type KaziSkill,
} from "@/components/kazi/types";
import { Avatar } from "@/components/kazi/ProfileView";

export const Route = createFileRoute("/kazi_/profile")({
  // The file is named kazi_.profile.tsx on purpose. A plain kazi.profile.tsx
  // nests under the /kazi page, which renders no <Outlet />, so this editor
  // would never mount and "Get Started" would look like a dead button. The
  // trailing underscore escapes that nesting; the URL is still /kazi/profile.
  getParentRoute: () => rootRouteId,
  head: () => ({
    meta: [
      { title: "Edit Profile — KAZI Link — PESAKI" },
      {
        name: "description",
        content: "Create and edit your public KAZI Link profile — skills, experience, education and portfolio.",
      },
    ],
  }),
  component: KaziProfileEditor,
});

const inputCls =
  "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm text-foreground outline-none focus:ring-2 focus:ring-ring";
const labelCls = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className={labelCls}>{children}</label>;
}

function Checkbox({ checked, onChange, label }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-2 text-xs font-medium text-foreground"
    >
      <span
        className={`grid h-4 w-4 place-items-center rounded border ${
          checked ? "border-primary bg-primary text-primary-foreground" : "border-border bg-background"
        }`}
      >
        {checked && <Check className="h-3 w-3" />}
      </span>
      {label}
    </button>
  );
}

/** Reusable drag & drop / click-to-browse uploader. */
function FileDrop({
  label,
  accept,
  busy,
  onPick,
  hint,
}: {
  label: string;
  accept: string;
  busy: boolean;
  onPick: (file: File) => void;
  hint?: string;
}) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);

  const validateAndPick = (file?: File | null) => {
    if (!file) return;
    if (file.size > KAZI_MAX_UPLOAD_BYTES) {
      toast.error("File must be 5 MB or smaller");
      return;
    }
    onPick(file);
  };

  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <button
        type="button"
        disabled={busy}
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          validateAndPick(e.dataTransfer.files?.[0]);
        }}
        className={`mt-1 flex w-full items-center justify-center gap-2 rounded-xl border border-dashed px-4 py-6 text-xs font-semibold transition-colors ${
          dragging ? "border-primary bg-primary/5 text-primary" : "border-border bg-card text-muted-foreground"
        } ${busy ? "opacity-60" : ""}`}
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
        {busy ? "Uploading…" : "Drag & drop or click to upload"}
      </button>
      {hint && <p className="mt-1 text-[10px] text-muted-foreground">{hint}</p>}
      <input
        ref={inputRef}
        type="file"
        accept={accept}
        className="hidden"
        onChange={(e) => {
          validateAndPick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}

function ListCard({ title, subtitle, onRemove }: { title: string; subtitle?: string; onRemove: () => void }) {
  return (
    <Card className="!p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-foreground">{title}</p>
          {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
        </div>
        <button
          type="button"
          onClick={onRemove}
          aria-label={`Remove ${title}`}
          className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </Card>
  );
}

/**
 * Collapsed add-forms. Each of skills / experience / education / portfolio is a
 * long form; showing all four expanded at once pushes the saved list far down
 * the page, so only the one being edited is open.
 */
function CollapsibleAdd({
  label,
  open,
  onToggle,
  children,
}: {
  label: string;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-3">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className={`inline-flex w-full items-center gap-1.5 rounded-xl border px-4 py-2.5 text-xs font-semibold transition-colors ${
          open ? "border-primary bg-primary/5 text-primary" : "border-border bg-background text-foreground"
        }`}
      >
        <Plus className={`h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-45" : ""}`} />
        {open ? `Close ${label.toLowerCase()} form` : label}
        <ChevronDown className={`ml-auto h-3.5 w-3.5 shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open && <div className="space-y-3">{children}</div>}
    </div>
  );
}

/** Shown instead of the editor when there is no session, with a real CTA. */
function GetStartedGate() {
  return (
    <AppShell>
      <PageHeader
        title="Edit Profile"
        subtitle="Your public KAZI Link profile"
        right={
          <button
            onClick={() => window.history.back()}
            aria-label="Go back"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        }
      />
      <div className="flex flex-col items-center px-6 py-16 text-center">
        <div className="grid h-14 w-14 place-items-center rounded-full bg-primary/10 text-primary">
          <UserIcon className="h-6 w-6" />
        </div>
        <h2 className="mt-4 text-lg font-bold text-foreground">Create your KAZI Link profile</h2>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">
          Sign up or log in to add your skills, experience and CV, then get found by employers
          searching KAZI.
        </p>
        <div className="mt-5 flex w-full max-w-xs flex-col gap-2.5">
          <Link
            to="/auth?mode=signup&redirect=/kazi/profile"
            className="flex h-11 items-center justify-center gap-2 rounded-full bg-primary text-sm font-bold text-primary-foreground"
          >
            <UserPlus className="h-4 w-4" /> Get Started
          </Link>
          <Link
            to="/auth?mode=signin&redirect=/kazi/profile"
            className="flex h-11 items-center justify-center gap-2 rounded-full border border-border text-sm font-semibold text-foreground"
          >
            <LogIn className="h-4 w-4" /> Log in
          </Link>
        </div>
      </div>
    </AppShell>
  );
}

export function KaziProfileEditor() {
  const navigate = useNavigate();
  const { requireAuth, user, ready } = useRequireAuth();

  const [profile, setProfile] = useState<KaziProfile | null>(null);
  const [skills, setSkills] = useState<KaziSkill[]>([]);
  const [experience, setExperience] = useState<KaziExperience[]>([]);
  const [education, setEducation] = useState<KaziEducation[]>([]);
  const [portfolio, setPortfolio] = useState<KaziPortfolioItem[]>([]);

  const [form, setForm] = useState<KaziProfileBasic>({
    profile_type: "worker",
    full_name: "",
    headline: "",
    bio: "",
    photo_url: "",
    cv_url: "",
    category: "",
    location: "",
    availability: "",
    service_name: "",
    service_description: "",
    hourly_rate: null,
    daily_rate: null,
    monthly_rate: null,
  });

  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState<"cv" | "photo" | null>(null);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const hasFetched = useRef(false);
  const saveTimer = useRef<NodeJS.Timeout | null>(null);

  // ── Which add-form is open (only ever one) ────────────────────────────────
  const [openAdd, setOpenAdd] = useState<"skill" | "exp" | "edu" | "portfolio" | null>(null);
  const toggleAdd = (key: "skill" | "exp" | "edu" | "portfolio") =>
    setOpenAdd((cur) => (cur === key ? null : key));

  // ── Skills draft ───────────────────────────────────────────────────────────
  const [skillName, setSkillName] = useState("");
  const [skillProficiency, setSkillProficiency] = useState<string>("");
  const [skillYears, setSkillYears] = useState("");

  // ── Experience draft ───────────────────────────────────────────────────────
  const [expTitle, setExpTitle] = useState("");
  const [expCompany, setExpCompany] = useState("");
  const [expLocation, setExpLocation] = useState("");
  const [expStart, setExpStart] = useState("");
  const [expEnd, setExpEnd] = useState("");
  const [expCurrent, setExpCurrent] = useState(false);
  const [expDescription, setExpDescription] = useState("");

  // ── Education draft ────────────────────────────────────────────────────────
  const [eduInstitution, setEduInstitution] = useState("");
  const [eduQualification, setEduQualification] = useState("");
  const [eduField, setEduField] = useState("");
  const [eduStart, setEduStart] = useState("");
  const [eduEnd, setEduEnd] = useState("");

  // ── Portfolio draft ────────────────────────────────────────────────────────
  const [portfolioTitle, setPortfolioTitle] = useState("");
  const [portfolioDescription, setPortfolioDescription] = useState("");
  const [pendingPortfolioUrl, setPendingPortfolioUrl] = useState<string | null>(null);

  // ── Refs ───────────────────────────────────────────────────────────────────
  const photoInputRef = useRef<HTMLInputElement>(null);

  // ── Live completeness (local, instant) ─────────────────────────────────────
  const completeness = useMemo(() => {
    let score = 0;
    if (form.headline?.trim()) score += 10;
    if (form.bio?.trim()) score += 10;
    if (form.photo_url?.trim()) score += 10;
    if (form.cv_url?.trim()) score += 10;
    if (form.category?.trim()) score += 10;
    if (form.location?.trim()) score += 10;
    score += Math.min(15, skills.length * 5);
    if (experience.length > 0) score += 10;
    if (education.length > 0) score += 10;
    score += Math.min(15, portfolio.length * 5);
    return Math.min(100, score);
  }, [form, skills, experience, education, portfolio]);

  // ── Auto-save helpers ──────────────────────────────────────────────────────
  const triggerAutoSave = useCallback((updates: Partial<KaziProfileBasic>) => {
    if (saveTimer.current) clearTimeout(saveTimer.current);
    setSaveStatus("saving");
    saveTimer.current = setTimeout(async () => {
      if (!user) return;
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (!token) return;

      const payload = { ...form, ...updates };
      try {
        const res = await fetch(`${API_BASE}/kazi/profile/me`, {
          method: "PUT",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
          body: JSON.stringify({
            ...payload,
            full_name: payload.full_name?.trim() || null,
            headline: payload.headline?.trim() || null,
            bio: payload.bio?.trim() || null,
            location: payload.location?.trim() || null,
            category: payload.category || null,
            availability: payload.availability || null,
            service_name: (payload.profile_type === "service_provider" || payload.profile_type === "business")
              ? payload.service_name?.trim() || null
              : null,
            service_description: (payload.profile_type === "service_provider" || payload.profile_type === "business")
              ? payload.service_description?.trim() || null
              : null,
            hourly_rate: payload.hourly_rate ?? null,
            daily_rate: payload.daily_rate ?? null,
            monthly_rate: payload.monthly_rate ?? null,
          }),
        });
        const json = await res.json();
        if (json.success) {
          setSaveStatus("saved");
          setTimeout(() => setSaveStatus("idle"), 2000);
          if (json.data?.profile) setProfile(json.data.profile);
        } else {
          setSaveStatus("failed");
          // retry on next change
        }
      } catch {
        setSaveStatus("failed");
      }
    }, 800);
  }, [form, user]);

  // Wrapper that updates local state AND triggers auto-save
  const setAndSave = <K extends keyof KaziProfileBasic>(key: K, value: KaziProfileBasic[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    triggerAutoSave({ [key]: value });
  };

  const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

  useEffect(() => {
    if (!ready) return;
    if (!user) {
      setLoading(false);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;

    fetchMyProfile().then((res) => {
      if (!res.success || !res.data) {
        toast.error(res.error || "Could not load your profile");
        setLoading(false);
        return;
      }
      const p = res.data.profile;
      setProfile(p);
      setSkills(res.data.skills);
      setExperience(res.data.experience);
      setEducation(res.data.education);
      setPortfolio(res.data.portfolio);
      setForm({
        profile_type: p.profile_type ?? "worker",
        full_name: p.full_name ?? "",
        headline: p.headline ?? "",
        bio: p.bio ?? "",
        photo_url: p.photo_url ?? "",
        cv_url: p.cv_url ?? "",
        category: p.category ?? "",
        location: p.location ?? "",
        availability: p.availability ?? "",
        service_name: p.service_name ?? "",
        service_description: p.service_description ?? "",
        hourly_rate: p.hourly_rate,
        daily_rate: p.daily_rate,
        monthly_rate: p.monthly_rate,
      });
      setLoading(false);
    });
  }, [ready, user]);

  // Keep set for internal draft fields that shouldn't auto-save
  const setDraft = <K extends keyof KaziProfileBasic>(key: K, value: KaziProfileBasic[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isService = form.profile_type === "service_provider" || form.profile_type === "business";

  // ── Uploads ────────────────────────────────────────────────────────────────
  const handleCvUpload = async (file: File) => {
    if (!requireAuth()) return;
    setUploading("cv");
    const res = await uploadCv(file);
    setUploading(null);
    if (!res.success || !res.data) {
      toast.error(res.error || "Could not upload the CV");
      return;
    }
    const url = (res.data as UploadedFile).url;
    setAndSave("cv_url", url);
    toast.success("CV uploaded");
  };

  const handleCvRemove = async () => {
    if (!requireAuth()) return;
    setBusyRow("cv-remove");
    const res = await updateMyProfile({ cv_url: null });
    setBusyRow(null);
    if (!res.success) {
      toast.error(res.error || "Could not remove the CV");
      return;
    }
    setAndSave("cv_url", "");
    if (res.data?.profile) setProfile(res.data.profile);
    toast.success("CV removed");
  };

  const handlePhotoUpload = async (file: File) => {
    if (!requireAuth()) return;
    setUploading("photo");
    const res = await uploadPhoto(file);
    setUploading(null);
    if (!res.success || !res.data) {
      toast.error(res.error || "Could not upload the photo");
      return;
    }
    const url = (res.data as UploadedFile).url;
    setAndSave("photo_url", url);
    toast.success("Photo updated");
  };

  const handlePortfolioUpload = async (file: File) => {
    if (!requireAuth()) return;
    setUploadingPortfolio(true);
    const res = await uploadPortfolioImage(file);
    setUploadingPortfolio(false);
    if (!res.success || !res.data) {
      toast.error(res.error || "Could not upload the image");
      return;
    }
    setPendingPortfolioUrl((res.data as UploadedFile).url);
    toast.success("Image uploaded — add a title to save it");
  };

  // ── Sub-resource mutations ─────────────────────────────────────────────────
  const mutate = useCallback(async (fn: () => Promise<{ success: boolean; error?: string; data?: any }>, okMsg: string) => {
    const res = await fn();
    if (!res.success) {
      toast.error(res.error || "Something went wrong");
      return false;
    }
    if (typeof res.data?.completeness === "number") {
      // completeness is now computed locally, but we still update profile if returned
    }
    toast.success(okMsg);
    return true;
  }, []);

  const reloadCollections = useCallback(async () => {
    const res = await fetchMyProfile();
    if (res.success && res.data) {
      setSkills(res.data.skills);
      setExperience(res.data.experience);
      setEducation(res.data.education);
      setPortfolio(res.data.portfolio);
      if (res.data.profile) setProfile(res.data.profile);
    }
  }, []);

  const handleAddSkill = async () => {
    if (!requireAuth()) return;
    if (!skillName.trim()) {
      toast.error("Enter a skill name");
      return;
    }
    setBusyRow("skill");
    const ok = await mutate(
      () =>
        addSkill({
          skill_name: skillName.trim(),
          proficiency: skillProficiency || null,
          years_experience: skillYears ? Number(skillYears) : null,
        }),
      "Skill added"
    );
    setBusyRow(null);
    if (ok) {
      setSkillName("");
      setSkillProficiency("");
      setSkillYears("");
      setOpenAdd(null);
      reloadCollections();
    }
  };

  const handleRemoveSkill = async (id: string) => {
    setBusyRow(id);
    await mutate(() => removeSkill(id), "Skill removed");
    setBusyRow(null);
    reloadCollections();
  };

  const handleAddExperience = async () => {
    if (!requireAuth()) return;
    if (!expTitle.trim()) {
      toast.error("Enter a job title");
      return;
    }
    setBusyRow("exp");
    const ok = await mutate(
      () =>
        addExperience({
          job_title: expTitle.trim(),
          company: expCompany.trim() || null,
          location: expLocation.trim() || null,
          start_date: expStart || null,
          end_date: expCurrent ? null : expEnd || null,
          is_current: expCurrent,
          description: expDescription.trim() || null,
        }),
      "Experience added"
    );
    setBusyRow(null);
    if (ok) {
      setExpTitle("");
      setExpCompany("");
      setExpLocation("");
      setExpStart("");
      setExpEnd("");
      setExpCurrent(false);
      setExpDescription("");
      setOpenAdd(null);
      reloadCollections();
    }
  };

  const handleRemoveExperience = async (id: string) => {
    setBusyRow(id);
    await mutate(() => removeExperience(id), "Experience removed");
    setBusyRow(null);
    reloadCollections();
  };

  const handleAddEducation = async () => {
    if (!requireAuth()) return;
    if (!eduInstitution.trim()) {
      toast.error("Enter an institution");
      return;
    }
    setBusyRow("edu");
    const ok = await mutate(
      () =>
        addEducation({
          institution: eduInstitution.trim(),
          qualification: eduQualification.trim() || null,
          field_of_study: eduField.trim() || null,
          start_year: eduStart ? Number(eduStart) : null,
          end_year: eduEnd ? Number(eduEnd) : null,
        }),
      "Education added"
    );
    setBusyRow(null);
    if (ok) {
      setEduInstitution("");
      setEduQualification("");
      setEduField("");
      setEduStart("");
      setEduEnd("");
      setOpenAdd(null);
      reloadCollections();
    }
  };

  const handleRemoveEducation = async (id: string) => {
    setBusyRow(id);
    await mutate(() => removeEducation(id), "Education removed");
    setBusyRow(null);
    reloadCollections();
  };

  const handleAddPortfolio = async () => {
    if (!requireAuth()) return;
    if (!pendingPortfolioUrl) {
      toast.error("Upload an image first");
      return;
    }
    setBusyRow("portfolio");
    const ok = await mutate(
      () =>
        addPortfolioItem({
          image_url: pendingPortfolioUrl,
          title: portfolioTitle.trim() || null,
          description: portfolioDescription.trim() || null,
        }),
      "Portfolio item added"
    );
    setBusyRow(null);
    if (ok) {
      setPendingPortfolioUrl(null);
      setPortfolioTitle("");
      setPortfolioDescription("");
      setOpenAdd(null);
      reloadCollections();
    }
  };

  const handleRemovePortfolio = async (id: string) => {
    setBusyRow(id);
    await mutate(() => removePortfolioItem(id), "Portfolio item removed");
    setBusyRow(null);
    reloadCollections();
  };

  if (ready && !user) {
    return <GetStartedGate />;
  }

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Edit Profile" subtitle="Your public KAZI Link profile" />
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading…
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <PageHeader
        title="Edit Profile"
        subtitle="Your public KAZI Link profile"
        right={
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1.5">
              {saveStatus === "saving" && (
                <>
                  <Loader2 className="h-4 w-4 animate-spin text-primary" />
                  <span className="text-xs text-primary">Saving…</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                  <span className="text-xs text-emerald-600">Saved</span>
                </>
              )}
              {saveStatus === "failed" && (
                <>
                  <X className="h-4 w-4 text-destructive" />
                  <span className="text-xs text-destructive">Save failed</span>
                </>
              )}
            </div>
            <button
              onClick={() => navigate({ to: "/kazi" })}
              aria-label="Back to KAZI Link"
              className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
          </div>
        }
      />

      <div className="space-y-4 px-5 pt-4">
        {/* ── Strength ─────────────────────────────────────────────────── */}
        <Card className="!p-3.5">
          <div className="mb-2 flex items-center justify-between">
            <span className={labelCls}>Profile strength</span>
            <span className="text-xs font-bold text-primary">{completeness}%</span>
          </div>
          <Progress value={completeness} />
        </Card>

        {/* ── 1. Basic info ────────────────────────────────────────────── */}
        <section>
          <SectionTitle
            title="Basic info"
            action={<span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary"><UserIcon className="h-3.5 w-3.5" /></span>}
          />
          <Card className="space-y-3">
            <div className="flex items-center gap-3">
              <div className="relative">
                <div className="w-24 h-24 rounded-full overflow-hidden bg-primary/10 flex items-center justify-center text-primary text-3xl font-bold">
                  {form.photo_url ? (
                    <img src={form.photo_url} alt="Profile" className="w-full h-full object-cover" />
                  ) : (
                    <span>{(form.full_name || profile?.full_name || "U").trim().charAt(0).toUpperCase()}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={() => photoInputRef.current?.click()}
                  disabled={uploading === "photo"}
                  className="absolute bottom-0 right-0 h-8 w-8 rounded-full bg-emerald-600 text-white flex items-center justify-center border-2 border-white shadow-md disabled:opacity-50"
                  aria-label="Change profile photo"
                >
                  {uploading === "photo" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
                </button>
                <input
                  ref={photoInputRef}
                  type="file"
                  accept={KAZI_IMAGE_ACCEPT}
                  className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) {
                      if (file.size > KAZI_MAX_UPLOAD_BYTES) {
                        toast.error("File must be 5 MB or smaller");
                        return;
                      }
                      handlePhotoUpload(file);
                    }
                    e.target.value = "";
                  }}
                />
              </div>
              <p className="text-xs text-muted-foreground">Tap + to add or change your photo</p>
            </div>

            <div>
              <FieldLabel>Full name</FieldLabel>
              <input
                value={form.full_name || ""}
                onChange={(e) => setAndSave("full_name", e.target.value)}
                placeholder="e.g. Amina Wanjiru"
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Headline</FieldLabel>
              <input
                value={form.headline || ""}
                onChange={(e) => setAndSave("headline", e.target.value)}
                placeholder="e.g. Experienced house help and nanny"
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Bio</FieldLabel>
              <textarea
                value={form.bio || ""}
                onChange={(e) => setAndSave("bio", e.target.value)}
                rows={4}
                placeholder="Tell employers about yourself, your strengths and what you are looking for."
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Category</FieldLabel>
              <select
                value={form.category || ""}
                onChange={(e) => setAndSave("category", e.target.value)}
                className={inputCls}
              >
                <option value="">Select a category</option>
                {KAZI_CATEGORIES.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <FieldLabel>Location</FieldLabel>
              <input
                value={form.location || ""}
                onChange={(e) => setAndSave("location", e.target.value)}
                placeholder="e.g. Westlands, Nairobi"
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Availability</FieldLabel>
              <div className="mt-1 grid grid-cols-3 gap-2">
                {KAZI_AVAILABILITY.map((a) => {
                  const active = form.availability === a;
                  return (
                    <button
                      key={a}
                      type="button"
                      onClick={() => setAndSave("availability", active ? "" : a)}
                      className={`flex items-center justify-center gap-1.5 rounded-xl border px-2 py-2.5 text-xs font-semibold transition-colors ${
                        active
                          ? "border-primary bg-primary text-primary-foreground"
                          : "border-border bg-background text-foreground"
                      }`}
                    >
                      <span
                        className={`grid h-3.5 w-3.5 shrink-0 place-items-center rounded-full border ${
                          active ? "border-primary-foreground" : "border-border"
                        }`}
                      >
                        {active && <Check className="h-2.5 w-2.5 text-primary-foreground" />}
                      </span>
                      <span className="truncate">{a}</span>
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                Tap your current status. Tap again to clear it.
              </p>
            </div>
          </Card>
        </section>

        {/* ── 2. Profile type ──────────────────────────────────────────── */}
        <section>
          <SectionTitle title="Profile type" />
          <Card className="space-y-2.5">
            {KAZI_PROFILE_TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setAndSave("profile_type", t.value)}
                className={`flex w-full items-start gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors ${
                  form.profile_type === t.value
                    ? "border-primary bg-primary/5"
                    : "border-border bg-background"
                }`}
              >
                <span
                  className={`mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded-full border ${
                    form.profile_type === t.value ? "border-primary bg-primary" : "border-border"
                  }`}
                >
                  {form.profile_type === t.value && <Check className="h-3 w-3 text-primary-foreground" />}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold text-foreground">{t.label}</span>
                  <span className="block text-[11px] text-muted-foreground">{t.hint}</span>
                </span>
              </button>
            ))}

            {isService && (
              <div className="space-y-3 border-t border-border pt-3">
                <div>
                  <FieldLabel>Service / business name</FieldLabel>
                  <input
                    value={form.service_name || ""}
                    onChange={(e) => setAndSave("service_name", e.target.value)}
                    placeholder="e.g. Amina Home Services"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>Service description</FieldLabel>
                  <textarea
                    value={form.service_description || ""}
                    onChange={(e) => setAndSave("service_description", e.target.value)}
                    rows={3}
                    placeholder="Describe the services you offer and who you serve."
                    className={inputCls}
                  />
                </div>
              </div>
            )}
          </Card>
        </section>

        {/* ── 3. Rates ─────────────────────────────────────────────────── */}
        <section>
          <SectionTitle title="Rates" />
          <Card className="grid grid-cols-3 gap-3">
            <div>
              <FieldLabel>Hourly</FieldLabel>
              <input
                type="number"
                min={0}
                value={form.hourly_rate ?? ""}
                onChange={(e) => setAndSave("hourly_rate", e.target.value ? Number(e.target.value) : null)}
                placeholder="KES"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Daily</FieldLabel>
              <input
                type="number"
                min={0}
                value={form.daily_rate ?? ""}
                onChange={(e) => setAndSave("daily_rate", e.target.value ? Number(e.target.value) : null)}
                placeholder="KES"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Monthly</FieldLabel>
              <input
                type="number"
                min={0}
                value={form.monthly_rate ?? ""}
                onChange={(e) => setAndSave("monthly_rate", e.target.value ? Number(e.target.value) : null)}
                placeholder="KES"
                className={inputCls}
              />
            </div>
          </Card>
        </section>

        {/* ── 4. CV ────────────────────────────────────────────────────── */}
        <section>
          <SectionTitle title="CV" />
          <Card className="space-y-3">
            {form.cv_url ? (
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <FileText className="h-5 w-5 shrink-0 text-primary" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">CV on file</p>
                      <a
                        href={form.cv_url}
                        target="_blank"
                        rel="noreferrer"
                        className="truncate text-xs text-primary underline"
                      >
                        View CV
                      </a>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={handleCvUpload}
                      disabled={uploading === "cv"}
                      className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background px-3 py-1.5 text-xs font-semibold text-foreground disabled:opacity-50"
                    >
                      {uploading === "cv" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      Replace
                    </button>
                    <button
                      type="button"
                      onClick={handleCvRemove}
                      disabled={busyRow === "cv-remove"}
                      aria-label="Remove CV"
                      className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-muted text-foreground disabled:opacity-50"
                    >
                      {busyRow === "cv-remove" ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Trash2 className="h-3.5 w-3.5" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <button
                type="button"
                onClick={handleCvUpload}
                disabled={uploading === "cv"}
                className="w-full flex items-center justify-center gap-2 rounded-xl border border-dashed border-border bg-card px-4 py-4 text-sm font-semibold text-muted-foreground hover:bg-muted disabled:opacity-50"
              >
                <FileText className="h-5 w-5" />
                <span>+ Upload CV</span>
              </button>
            )}
          </Card>
        </section>

        {/* ── 5. Skills ────────────────────────────────────────────────── */}
        <section>
          <SectionTitle title={`Skills (${skills.length})`} />
          <Card className="space-y-3">
            <CollapsibleAdd
              label="Add skill"
              open={openAdd === "skill"}
              onToggle={() => toggleAdd("skill")}
            >
            <div>
              <FieldLabel>Skill</FieldLabel>
              <input
                value={skillName}
                onChange={(e) => setSkillName(e.target.value)}
                placeholder="e.g. Cooking"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Proficiency</FieldLabel>
                <select
                  value={skillProficiency}
                  onChange={(e) => setSkillProficiency(e.target.value)}
                  className={inputCls}
                >
                  <option value="">Not set</option>
                  {KAZI_PROFICIENCIES.map((p) => (
                    <option key={p.value} value={p.value}>
                      {p.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <FieldLabel>Years</FieldLabel>
                <input
                  type="number"
                  min={0}
                  value={skillYears}
                  onChange={(e) => setSkillYears(e.target.value)}
                  placeholder="e.g. 3"
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddSkill}
              disabled={busyRow === "skill"}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {busyRow === "skill" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5" />}
              Add skill
            </button>
            </CollapsibleAdd>
            {skills.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                {skills.map((s) => (
                  <ListCard
                    key={s.id}
                    title={s.skill_name}
                    subtitle={[
                      s.proficiency,
                      s.years_experience !== null && s.years_experience !== undefined
                        ? `${Number(s.years_experience)} yrs`
                        : null,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                    onRemove={() => handleRemoveSkill(s.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* ── 6. Experience ────────────────────────────────────────────── */}
        <section>
          <SectionTitle title={`Experience (${experience.length})`} />
          <Card className="space-y-3">
            <CollapsibleAdd
              label="Add experience"
              open={openAdd === "exp"}
              onToggle={() => toggleAdd("exp")}
            >
            <div>
              <FieldLabel>Job title</FieldLabel>
              <input
                value={expTitle}
                onChange={(e) => setExpTitle(e.target.value)}
                placeholder="e.g. House Help"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Company</FieldLabel>
                <input
                  value={expCompany}
                  onChange={(e) => setExpCompany(e.target.value)}
                  placeholder="e.g. Karen Homes"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Location</FieldLabel>
                <input
                  value={expLocation}
                  onChange={(e) => setExpLocation(e.target.value)}
                  placeholder="e.g. Nairobi"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Start date</FieldLabel>
                <input
                  type="month"
                  value={expStart}
                  onChange={(e) => setExpStart(e.target.value)}
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>End date</FieldLabel>
                <input
                  type="month"
                  value={expEnd}
                  disabled={expCurrent}
                  onChange={(e) => setExpEnd(e.target.value)}
                  className={`${inputCls} ${expCurrent ? "opacity-50" : ""}`}
                />
              </div>
            </div>
            <Checkbox checked={expCurrent} onChange={setExpCurrent} label="I currently work here" />
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={expDescription}
                onChange={(e) => setExpDescription(e.target.value)}
                rows={3}
                placeholder="What did you do?"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={handleAddExperience}
              disabled={busyRow === "exp"}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {busyRow === "exp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Briefcase className="h-3.5 w-3.5" />}
              Add experience
            </button>
            </CollapsibleAdd>
            {experience.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                {experience.map((e) => (
                  <ListCard
                    key={e.id}
                    title={e.job_title}
                    subtitle={[e.company, e.location, e.is_current ? "Present" : e.end_date]
                      .filter(Boolean)
                      .join(" · ")}
                    onRemove={() => handleRemoveExperience(e.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* ── 7. Education ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle title={`Education (${education.length})`} />
          <Card className="space-y-3">
            <CollapsibleAdd
              label="Add education"
              open={openAdd === "edu"}
              onToggle={() => toggleAdd("edu")}
            >
            <div>
              <FieldLabel>Institution</FieldLabel>
              <input
                value={eduInstitution}
                onChange={(e) => setEduInstitution(e.target.value)}
                placeholder="e.g. Kenya Polytechnic"
                className={inputCls}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Qualification</FieldLabel>
                <input
                  value={eduQualification}
                  onChange={(e) => setEduQualification(e.target.value)}
                  placeholder="e.g. Certificate"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>Field of study</FieldLabel>
                <input
                  value={eduField}
                  onChange={(e) => setEduField(e.target.value)}
                  placeholder="e.g. Nursing"
                  className={inputCls}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Start year</FieldLabel>
                <input
                  type="number"
                  min={1900}
                  max={2200}
                  value={eduStart}
                  onChange={(e) => setEduStart(e.target.value)}
                  placeholder="e.g. 2018"
                  className={inputCls}
                />
              </div>
              <div>
                <FieldLabel>End year</FieldLabel>
                <input
                  type="number"
                  min={1900}
                  max={2200}
                  value={eduEnd}
                  onChange={(e) => setEduEnd(e.target.value)}
                  placeholder="e.g. 2021"
                  className={inputCls}
                />
              </div>
            </div>
            <button
              type="button"
              onClick={handleAddEducation}
              disabled={busyRow === "edu"}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {busyRow === "edu" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <GraduationCap className="h-3.5 w-3.5" />}
              Add education
            </button>
            </CollapsibleAdd>
            {education.length > 0 && (
              <div className="space-y-2 border-t border-border pt-3">
                {education.map((e) => (
                  <ListCard
                    key={e.id}
                    title={[e.qualification, e.field_of_study].filter(Boolean).join(" · ") || e.institution}
                    subtitle={[e.institution, e.start_year, e.end_year].filter(Boolean).join(" · ")}
                    onRemove={() => handleRemoveEducation(e.id)}
                  />
                ))}
              </div>
            )}
          </Card>
        </section>

        {/* ── 8. Portfolio ─────────────────────────────────────────────── */}
        <section>
          <SectionTitle title={`Portfolio (${portfolio.length})`} />
          <Card className="space-y-3">
            <CollapsibleAdd
              label="Add portfolio item"
              open={openAdd === "portfolio"}
              onToggle={() => toggleAdd("portfolio")}
            >
            <FileDrop
              label="Add an image"
              accept={KAZI_IMAGE_ACCEPT}
              busy={uploadingPortfolio}
              onPick={handlePortfolioUpload}
              hint="JPG, PNG, WEBP or GIF · max 5 MB"
            />
            {pendingPortfolioUrl && (
              <img
                src={pendingPortfolioUrl}
                alt="New portfolio item"
                className="h-28 w-full rounded-xl object-cover"
              />
            )}
            <div>
              <FieldLabel>Title</FieldLabel>
              <input
                value={portfolioTitle}
                onChange={(e) => setPortfolioTitle(e.target.value)}
                placeholder="e.g. Deep clean — 3-bed house"
                className={inputCls}
              />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <textarea
                value={portfolioDescription}
                onChange={(e) => setPortfolioDescription(e.target.value)}
                rows={2}
                placeholder="What was the job?"
                className={inputCls}
              />
            </div>
            <button
              type="button"
              onClick={handleAddPortfolio}
              disabled={busyRow === "portfolio"}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-2.5 text-xs font-semibold text-foreground disabled:opacity-60"
            >
              {busyRow === "portfolio" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Images className="h-3.5 w-3.5" />}
              Add to portfolio
            </button>
            </CollapsibleAdd>
            {portfolio.length > 0 && (
              <div className="grid grid-cols-2 gap-2 border-t border-border pt-3">
                {portfolio.map((item) => (
                  <div key={item.id} className="overflow-hidden rounded-xl border border-border">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.title || "Portfolio"} className="h-24 w-full object-cover" />
                    ) : null}
                    <div className="flex items-center justify-between gap-2 p-2">
                      <span className="truncate text-[11px] font-medium text-foreground">
                        {item.title || "Untitled"}
                      </span>
                      <button
                        type="button"
                        onClick={() => handleRemovePortfolio(item.id)}
                        aria-label={`Remove ${item.title || "portfolio item"}`}
                        className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-destructive/10 text-destructive"
                      >
                        <Trash2 className="h-3 w-3" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </Card>
        </section>

        <div className="h-24" />
      </div>
    </AppShell>
  );
}