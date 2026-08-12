import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Search, Star, MapPin, ShieldCheck, Plus, X, ArrowLeft, Upload, CheckCircle2,
  Send, Bell, Wallet, User as UserIcon, Phone, Mail, Briefcase, Clock, Loader2,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { jobCategories, workers } from "@/lib/mock";
import { useBalance } from "@/lib/balance";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

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

// ─── Types ────────────────────────────────────────────────────────────────────
interface Job {
  id: string;
  title: string;
  category: string;
  location: string;
  pay: string;
  payAmount: number;
  duration: string;
  description: string;
  badge: string;
  status: string;
  createdAt: string;
  employerId: string;
}

interface Application {
  id: string;
  jobId: string;
  jobTitle: string;
  jobPay: string;
  jobPayAmount: number;
  applicantName: string;
  phone: string;
  email: string;
  location: string;
  experience: string;
  availability: string;
  status: string;
  appliedAt: string;
  photoName: string | null;
  workerId: string;
  paidEscrow?: boolean;
  serviceFeePaid?: boolean;
}

function KaziPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("find");
  const [q, setQ] = useState("");
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [postJob, setPostJob] = useState(false);
  const [hireApp, setHireApp] = useState<Application | null>(null);
  const [chatApp, setChatApp] = useState<Application | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);

  // ─── Data state (from backend) ──────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);

  // ─── Fetch all data from backend ──────────────────────────────────────
  const fetchData = async () => {
    try {
      setLoading(true);
      const [jobsRes, appsRes, notifsRes] = await Promise.all([
        apiRequest("/kazi/jobs"),
        apiRequest("/kazi/applications"),
        apiRequest("/kazi/notifications"),
      ]);
      setJobs(jobsRes || []);
      setApplications(appsRes || []);
      setNotifications(notifsRes || []);
    } catch (err) {
      console.error("Failed to fetch KAZI data:", err);
      toast.error("Could not load KAZI Link data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // ─── Filtered jobs (Find Work) ──────────────────────────────────────────
  const visibleJobs = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = jobs.filter((j) => j.status === "open");
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
  }, [jobs, q]);

  // ─── Applicants for "Hire" tab ─────────────────────────────────────────
  const applicantsGrouped = useMemo(() => {
    const term = q.trim().toLowerCase();
    const myJobIds = new Set(jobs.filter((j) => j.employerId === user?.id).map((j) => j.id));
    let apps = applications.filter((a) => myJobIds.has(a.jobId));
    apps = apps.filter((a) => a.workerId !== user?.id);
    if (term) {
      apps = apps.filter(
        (a) =>
          a.applicantName.toLowerCase().includes(term) ||
          a.location.toLowerCase().includes(term) ||
          a.jobTitle.toLowerCase().includes(term),
      );
    }
    return apps;
  }, [applications, jobs, q, user]);

  // ─── Worker's own applications for "My Panel" ─────────────────────────
  const myApplications = useMemo(() => {
    return applications.filter((a) => a.workerId === user?.id);
  }, [applications, user]);

  const unread = notifications.filter((n) => !n.read).length;

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="KAZI Link" subtitle="Connecting workers and employers" />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </AppShell>
    );
  }

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
                      <Badge tone={j.badge === "Urgent" ? "destructive" : j.badge === "Hot" ? "warning" : "gold"}>
                        {j.badge}
                      </Badge>
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
          apps={myApplications}
          onChat={(a) => setChatApp(a)}
        />
      )}

      {applyJob && <ApplyJobSheet job={applyJob} onClose={() => setApplyJob(null)} onSuccess={fetchData} />}
      {postJob && <PostJobSheet onClose={() => setPostJob(false)} onSuccess={fetchData} />}
      {hireApp && <HireSheet app={hireApp} onClose={() => setHireApp(null)} onOpenChat={() => { setChatApp(hireApp); setHireApp(null); }} />}
      {chatApp && <ChatSheet app={chatApp} from="employer" onClose={() => setChatApp(null)} />}
      {notifOpen && <NotifSheet onClose={() => setNotifOpen(false)} />}
    </AppShell>
  );
}

