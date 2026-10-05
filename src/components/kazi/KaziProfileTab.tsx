import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  Copy,
  ExternalLink,
  Loader2,
  Pencil,
  RefreshCw,
  Share2,
  Sparkles,
  UserPlus,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui-bits";
import { fetchMyProfile, fetchReviews } from "./api";
import { isProfileEmpty, type KaziProfileBundle, type KaziReview } from "./types";
import {
  Avatar,
  CompletenessBar,
  ProfileHeaderCard,
  ProfileSections,
} from "./ProfileView";

async function copyText(text: string): Promise<boolean> {
  if (navigator.clipboard && window.isSecureContext) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      /* fall through to the legacy path */
    }
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.top = "-9999px";
    document.body.appendChild(ta);
    ta.focus();
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

/** "Create your profile" state shown before the user has filled anything in. */
function ProfileEmptyState({ onGetStarted }: { onGetStarted: () => void }) {
  return (
    <section className="mt-5 px-5">
      <Card className="!p-6 text-center">
        <div className="mx-auto grid h-14 w-14 place-items-center rounded-full gradient-primary">
          <UserPlus className="h-6 w-6 text-primary-foreground" />
        </div>
        <h2 className="mt-3 text-base font-bold tracking-tight text-foreground">Create your profile</h2>
        <p className="mx-auto mt-1.5 max-w-sm text-xs leading-relaxed text-muted-foreground">
          Build a public profile employers can find when they post work. Add your skills, experience and a
          portfolio, then share your profile link anywhere.
        </p>
        <button
          onClick={onGetStarted}
          className="mt-4 inline-flex items-center gap-2 rounded-full gradient-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground"
        >
          <Sparkles className="h-4 w-4" /> Get Started
        </button>
      </Card>
    </section>
  );
}

/**
 * The Profile tab: the user's own public profile, read-only inside KAZI Link.
 * Editing happens on the dedicated /kazi/profile editor route.
 */
export function KaziProfileTab() {
  const navigate = useNavigate();
  const [bundle, setBundle] = useState<KaziProfileBundle | null>(null);
  const [reviews, setReviews] = useState<KaziReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await fetchMyProfile();
    if (!res.success || !res.data) {
      setError(res.error || "Could not load your profile");
      setBundle(null);
      setLoading(false);
      return;
    }
    setBundle(res.data);
    setLoading(false);

    const reviewRes = await fetchReviews(res.data.profile.user_id);
    if (reviewRes.success && reviewRes.data?.reviews) setReviews(reviewRes.data.reviews);
  }, []);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const publicUrl = () => {
    if (typeof window === "undefined" || !bundle) return "";
    return `${window.location.origin}/kazi/public/${bundle.profile.user_id}`;
  };

  const handleShare = async () => {
    const url = publicUrl();
    if (!url) return;
    const name = bundle?.profile.full_name?.trim() || "My KAZI profile";
    const shareData = { title: `${name} — KAZI Link`, text: `Check out my KAZI Link profile`, url };

    if (navigator.share) {
      try {
        await navigator.share(shareData);
        return;
      } catch {
        /* user dismissed the share sheet — fall back to copying */
      }
    }
    const ok = await copyText(url);
    if (ok) toast.success("Profile link copied");
    else toast.error(`Could not copy automatically. Copy this link: ${url}`);
  };

  const handleCopyLink = async () => {
    const url = publicUrl();
    const ok = await copyText(url);
    if (ok) toast.success("Profile link copied");
    else toast.error(`Could not copy automatically. Copy this link: ${url}`);
  };

  if (loading) {
    return (
      <section className="mt-5 px-5">
        <div className="flex items-center justify-center gap-2 py-12 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm">Loading your profile…</span>
        </div>
      </section>
    );
  }

  if (error) {
    return (
      <section className="mt-5 px-5">
        <Card className="!p-5 text-center">
          <p className="text-sm font-semibold text-foreground">Profile unavailable</p>
          <p className="mt-1 text-xs text-muted-foreground">{error}</p>
          <button
            onClick={() => {
              hasFetched.current = false;
              load();
            }}
            className="mt-3 inline-flex items-center gap-2 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground"
          >
            <RefreshCw className="h-3.5 w-3.5" /> Try again
          </button>
        </Card>
      </section>
    );
  }

  if (!bundle || isProfileEmpty(bundle)) {
    return <ProfileEmptyState onGetStarted={() => navigate({ to: "/kazi/profile" })} />;
  }

  const user = bundle.profile;

  return (
    <section className="mt-5 space-y-3 px-5">
      <ProfileHeaderCard
        bundle={bundle}
        actions={
          <>
            <button
              onClick={() => navigate({ to: "/kazi/profile" })}
              className="inline-flex items-center gap-1.5 rounded-full gradient-primary px-4 py-2 text-xs font-semibold text-primary-foreground"
            >
              <Pencil className="h-3.5 w-3.5" /> Edit Profile
            </button>
            <button
              onClick={handleShare}
              className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-xs font-semibold text-foreground"
            >
              <Share2 className="h-3.5 w-3.5" /> Share Profile
            </button>
          </>
        }
      />

      <CompletenessBar value={user.completeness} />

      {bundle.profile.cv_url && (
        <Card className="!p-3.5">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-foreground">CV on file</p>
              <p className="truncate text-[11px] text-muted-foreground">Uploaded and shared with employers.</p>
            </div>
            <a
              href={bundle.profile.cv_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-border px-3 py-1.5 text-[11px] font-semibold text-foreground"
            >
              <ExternalLink className="h-3 w-3" /> Open
            </a>
          </div>
        </Card>
      )}

      <ProfileSections bundle={bundle} reviews={reviews} />

      <div className="sticky bottom-20 z-10 mt-4 flex flex-col gap-2">
        <button
          onClick={() => navigate({ to: "/kazi/public/$userId", params: { userId: user.user_id } })}
          className="inline-flex items-center justify-center gap-2 rounded-full gradient-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground shadow-[var(--shadow-card)]"
        >
          <ExternalLink className="h-4 w-4" /> Preview Public Profile
        </button>
        <button
          onClick={handleCopyLink}
          className="inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 py-2.5 text-xs font-semibold text-foreground"
        >
          <Copy className="h-3.5 w-3.5" /> Copy public link
        </button>
      </div>
    </section>
  );
}

export { copyText };

/** Small card used at the top of My Panel to jump straight to the Profile tab. */
export function MyProfileShortcut({ onClick }: { onClick: () => void }) {
  const [bundle, setBundle] = useState<KaziProfileBundle | null>(null);

  useEffect(() => {
    let cancelled = false;
    fetchMyProfile().then((res) => {
      if (!cancelled && res.success && res.data) setBundle(res.data);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const name = bundle?.profile.full_name?.trim() || "Your public profile";
  const pct = bundle?.profile.completeness ?? 0;
  const photo = bundle?.profile.photo_url || null;

  return (
    <button
      onClick={onClick}
      className="mb-4 flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-3 text-left shadow-[var(--shadow-card)] transition-colors hover:bg-muted"
    >
      <Avatar url={photo} name={name} size={44} />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-foreground">My Profile</p>
        <p className="truncate text-[11px] text-muted-foreground">
          {pct > 0 ? `${pct}% complete · ` : ""}
          {bundle && isProfileEmpty(bundle) ? "Get started" : "View your public profile"}
        </p>
      </div>
      <Sparkles className="h-4 w-4 shrink-0 text-gold-foreground" />
    </button>
  );
}