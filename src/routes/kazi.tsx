import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  Search, Star, MapPin, ShieldCheck, Plus, X, ArrowLeft, Upload, CheckCircle2,
  Send, Bell, Wallet, User as UserIcon, Phone, Mail, Briefcase, Clock, Loader2,
  MessageCircle, Eye, UserCheck, Calendar, DollarSign, AlertCircle,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { createClient } from "@supabase/supabase-js";
import { fmt } from "@/lib/mock";

export const Route = createFileRoute("/kazi")({
  head: () => ({
    meta: [
      { title: "KAZI Link — PESAKI" },
      { name: "description", content: "Find work or hire trusted workers on KAZI Link — house helps, drivers, plumbers, tutors and more." },
    ],
  }),
  component: KaziPage,
});

const API_BASE = import.meta.env.VITE_PESAKI_API_URL || "https://pesaki-server.onrender.com";

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
  created_at: string;
  employer_id: string;
  hired_worker_id?: string;
  platform_fee?: number;
  total_held?: number;
  released_amount?: number;
}

interface Application {
  id: string;
  job_id: string;
  jobs?: {
    title: string;
    pay_label: string;
    pay_amount: number;
    employer_id: string;
    location: string;
    duration: string;
  };
  applicant_name: string;
  phone: string;
  email: string;
  location: string;
  experience: string;
  availability: string;
  status: string; // Pending, Hired, Rejected, Completed
  applied_at: string;
  photo_url?: string;
  worker_id: string;
}

interface JobContract {
  id: string;
  job_id: string;
  employer_id: string;
  worker_id: string;
  status: string; // active, completed, cancelled
  total_amount: number;
  platform_fee: number;
  worker_amount: number;
  start_date: string;
  end_date: string;
  next_payout_date: string;
  amount_released: number;
  amount_held: number;
}

interface ChatMessage {
  id: string;
  sender_id: string;
  receiver_id: string;
  job_id: string;
  message: string;
  created_at: string;
  read: boolean;
}

