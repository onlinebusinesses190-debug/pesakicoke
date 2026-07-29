import { createFileRoute } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import {
  Building2, FileText, TrendingUp, Award, BookOpen, ChevronRight, X, ArrowLeft,
  Rocket, Store, Calendar, CheckCircle2, Clock,
} from "lucide-react";
import { toast } from "sonner";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { apiRequest } from "@/utils/api";
import { FileField, SuccessBlock } from "./kazi";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Business Hub — PESAKI" },
      { name: "description", content: "Apply for funding, manage applications, and grow your business through PESAKI Business Hub." },
    ],
  }),
  component: BusinessPage,
});

type ActionKey = "apply" | "apps" | "invest" | "stories" | "guide";
const sections: { label: string; icon: any; tone: string; key: ActionKey }[] = [
  { label: "Apply for Funding",  icon: FileText,    tone: "primary", key: "apply" },
  { label: "My Applications",    icon: Building2,   tone: "gold",    key: "apps" },
  { label: "My Investments",     icon: TrendingUp,  tone: "success", key: "invest" },
  { label: "Success Stories",    icon: Award,       tone: "gold",    key: "stories" },
  { label: "Funding Guidelines", icon: BookOpen,    tone: "primary", key: "guide" },
];

// ── Helper: format currency ──────────────────────────────────────────────────
const fmt = (amount: number) => {
  return new Intl.NumberFormat('en-KE', { style: 'currency', currency: 'KES', minimumFractionDigits: 0 }).format(amount);
};

// ── Default Success Stories (always visible to motivate new users) ──────────
const DEFAULT_SUCCESS_STORIES = [
  {
    name: "Wanjiku's Fresh Produce",
    grew: "Grew 3x in 6 months",
    quote: "PESAKI funding helped me buy a refrigerated truck. My profits tripled and I now supply 5 major supermarkets."
  },
  {
    name: "Tech4Kids Academy",
    grew: "Expanded to 4 branches",
    quote: "We used the funds to set up two new computer labs. We're now teaching coding to over 500 kids weekly."
  },
  {
    name: "Mama Mtaani Bakery",
    grew: "Hired 12 staff members",
    quote: "The business loan allowed me to buy a commercial oven. I've gone from 3 employees to 15 and supply 30 local shops."
  }
];

