import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  BadgeCheck,
  Briefcase,
  Loader2,
  MapPin,
  Search,
  Sparkles,
  Star,
  X,
} from "lucide-react";
import { searchProfiles } from "./api";
import { Avatar, AvailabilityBadge } from "./ProfileView";
import { profileTypeLabel, type KaziSearchResult } from "./types";

const TYPES = [
  { key: "all", label: "All" },
  { key: "worker", label: "Workers" },
  { key: "service_provider", label: "Service providers" },
  { key: "business", label: "Businesses" },
] as const;

type TypeFilter = (typeof TYPES)[number]["key"];

const PAGE_SIZE = 20;

function Row({ r, onOpen }: { r: KaziSearchResult; onOpen: () => void }) {
  return (
    <button
      type="button"
      onClick={onOpen}
      className="flex w-full items-start gap-3 rounded-2xl border border-border bg-card p-3 text-left transition-colors hover:bg-muted"
    >
      <Avatar url={r.photoUrl} name={r.name} size={48} />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <p className="truncate text-sm font-bold text-foreground">{r.name}</p>
          {r.verified && <BadgeCheck className="h-3.5 w-3.5 shrink-0 text-primary" aria-label="Verified" />}
        </div>
        {r.headline && <p className="truncate text-xs text-muted-foreground">{r.headline}</p>}
        {r.serviceName && (
          <p className="truncate text-[11px] font-semibold text-primary">{r.serviceName}</p>
        )}

        <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-muted-foreground">
          {r.category && (
            <span className="inline-flex items-center gap-1">
              <Briefcase className="h-3 w-3" /> {r.category}
            </span>
          )}
          {r.location && (
            <span className="inline-flex items-center gap-1">
              <MapPin className="h-3 w-3" /> {r.location}
            </span>
          )}
        </div>

        <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
          <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">
            {profileTypeLabel(r.profileType)}
          </span>
          <AvailabilityBadge value={r.availability} />
          {r.ratingAverage !== null && (
            <span className="inline-flex items-center gap-1 text-[11px]">
              <Star className="h-3 w-3 fill-gold text-gold" />
              <span className="font-semibold text-foreground">{r.ratingAverage.toFixed(1)}</span>
              <span className="text-muted-foreground">({r.ratingCount})</span>
            </span>
          )}
          {r.jobsCompleted > 0 && (
            <span className="text-[11px] text-muted-foreground">
              {r.jobsCompleted} job{r.jobsCompleted === 1 ? "" : "s"} done
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

/**
 * Searches public KAZI profiles (people, skills and categories) and opens the
 * public profile route for the chosen result. Backed by GET /kazi/search-profiles.
 */
export function ProfileSearchSheet({ onClose }: { onClose: () => void }) {
  const navigate = useNavigate();
  const [term, setTerm] = useState("");
  const [debounced, setDebounced] = useState("");
  const [type, setType] = useState<TypeFilter>("all");
  const [results, setResults] = useState<KaziSearchResult[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const requestId = useRef(0);

  // Debounce keystrokes so each character doesn't fire a request.
  useEffect(() => {
    const t = setTimeout(() => setDebounced(term.trim()), 300);
    return () => clearTimeout(t);
  }, [term]);

  const fetchPage = useCallback(
    async (q: string, t: TypeFilter, offset: number, append: boolean) => {
      const id = ++requestId.current;
      setError(null);
      if (!append) setLoading(true);

      const res = await searchProfiles(q, t, PAGE_SIZE, offset);
      // A newer request already started — discard this stale response.
      if (id !== requestId.current) return;

      if (!res.success || !res.data) {
        setError(res.error || "Could not search profiles");
        if (!append) {
          setResults([]);
          setTotal(0);
        }
        setLoading(false);
        return;
      }

      setResults((prev) => (append ? [...prev, ...res.data!.results] : res.data!.results));
      setTotal(res.data.total);
      setLoading(false);
    },
    []
  );

  useEffect(() => {
    fetchPage(debounced, type, 0, false);
  }, [debounced, type, fetchPage]);

  const open = (userId: string) => {
    onClose();
    navigate({ to: "/kazi/public/$userId", params: { userId } });
  };

  const hasMore = results.length < total;

  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <button
            onClick={onClose}
            aria-label="Close search"
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">Find people</h3>
          <button
            onClick={onClose}
            aria-label="Close search"
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 px-5 pt-4">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={term}
              onChange={(e) => setTerm(e.target.value)}
              placeholder="Search name, skill or category"
              autoFocus
              className="w-full rounded-xl border border-border bg-background py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {term && (
              <button
                onClick={() => setTerm("")}
                aria-label="Clear search"
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              >
                <X className="h-4 w-4" />
              </button>
            )}
          </div>

          <div className="flex w-max gap-1 rounded-full bg-muted p-1">
            {TYPES.map((t) => (
              <button
                key={t.key}
                onClick={() => setType(t.key)}
                className={`rounded-full px-3 py-1.5 text-[11px] font-semibold transition-all ${
                  type === t.key ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+2rem)] pt-4">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-12 text-sm text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" /> Searching…
            </div>
          ) : error ? (
            <div className="py-10 text-center">
              <p className="text-sm font-semibold text-foreground">Search unavailable</p>
              <p className="mt-1 text-xs text-muted-foreground">{error}</p>
              <button
                onClick={() => fetchPage(debounced, type, 0, false)}
                className="mt-3 inline-flex items-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground"
              >
                Try again
              </button>
            </div>
          ) : results.length === 0 ? (
            <div className="py-10 text-center">
              <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-muted">
                <Sparkles className="h-5 w-5 text-muted-foreground" />
              </div>
              <p className="mt-3 text-sm font-semibold text-foreground">No profiles found</p>
              <p className="mt-1 text-xs text-muted-foreground">
                {debounced
                  ? `Nothing matches "${debounced}". Try a different name, skill or category.`
                  : "No KAZI profiles have been published yet."}
              </p>
            </div>
          ) : (
            <>
              <p className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
                {total} profile{total === 1 ? "" : "s"}
              </p>
              <div className="space-y-2">
                {results.map((r) => (
                  <Row key={r.userId} r={r} onOpen={() => open(r.userId)} />
                ))}
              </div>
              {hasMore && (
                <button
                  onClick={() => fetchPage(debounced, type, results.length, true)}
                  className="mt-3 w-full rounded-xl border border-border py-2.5 text-xs font-semibold text-foreground"
                >
                  Load more
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
}
