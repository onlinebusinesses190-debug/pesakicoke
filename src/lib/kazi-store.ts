import { useSyncExternalStore } from "react";
import { balanceStore } from "@/lib/balance";

export type PostedJob = {
  id: string;
  title: string;
  category: string;
  location: string;
  pay: string;
  payAmount: number;      // numeric for escrow
  duration: string;       // e.g. "1 month", "3 weeks"
  accommodation: boolean;
  requirements: string[];
  description: string;
  postedBy: string;
  postedAt: number;
  badge: "New" | "Urgent" | "Hot";
  status: "Open" | "Filled" | "Closed";
  hiredApplicantId?: string;
};

export type Application = {
  id: string;
  jobId: string;
  jobTitle: string;
  jobPay: string;
  applicantName: string;
  phone: string;
  email: string;
  location: string;
  experience: string;
  availability: string;
  photoName?: string;
  cvName?: string;
  appliedAt: number;
  status: "Pending" | "Shortlisted" | "Hired" | "Rejected";
  paidEscrow: boolean;
  serviceFeePaid: boolean;
};

export type ChatMessage = {
  id: string;
  threadId: string;   // `${jobId}:${applicationId}`
  from: "employer" | "worker";
  text: string;
  at: number;
};

export type Notif = {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
};

type State = {
  jobs: PostedJob[];
  applications: Application[];
  messages: ChatMessage[];
  notifications: Notif[];
  firstJobPayoutDone: boolean; // for KES 200 service fee (once)
};

const STORAGE_KEY = "pesaki:kazi:v1";

const initial: State = {
  jobs: [
    { id: "j1", title: "Live-in House Help", category: "House Help", location: "Karen, Nairobi", pay: "KES 25,000/mo", payAmount: 25000, duration: "1 month", accommodation: true, requirements: ["Experience required", "ID Required"], description: "Cooking, cleaning and laundry for a small family.", postedBy: "Mwangi Family", postedAt: Date.now() - 86400000, badge: "Urgent", status: "Open" },
    { id: "j2", title: "Evening Tutor (Math)", category: "Tutor", location: "Kileleshwa", pay: "KES 1,200/hr", payAmount: 1200, duration: "3 months", accommodation: false, requirements: ["Experience required"], description: "Grade 8 math coaching, 3 evenings/week.", postedBy: "Achieng W.", postedAt: Date.now() - 3600000, badge: "New", status: "Open" },
    { id: "j3", title: "Event Cleaner", category: "Cleaner", location: "Westlands", pay: "KES 1,800/day", payAmount: 1800, duration: "2 weeks", accommodation: false, requirements: ["ID Required"], description: "Corporate event cleanup shifts.", postedBy: "Nairobi Events Co.", postedAt: Date.now() - 7200000, badge: "Hot", status: "Open" },
  ],
  applications: [],
  messages: [],
  notifications: [],
  firstJobPayoutDone: false,
};

function load(): State {
  if (typeof window === "undefined") return initial;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return initial;
    return { ...initial, ...JSON.parse(raw) } as State;
  } catch { return initial; }
}

let state: State = initial;
let hydrated = false;
const listeners = new Set<() => void>();

function ensure() { if (!hydrated && typeof window !== "undefined") { state = load(); hydrated = true; } }
function persist() { if (typeof window !== "undefined") { try { localStorage.setItem(STORAGE_KEY, JSON.stringify(state)); } catch {} } }
function set(next: State) { state = next; persist(); listeners.forEach((l) => l()); }
function subscribe(cb: () => void) { ensure(); listeners.add(cb); return () => listeners.delete(cb); }
function getSnapshot() { ensure(); return state; }

function notify(title: string, body: string) {
  const n: Notif = { id: `n${Date.now()}${Math.random().toString(36).slice(2,6)}`, title, body, at: Date.now(), read: false };
  set({ ...state, notifications: [n, ...state.notifications] });
}

