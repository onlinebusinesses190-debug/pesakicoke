import { createFileRoute, rootRouteId, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  Briefcase,
  GraduationCap,
  Images,
  Loader2,
  MessageCircle,
  RefreshCw,
  Share2,
  Sparkles,
  UserCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui-bits";
import { fetchPublicProfile, fetchReviews } from "@/components/kazi/api";
import type {
  KaziProfileBundle,
  KaziReview,
} from "@/components/kazi/types";
import { CompletenessBar, ProfileHeaderCard, AboutSection, SkillsSection, ExperienceSection, EducationSection, PortfolioSection, ReviewsSection, RateChips } from "@/components/kazi/ProfileView";

export const Route = createFileRoute("/kazi_/public/$userId")({
  // See the note in kazi_.profile.tsx: the kazi_ prefix escapes nesting under
  // the /kazi page, which has no <Outlet />. URL is still /kazi/public/$userId.
  getParentRoute: () => rootRouteId,
  head: () => ({
    meta: [
      { title: "Profile — KAZI Link — PESAKI" },
      {
        name: "description",
        content: "A public KAZI Link worker or service provider profile.",
      },
      { name: "robots", content: "index, follow" },
    ],
  }),
  component: KaziPublicProfile,
});

type SectionTab = "about" | "skills" | "experience" | "education" | "portfolio" | "reviews";

const TABS: { key: SectionTab; label: string; icon: typeof Sparkles }[] = [
  { key: "about", label: "About", icon: Sparkles },
  { key: "skills", label: "Skills", icon: Sparkles },
  { key: "experience", label: "Experience", icon: Briefcase },
  { key: "education", label: "Education", icon: GraduationCap },
  { key: "portfolio", label: "Portfolio", icon: Images },
  { key: "reviews", label: "Reviews", icon: MessageCircle },
];

/** Renders only the selected section so the tab strip actually switches. */
function TabSection({
  bundle,
  reviews,
  tab,
}: {
  bundle: KaziProfileBundle;
  reviews: KaziReview[];
  tab: SectionTab;
}) {
  switch (tab) {
    case "skills":
      return <SkillsSection bundle={bundle} />;
    case "experience":
      return <ExperienceSection bundle={bundle} />;
    case "education":
      return <EducationSection bundle={bundle} />;
    case "portfolio":
      return <PortfolioSection bundle={bundle} />;
    case "reviews":
      return <ReviewsSection reviews={reviews} />;
    case "about":
    default:
      return (
        <>
          <AboutSection bundle={bundle} />
          <RateChips bundle={bundle} />
        </>
      );
  }
}

function KaziPublicProfile() {
  const { userId } = Route.useParams();
  const navigate = useNavigate();

  const [bundle, setBundle] = useState<KaziProfileBundle | null>(null);
  const [reviews, setReviews] = useState<KaziReview[]>([]);
  const [tab, setTab] = useState<SectionTab>("about");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const hasFetched = useRef(false);

  // ── JSON-LD Structured Data ──────────────────────────────────────────────
  useEffect(() => {
    if (!bundle) return;
    const p = bundle.profile;
    const mainEntity: Record<string, any> = {
      "@type": "Person",
      name: p.full_name?.trim() || "KAZI member",
    };
    if (p.headline?.trim()) mainEntity.jobTitle = p.headline.trim();
    if (p.bio?.trim()) mainEntity.description = p.bio.trim();
    if (p.location?.trim()) {
      mainEntity.address = {
        "@type": "PostalAddress",
        addressLocality: p.location.trim(),
        addressCountry: "KE",
      };
    }
    if (p.photo_url?.trim()) mainEntity.image = p.photo_url.trim();
    mainEntity.url = `${window.location.origin}/kazi/public/${userId}`;
    mainEntity.worksFor = {
      "@type": "Organization",
      name: "KAZI Link by PESAKI",
    };

    const jsonLd = {
      "@context": "https://schema.org",
      "@type": "ProfilePage",
      mainEntity,
    };

    const script = document.createElement("script");
    script.type = "application/ld+json";
    script.text = JSON.stringify(jsonLd);
    script.id = "kazi-profile-jsonld";

    document.getElementById("kazi-profile-jsonld")?.remove();
    document.head.appendChild(script);

    return () => {
      document.getElementById("kazi-profile-jsonld")?.remove();
    };
  }, [bundle, userId]);

  // ── Dynamic Title & Meta Description ─────────────────────────────────────
  useEffect(() => {
    if (!bundle) return;
    const p = bundle.profile;
    const name = p.full_name?.trim() || "KAZI member";
    const headline = p.headline?.trim() || "Worker";
    document.title = `${name} — ${headline} | KAZI Link`;

    let metaDesc = document.querySelector('meta[name="description"]');
    if (!metaDesc) {
      metaDesc = document.createElement("meta");
      metaDesc.setAttribute("name", "description");
      document.head.appendChild(metaDesc);
    }
    const desc = (p.bio?.trim() || `${name} — ${headline} on KAZI Link`).slice(0, 160);
    metaDesc.setAttribute("content", desc);
  }, [bundle]);

  // ── Robots Meta ──────────────────────────────────────────────────────────
  useEffect(() => {
    let robots = document.querySelector('meta[name="robots"]');
    if (!robots) {
      robots = document.createElement("meta");
      robots.setAttribute("name", "robots");
      document.head.appendChild(robots);
    }
    robots.setAttribute("content", "index, follow");
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);

    const res = await fetchPublicProfile(userId);
    if (!res.success || !res.data) {
      setError(res.error || "Profile not found");
      setBundle(null);
      setLoading(false);
      return;
    }
    setBundle(res.data);
    setLoading(false);

    const reviewRes = await fetchReviews(userId);
    if (reviewRes.success && reviewRes.data?.reviews) setReviews(reviewRes.data.reviews);
  }, [userId]);

  useEffect(() => {
    if (hasFetched.current) return;
    hasFetched.current = true;
    load();
  }, [load]);

  const shareUrl = () =>
    typeof window === "undefined" ? "" : `${window.location.origin}/kazi/public/${userId}`;

  const shareText = () => {
    const p = bundle?.profile;
    const name = p?.full_name?.trim() || "this KAZI member";
    const bits: string[] = [];
    if (p?.headline) bits.push(p.headline);
    if (p?.category) bits.push(p.category);
    if (p?.location) bits.push(p.location);
    const suffix = bits.length ? `\n${bits.join(" · ")}` : "";
    return `Check out ${name} on KAZI Link${suffix}\n${shareUrl()}`;
  };

  /**
   * KAZI messaging is job-scoped: both /kazi/messages?jobId= and
   * /kazi/send-message require a jobId, and there is no user-to-user channel.
   * Rather than navigating to a chat that cannot exist, say so and send the
   * viewer to KAZI where they can message from an application or job.
   */
  const handleMessage = () => {
    const name = bundle?.profile.full_name?.trim() || "them";
    toast(
      `Messaging on KAZI runs through a job, so there is no direct chat with ${name} yet. Open the job or application to message them.`,
      { duration: 6000 }
    );
    navigate({ to: "/kazi" });
  };

  const handleHire = () => {
    const name = bundle?.profile.full_name?.trim() || "this KAZI member";
    navigate({ to: "/kazi", search: { hireFor: name } as never });
  };

  const handleShare = async () => {
    const url = shareUrl();
    const name = bundle?.profile.full_name?.trim() || "KAZI profile";
    if (navigator.share) {
      try {
        await navigator.share({ title: `${name} — KAZI Link`, text: shareText(), url });
        return;
      } catch {
        /* dismissed — copy instead */
      }
    }
    try {
      await navigator.clipboard.writeText(shareText());
      toast.success("Profile details copied");
    } catch {
      toast.error(`Copy this link: ${url}`);
    }
  };

  /** WhatsApp is the primary sharing channel in Kenya. */
  const handleWhatsApp = () => {
    const url = `https://wa.me/?text=${encodeURIComponent(shareText())}`;
    window.open(url, "_blank", "noopener,noreferrer");
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Profile" subtitle="KAZI Link" />
        <div className="flex items-center justify-center gap-2 py-16 text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading profile…
        </div>
      </AppShell>
    );
  }

  if (error || !bundle) {
    return (
      <AppShell>
        <PageHeader
          title="Profile"
          subtitle="KAZI Link"
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
        <div className="px-5 pt-4">
          <Card className="!p-5 text-center">
            <p className="text-sm font-semibold text-foreground">Profile unavailable</p>
            <p className="mt-1 text-xs text-muted-foreground">{error || "This profile could not be loaded."}</p>
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
        </div>
      </AppShell>
    );
  }

  const name = bundle.profile.full_name?.trim() || "KAZI member";

  return (
    <AppShell>
      <PageHeader
        title={name}
        subtitle="KAZI Link public profile"
        right={
          <button
            onClick={() => (typeof window !== "undefined" ? window.history.back() : navigate({ to: "/kazi" }))}
            aria-label="Go back"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        }
      />

      <div className="space-y-3 px-5 pt-4">
        <ProfileHeaderCard bundle={bundle} />

        <div className="overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1 rounded-full bg-muted p-1">
            {TABS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTab(t.key)}
                className={`inline-flex items-center gap-1 rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  tab === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                <t.icon className="h-3 w-3" />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <CompletenessBar value={bundle.profile.completeness} />

        <TabSection bundle={bundle} reviews={reviews} tab={tab} />
      </div>

      {/* ── Sticky CTA ─────────────────────────────────────────────────── */}
      <div className="fixed inset-x-0 bottom-0 z-20 border-t border-border bg-card/95 px-5 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-md items-center gap-2">
          <button
            onClick={handleMessage}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-semibold text-foreground"
          >
            <MessageCircle className="h-4 w-4" /> Message
          </button>
          <button
            onClick={handleHire}
            className="inline-flex flex-1 items-center justify-center gap-2 rounded-full gradient-primary px-4 py-2.5 text-xs font-semibold text-primary-foreground"
          >
            <UserCheck className="h-4 w-4" /> Hire
          </button>
          <button
            onClick={handleWhatsApp}
            aria-label="Share on WhatsApp"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-[#25D366] text-white"
          >
            <MessageCircle className="h-4 w-4" />
          </button>
          <button
            onClick={handleShare}
            aria-label="Share profile"
            className="grid h-10 w-10 shrink-0 place-items-center rounded-full border border-border text-foreground"
          >
            <Share2 className="h-4 w-4" />
          </button>
        </div>
      </div>
    </AppShell>
  );
}