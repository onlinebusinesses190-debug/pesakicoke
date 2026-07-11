import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Star, MapPin, ShieldCheck, Plus, X, ArrowLeft, Upload, CheckCircle2 } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { jobCategories, workers } from "@/lib/mock";

export const Route = createFileRoute("/kazi")({
  head: () => ({
    meta: [
      { title: "KAZI Link — PESAKI" },
      { name: "description", content: "Find work or hire trusted workers on KAZI Link — house helps, drivers, plumbers, tutors and more." },
    ],
  }),
  component: KaziPage,
});

type Job = { t: string; l: string; p: string; b: "Urgent" | "New" | "Hot" };
const jobs: Job[] = [
  { t: "Live-in House Help", l: "Karen, Nairobi", p: "KES 25,000/mo", b: "Urgent" },
  { t: "Evening Tutor (Math)", l: "Kileleshwa", p: "KES 1,200/hr", b: "New" },
  { t: "Event Cleaner", l: "Westlands", p: "KES 1,800/day", b: "Hot" },
];

function KaziPage() {
  const [tab, setTab] = useState<"find" | "hire">("find");
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [postJob, setPostJob] = useState(false);

  return (
    <AppShell>
      <PageHeader title="KAZI Link" subtitle="Connecting workers and employers" />

      <div className="px-5 pt-4">
        <div className="grid grid-cols-3 gap-1 rounded-full bg-muted p-1">
          {(["find", "hire"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full py-2 text-xs font-semibold transition-all ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "find" ? "Find Work" : "Hire Workers"}
            </button>
          ))}
          <button
            onClick={() => setPostJob(true)}
            className="inline-flex items-center justify-center gap-1 rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground"
          >
            <Plus className="h-3 w-3" /> Post a Job
          </button>
        </div>
      </div>

      <section className="mt-4 px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={tab === "find" ? "Search jobs near you" : "Search workers by skill"}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      <section className="mt-5 px-5">
        <SectionTitle title="Categories" />
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {jobCategories.map((c) => (
            <button key={c} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
              {c}
            </button>
          ))}
        </div>
      </section>

      {tab === "find" ? (
        <section className="mt-5 px-5">
          <SectionTitle title="Open jobs near you" />
          <div className="space-y-2.5">
            {jobs.map((j) => (
              <Card key={j.t} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{j.t}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {j.l}
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">{j.p}</p>
                  </div>
                  <Badge tone={j.b === "Urgent" ? "destructive" : j.b === "Hot" ? "warning" : "gold"}>{j.b}</Badge>
                </div>
                <button
                  onClick={() => setApplyJob(j)}
                  className="mt-3 w-full rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground"
                >
                  Apply now
                </button>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-5 px-5">
          <SectionTitle title="Top workers" />
          <div className="space-y-2.5">
            {workers.map((w) => (
              <Card key={w.name} className="!p-3.5">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">
                    {w.name.split(" ").map((n) => n[0]).slice(0, 2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <Badge tone={w.badge === "Top Rated" ? "gold" : w.badge === "Verified" ? "success" : "primary"}>
                        {w.badge}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {w.loc}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-0.5 font-semibold">
                        <Star className="h-3 w-3 fill-gold text-gold" /> {w.rating}
                      </span>
                      <span className="text-muted-foreground">{w.jobs} jobs</span>
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {w.skills.map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="rounded-full border border-border py-2 text-xs font-semibold">Message</button>
                  <button className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground">Hire</button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}

      {applyJob && <ApplyJobSheet job={applyJob} onClose={() => setApplyJob(null)} />}
      {postJob && <PostJobSheet onClose={() => setPostJob(false)} />}
    </AppShell>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}
const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function ApplyJobSheet({ job, onClose }: { job: Job; onClose: () => void }) {
  const [done, setDone] = useState(false);
  return (
    <SheetShell title="Apply for job" onClose={onClose}>
      {done ? (
        <SuccessBlock message={`Your application for "${job.t}" has been submitted.`} onClose={onClose} />
      ) : (
        <>
          <div className="rounded-xl bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{job.b}</p>
            <p className="mt-0.5 text-sm font-bold">{job.t}</p>
            <p className="text-xs text-muted-foreground">{job.l} · {job.p}</p>
          </div>

          <form className="mt-4 space-y-3" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
            <div>
              <FieldLabel>Full name</FieldLabel>
              <input required className={inputCls} placeholder="Jane Wanjiku" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input required className={inputCls} placeholder="+254 7…" />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input required type="email" className={inputCls} placeholder="you@mail.com" />
              </div>
            </div>
            <div>
              <FieldLabel>Current location</FieldLabel>
              <input required className={inputCls} placeholder="e.g. Kasarani, Nairobi" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Years of experience</FieldLabel>
                <select required className={inputCls}>
                  <option value="">Select</option>
                  <option>Less than 1</option>
                  <option>1 - 3</option>
                  <option>3 - 5</option>
                  <option>5+</option>
                </select>
              </div>
              <div>
                <FieldLabel>Availability</FieldLabel>
                <select required className={inputCls}>
                  <option value="">Select</option>
                  <option>Immediate</option>
                  <option>1 week</option>
                  <option>2 weeks</option>
                </select>
              </div>
            </div>
            <FileField label="Upload profile photo (full body)" required accept="image/*" />
            <FileField label="Upload CV / Resume (optional)" accept=".pdf,.doc,.docx" />

            <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
              Submit Application
            </button>
          </form>
        </>
      )}
    </SheetShell>
  );
}

function PostJobSheet({ onClose }: { onClose: () => void }) {
  const [done, setDone] = useState(false);
  const [accommodation, setAccommodation] = useState(false);
  const requirements = ["Experience required", "ID Required", "References", "Background check", "Own tools"];
  return (
    <SheetShell title="Post a Job" onClose={onClose}>
      {done ? (
        <SuccessBlock message="Your job posting is ready to publish." onClose={onClose} />
      ) : (
        <form className="space-y-3" onSubmit={(e) => { e.preventDefault(); setDone(true); }}>
          <div>
            <FieldLabel>Job title</FieldLabel>
            <input required className={inputCls} placeholder="e.g. Live-in House Help" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Category</FieldLabel>
              <select required className={inputCls}>
                <option value="">Select</option>
                <option>House Help</option>
                <option>Cleaner</option>
                <option>Tutor</option>
                <option>Gardener</option>
                <option>Driver</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input required className={inputCls} placeholder="Karen, Nairobi" />
            </div>
          </div>
          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold">Accommodation provided?</p>
              <p className="text-[11px] text-muted-foreground">Toggle if the role includes housing.</p>
            </div>
            <button
              type="button"
              onClick={() => setAccommodation((v) => !v)}
              className={`relative h-6 w-11 rounded-full transition-colors ${accommodation ? "bg-primary" : "bg-muted"}`}
              aria-pressed={accommodation}
            >
              <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${accommodation ? "left-[22px]" : "left-0.5"}`} />
            </button>
          </div>
          <div>
            <FieldLabel>Salary / Payment</FieldLabel>
            <input required className={inputCls} placeholder="e.g. KES 25,000/mo" />
          </div>
          <div>
            <FieldLabel>Job requirements</FieldLabel>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {requirements.map((r) => (
                <label key={r} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                  <input type="checkbox" className="h-4 w-4 accent-primary" />
                  {r}
                </label>
              ))}
            </div>
          </div>
          <div>
            <FieldLabel>Job description</FieldLabel>
            <textarea required rows={4} className={inputCls} placeholder="Describe duties, working hours, expectations…" />
          </div>
          <FileField label="Add image (optional)" accept="image/*" />

          <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
            Preview & Publish
          </button>
        </form>
      )}
    </SheetShell>
  );
}

export function FileField({ label, required, accept }: { label: string; required?: boolean; accept?: string }) {
  const [name, setName] = useState<string>("");
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <label className="mt-1 flex cursor-pointer items-center gap-2 rounded-xl border border-dashed border-border bg-background px-3 py-3 text-xs text-muted-foreground hover:border-primary/40">
        <Upload className="h-4 w-4" />
        <span className="truncate">{name || "Tap to upload"}</span>
        <input
          type="file"
          required={required}
          accept={accept}
          onChange={(e) => setName(e.target.files?.[0]?.name ?? "")}
          className="hidden"
        />
      </label>
    </div>
  );
}

export function SuccessBlock({ message, onClose }: { message: string; onClose: () => void }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <p className="mt-3 text-base font-bold">Success</p>
      <p className="mt-1 text-xs text-muted-foreground">{message}</p>
      <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
        Done
      </button>
    </div>
  );
}
