import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  Check,
  ChevronDown,
  FileText,
  GraduationCap,
  Images,
  Loader2,
  LogIn,
  Plus,
  Save,
  Trash2,
  Upload,
  User as UserIcon,
  UserPlus,
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

export const Route = createFileRoute("/kazi/profile")({
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
  const [completeness, setCompleteness] = useState(0);

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
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState<"cv" | "photo" | null>(null);
  const [uploadingPortfolio, setUploadingPortfolio] = useState(false);
  const [busyRow, setBusyRow] = useState<string | null>(null);
  const hasFetched = useRef(false);

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

  useEffect(() => {
    if (!ready) return;
    // Signed out: show the Get Started gate instead of silently bouncing.
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
      setCompleteness(p.completeness ?? 0);
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

  const set = <K extends keyof KaziProfileBasic>(key: K, value: KaziProfileBasic[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const isService = form.profile_type === "service_provider" || form.profile_type === "business";

  // ── Save basic info ────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!requireAuth()) return;
    setSaving(true);
    const res = await updateMyProfile({
      ...form,
      full_name: form.full_name?.trim() || null,
      headline: form.headline?.trim() || null,
      bio: form.bio?.trim() || null,
      location: form.location?.trim() || null,
      category: form.category || null,
      availability: form.availability || null,
      service_name: isService ? form.service_name?.trim() || null : null,
      service_description: isService ? form.service_description?.trim() || null : null,
      hourly_rate: form.hourly_rate ?? null,
      daily_rate: form.daily_rate ?? null,
      monthly_rate: form.monthly_rate ?? null,
    });
    setSaving(false);

    if (!res.success) {
      toast.error(res.error || "Could not save your profile");
      return;
    }
    setProfile(res.data?.profile ?? null);
    if (typeof res.data?.completeness === "number") setCompleteness(res.data.completeness);
    toast.success("Profile saved");
  };

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
    set("cv_url", (res.data as UploadedFile).url);
    toast.success("CV uploaded");
  };

  // Detaching is a plain profile update, so no storage delete is attempted —
  // an orphaned object in the bucket is harmless and removal may fail on
  // objects this user no longer owns.
  const handleCvRemove = async () => {
    if (!requireAuth()) return;
    setBusyRow("cv-remove");
    const res = await updateMyProfile({ cv_url: null });
    setBusyRow(null);
    if (!res.success) {
      toast.error(res.error || "Could not remove the CV");
      return;
    }
    set("cv_url", "");
    setProfile(res.data?.profile ?? null);
    if (typeof res.data?.completeness === "number") setCompleteness(res.data.completeness);
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
    set("photo_url", (res.data as UploadedFile).url);
    toast.success("Photo uploaded");
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
    if (typeof res.data?.completeness === "number") setCompleteness(res.data.completeness);
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
      if (typeof res.data.profile.completeness === "number") setCompleteness(res.data.profile.completeness);
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
          <button
            onClick={() => navigate({ to: "/kazi" })}
            aria-label="Back to KAZI Link"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
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
              <Avatar url={form.photo_url || profile?.photo_url} name={form.full_name || profile?.full_name} size={56} />
              <div className="flex-1">
                <FileDrop
                  label="Profile photo"
                  accept={KAZI_IMAGE_ACCEPT}
                  busy={uploading === "photo"}
                  onPick={handlePhotoUpload}
                  hint="JPG, PNG, WEBP or GIF · max 5 MB"
                />
              </div>
            </div>

            <div>
              <FieldLabel>Full name</FieldLabel>
              <input
                value={form.full_name || ""}
                onChange={(e) => set("full_name", e.target.value)}
                placeholder="e.g. Amina Wanjiru"
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Headline</FieldLabel>
              <input
                value={form.headline || ""}
                onChange={(e) => set("headline", e.target.value)}
                placeholder="e.g. Experienced house help and nanny"
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Bio</FieldLabel>
              <textarea
                value={form.bio || ""}
                onChange={(e) => set("bio", e.target.value)}
                rows={4}
                placeholder="Tell employers about yourself, your strengths and what you are looking for."
                className={inputCls}
              />
            </div>

            <div>
              <FieldLabel>Category</FieldLabel>
              <select
                value={form.category || ""}
                onChange={(e) => set("category", e.target.value)}
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
                onChange={(e) => set("location", e.target.value)}
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
                      onClick={() => set("availability", active ? "" : a)}
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
                onClick={() => set("profile_type", t.value)}
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
                    onChange={(e) => set("service_name", e.target.value)}
                    placeholder="e.g. Amina Home Services"
                    className={inputCls}
                  />
                </div>
                <div>
                  <FieldLabel>Service description</FieldLabel>
                  <textarea
                    value={form.service_description || ""}
                    onChange={(e) => set("service_description", e.target.value)}
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
                onChange={(e) => set("hourly_rate", e.target.value ? Number(e.target.value) : null)}
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
                onChange={(e) => set("daily_rate", e.target.value ? Number(e.target.value) : null)}
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
                onChange={(e) => set("monthly_rate", e.target.value ? Number(e.target.value) : null)}
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
              <div className="flex items-center gap-3 rounded-xl border border-border bg-background px-3 py-2.5">
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
            ) : (
              <p className="text-xs text-muted-foreground">
                No CV uploaded yet. Employers can filter profiles by CV.
              </p>
            )}
            <FileDrop
              label={form.cv_url ? "Replace CV" : "Upload CV"}
              accept={KAZI_CV_ACCEPT}
              busy={uploading === "cv"}
              onPick={handleCvUpload}
              hint="PDF, DOC or DOCX · max 5 MB"
            />
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

      {/* ── Sticky save ────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-3">
          <Badge tone={completeness >= 80 ? "success" : "primary"}>{completeness}% complete</Badge>
          <button
            onClick={handleSave}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-2 rounded-full gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
            {saving ? "Saving…" : "Save Profile"}
          </button>
        </div>
      </div>
    </AppShell>
  );
}