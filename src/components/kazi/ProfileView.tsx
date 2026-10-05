import type { ReactNode } from "react";
import {
  BadgeCheck,
  Briefcase,
  Clock,
  FileText,
  GraduationCap,
  Images,
  MapPin,
  MessageSquare,
  Sparkles,
  Star,
} from "lucide-react";
import { Badge, Card, SectionTitle } from "@/components/ui-bits";
import {
  formatKaziDate,
  formatKaziDateRange,
  availabilityTone,
  profileTypeLabel,
  type KaziProfileBundle,
  type KaziReview,
} from "./types";

function Avatar({ url, name, size = 80 }: { url?: string | null; name?: string | null; size?: number }) {
  const initial = (name || "K").trim().charAt(0).toUpperCase();
  if (url) {
    return (
      <img
        src={url}
        alt={name || "Profile photo"}
        width={size}
        height={size}
        className="shrink-0 rounded-full object-cover"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div
      className="grid shrink-0 place-items-center rounded-full gradient-primary font-bold text-primary-foreground"
      style={{ width: size, height: size, fontSize: size / 2.6 }}
      aria-hidden
    >
      {initial}
    </div>
  );
}

export function StarRow({ rating, count }: { rating: number | null; count: number }) {
  if (rating === null) {
    return <span className="text-xs text-muted-foreground">No ratings yet</span>;
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs">
      <Star className="h-3.5 w-3.5 fill-gold text-gold" />
      <span className="font-semibold text-foreground">{rating.toFixed(1)}</span>
      <span className="text-muted-foreground">
        ({count} review{count === 1 ? "" : "s"})
      </span>
    </span>
  );
}

export function RateChips({ bundle }: { bundle: KaziProfileBundle }) {
  const p = bundle.profile;
  const rates = [
    { label: "Hourly", value: p.hourly_rate },
    { label: "Daily", value: p.daily_rate },
    { label: "Monthly", value: p.monthly_rate },
  ].filter((r) => r.value !== null && r.value !== undefined);

  if (rates.length === 0) return null;

  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {rates.map((r) => (
        <span
          key={r.label}
          className="inline-flex items-center gap-1 rounded-full bg-gold/15 px-2.5 py-1 text-[11px] font-semibold text-gold-foreground"
        >
          KES {Number(r.value).toLocaleString("en-KE")} / {r.label.toLowerCase()}
        </span>
      ))}
    </div>
  );
}

