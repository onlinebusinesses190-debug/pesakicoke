import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Star, MapPin, ShieldCheck, Plus, X, ArrowLeft, Upload, CheckCircle2,
  Send, Bell, Wallet, User as UserIcon, Phone, Mail, Briefcase, Clock,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { jobCategories, workers } from "@/lib/mock";
import { useBalance } from "@/lib/balance";
import { useKazi, kaziStore, type PostedJob, type Application } from "@/lib/kazi-store";
import { apiRequest } from "@/utils/api";

export const Route = createFileRoute("/kazi")({
  head: () => ({
    meta: [
      { title: "KAZI Link — PESAKI" },
      { name: "description", content: "Find work or hire trusted workers on KAZI Link — house helps, drivers, plumbers, tutors and more." },
    ],
  }),
  component: KaziPage,
});

type Tab = "find" | "hire" | "mine";

function KaziPage() {
  const [tab, setTab] = useState<Tab>("find");
  const [q, setQ] = useState("");
  const [applyJob, setApplyJob] = useState<PostedJob | null>(null);
  const [postJob, setPostJob] = useState(false);
  const [hireApp, setHireApp] = useState<Application | null>(null);
  const [chatApp, setChatApp] = useState<Application | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);

  const store = useKazi();
  const unread = store.notifications.filter((n) => !n.read).length;

  // ── Local state for applications (fetched based on role) ──────────────
  const [applications, setApplications] = useState<Application[]>([]);

  // ── Fetch applications when tab changes ─────────────────────────────────
  useEffect(() => {
    const fetchApplications = async () => {
      let url = '/kazi/applications';
      if (tab === 'hire') {
        url += '?role=employer';
      } else if (tab === 'mine') {
        url += '?role=worker';
      }
      try {
        const data = await apiRequest(url);
        setApplications(data);
      } catch (err) {
        console.error('Failed to fetch applications:', err);
      }
    };
    fetchApplications();
  }, [tab]);

  const visibleJobs = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = store.jobs.filter((j) => j.status === "Open");
    if (term) {
      list = list.filter(
        (j) =>
          j.title.toLowerCase().includes(term) ||
          j.location.toLowerCase().includes(term) ||
          j.category.toLowerCase().includes(term) ||
          j.description.toLowerCase().includes(term),
      );
    }
    return list;
  }, [store.jobs, q]);

  // ─── Use local applications for both "Hire" and "My Panel" ──────────────
  const applicantsGrouped = useMemo(() => {
    const term = q.trim().toLowerCase();
    let apps = applications;
    if (term) {
      apps = apps.filter(
        (a) =>
          a.applicantName.toLowerCase().includes(term) ||
          a.location.toLowerCase().includes(term) ||
          a.jobTitle.toLowerCase().includes(term),
      );
    }
    return apps;
  }, [applications, q]);

  return (
    <AppShell>
      <PageHeader
        title="KAZI Link"
        subtitle="Connecting workers and employers"
        right={
          <button
            onClick={() => setNotifOpen(true)}
            className="relative grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
            aria-label="Notifications"
          >
            <Bell className="h-4 w-4" />
            {unread > 0 && (
              <span className="absolute -right-0.5 -top-0.5 grid h-4 min-w-4 place-items-center rounded-full bg-destructive px-1 text-[9px] font-bold text-destructive-foreground">
                {unread}
              </span>
            )}
          </button>
        }
      />

      <div className="px-5 pt-4">
        <div className="grid grid-cols-4 gap-1 rounded-full bg-muted p-1">
          {([
            { k: "find", label: "Find Work" },
            { k: "hire", label: "Hire" },
            { k: "mine", label: "My Panel" },
          ] as const).map((t) => (
            <button
              key={t.k}
              onClick={() => setTab(t.k)}
              className={`rounded-full py-2 text-[11px] font-semibold transition-all ${
                tab === t.k ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t.label}
            </button>
          ))}
          <button
            onClick={() => setPostJob(true)}
            className="inline-flex items-center justify-center gap-1 rounded-full gradient-primary py-2 text-[11px] font-semibold text-primary-foreground"
          >
            <Plus className="h-3 w-3" /> Post
          </button>
        </div>
      </div>

      {tab !== "mine" && (
        <section className="mt-4 px-5">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder={tab === "find" ? "Search jobs, location, category" : "Search applicants by name, job, area"}
              className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-9 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            {q && (
              <button
                onClick={() => setQ("")}
                className="absolute right-2 top-1/2 grid h-6 w-6 -translate-y-1/2 place-items-center rounded-full bg-muted text-muted-foreground"
                aria-label="Clear search"
              >
                <X className="h-3 w-3" />
              </button>
            )}
          </div>
        </section>
      )}

      {tab === "find" && (
        <>
          <section className="mt-5 px-5">
            <SectionTitle title="Categories" />
            <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {jobCategories.map((c) => (
                <button
                  key={c}
                  onClick={() => setQ(c)}
                  className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted"
                >
                  {c}
                </button>
              ))}
            </div>
          </section>

          <section className="mt-3 px-5">
            <SectionTitle title={`Open jobs (${visibleJobs.length})`} />
            {visibleJobs.length === 0 ? (
              <EmptyState label="No jobs match your search." />
            ) : (
              <div className="space-y-2.5">
                {visibleJobs.map((j) => (
                  <Card key={j.id} className="!p-3.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{j.title}</p>
                        <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                          <MapPin className="h-3 w-3" /> {j.location}
                        </p>
                        <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                          <Clock className="h-3 w-3" /> {j.duration}
                        </p>
                        <p className="mt-1 text-sm font-bold text-primary">{j.pay}</p>
                      </div>
                      <Badge tone={j.badge === "Urgent" ? "destructive" : j.badge === "Hot" ? "warning" : "gold"}>{j.badge}</Badge>
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
            )}
          </section>
        </>
      )}

      {tab === "hire" && (
        <>
          {applicantsGrouped.length > 0 && (
            <section className="mt-5 px-5">
              <SectionTitle title={`Applicants awaiting your review (${applicantsGrouped.length})`} />
              <div className="space-y-2.5">
                {applicantsGrouped.map((a) => (
                  <ApplicantRow key={a.id}
                    a={a}
                    onHire={() => setHireApp(a)}
                    onChat={() => setChatApp(a)}
                  />
                ))}
              </div>
            </section>
          )}

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
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Post a job to receive applications from workers like {w.name.split(" ")[0]}.
                  </p>
                </Card>
              ))}
            </div>
          </section>
        </>
      )}

      {tab === "mine" && (
        <MyPanel
          apps={applications}
          onChat={(a) => setChatApp(a)}
        />
      )}

      {applyJob && <ApplyJobSheet job={applyJob} onClose={() => setApplyJob(null)} />}
      {postJob && <PostJobSheet onClose={() => setPostJob(false)} />}
      {hireApp && <HireSheet app={hireApp} onClose={() => setHireApp(null)} onOpenChat={() => { setChatApp(hireApp); setHireApp(null); }} />}
      {chatApp && <ChatSheet app={chatApp} from="employer" onClose={() => setChatApp(null)} />}
      {notifOpen && <NotifSheet onClose={() => setNotifOpen(false)} />}
    </AppShell>
  );
}

/* ------------------------------ Applicant Row ------------------------------ */

function ApplicantRow({ a, onHire, onChat }: { a: Application; onHire: () => void; onChat: () => void }) {
  const store = useKazi();
  const unread = store.messages.filter((m) => m.threadId === `${a.jobId}:${a.id}` && m.from === "worker").length;
  return (
    <Card className="!p-3.5">
      <div className="flex items-start gap-3">
        <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full gradient-gold text-sm font-bold text-gold-foreground">
          {a.applicantName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-sm font-semibold">{a.applicantName}</p>
            <Badge tone={a.status === "Hired" ? "success" : a.status === "Rejected" ? "destructive" : "primary"}>{a.status}</Badge>
          </div>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <Briefcase className="h-3 w-3" /> Applied for {a.jobTitle}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <MapPin className="h-3 w-3" /> {a.location} · {a.experience} yrs
          </p>
        </div>
      </div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        <button onClick={onChat} className="relative rounded-full border border-border py-2 text-xs font-semibold">
          Message
          {unread > 0 && <span className="absolute right-2 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-destructive" />}
        </button>
        <button
          onClick={onHire}
          disabled={a.status === "Hired" || a.status === "Rejected"}
          className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
        >
          {a.status === "Hired" ? "Hired" : "Hire · View"}
        </button>
      </div>
    </Card>
  );
}

/* --------------------------------- My Panel -------------------------------- */

function MyPanel({ apps, onChat }: { apps: Application[]; onChat: (a: Application) => void }) {
  const store = useKazi();
  if (apps.length === 0) {
    return (
      <section className="mt-6 px-5">
        <EmptyState label="You haven't applied to any jobs yet. Head to Find Work to get started." />
      </section>
    );
  }
  return (
    <section className="mt-5 px-5">
      <SectionTitle title={`My applications (${apps.length})`} />
      <div className="space-y-2.5">
        {apps.map((a) => {
          const unread = store.messages.filter((m) => m.threadId === `${a.jobId}:${a.id}` && m.from === "employer").length;
          return (
            <Card key={a.id} className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.jobTitle}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{a.jobPay}</p>
                  <p className="mt-0.5 text-[11px] text-muted-foreground">
                    Applied {new Date(a.appliedAt).toLocaleDateString()}
                  </p>
                </div>
                <Badge tone={a.status === "Hired" ? "success" : a.status === "Rejected" ? "destructive" : a.status === "Shortlisted" ? "gold" : "primary"}>
                  {a.status}
                </Badge>
              </div>

              {a.status === "Hired" && a.paidEscrow && (
                <div className="mt-3 rounded-xl bg-success/10 p-3 text-[11px]">
                  <p className="font-semibold text-success">Payment secured in escrow</p>
                  <PayoutBreakdown application={a} />
                </div>
              )}

              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  onClick={() => onChat(a)}
                  className="relative rounded-full border border-border py-2 text-xs font-semibold"
                >
                  Chat with employer
                  {unread > 0 && <span className="absolute right-3 top-1/2 h-2 w-2 -translate-y-1/2 rounded-full bg-destructive" />}
                </button>
                <button
                  disabled={a.status !== "Hired" || a.serviceFeePaid}
                  onClick={() => kaziStore.registerPayout(a.id)}
                  className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {a.serviceFeePaid ? "Paid ✓" : "Receive payout"}
                </button>
              </div>
            </Card>
          );
        })}
      </div>
    </section>
  );
}

function PayoutBreakdown({ application }: { application: Application }) {
  const store = useKazi();
  const job = store.jobs.find((j) => j.id === application.jobId);
  if (!job) return null;
  const gross = job.payAmount;
  const serviceFee = application.serviceFeePaid ? 0 : (store.firstJobPayoutDone ? 0 : 200);
  const insurance = Math.round(gross * 0.01);
  const net = gross - serviceFee - insurance;
  return (
    <ul className="mt-1 space-y-0.5 text-muted-foreground">
      <li className="flex justify-between"><span>Gross pay</span><span className="font-semibold text-foreground">KES {gross.toLocaleString()}</span></li>
      <li className="flex justify-between"><span>Service fee (once)</span><span>- KES {serviceFee}</span></li>
      <li className="flex justify-between"><span>Insurance (1%)</span><span>- KES {insurance.toLocaleString()}</span></li>
      <li className="flex justify-between border-t border-border/60 pt-1"><span className="font-semibold text-foreground">Net</span><span className="font-bold text-success">KES {net.toLocaleString()}</span></li>
    </ul>
  );
}

/* --------------------------------- Sheets --------------------------------- */

function SheetShell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-[60] grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex max-h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Back">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <h3 className="text-base font-bold">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 pb-[calc(env(safe-area-inset-bottom)+7rem)] pt-4">
          {children}
        </div>
      </div>
    </div>
  );
}

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}
const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function ApplyJobSheet({ job, onClose }: { job: PostedJob; onClose: () => void }) {
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    applicantName: "", phone: "", email: "", location: "",
    experience: "", availability: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  function submit(e: React.FormEvent) {
    e.preventDefault();
    kaziStore.apply(job.id, form);
    setDone(true);
  }

  return (
    <SheetShell title="Apply for job" onClose={onClose}>
      {done ? (
        <SuccessBlock
          message={`Your application for "${job.title}" has been submitted. Track it under My Panel.`}
          onClose={onClose}
        />
      ) : (
        <>
          <div className="rounded-xl bg-primary/5 p-3">
            <p className="text-xs font-semibold uppercase tracking-wider text-primary">{job.badge}</p>
            <p className="mt-0.5 text-sm font-bold">{job.title}</p>
            <p className="text-xs text-muted-foreground">{job.location} · {job.pay} · {job.duration}</p>
          </div>

          <form className="mt-4 space-y-3" onSubmit={submit}>
            <div>
              <FieldLabel>Full name</FieldLabel>
              <input required value={form.applicantName} onChange={set("applicantName")} className={inputCls} placeholder="Jane Wanjiku" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Phone</FieldLabel>
                <input required value={form.phone} onChange={set("phone")} className={inputCls} placeholder="+254 7…" />
              </div>
              <div>
                <FieldLabel>Email</FieldLabel>
                <input required type="email" value={form.email} onChange={set("email")} className={inputCls} placeholder="you@mail.com" />
              </div>
            </div>
            <div>
              <FieldLabel>Current location</FieldLabel>
              <input required value={form.location} onChange={set("location")} className={inputCls} placeholder="e.g. Kasarani, Nairobi" />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Years of experience</FieldLabel>
                <select required value={form.experience} onChange={set("experience")} className={inputCls}>
                  <option value="">Select</option>
                  <option>Less than 1</option>
                  <option>1 - 3</option>
                  <option>3 - 5</option>
                  <option>5+</option>
                </select>
              </div>
              <div>
                <FieldLabel>Availability</FieldLabel>
                <select required value={form.availability} onChange={set("availability")} className={inputCls}>
                  <option value="">Select</option>
                  <option>Immediate</option>
                  <option>1 week</option>
                  <option>2 weeks</option>
                </select>
              </div>
            </div>
            <FileField label="Upload profile photo (full body)" required accept="image/*" />
            <FileField label="Upload CV / Resume (optional)" accept=".pdf,.doc,.docx" />

            <div className="rounded-xl bg-muted/60 p-3 text-[11px] text-muted-foreground">
              A one-time KES 200 service fee is deducted from your first job payment, plus a 1% insurance fee per payout.
            </div>

            <button type="submit" className="mt-2 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
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
  const [checked, setChecked] = useState<string[]>([]);
  const requirements = ["Experience required", "ID Required", "References", "Background check", "Own tools"];
  const [form, setForm] = useState({
    title: "", category: "", location: "", pay: "", payAmount: 0, duration: "", description: "", postedBy: "You",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = k === "payAmount" ? Number((e.target as HTMLInputElement).value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  function submit(e: React.FormEvent) {
    e.preventDefault();
    kaziStore.postJob({
      title: form.title,
      category: form.category,
      location: form.location,
      pay: form.pay,
      payAmount: form.payAmount,
      duration: form.duration,
      accommodation,
      requirements: checked,
      description: form.description,
      postedBy: form.postedBy,
    });
    setDone(true);
  }

  return (
    <SheetShell title="Post a Job" onClose={onClose}>
      {done ? (
        <SuccessBlock message="Your job is now live and visible in Find Work." onClose={onClose} />
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <div>
            <FieldLabel>Job title</FieldLabel>
            <input required value={form.title} onChange={set("title")} className={inputCls} placeholder="e.g. Live-in House Help" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Category</FieldLabel>
              <select required value={form.category} onChange={set("category")} className={inputCls}>
                <option value="">Select</option>
                <option>House Help</option>
                <option>Cleaner</option>
                <option>Tutor</option>
                <option>Gardener</option>
                <option>Driver</option>
                <option>Plumber</option>
                <option>Electrician</option>
                <option>Security Guard</option>
                <option>Event Worker</option>
                <option>Other</option>
              </select>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <input required value={form.location} onChange={set("location")} className={inputCls} placeholder="Karen, Nairobi" />
            </div>
          </div>

          <div>
            <FieldLabel>Job duration</FieldLabel>
            <select required value={form.duration} onChange={set("duration")} className={inputCls}>
              <option value="">Select duration</option>
              <option>1 day</option>
              <option>3 days</option>
              <option>1 week</option>
              <option>2 weeks</option>
              <option>3 weeks</option>
              <option>1 month</option>
              <option>3 months</option>
              <option>6 months</option>
              <option>Ongoing</option>
            </select>
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

          <div className="grid grid-cols-2 gap-3">
            <div>
              <FieldLabel>Pay label</FieldLabel>
              <input required value={form.pay} onChange={set("pay")} className={inputCls} placeholder="e.g. KES 25,000/mo" />
            </div>
            <div>
              <FieldLabel>Pay amount (KES)</FieldLabel>
              <input required type="number" min={1} value={form.payAmount || ""} onChange={set("payAmount")} className={inputCls} placeholder="25000" />
            </div>
          </div>

          <div>
            <FieldLabel>Job requirements</FieldLabel>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {requirements.map((r) => (
                <label key={r} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs">
                  <input
                    type="checkbox"
                    className="h-4 w-4 accent-primary"
                    checked={checked.includes(r)}
                    onChange={(e) =>
                      setChecked((c) => (e.target.checked ? [...c, r] : c.filter((x) => x !== r)))
                    }
                  />
                  {r}
                </label>
              ))}
            </div>
          </div>

          <div>
            <FieldLabel>Job description</FieldLabel>
            <textarea required rows={4} value={form.description} onChange={set("description")} className={inputCls} placeholder="Describe duties, working hours, expectations…" />
          </div>
          <FileField label="Add image (optional)" accept="image/*" />

          <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
            Publish job
          </button>
        </form>
      )}
    </SheetShell>
  );
}

function HireSheet({ app, onClose, onOpenChat }: { app: Application; onClose: () => void; onOpenChat: () => void }) {
  const bal = useBalance();
  const store = useKazi();
  const job = store.jobs.find((j) => j.id === app.jobId);
  const [err, setErr] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  if (!job) return null;

  const total = job.payAmount;
  const insufficient = bal.available < total;

  function confirmHire() {
    setErr(null);
    const res = kaziStore.hireAndDeposit(app.id);
    if (!res.ok) { setErr(res.error ?? "Could not process"); return; }
    setDone(true);
  }

  return (
    <SheetShell title="Applicant profile" onClose={onClose}>
      {done ? (
        <SuccessBlock message={`${app.applicantName} has been hired for "${job.title}". Escrow funded.`} onClose={onClose} />
      ) : (
        <>
          <div className="flex items-center gap-3">
            <div className="grid h-16 w-16 place-items-center rounded-2xl gradient-primary text-lg font-bold text-primary-foreground">
              {app.applicantName.split(" ").map((n) => n[0]).slice(0, 2).join("").toUpperCase()}
            </div>
            <div className="min-w-0">
              <p className="text-lg font-bold">{app.applicantName}</p>
              <p className="flex items-center gap-1 text-xs text-muted-foreground"><MapPin className="h-3 w-3" /> {app.location}</p>
              <p className="text-[11px] text-muted-foreground">Applied for {app.jobTitle}</p>
            </div>
          </div>

          <ul className="mt-4 space-y-2 text-sm">
            <ProfileRow icon={<Phone className="h-4 w-4" />} label="Phone" value={app.phone} />
            <ProfileRow icon={<Mail className="h-4 w-4" />} label="Email" value={app.email} />
            <ProfileRow icon={<Briefcase className="h-4 w-4" />} label="Experience" value={`${app.experience} years`} />
            <ProfileRow icon={<Clock className="h-4 w-4" />} label="Availability" value={app.availability} />
            <ProfileRow icon={<UserIcon className="h-4 w-4" />} label="Photo" value={app.photoName || "Provided"} />
          </ul>

          <button
            onClick={onOpenChat}
            className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-border py-2.5 text-sm font-semibold"
          >
            <Send className="h-4 w-4" /> Message {app.applicantName.split(" ")[0]}
          </button>

          <div className="mt-4 rounded-2xl border border-border bg-muted/30 p-4">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Escrow deposit</p>
            <p className="mt-1 text-xs text-muted-foreground">
              To confirm the hire, deposit the agreed pay into PESAKI escrow. The worker is only alerted once payment is held.
            </p>
            <ul className="mt-3 space-y-1 text-sm">
              <li className="flex justify-between"><span className="text-muted-foreground">Job pay</span><span className="font-semibold">KES {job.payAmount.toLocaleString()}</span></li>
              <li className="flex justify-between"><span className="text-muted-foreground">Available balance</span><span className="font-semibold">KES {bal.available.toLocaleString()}</span></li>
              <li className="flex justify-between border-t border-border/60 pt-2"><span className="font-semibold">Total to deposit</span><span className="font-bold text-primary">KES {total.toLocaleString()}</span></li>
            </ul>

            {insufficient && (
              <p className="mt-2 rounded-lg bg-destructive/10 px-3 py-2 text-[11px] font-medium text-destructive">
                Insufficient wallet balance. Top up in Wallet before hiring.
              </p>
            )}
            {err && <p className="mt-2 text-[11px] font-medium text-destructive">{err}</p>}

            <button
              onClick={confirmHire}
              disabled={insufficient}
              className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
            >
              <Wallet className="h-4 w-4" /> Confirm Hire & Deposit
            </button>
          </div>
        </>
      )}
    </SheetShell>
  );
}

function ProfileRow({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <li className="flex items-center gap-3 rounded-xl border border-border p-3">
      <span className="grid h-8 w-8 place-items-center rounded-lg bg-muted text-muted-foreground">{icon}</span>
      <div className="min-w-0 flex-1">
        <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</p>
        <p className="truncate text-sm font-semibold">{value}</p>
      </div>
    </li>
  );
}

function ChatSheet({ app, from, onClose }: { app: Application; from: "employer" | "worker"; onClose: () => void }) {
  const store = useKazi();
  const [text, setText] = useState("");
  const threadId = `${app.jobId}:${app.id}`;
  const msgs = store.messages.filter((m) => m.threadId === threadId);
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [msgs.length]);

  function send(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    kaziStore.send(app.id, from, text);
    setText("");
  }

  return (
    <SheetShell title={`Chat · ${app.applicantName}`} onClose={onClose}>
      <p className="text-[11px] text-muted-foreground">About: {app.jobTitle}</p>
      <div className="mt-3 space-y-2">
        {msgs.length === 0 && (
          <p className="rounded-xl bg-muted p-3 text-xs text-muted-foreground">
            No messages yet. Say hello 👋
          </p>
        )}
        {msgs.map((m) => {
          const mine = m.from === from;
          return (
            <div key={m.id} className={`flex ${mine ? "justify-end" : "justify-start"}`}>
              <div className={`max-w-[80%] rounded-2xl px-3 py-2 text-sm ${mine ? "gradient-primary text-primary-foreground" : "bg-muted text-foreground"}`}>
                <p>{m.text}</p>
                <p className={`mt-0.5 text-[9px] ${mine ? "opacity-80" : "text-muted-foreground"}`}>
                  {new Date(m.at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </p>
              </div>
            </div>
          );
        })}
        <div ref={endRef} />
      </div>

      <form onSubmit={send} className="sticky bottom-0 mt-4 flex items-center gap-2 border-t border-border bg-card pt-3">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Type a message…"
          className="flex-1 rounded-full border border-border bg-background px-4 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring"
        />
        <button type="submit" className="grid h-10 w-10 place-items-center rounded-full gradient-primary text-primary-foreground">
          <Send className="h-4 w-4" />
        </button>
      </form>
    </SheetShell>
  );
}

function NotifSheet({ onClose }: { onClose: () => void }) {
  const store = useKazi();
  useEffect(() => { kaziStore.markAllRead(); }, []);
  return (
    <SheetShell title="Notifications" onClose={onClose}>
      {store.notifications.length === 0 ? (
        <EmptyState label="You're all caught up." />
      ) : (
        <ul className="space-y-2">
          {store.notifications.map((n) => (
            <li key={n.id} className="rounded-xl border border-border p-3">
              <p className="text-sm font-semibold">{n.title}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">{n.body}</p>
              <p className="mt-1 text-[10px] uppercase tracking-wider text-muted-foreground">
                {new Date(n.at).toLocaleString()}
              </p>
            </li>
          ))}
        </ul>
      )}
    </SheetShell>
  );
}

/* --------------------------------- Helpers -------------------------------- */

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

function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}