// ── Main Component ────────────────────────────────────────────────────────────
function BusinessPage() {
  const [mode, setMode] = useState<"none" | "picker" | "startup" | "existing">("none");
  const [info, setInfo] = useState<null | "invest" | "guide">(null);
  const [loading, setLoading] = useState(true);

  // ── Real data state ──
  const [summary, setSummary] = useState({
    totalFunding: 0,
    repaidAmount: 0,
    profitSharePaid: 0,
    openApps: 0,
    approvedApps: 0,
    repaymentStatus: "On time",
  });
  const [applications, setApplications] = useState<any[]>([]);
  // ✅ Initialize with default stories so they always show
  const [successStories, setSuccessStories] = useState(DEFAULT_SUCCESS_STORIES);

  const fetchBusinessData = async () => {
    try {
      setLoading(true);
      // Fetch summary
      const summaryData = await apiRequest('/business/summary');
      setSummary({
        totalFunding: summaryData.totalFunding || 0,
        repaidAmount: summaryData.repaidAmount || 0,
        profitSharePaid: summaryData.profitSharePaid || 0,
        openApps: summaryData.openApps || 0,
        approvedApps: summaryData.approvedApps || 0,
        repaymentStatus: summaryData.repaymentStatus || "On time",
      });

      // Fetch applications
      const appsData = await apiRequest('/business/applications');
      setApplications(appsData || []);

      // ✅ Fetch success stories from backend – if any, we keep them; otherwise we keep default ones.
      try {
        const storiesData = await apiRequest('/business/success-stories');
        if (storiesData && storiesData.length > 0) {
          setSuccessStories(storiesData); // Replace with real ones
        } else {
          setSuccessStories(DEFAULT_SUCCESS_STORIES); // Ensure at least 3 show
        }
      } catch (e) {
        // If backend endpoint doesn't exist, keep the default ones
        setSuccessStories(DEFAULT_SUCCESS_STORIES);
      }
    } catch (err) {
      console.error('Failed to load business data:', err);
      toast.error('Could not load business data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBusinessData();
  }, []);

  const onAction = (k: ActionKey) => {
    if (k === "apply") return setMode("picker");
    if (k === "apps") return document.getElementById("apps-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (k === "stories") return document.getElementById("stories-section")?.scrollIntoView({ behavior: "smooth", block: "start" });
    if (k === "invest") return setInfo("invest");
    if (k === "guide") return setInfo("guide");
  };

  if (loading) {
    return (
      <AppShell>
        <PageHeader title="Business Hub" subtitle="Fund. Build. Scale." />
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading business data...</p>
        </div>
      </AppShell>
    );
  }

  const { totalFunding, repaidAmount, profitSharePaid, openApps, approvedApps, repaymentStatus } = summary;

  return (
    <AppShell>
      <PageHeader title="Business Hub" subtitle="Fund. Build. Scale." />

      <section className="px-5 pt-5">
        <div className="gradient-primary rounded-2xl p-5 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-80">Total Funding Received</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(totalFunding)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Amount Repaid</p>
              <p className="mt-0.5 font-semibold">{fmt(repaidAmount)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Profit Share Paid</p>
              <p className="mt-0.5 font-semibold">{fmt(profitSharePaid)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3 px-5">
        <Stat label="Open Apps" value={String(openApps)} tone="primary" />
        <Stat label="Approved" value={String(approvedApps)} tone="success" />
        <Stat label="Repayment" value={repaymentStatus} tone="gold" />
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="Quick actions" />
        <Card className="!p-2">
          <ul className="divide-y divide-border">
            {sections.map((s) => (
              <li key={s.label}>
                <button
                  onClick={() => onAction(s.key)}
                  className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-left"
                >
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${
                    s.tone === "gold" ? "bg-gold/15 text-gold-foreground"
                    : s.tone === "success" ? "bg-success/15 text-success"
                    : "bg-primary/10 text-primary"
                  }`}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-semibold">{s.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section id="apps-section" className="mt-6 px-5 scroll-mt-20">
        <SectionTitle title="My applications" />
        <div className="space-y-2.5">
          {applications.length === 0 && (
            <Card className="!p-4 text-center text-xs text-muted-foreground">No applications yet. Apply for funding to get started!</Card>
          )}
          {applications.map((a) => (
            <Card key={a.id || a.name} className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Requested {fmt(a.amount)}</p>
                  {a.repaid > 0 && (
                    <p className="mt-1 text-[11px] text-success">Repaid {fmt(a.repaid)}</p>
                  )}
                </div>
                <Badge tone={a.status === "Approved" ? "success" : a.status === "Disbursed" ? "primary" : "warning"}>
                  {a.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="stories-section" className="mt-6 px-5 pb-2 scroll-mt-20">
        <SectionTitle title="Success stories" />
        <div className="space-y-2.5">
          {successStories.map((s) => (
            <Card key={s.name} className="!p-4">
              <Badge tone="gold">{s.grew}</Badge>
              <p className="mt-2 text-sm font-semibold">{s.name}</p>
              <p className="mt-1 text-xs italic text-muted-foreground">"{s.quote}"</p>
            </Card>
          ))}
        </div>
      </section>

      {mode !== "none" && (
        <FundingSheet
          mode={mode}
          setMode={setMode}
          onClose={() => setMode("none")}
          onSuccess={fetchBusinessData}
        />
      )}
      {info && <InfoSheet which={info} onClose={() => setInfo(null)} />}
    </AppShell>
  );
}

// ── Shared Sheet Shell ────────────────────────────────────────────────────────
function SheetShell({ title, onBack, onClose, children }: { title: string; onBack?: () => void; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 grid place-items-end sm:place-items-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative z-10 max-h-[92vh] w-full max-w-md overflow-y-auto rounded-t-3xl bg-card p-5 shadow-2xl sm:rounded-3xl">
        <div className="mb-4 flex items-center justify-between">
          <button
            onClick={onBack ?? onClose}
            className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground"
            aria-label="Back"
          >
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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return <label className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{children}</label>;
}
const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";

function SectionHeader({ n, title }: { n: number; title: string }) {
  return (
    <div className="mt-5 flex items-center gap-2 border-b border-border pb-2">
      <span className="grid h-6 w-6 place-items-center rounded-full gradient-primary text-[11px] font-bold text-primary-foreground">{n}</span>
      <h4 className="text-sm font-bold">{title}</h4>
    </div>
  );
}

// ── Funding Sheet ──────────────────────────────────────────────────────────────
function FundingSheet({
  mode, setMode, onClose, onSuccess,
}: {
  mode: "picker" | "startup" | "existing";
  setMode: (m: "picker" | "startup" | "existing") => void;
  onClose: () => void;
  onSuccess: () => void;
}) {
  if (mode === "picker") {
    return (
      <SheetShell title="Apply for funding" onClose={onClose}>
        <p className="text-xs text-muted-foreground">Choose the type of business you're funding. Each flow is tailored to your stage.</p>
        <div className="mt-4 space-y-3">
          <button
            onClick={() => setMode("startup")}
            className="w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl gradient-primary text-primary-foreground">
                <Rocket className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Startup</p>
                <p className="text-[11px] text-muted-foreground">New idea or business under 1 year</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </div>
          </button>
          <button
            onClick={() => setMode("existing")}
            className="w-full rounded-2xl border border-border p-4 text-left transition-colors hover:border-primary/40"
          >
            <div className="flex items-center gap-3">
              <span className="grid h-11 w-11 place-items-center rounded-xl gradient-gold text-gold-foreground">
                <Store className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold">Existing Business</p>
                <p className="text-[11px] text-muted-foreground">Operating with revenue & records</p>
              </div>
              <ChevronRight className="ml-auto h-4 w-4 text-muted-foreground" />
            </div>
          </button>
        </div>
      </SheetShell>
    );
  }

  if (mode === "startup") {
    return <StartupForm onBack={() => setMode("picker")} onClose={onClose} onSuccess={onSuccess} />;
  }
  return <ExistingForm onBack={() => setMode("picker")} onClose={onClose} onSuccess={onSuccess} />;
}

// ── Startup Form ──────────────────────────────────────────────────────────────
function StartupForm({ onBack, onClose, onSuccess }: { onBack: () => void; onClose: () => void; onSuccess: () => void }) {
  const [done, setDone] = useState(false);
  const [agree, setAgree] = useState(false);
  const [slot, setSlot] = useState<"morning" | "afternoon">("morning");
  const [date, setDate] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return;
    setSubmitting(true);
    try {
      await apiRequest('/business/apply/startup', {
        method: 'POST',
        body: JSON.stringify({ /* form data */ }),
      });
      toast.success('Startup application submitted!');
      setDone(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (done) {
    return (
      <SheetShell title="Startup funding" onClose={onClose}>
        <SuccessBlock message="Your startup application has been submitted. We'll review and get back to you shortly." onClose={onClose} />
      </SheetShell>
    );
  }

  return (
    <SheetShell title="Startup funding" onBack={onBack} onClose={onClose}>
      <div className="rounded-xl bg-primary/5 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-primary">Startup track</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Fill in each section — a training session is required after review.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <SectionHeader n={1} title="Business details" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Business name</FieldLabel><input required className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Business type</FieldLabel>
              <select required className={inputCls}><option>Startup</option></select>
            </div>
            <div><FieldLabel>Years in operation</FieldLabel>
              <select required className={inputCls}>
                <option value="">Select</option>
                <option>Less than 1</option><option>1 - 2</option><option>2+</option>
              </select>
            </div>
          </div>
          <div><FieldLabel>Location</FieldLabel><input required className={inputCls} placeholder="e.g. Nairobi CBD" /></div>
        </div>

        <SectionHeader n={2} title="Founder details" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Full name</FieldLabel><input required className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Phone</FieldLabel><input required className={inputCls} /></div>
            <div><FieldLabel>Email</FieldLabel><input required type="email" className={inputCls} /></div>
          </div>
          <div><FieldLabel>ID / Passport number</FieldLabel><input required className={inputCls} /></div>
          <FileField label="Founder photo" required accept="image/*" />
        </div>

        <SectionHeader n={3} title="Pitch" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Tell us about your business idea</FieldLabel><textarea required rows={3} className={inputCls} /></div>
          <div><FieldLabel>What problem does it solve?</FieldLabel><textarea required rows={3} className={inputCls} /></div>
        </div>

        <SectionHeader n={4} title="Funding" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Amount requested (KES)</FieldLabel><input required type="number" min={1000} className={inputCls} /></div>
          <div><FieldLabel>Purpose</FieldLabel>
            <select required className={inputCls}>
              <option value="">Select</option>
              <option>Equipment</option><option>Inventory</option><option>Marketing</option><option>Expansion</option><option>Other</option>
            </select>
          </div>
          <div><FieldLabel>Expected monthly profit (KES)</FieldLabel><input required type="number" className={inputCls} /></div>
        </div>

        <SectionHeader n={5} title="Training (after review)" />
        <div className="mt-3 rounded-xl bg-gold/10 p-3 text-xs">
          <p className="font-semibold text-gold-foreground">
            You must attend a free one-time physical training to get funds for startup.
          </p>
        </div>
        <div className="mt-3 space-y-3">
          <div>
            <FieldLabel>Preferred training date</FieldLabel>
            <div className="relative">
              <Calendar className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input required type="date" value={date} onChange={(e) => setDate(e.target.value)} className={inputCls + " pl-9"} />
            </div>
          </div>
          <div>
            <FieldLabel>Preferred time</FieldLabel>
            <div className="mt-1 grid grid-cols-2 gap-2">
              {([
                { key: "morning" as const, label: "8:00 AM – 11:00 AM" },
                { key: "afternoon" as const, label: "2:00 PM – 5:00 PM" },
              ]).map((s) => (
                <button
                  type="button"
                  key={s.key}
                  onClick={() => setSlot(s.key)}
                  className={`flex items-center justify-center gap-1.5 rounded-xl border py-2.5 text-xs font-semibold ${
                    slot === s.key ? "border-primary bg-primary/5 text-primary" : "border-border text-muted-foreground"
                  }`}
                >
                  <Clock className="h-3.5 w-3.5" /> {s.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <SectionHeader n={6} title="Terms" />
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-border p-3 text-xs">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>I agree to return a percentage of my monthly profit to PESAKI until the full amount is repaid.</span>
        </label>

        <button
          type="submit"
          disabled={!agree || submitting}
          className="mt-5 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Application'}
        </button>
      </form>
    </SheetShell>
  );
}

// ── Existing Business Form ────────────────────────────────────────────────────
function ExistingForm({ onBack, onClose, onSuccess }: { onBack: () => void; onClose: () => void; onSuccess: () => void }) {
  const [submitted, setSubmitted] = useState(false);
  const [agree, setAgree] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agree) return;
    setSubmitting(true);
    try {
      await apiRequest('/business/apply/existing', {
        method: 'POST',
        body: JSON.stringify({ /* form data */ }),
      });
      toast.success('Existing business application submitted!');
      setSubmitted(true);
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || 'Submission failed');
    } finally {
      setSubmitting(false);
    }
  };

  if (submitted) {
    return (
      <SheetShell title="Existing business funding" onClose={onClose}>
        <div className="mt-5 rounded-2xl border border-border bg-primary/5 p-5 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-primary/15 text-primary">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <p className="mt-3 text-base font-bold">Your application is under review</p>
          <p className="mt-1 text-xs text-muted-foreground">
            Our team will assess your documents and financials. Expect a decision within 3–5 business days.
          </p>
          <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
            Done
          </button>
        </div>
      </SheetShell>
    );
  }

  return (
    <SheetShell title="Existing business funding" onBack={onBack} onClose={onClose}>
      <div className="rounded-xl bg-gold/10 p-3">
        <p className="text-[11px] font-semibold uppercase tracking-wider text-gold-foreground">Established track</p>
        <p className="mt-0.5 text-xs text-muted-foreground">Documented businesses with revenue history.</p>
      </div>

      <form onSubmit={handleSubmit}>
        <SectionHeader n={1} title="Business details" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Business name</FieldLabel><input required className={inputCls} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Registration number</FieldLabel><input required className={inputCls} /></div>
            <div><FieldLabel>Business type</FieldLabel>
              <select required className={inputCls}><option>Existing</option></select>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Location</FieldLabel><input required className={inputCls} /></div>
            <div><FieldLabel>Years in operation</FieldLabel>
              <select required className={inputCls}>
                <option value="">Select</option>
                <option>1 - 2</option><option>3 - 5</option><option>5 - 10</option><option>10+</option>
              </select>
            </div>
          </div>
        </div>

        <SectionHeader n={2} title="Documents" />
        <div className="mt-3 space-y-3">
          <FileField label="Business license" required accept=".pdf,image/*" />
          <FileField label="Bank statements (last 6 months)" required accept=".pdf" />
          <FileField label="Tax compliance certificate (optional)" accept=".pdf,image/*" />
          <FileField label="Business plan (optional)" accept=".pdf,.doc,.docx" />
        </div>

        <SectionHeader n={3} title="Financials" />
        <div className="mt-3 space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Monthly revenue (KES)</FieldLabel><input required type="number" className={inputCls} /></div>
            <div><FieldLabel>Monthly profit (KES)</FieldLabel><input required type="number" className={inputCls} /></div>
          </div>
          <div><FieldLabel>Reason for funding</FieldLabel><textarea required rows={3} className={inputCls} /></div>
          <div><FieldLabel>Repayment plan</FieldLabel><textarea required rows={3} className={inputCls} /></div>
        </div>

        <SectionHeader n={4} title="Funding" />
        <div className="mt-3 space-y-3">
          <div><FieldLabel>Amount requested (KES)</FieldLabel><input required type="number" className={inputCls} /></div>
          <div><FieldLabel>Purpose</FieldLabel>
            <select required className={inputCls}>
              <option value="">Select</option>
              <option>Equipment</option><option>Inventory</option><option>Marketing</option><option>Expansion</option><option>Other</option>
            </select>
          </div>
        </div>

        <SectionHeader n={5} title="Terms" />
        <label className="mt-3 flex items-start gap-2 rounded-xl border border-border p-3 text-xs">
          <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-0.5 h-4 w-4 accent-primary" />
          <span>I agree to return a percentage of my monthly profit to PESAKI until the full amount is repaid.</span>
        </label>

        <button
          type="submit"
          disabled={!agree || submitting}
          className="mt-5 h-11 w-full rounded-xl gradient-gold text-sm font-semibold text-gold-foreground disabled:opacity-50"
        >
          {submitting ? 'Submitting...' : 'Submit Application'}
        </button>
      </form>
    </SheetShell>
  );
}

// ── Info Sheet ────────────────────────────────────────────────────────────────
function InfoSheet({ which, onClose }: { which: "invest" | "guide"; onClose: () => void }) {
  const title = which === "invest" ? "My Investments" : "Funding Guidelines";
  return (
    <SheetShell title={title} onClose={onClose}>
      {which === "invest" ? (
        <div className="space-y-3 text-sm">
          <p className="text-xs text-muted-foreground">Track businesses you've co-funded through PESAKI and your projected returns.</p>
          <div className="rounded-2xl gradient-primary p-4 text-primary-foreground">
            <p className="text-[11px] uppercase tracking-widest opacity-80">Total invested</p>
            <p className="mt-1 text-2xl font-bold">KES 175,000</p>
            <p className="mt-1 text-xs opacity-90">Avg. return · +14.2% p.a.</p>
          </div>
          <div className="space-y-2">
            {[
              { name: "Wanjiku's Bakery", amount: 75000, ret: "+18%" },
              { name: "Tech4Kids Academy", amount: 100000, ret: "+12%" },
            ].map((i) => (
              <div key={i.name} className="flex items-center justify-between rounded-xl border border-border p-3">
                <div>
                  <p className="text-sm font-semibold">{i.name}</p>
                  <p className="text-[11px] text-muted-foreground">{fmt(i.amount)} invested</p>
                </div>
                <span className="text-xs font-bold text-success">{i.ret}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="space-y-3 text-xs text-muted-foreground">
          <div className="rounded-xl bg-primary/5 p-3 text-foreground">
            <p className="text-sm font-bold">Who qualifies?</p>
            <ul className="mt-1 list-disc space-y-1 pl-4">
              <li>Kenyan resident, 18+ with verified ID and phone</li>
              <li>Startup: viable idea + attendance of one free training</li>
              <li>Existing: 12+ months of trading and documented revenue</li>
            </ul>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-foreground">Funding range</p>
            <p className="mt-1">Startup: KES 20,000 – 250,000 · Existing: KES 50,000 – 2,000,000.</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-foreground">Repayment</p>
            <p className="mt-1">A negotiated share of monthly profit until the funded amount is fully repaid — no compounding interest.</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-foreground">Timeline</p>
            <p className="mt-1">Startup: 7–10 business days including training. Existing: 3–5 business days after documents are verified.</p>
          </div>
          <div className="rounded-xl border border-border p-3">
            <p className="text-sm font-bold text-foreground">Required documents</p>
            <p className="mt-1">National ID, KRA PIN, business registration (if any), 6 months of bank/M-Pesa statements, and a short business plan.</p>
          </div>
        </div>
      )}
    </SheetShell>
  );
}