// ─── Applicant Row ────────────────────────────────────────────────────────────
function ApplicantRow({ a, onHire, onChat }: { a: Application; onHire: () => void; onChat: () => void }) {
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
        <button onClick={onChat} className="rounded-full border border-border py-2 text-xs font-semibold">
          Message
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

// ─── My Panel ─────────────────────────────────────────────────────────────────
function MyPanel({ apps, onChat }: { apps: Application[]; onChat: (a: Application) => void }) {
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
        {apps.map((a) => (
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
            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onChat(a)}
                className="rounded-full border border-border py-2 text-xs font-semibold"
              >
                Chat with employer
              </button>
              <button
                disabled={a.status !== "Hired" || a.serviceFeePaid}
                onClick={() => {}}
                className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {a.serviceFeePaid ? "Paid ✓" : "Receive payout"}
              </button>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}

// ─── Sheets (Apply, Post, Hire, Chat, Notifications) ────────────────────
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

function ApplyJobSheet({ job, onClose, onSuccess }: { job: Job; onClose: () => void; onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const [form, setForm] = useState({
    applicantName: "", phone: "", email: "", location: "",
    experience: "", availability: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiRequest("/kazi/applications", {
        method: "POST",
        body: JSON.stringify({ jobId: job.id, ...form }),
      });
      toast.success("Application submitted!");
      setDone(true);
      onSuccess();
    } catch (err) {
      toast.error("Failed to apply");
    }
  }

  return (
    <SheetShell title="Apply for job" onClose={onClose}>
      {done ? (
        <SuccessBlock message={`Your application for "${job.title}" has been submitted.`} onClose={onClose} />
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <div><FieldLabel>Full name</FieldLabel><input required value={form.applicantName} onChange={set("applicantName")} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Phone</FieldLabel><input required value={form.phone} onChange={set("phone")} className={inputCls} /></div>
            <div><FieldLabel>Email</FieldLabel><input required type="email" value={form.email} onChange={set("email")} className={inputCls} /></div>
          </div>
          <div><FieldLabel>Location</FieldLabel><input required value={form.location} onChange={set("location")} className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Experience</FieldLabel><select required value={form.experience} onChange={set("experience")} className={inputCls}><option value="">Select</option><option>Less than 1</option><option>1-3</option><option>3-5</option><option>5+</option></select></div>
            <div><FieldLabel>Availability</FieldLabel><select required value={form.availability} onChange={set("availability")} className={inputCls}><option value="">Select</option><option>Immediate</option><option>1 week</option><option>2 weeks</option></select></div>
          </div>
          <FileField label="Upload photo" required accept="image/*" />
          <FileField label="CV (optional)" accept=".pdf,.doc,.docx" />
          <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Submit</button>
        </form>
      )}
    </SheetShell>
  );
}

// ─── FIXED PostJobSheet ─────────────────────────────────────────────────────
function PostJobSheet({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const [loading, setLoading] = useState(false);
  const [accommodation, setAccommodation] = useState(false);
  const [checked, setChecked] = useState<string[]>([]);
  const requirements = ["Experience required", "ID Required", "References", "Background check", "Own tools"];
  const [form, setForm] = useState({
    title: "", category: "", location: "", pay: "", payAmount: 0, duration: "", description: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const v = k === "payAmount" ? Number((e.target as HTMLInputElement).value) : e.target.value;
    setForm((f) => ({ ...f, [k]: v }));
  };

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      await apiRequest("/kazi/jobs", {
        method: "POST",
        body: JSON.stringify({
          title: form.title,
          category: form.category,
          location: form.location,
          pay: form.pay,
          payAmount: form.payAmount,
          duration: form.duration,
          accommodation,
          requirements: checked,
          description: form.description,
        }),
      });
      toast.success("Job posted successfully!");
      setDone(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to post job");
      setLoading(false);
    }
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
                <option>House Help</option><option>Cleaner</option><option>Tutor</option>
                <option>Gardener</option><option>Driver</option><option>Plumber</option>
                <option>Electrician</option><option>Security Guard</option><option>Event Worker</option>
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
              <option>1 day</option><option>3 days</option><option>1 week</option>
              <option>2 weeks</option><option>3 weeks</option><option>1 month</option>
              <option>3 months</option><option>6 months</option><option>Ongoing</option>
            </select>
          </div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div>
              <p className="text-sm font-semibold">Accommodation provided?</p>
              <p className="text-[11px] text-muted-foreground">Toggle if the role includes housing.</p>
            </div>
            <button
              type="button"
              onClick={() => setAccommodation(v => !v)}
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
                      setChecked(c => e.target.checked ? [...c, r] : c.filter(x => x !== r))
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

          <button
            type="submit"
            disabled={loading}
            className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Publishing..." : "Publish job"}
          </button>
        </form>
      )}
    </SheetShell>
  );
}

function HireSheet({ app, onClose, onOpenChat }: { app: Application; onClose: () => void; onOpenChat: () => void }) {
  const bal = useBalance();
  const [done, setDone] = useState(false);
  return (
    <SheetShell title="Applicant profile" onClose={onClose}>
      {done ? <SuccessBlock message={`${app.applicantName} hired!`} onClose={onClose} /> : (
        <div>
          <p>Hire {app.applicantName}</p>
          <button onClick={onOpenChat} className="border p-2 rounded">Chat</button>
          <button onClick={() => setDone(true)} className="mt-3 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Confirm Hire</button>
        </div>
      )}
    </SheetShell>
  );
}

function ChatSheet({ app, from, onClose }: { app: Application; from: string; onClose: () => void }) {
  const [text, setText] = useState("");
  return (
    <SheetShell title={`Chat · ${app.applicantName}`} onClose={onClose}>
      <div>Chat with {app.applicantName}</div>
      <input value={text} onChange={e => setText(e.target.value)} className="w-full border rounded p-2" />
      <button onClick={() => {}} className="mt-2 bg-primary text-white px-4 py-2 rounded">Send</button>
    </SheetShell>
  );
}

function NotifSheet({ onClose }: { onClose: () => void }) {
  return (
    <SheetShell title="Notifications" onClose={onClose}>
      <div>No notifications</div>
    </SheetShell>
  );
}

// ─── Helpers ───────────────────────────────────────────────────────────────────
function EmptyState({ label }: { label: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-border bg-muted/30 p-6 text-center text-xs text-muted-foreground">
      {label}
    </div>
  );
}

// ─── Exports for business.tsx ──────────────────────────────────────────────
export function FileField({ label, required, accept }: { label: string; required?: boolean; accept?: string }) {
  const [name, setName] = useState("");
  return (
    <div>
      <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{label}</label>
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