/** Availability pill. Tones: green available, amber busy, grey unavailable. */
export function AvailabilityBadge({ value }: { value?: string | null }) {
  const { label, tone } = availabilityTone(value);
  const tones = {
    success: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
    warning: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
    neutral: "bg-muted text-muted-foreground",
  } as const;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold ${tones[tone]}`}
    >
      <span
        className={`h-1.5 w-1.5 rounded-full ${
          tone === "success" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-muted-foreground"
        }`}
      />
      {label}
    </span>
  );
}

/** Photo, name, verified badge, headline, location, availability and rating. */
export function ProfileHeaderCard({
  bundle,
  actions,
}: {
  bundle: KaziProfileBundle;
  actions?: ReactNode;
}) {
  const p = bundle.profile;
  const name = p.full_name?.trim() || "KAZI member";
  const isService = p.profile_type !== "worker";

  return (
    <Card className="!p-0 overflow-hidden">
      <div className="h-20 w-full gradient-primary" />
      <div className="px-4 pb-4">
        <div className="-mt-9 flex items-end gap-3">
          <div className="rounded-full border-4 border-card">
            <Avatar url={p.photo_url} name={name} size={72} />
          </div>
          <div className="min-w-0 flex-1 pb-1">
            <div className="flex items-center gap-1.5">
              <h1 className="truncate text-base font-bold tracking-tight text-foreground">{name}</h1>
              {p.is_verified && (
                <BadgeCheck className="h-4 w-4 shrink-0 text-primary" aria-label="Verified" />
              )}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <Badge tone="primary">{profileTypeLabel(p.profile_type)}</Badge>
              {p.category && <Badge tone="gold">{p.category}</Badge>}
              <AvailabilityBadge value={p.availability} />
            </div>
          </div>
        </div>

        {p.headline && (
          <p className="mt-3 text-sm font-medium leading-snug text-foreground">{p.headline}</p>
        )}
        {isService && p.service_name && (
          <p className="mt-1 text-xs font-semibold text-primary">{p.service_name}</p>
        )}

        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-muted-foreground">
          {p.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3.5 w-3.5" /> {p.location}
            </span>
          )}
        </div>

        <div className="mt-2">
          <StarRow rating={bundle.rating.rating} count={bundle.rating.reviewCount} />
        </div>

        <RateChips bundle={bundle} />

        {actions && <div className="mt-4 flex flex-wrap gap-2">{actions}</div>}
      </div>
    </Card>
  );
}

export function CompletenessBar({ value }: { value: number }) {
  const pct = Math.max(0, Math.min(100, Number(value) || 0));
  return (
    <Card className="!p-3.5">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Profile strength
        </span>
        <span className="text-xs font-bold text-primary">{pct}%</span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full gradient-primary transition-all"
          style={{ width: `${pct}%` }}
        />
      </div>
      {pct < 100 && (
        <p className="mt-2 text-[11px] text-muted-foreground">
          Add a photo, headline, bio and skills to help employers find you.
        </p>
      )}
    </Card>
  );
}

function Section({ title, icon, children }: { title: string; icon: ReactNode; children: ReactNode }) {
  return (
    <section className="mt-5">
      <SectionTitle
        title={title}
        action={
          <span className="grid h-6 w-6 place-items-center rounded-full bg-primary/10 text-primary">{icon}</span>
        }
      />
      {children}
    </section>
  );
}

function Empty({ label }: { label: string }) {
  return (
    <p className="rounded-2xl border border-dashed border-border bg-card px-4 py-5 text-center text-xs text-muted-foreground">
      {label}
    </p>
  );
}

export function AboutSection({ bundle, heading = true }: { bundle: KaziProfileBundle; heading?: boolean }) {
  const p = bundle.profile;
  const body = (
    <Card className="!p-3.5">
      {p.bio ? (
        <p className="whitespace-pre-line text-sm leading-relaxed text-foreground">{p.bio}</p>
      ) : (
        <Empty label="No bio added yet." />
      )}
      {p.service_description && (
        <p className="mt-2 whitespace-pre-line text-sm leading-relaxed text-muted-foreground">
          {p.service_description}
        </p>
      )}

      {(p.category || p.cv_url) && (
        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          {p.category && (
            <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-[11px] font-semibold text-primary">
              <Briefcase className="h-3 w-3" /> {p.category}
            </span>
          )}
          {p.cv_url && (
            <a
              href={p.cv_url}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[11px] font-semibold text-foreground"
            >
              <FileText className="h-3 w-3" /> View CV
            </a>
          )}
        </div>
      )}
    </Card>
  );
  if (!heading) return body;
  return (
    <Section title="About" icon={<Sparkles className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

export function SkillsSection({ bundle, heading = true }: { bundle: KaziProfileBundle; heading?: boolean }) {
  const body =
    bundle.skills.length === 0 ? (
      <Empty label="No skills added yet." />
    ) : (
      <div className="flex flex-wrap gap-2">
        {bundle.skills.map((s) => (
          <span
            key={s.id}
            className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium text-foreground"
          >
            {s.skill_name}
            {s.proficiency && <Badge tone="primary">{s.proficiency}</Badge>}
            {s.years_experience !== null && s.years_experience !== undefined && (
              <span className="text-[10px] text-muted-foreground">{Number(s.years_experience)} yrs</span>
            )}
          </span>
        ))}
      </div>
    );
  if (!heading) return body;
  return (
    <Section title="Skills" icon={<Sparkles className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

export function ExperienceSection({ bundle, heading = true }: { bundle: KaziProfileBundle; heading?: boolean }) {
  const body =
    bundle.experience.length === 0 ? (
      <Empty label="No experience added yet." />
    ) : (
      <div className="space-y-2.5">
        {bundle.experience.map((e) => (
          <Card key={e.id} className="!p-3.5">
            <p className="text-sm font-semibold text-foreground">{e.job_title}</p>
            <p className="text-xs text-muted-foreground">
              {[e.company, e.location].filter(Boolean).join(" · ") || "—"}
            </p>
            {formatKaziDateRange(e.start_date, e.end_date, e.is_current) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {formatKaziDateRange(e.start_date, e.end_date, e.is_current)}
              </p>
            )}
            {e.description && (
              <p className="mt-1.5 whitespace-pre-line text-xs leading-relaxed text-foreground">
                {e.description}
              </p>
            )}
          </Card>
        ))}
      </div>
    );
  if (!heading) return body;
  return (
    <Section title="Experience" icon={<Briefcase className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

export function EducationSection({ bundle, heading = true }: { bundle: KaziProfileBundle; heading?: boolean }) {
  const body =
    bundle.education.length === 0 ? (
      <Empty label="No education added yet." />
    ) : (
      <div className="space-y-2.5">
        {bundle.education.map((e) => (
          <Card key={e.id} className="!p-3.5">
            <p className="text-sm font-semibold text-foreground">
              {[e.qualification, e.field_of_study].filter(Boolean).join(" · ") || e.institution}
            </p>
            <p className="text-xs text-muted-foreground">{e.institution}</p>
            {(e.start_year || e.end_year) && (
              <p className="mt-0.5 text-[11px] text-muted-foreground">
                {e.start_year ?? ""} – {e.end_year ?? "Present"}
              </p>
            )}
          </Card>
        ))}
      </div>
    );
  if (!heading) return body;
  return (
    <Section title="Education" icon={<GraduationCap className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

export function PortfolioSection({ bundle, heading = true }: { bundle: KaziProfileBundle; heading?: boolean }) {
  const body =
    bundle.portfolio.length === 0 ? (
      <Empty label="No portfolio items yet." />
    ) : (
      <div className="grid grid-cols-2 gap-2.5">
        {bundle.portfolio.map((item) => (
          <Card key={item.id} className="!p-0 overflow-hidden">
            {item.image_url ? (
              <img
                src={item.image_url}
                alt={item.title || "Portfolio item"}
                loading="lazy"
                className="h-28 w-full object-cover"
              />
            ) : (
              <div className="grid h-28 w-full place-items-center bg-muted text-muted-foreground">
                <Images className="h-6 w-6" />
              </div>
            )}
            {(item.title || item.description) && (
              <div className="p-2.5">
                {item.title && <p className="truncate text-xs font-semibold text-foreground">{item.title}</p>}
                {item.description && (
                  <p className="line-clamp-2 text-[11px] text-muted-foreground">{item.description}</p>
                )}
              </div>
            )}
          </Card>
        ))}
      </div>
    );
  if (!heading) return body;
  return (
    <Section title="Portfolio" icon={<Images className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

export function ReviewsSection({
  reviews,
  heading = true,
}: {
  reviews: KaziReview[];
  heading?: boolean;
}) {
  const body =
    reviews.length === 0 ? (
      <Empty label="No reviews yet. Reviews appear after a completed KAZI contract." />
    ) : (
      <div className="space-y-2.5">
        {reviews.map((r) => (
          <Card key={r.id} className="!p-3.5">
            <div className="flex items-center justify-between gap-2">
              <StarRow rating={Number(r.rating)} count={1} />
              <span className="text-[10px] text-muted-foreground">{formatKaziDate(r.created_at)}</span>
            </div>
            {r.comment && <p className="mt-1.5 text-xs leading-relaxed text-foreground">{r.comment}</p>}
            {r.jobs?.title && <p className="mt-1 text-[10px] text-muted-foreground">{r.jobs.title}</p>}
          </Card>
        ))}
      </div>
    );
  if (!heading) return body;
  return (
    <Section title="Reviews" icon={<MessageSquare className="h-3.5 w-3.5" />}>
      {body}
    </Section>
  );
}

/** Every section stacked, in order — used by the Profile tab preview. */
export function ProfileSections({
  bundle,
  reviews = [],
}: {
  bundle: KaziProfileBundle;
  reviews?: KaziReview[];
}) {
  return (
    <>
      <AboutSection bundle={bundle} />
      <SkillsSection bundle={bundle} />
      <ExperienceSection bundle={bundle} />
      <EducationSection bundle={bundle} />
      <PortfolioSection bundle={bundle} />
      <ReviewsSection reviews={reviews} />
    </>
  );
}

export { Avatar };