export const kaziStore = {
  postJob(input: Omit<PostedJob, "id" | "postedAt" | "badge" | "status">) {
    const job: PostedJob = { ...input, id: `j${Date.now()}`, postedAt: Date.now(), badge: "New", status: "Open" };
    set({ ...state, jobs: [job, ...state.jobs] });
    notify("Job posted", `"${job.title}" is now live on KAZI Link.`);
    return job;
  },
  apply(jobId: string, data: Omit<Application, "id" | "jobId" | "jobTitle" | "jobPay" | "appliedAt" | "status" | "paidEscrow" | "serviceFeePaid">) {
    const job = state.jobs.find((j) => j.id === jobId);
    if (!job) return null;
    const app: Application = {
      ...data,
      id: `a${Date.now()}`,
      jobId,
      jobTitle: job.title,
      jobPay: job.pay,
      appliedAt: Date.now(),
      status: "Pending",
      paidEscrow: false,
      serviceFeePaid: false,
    };
    set({ ...state, applications: [app, ...state.applications] });
    notify("Application submitted", `You applied for "${job.title}".`);
    return app;
  },
  /** Employer deposits pay into escrow and hires the applicant. */
  hireAndDeposit(applicationId: string): { ok: boolean; error?: string } {
    const app = state.applications.find((a) => a.id === applicationId);
    if (!app) return { ok: false, error: "Applicant not found" };
    const job = state.jobs.find((j) => j.id === app.jobId);
    if (!job) return { ok: false, error: "Job not found" };
    const res = balanceStore.withdraw(job.payAmount, "M-Pesa");
    // Use deposit-esque decrement without fee: we prefer a direct debit -> use custom txn via balanceStore.transfer alternative
    // Fallback: if withdraw fails due to fee, just check available manually.
    if (!res.ok) return { ok: false, error: res.error };
    const updatedApps = state.applications.map((a) =>
      a.id === applicationId ? { ...a, status: "Hired" as const, paidEscrow: true } : a
    );
    // Close other applicants on this job -> Rejected
    const closedOthers = updatedApps.map((a) =>
      a.jobId === app.jobId && a.id !== applicationId && a.status !== "Hired" ? { ...a, status: "Rejected" as const } : a
    );
    const updatedJobs = state.jobs.map((j) =>
      j.id === app.jobId ? { ...j, status: "Filled" as const, hiredApplicantId: app.id } : j
    );
    set({ ...state, applications: closedOthers, jobs: updatedJobs });
    notify("Hired", `You hired ${app.applicantName} for "${job.title}". Escrow funded.`);
    return { ok: true };
  },
  send(applicationId: string, from: ChatMessage["from"], text: string) {
    const t = text.trim();
    if (!t) return;
    const app = state.applications.find((a) => a.id === applicationId);
    if (!app) return;
    const msg: ChatMessage = {
      id: `m${Date.now()}${Math.random().toString(36).slice(2,6)}`,
      threadId: `${app.jobId}:${app.id}`,
      from, text: t, at: Date.now(),
    };
    set({ ...state, messages: [...state.messages, msg] });
  },
  markAllRead() {
    set({ ...state, notifications: state.notifications.map((n) => ({ ...n, read: true })) });
  },
  /** Called when a worker is paid out (mock). Applies once-only KES 200 service fee + 1% insurance. */
  registerPayout(applicationId: string): { net: number; serviceFee: number; insurance: number } | null {
    const app = state.applications.find((a) => a.id === applicationId);
    if (!app) return null;
    const job = state.jobs.find((j) => j.id === app.jobId);
    if (!job) return null;
    const gross = job.payAmount;
    const serviceFee = state.firstJobPayoutDone ? 0 : 200;
    const insurance = Math.round(gross * 0.01);
    const net = gross - serviceFee - insurance;
    set({
      ...state,
      firstJobPayoutDone: true,
      applications: state.applications.map((a) => a.id === applicationId ? { ...a, serviceFeePaid: true } : a),
    });
    notify("Payment received", `${job.title}: net KES ${net.toLocaleString()} (fee ${serviceFee}, insurance ${insurance}).`);
    return { net, serviceFee, insurance };
  },
};

export function useKazi() {
  return useSyncExternalStore(subscribe, getSnapshot, () => initial);
}

export function unreadCount(s: State) {
  return s.notifications.filter((n) => !n.read).length;
}
