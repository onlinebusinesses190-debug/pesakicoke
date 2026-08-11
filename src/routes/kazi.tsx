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
                  {/* ... (unchanged) ... */}
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

/* ---------- The rest of your existing components (ApplicantRow, MyPanel, etc.) remain exactly as they are ---------- */