function KaziPage() {
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>("find");
  const [q, setQ] = useState("");
  const [applyJob, setApplyJob] = useState<Job | null>(null);
  const [postJob, setPostJob] = useState(false);
  const [hireApp, setHireApp] = useState<Application | null>(null);
  const [chatApp, setChatApp] = useState<{ application: Application; job: Job } | null>(null);
  const [notifOpen, setNotifOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedJob, setSelectedJob] = useState<Job | null>(null);
  const [showApplicants, setShowApplicants] = useState(false);
  const [contracts, setContracts] = useState<JobContract[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [messageInput, setMessageInput] = useState("");
  const hasFetched = useRef(false);

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  const getAuthToken = async () => {
    const { data } = await supabase.auth.getSession();
    return data.session?.access_token;
  };

  // ─── Data state ────────────────────────────────────────────────────────────
  const [jobs, setJobs] = useState<Job[]>([]);
  const [applications, setApplications] = useState<Application[]>([]);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [myPostedJobs, setMyPostedJobs] = useState<Job[]>([]);
  const [jobApplicants, setJobApplicants] = useState<Record<string, Application[]>>({});

  // ─── Fetch all data from backend ─────────────────────────────────────────
  const fetchData = async () => {
    if (!user) {
      setLoading(false);
      return;
    }
    if (hasFetched.current) return;
    hasFetched.current = true;
    setLoading(true);

    try {
      const token = await getAuthToken();

      // 1. Get all open jobs
      const jobsRes = await fetch(`${API_BASE}/kazi/jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (jobsRes.ok) {
        const jobsData = await jobsRes.json();
        setJobs(jobsData);
      }

      // 2. Get my applications (as worker)
      const myAppsRes = await fetch(`${API_BASE}/kazi/my-applications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (myAppsRes.ok) {
        const appsData = await myAppsRes.json();
        setApplications(appsData);
      }

      // 3. Get my posted jobs (as employer)
      const myJobsRes = await fetch(`${API_BASE}/kazi/my-jobs`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (myJobsRes.ok) {
        const jobsData = await myJobsRes.json();
        setMyPostedJobs(jobsData);
      }

      // 4. Get applicants for my jobs
      if (myPostedJobs.length > 0) {
        const applicantsRes = await fetch(`${API_BASE}/kazi/my-job-applicants`, {
          headers: { Authorization: `Bearer ${token}` },
        });
        if (applicantsRes.ok) {
          const data = await applicantsRes.json();
          setJobApplicants(data);
        }
      }

      // 5. Get active contracts
      const contractsRes = await fetch(`${API_BASE}/kazi/contracts`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (contractsRes.ok) {
        const contractsData = await contractsRes.json();
        setContracts(contractsData);
      }

      // 6. Get notifications
      const notifsRes = await fetch(`${API_BASE}/kazi/notifications`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (notifsRes.ok) {
        const notifsData = await notifsRes.json();
        setNotifications(notifsData || []);
      }

    } catch (err) {
      console.error('Failed to fetch KAZI data:', err);
      toast.error('Could not load KAZI Link data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user && !hasFetched.current) fetchData();
    if (!user) setLoading(false);
  }, [user?.id]);

  const refreshData = () => {
    hasFetched.current = false;
    fetchData();
  };

  // ─── Filtered jobs ────────────────────────────────────────────────────────
  const visibleJobs = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = jobs;
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
              {["House Help", "Cleaner", "Tutor", "Gardener", "Driver", "Plumber", "Electrician", "Security", "Event Worker"].map((c) => (
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
                  <JobCard
                    key={j.id}
                    job={j}
                    onApply={() => setApplyJob(j)}
                  />
                ))}
              </div>
            )}
          </section>
        </>
      )}

      {tab === "hire" && (
        <EmployerView
          postedJobs={myPostedJobs}
          jobApplicants={jobApplicants}
          onChat={(jobId, application) => {
            const job = myPostedJobs.find(j => j.id === jobId);
            if (job) setChatApp({ application, job });
          }}
          onHire={(app) => setHireApp(app)}
          onRefresh={refreshData}
        />
      )}

      {tab === "mine" && (
        <MyPanel
          apps={applications}
          postedJobs={myPostedJobs}
          contracts={contracts}
          onChat={(app, job) => setChatApp({ application: app, job })}
          onRefresh={refreshData}
          user={user}
        />
      )}

      {applyJob && <ApplyJobSheet job={applyJob} onClose={() => setApplyJob(null)} onSuccess={refreshData} user={user} />}
      {postJob && <PostJobSheet onClose={() => setPostJob(false)} onSuccess={refreshData} user={user} />}
      {hireApp && <HireSheet app={hireApp} onClose={() => setHireApp(null)} onHireSuccess={refreshData} user={user} />}
      {chatApp && (
        <ChatSheet
          application={chatApp.application}
          job={chatApp.job}
          onClose={() => setChatApp(null)}
          user={user}
        />
      )}
      {notifOpen && <NotifSheet notifications={notifications} onClose={() => setNotifOpen(false)} />}
    </AppShell>
  );
}

// ─── Job Card ────────────────────────────────────────────────────────────────
function JobCard({ job, onApply }: { job: Job; onApply: () => void }) {
  return (
    <Card className="!p-3.5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold">{job.title}</p>
          <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
            <MapPin className="h-3 w-3" /> {job.location}
          </p>
          <p className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
            <Clock className="h-3 w-3" /> {job.duration}
          </p>
          <p className="mt-1 text-sm font-bold text-primary">{job.pay}</p>
          <p className="mt-0.5 text-[10px] text-muted-foreground">10% platform fee applies</p>
        </div>
        <Badge tone={job.badge === "Urgent" ? "destructive" : job.badge === "Hot" ? "warning" : "gold"}>
          {job.badge}
        </Badge>
      </div>
      <button
        onClick={onApply}
        className="mt-3 w-full rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground"
      >
        Apply now
      </button>
    </Card>
  );
}

// ─── Employer View ──────────────────────────────────────────────────────────
function EmployerView({ postedJobs, jobApplicants, onChat, onHire, onRefresh }: any) {
  if (postedJobs.length === 0) {
    return (
      <section className="mt-6 px-5">
        <EmptyState label="You haven't posted any jobs yet. Post a job to receive applications." />
      </section>
    );
  }

  return (
    <section className="mt-5 px-5">
      <SectionTitle title={`My posted jobs (${postedJobs.length})`} />
      <div className="space-y-3">
        {postedJobs.map((job: Job) => {
          const applicants = jobApplicants[job.id] || [];
          const hired = applicants.filter((a: any) => a.status === 'Hired');
          const pending = applicants.filter((a: any) => a.status === 'Pending');

          return (
            <Card key={job.id} className="!p-4">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-sm font-semibold">{job.title}</p>
                  <p className="text-xs text-muted-foreground">{job.location} · {job.duration}</p>
                  <p className="mt-1 text-sm font-bold text-primary">{job.pay}</p>
                </div>
                <Badge tone={job.status === 'open' ? 'success' : 'warning'}>
                  {job.status}
                </Badge>
              </div>

              <div className="mt-3 flex gap-4 text-xs">
                <span>Applicants: <strong>{applicants.length}</strong></span>
                <span>Pending: <strong>{pending.length}</strong></span>
                <span>Hired: <strong>{hired.length}</strong></span>
              </div>

              {applicants.length > 0 && (
                <div className="mt-3 space-y-2">
                  <p className="text-[11px] font-semibold text-muted-foreground">Recent applicants:</p>
                  {applicants.slice(0, 3).map((app: Application) => (
                    <ApplicantMiniCard
                      key={app.id}
                      application={app}
                      onChat={() => onChat(job.id, app)}
                      onHire={() => onHire(app)}
                    />
                  ))}
                  {applicants.length > 3 && (
                    <button className="text-xs text-primary font-semibold">
                      View all {applicants.length} applicants
                    </button>
                  )}
                </div>
              )}
            </Card>
          );
        })}
      </div>
    </section>
  );
}

// ─── Applicant Mini Card ──────────────────────────────────────────────────
function ApplicantMiniCard({ application, onChat, onHire }: any) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-border p-2.5">
      <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
        {application.photo_url ? (
          <img src={application.photo_url} alt="" className="h-10 w-10 rounded-full object-cover" />
        ) : (
          application.applicant_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
        )}
      </div>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold truncate">{application.applicant_name}</p>
        <p className="text-[10px] text-muted-foreground">{application.experience} yrs exp · {application.location}</p>
      </div>
      <div className="flex gap-1.5">
        <button
          onClick={onChat}
          className="grid h-8 w-8 place-items-center rounded-full border border-border text-muted-foreground hover:bg-muted"
        >
          <MessageCircle className="h-3.5 w-3.5" />
        </button>
        {application.status !== 'Hired' && (
          <button
            onClick={onHire}
            className="grid h-8 w-8 place-items-center rounded-full gradient-primary text-primary-foreground"
          >
            <UserCheck className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}

// ─── My Panel ─────────────────────────────────────────────────────────────────
function MyPanel({ apps, postedJobs, contracts, onChat, onRefresh, user }: any) {
  const [activeTab, setActiveTab] = useState<"applications" | "jobs" | "contracts">("applications");

  return (
    <section className="mt-5 px-5">
      <div className="flex gap-1 rounded-full bg-muted p-1 mb-4">
        <button
          onClick={() => setActiveTab("applications")}
          className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold ${
            activeTab === "applications" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          My Applications
        </button>
        <button
          onClick={() => setActiveTab("jobs")}
          className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold ${
            activeTab === "jobs" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          My Jobs
        </button>
        <button
          onClick={() => setActiveTab("contracts")}
          className={`flex-1 rounded-full py-1.5 text-[11px] font-semibold ${
            activeTab === "contracts" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
          }`}
        >
          Active Contracts
        </button>
      </div>

      {activeTab === "applications" && (
        <WorkerApplications
          apps={apps}
          onChat={(app) => {
            const job = app.jobs;
            if (job) onChat(app, job);
          }}
          onRefresh={onRefresh}
          user={user}
        />
      )}

      {activeTab === "jobs" && (
        <div className="space-y-3">
          {postedJobs.length === 0 ? (
            <EmptyState label="You haven't posted any jobs yet." />
          ) : (
            postedJobs.map((job: Job) => (
              <Card key={job.id} className="!p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-sm font-semibold">{job.title}</p>
                    <p className="text-xs text-muted-foreground">{job.location} · {job.duration}</p>
                    <p className="mt-1 text-sm font-bold text-primary">{job.pay}</p>
                  </div>
                  <Badge tone={job.status === 'open' ? 'success' : 'warning'}>
                    {job.status}
                  </Badge>
                </div>
                {job.hired_worker_id && (
                  <p className="mt-2 text-xs text-success">✓ Worker hired</p>
                )}
              </Card>
            ))
          )}
        </div>
      )}

      {activeTab === "contracts" && (
        <ActiveContracts
          contracts={contracts}
          onRefresh={onRefresh}
          user={user}
        />
      )}
    </section>
  );
}

// ─── Worker Applications ──────────────────────────────────────────────────
function WorkerApplications({ apps, onChat, onRefresh, user }: any) {
  const [withdrawing, setWithdrawing] = useState<string | null>(null);

  const handleWithdraw = async (contractId: string) => {
    setWithdrawing(contractId);
    try {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        import.meta.env.VITE_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/withdraw`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contractId }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Withdrawal failed");
      toast.success("Payment withdrawn successfully!");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Withdrawal failed");
    } finally {
      setWithdrawing(null);
    }
  };

  if (apps.length === 0) {
    return <EmptyState label="You haven't applied to any jobs yet. Head to Find Work to get started." />;
  }

  return (
    <div className="space-y-2.5">
      {apps.map((a: any) => {
        const job = a.jobs;
        const isHired = a.status === 'Hired';
        const isCompleted = a.status === 'Completed';
        const isRejected = a.status === 'Rejected';

        return (
          <Card key={a.id} className="!p-3.5">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-semibold">{job?.title || 'Unknown'}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">{job?.pay_label || 'KES 0'}</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">
                  Applied {new Date(a.applied_at).toLocaleDateString()}
                </p>
                {a.status === 'Hired' && (
                  <div className="mt-2 flex items-center gap-2">
                    <Badge tone="success">Hired</Badge>
                    {a.contract && (
                      <span className="text-[10px] text-muted-foreground">
                        {a.contract.amount_released > 0 ? `Released: ${fmt(a.contract.amount_released)}` : 'Awaiting first payout'}
                      </span>
                    )}
                  </div>
                )}
                {a.status === 'Completed' && (
                  <Badge tone="gold">Completed</Badge>
                )}
                {a.status === 'Rejected' && (
                  <Badge tone="destructive">Rejected</Badge>
                )}
              </div>
              <Badge tone={a.status === "Hired" ? "success" : a.status === "Rejected" ? "destructive" : a.status === "Completed" ? "gold" : "primary"}>
                {a.status}
              </Badge>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2">
              <button
                onClick={() => onChat(a)}
                className="rounded-full border border-border py-2 text-xs font-semibold"
              >
                <MessageCircle className="inline h-3.5 w-3.5 mr-1" /> Chat
              </button>
              {a.status === 'Hired' && a.contract && (
                <button
                  onClick={() => handleWithdraw(a.contract.id)}
                  disabled={withdrawing === a.contract.id || a.contract.amount_released <= 0}
                  className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
                >
                  {withdrawing === a.contract.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                  ) : (
                    `Withdraw ${fmt(a.contract.amount_released)}`
                  )}
                </button>
              )}
              {a.status === 'Completed' && (
                <button
                  className="rounded-full gradient-gold py-2 text-xs font-semibold text-gold-foreground"
                >
                  View Summary
                </button>
              )}
            </div>
          </Card>
        );
      })}
    </div>
  );
}

// ─── Active Contracts ────────────────────────────────────────────────────
function ActiveContracts({ contracts, onRefresh, user }: any) {
  const [starting, setStarting] = useState<string | null>(null);

  const handleStartJob = async (contractId: string) => {
    setStarting(contractId);
    try {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        import.meta.env.VITE_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/start-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ contractId }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to start job");
      toast.success("Job started! Countdown for payouts has begun.");
      onRefresh();
    } catch (err: any) {
      toast.error(err.message || "Failed to start job");
    } finally {
      setStarting(null);
    }
  };

  if (contracts.length === 0) {
    return <EmptyState label="No active contracts. When you hire someone, it will appear here." />;
  }

  return (
    <div className="space-y-3">
      {contracts.map((c: any) => {
        const isEmployer = c.employer_id === user?.id;
        const totalDays = Math.ceil((new Date(c.end_date).getTime() - new Date(c.start_date).getTime()) / (1000 * 60 * 60 * 24));
        const daysElapsed = Math.ceil((new Date().getTime() - new Date(c.start_date).getTime()) / (1000 * 60 * 60 * 24));
        const progress = Math.min(100, Math.round((daysElapsed / totalDays) * 100));

        return (
          <Card key={c.id} className="!p-4">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-sm font-semibold">{c.job_title || 'Job'}</p>
                <p className="text-xs text-muted-foreground">
                  {isEmployer ? 'Employer' : 'Worker'} · {c.status}
                </p>
              </div>
              <Badge tone={c.status === 'active' ? 'success' : 'gold'}>
                {c.status}
              </Badge>
            </div>

            <div className="mt-3">
              <div className="flex justify-between text-xs">
                <span className="text-muted-foreground">Progress</span>
                <span>{progress}%</span>
              </div>
              <div className="mt-1 h-2 w-full rounded-full bg-muted">
                <div className="h-2 rounded-full gradient-primary" style={{ width: `${progress}%` }} />
              </div>
            </div>

            <div className="mt-3 grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-muted-foreground">Total Amount</p>
                <p className="font-semibold">{fmt(c.total_amount)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Released</p>
                <p className="font-semibold text-success">{fmt(c.amount_released)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Held</p>
                <p className="font-semibold text-warning">{fmt(c.amount_held)}</p>
              </div>
              <div>
                <p className="text-muted-foreground">Platform Fee</p>
                <p className="font-semibold text-muted-foreground">{fmt(c.platform_fee)}</p>
              </div>
            </div>

            {isEmployer && c.status === 'active' && c.amount_released === 0 && (
              <button
                onClick={() => handleStartJob(c.id)}
                disabled={starting === c.id}
                className="mt-3 w-full rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground disabled:opacity-50"
              >
                {starting === c.id ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin inline" />
                ) : (
                  'Start Job & Release First Payout'
                )}
              </button>
            )}

            {isEmployer && c.status === 'active' && c.amount_released > 0 && (
              <p className="mt-2 text-xs text-muted-foreground">
                Next payout will be released automatically based on the job duration.
              </p>
            )}

            {!isEmployer && c.status === 'active' && c.amount_released > 0 && (
              <p className="mt-2 text-xs text-success">
                ✅ {fmt(c.amount_released)} available for withdrawal
              </p>
            )}
          </Card>
        );
      })}
    </div>
  );
}

// ─── Sheets ──────────────────────────────────────────────────────────────────
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

// ─── FileField ──────────────────────────────────────────────────────────────
export function FileField({
  label,
  accept,
  onChange,
}: {
  label?: string;
  accept?: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}) {
  return (
    <div>
      {label && <FieldLabel>{label}</FieldLabel>}
      <input
        type="file"
        accept={accept}
        onChange={onChange}
        className={inputCls}
      />
    </div>
  );
}

// ─── ApplyJobSheet ──────────────────────────────────────────────────────────
function ApplyJobSheet({ job, onClose, onSuccess, user }: any) {
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState({
    applicantName: user?.user_metadata?.full_name || "",
    phone: user?.user_metadata?.phone || "",
    email: user?.email || "",
    location: "",
    experience: "",
    availability: "",
    photo_url: "",
  });
  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/apply`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          job_id: job.id,
          applicant_name: form.applicantName,
          phone: form.phone,
          email: form.email,
          location: form.location,
          experience: form.experience,
          availability: form.availability,
          photo_url: form.photo_url,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to apply");

      toast.success('Application submitted!');
      setDone(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to apply');
      console.error(err);
    } finally {
      setSubmitting(false);
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
          <div><FieldLabel>Photo (URL or upload later)</FieldLabel><input value={form.photo_url} onChange={set("photo_url")} className={inputCls} placeholder="https://..." /></div>
          <button type="submit" disabled={submitting} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">
            {submitting ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Submit Application'}
          </button>
        </form>
      )}
    </SheetShell>
  );
}

// ─── PostJobSheet ───────────────────────────────────────────────────────────
function PostJobSheet({ onClose, onSuccess, user }: any) {
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

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/post-job`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          ...form,
          accommodation,
          requirements: checked,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to post job");

      toast.success('Job posted successfully!');
      setDone(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Failed to post job');
      console.error(err);
    } finally {
      setLoading(false);
    }
  }

  return (
    <SheetShell title="Post a Job" onClose={onClose}>
      {done ? (
        <SuccessBlock message="Your job is now live and visible in Find Work. 10% platform fee will be deducted upon hiring." onClose={onClose} />
      ) : (
        <form className="space-y-3" onSubmit={submit}>
          <div><FieldLabel>Job title</FieldLabel><input required value={form.title} onChange={set("title")} className={inputCls} placeholder="e.g. Live-in House Help" /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Category</FieldLabel><select required value={form.category} onChange={set("category")} className={inputCls}><option value="">Select</option><option>House Help</option><option>Cleaner</option><option>Tutor</option><option>Gardener</option><option>Driver</option><option>Plumber</option><option>Electrician</option><option>Security Guard</option><option>Event Worker</option><option>Other</option></select></div>
            <div><FieldLabel>Location</FieldLabel><input required value={form.location} onChange={set("location")} className={inputCls} placeholder="Karen, Nairobi" /></div>
          </div>

          <div><FieldLabel>Duration</FieldLabel><select required value={form.duration} onChange={set("duration")} className={inputCls}><option value="">Select</option><option>1 day</option><option>3 days</option><option>1 week</option><option>2 weeks</option><option>3 weeks</option><option>1 month</option><option>3 months</option><option>6 months</option><option>Ongoing</option></select></div>

          <div className="flex items-center justify-between rounded-xl border border-border p-3">
            <div><p className="text-sm font-semibold">Accommodation provided?</p><p className="text-[11px] text-muted-foreground">Toggle if the role includes housing.</p></div>
            <button type="button" onClick={() => setAccommodation(v => !v)} className={`relative h-6 w-11 rounded-full transition-colors ${accommodation ? "bg-primary" : "bg-muted"}`}><span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${accommodation ? "left-[22px]" : "left-0.5"}`} /></button>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Pay label</FieldLabel><input required value={form.pay} onChange={set("pay")} className={inputCls} placeholder="e.g. KES 25,000/mo" /></div>
            <div><FieldLabel>Pay amount (KES)</FieldLabel><input required type="number" min={1} value={form.payAmount || ""} onChange={set("payAmount")} className={inputCls} placeholder="25000" /></div>
          </div>

          <div><FieldLabel>Requirements</FieldLabel><div className="mt-1 grid grid-cols-2 gap-2">{requirements.map(r => <label key={r} className="flex items-center gap-2 rounded-lg border border-border p-2 text-xs"><input type="checkbox" className="h-4 w-4 accent-primary" checked={checked.includes(r)} onChange={e => setChecked(c => e.target.checked ? [...c, r] : c.filter(x => x !== r))} />{r}</label>)}</div></div>

          <div><FieldLabel>Description</FieldLabel><textarea required rows={4} value={form.description} onChange={set("description")} className={inputCls} placeholder="Describe duties, working hours, expectations…" /></div>

          <div className="rounded-xl bg-primary/5 p-3 text-xs">
            <p className="font-semibold">ℹ️ Platform fee: 10% of the total job payment will be deducted when you hire a worker.</p>
          </div>

          <button type="submit" disabled={loading} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {loading ? "Publishing..." : "Publish job"}
          </button>
        </form>
      )}
    </SheetShell>
  );
}

// ─── HireSheet ──────────────────────────────────────────────────────────────
function HireSheet({ app, onClose, onHireSuccess, user }: any) {
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const handleHire = async () => {
    setLoading(true);
    try {
      const supabase = createClient(
        import.meta.env.VITE_SUPABASE_URL!,
        import.meta.env.VITE_SUPABASE_ANON_KEY!
      );
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/hire`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          applicationId: app.id,
          jobId: app.job_id,
        }),
      });

      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "Failed to hire");

      toast.success(`You have hired ${app.applicant_name}!`);
      setDone(true);
      onHireSuccess();
      setTimeout(() => onClose(), 3000);
    } catch (err: any) {
      toast.error(err.message || "Failed to hire");
    } finally {
      setLoading(false);
    }
  };

  if (done) {
    return (
      <SheetShell title="Hired!" onClose={onClose}>
        <div className="py-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold">Worker hired successfully</p>
          <p className="mt-1 text-xs text-muted-foreground">
            {app.applicant_name} has been hired for the job.
          </p>
          <p className="mt-2 text-xs text-muted-foreground">
            💰 Total amount: {app.jobs?.pay_label}
          </p>
          <p className="text-xs text-muted-foreground">
            📊 Platform fee (10%): will be deducted from the total.
          </p>
          <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
            Done
          </button>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title="Hire Worker" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full bg-primary/10 text-xl font-bold text-primary">
            {app.photo_url ? (
              <img src={app.photo_url} alt="" className="h-14 w-14 rounded-full object-cover" />
            ) : (
              app.applicant_name.split(" ").map((n: string) => n[0]).slice(0, 2).join("").toUpperCase()
            )}
          </div>
          <div>
            <p className="text-base font-bold">{app.applicant_name}</p>
            <p className="text-xs text-muted-foreground">{app.location} · {app.experience} yrs exp</p>
            <p className="text-xs text-muted-foreground">📱 {app.phone} · ✉️ {app.email}</p>
          </div>
        </div>

        <div className="rounded-xl bg-muted/60 p-3 text-xs">
          <p><span className="font-semibold">Job:</span> {app.jobs?.title}</p>
          <p><span className="font-semibold">Pay:</span> {app.jobs?.pay_label}</p>
          <p><span className="font-semibold">Duration:</span> {app.jobs?.duration}</p>
          <p><span className="font-semibold">Availability:</span> {app.availability}</p>
        </div>

        <div className="rounded-xl bg-warning/10 p-3 text-xs text-warning-foreground">
          <p className="font-semibold">⚠️ Important</p>
          <p>10% platform fee will be deducted from the total job amount.</p>
          <p>You can start the job and release payouts after hiring.</p>
        </div>

        <button
          onClick={handleHire}
          disabled={loading}
          className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin inline" /> : 'Confirm Hire'}
        </button>
      </div>
    </SheetShell>
  );
}

// ─── ChatSheet ──────────────────────────────────────────────────────────────
function ChatSheet({ application, job, onClose, user }: any) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const supabase = createClient(
    import.meta.env.VITE_SUPABASE_URL!,
    import.meta.env.VITE_SUPABASE_ANON_KEY!
  );

  const fetchMessages = async () => {
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/messages?jobId=${job.id}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) {
        const data = await response.json();
        setMessages(data);
      }
    } catch (err) {
      console.error('Failed to fetch messages:', err);
    } finally {
      setLoading(false);
    }
  };

  const sendMessage = async () => {
    if (!input.trim()) return;
    setSending(true);
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;

      const response = await fetch(`${API_BASE}/kazi/send-message`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          jobId: job.id,
          receiverId: application.worker_id === user?.id ? job.employer_id : application.worker_id,
          message: input,
        }),
      });

      if (response.ok) {
        const newMessage = await response.json();
        setMessages(prev => [newMessage, ...prev]);
        setInput("");
      }
    } catch (err) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  useEffect(() => {
    fetchMessages();
    const interval = setInterval(fetchMessages, 5000);
    return () => clearInterval(interval);
  }, [job.id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const otherUser = application.worker_id === user?.id ? 'Employer' : application.applicant_name;

  return (
    <div className="fixed inset-0 z-[70] grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 flex h-[92vh] w-full max-w-md flex-col rounded-t-3xl bg-card shadow-2xl sm:rounded-3xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-3">
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex items-center gap-2">
            <h3 className="text-base font-bold">Chat</h3>
            <Badge tone="primary">{otherUser}</Badge>
          </div>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4 space-y-3">
          {loading ? (
            <div className="flex justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="text-center py-8 text-xs text-muted-foreground">No messages yet. Start a conversation.</div>
          ) : (
            messages.map((msg) => {
              const isOwn = msg.sender_id === user?.id;
              return (
                <div key={msg.id} className={`flex ${isOwn ? 'justify-end' : 'justify-start'}`}>
                  <div className={`max-w-[80%] rounded-2xl px-4 py-2 text-sm ${isOwn ? 'gradient-primary text-primary-foreground' : 'bg-muted'}`}>
                    <p>{msg.message}</p>
                    <p className="mt-1 text-[10px] opacity-70">{new Date(msg.created_at).toLocaleTimeString()}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={messagesEndRef} />
        </div>

        <div className="border-t border-border p-3">
          <div className="flex gap-2">
            <input
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Type a message..."
              className="flex-1 rounded-full border border-border bg-background px-4 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={sendMessage}
              disabled={sending || !input.trim()}
              className="grid h-10 w-10 place-items-center rounded-full gradient-primary text-primary-foreground disabled:opacity-50"
            >
              {sending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── NotifSheet ────────────────────────────────────────────────────────────
function NotifSheet({ notifications, onClose }: any) {
  return (
    <SheetShell title="Notifications" onClose={onClose}>
      {notifications.length === 0 ? (
        <EmptyState label="No notifications" />
      ) : (
        <div className="space-y-2.5">
          {notifications.map((n: any) => (
            <Card key={n.id} className="!p-3.5">
              <p className="text-sm">{n.message}</p>
              <p className="mt-0.5 text-[10px] text-muted-foreground">{new Date(n.created_at).toLocaleString()}</p>
            </Card>
          ))}
        </div>
      )}
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
