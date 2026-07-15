import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import {
  User, KeyRound, Phone, Gift, ShieldCheck, Bell,
  HelpCircle, MessageCircle, FileText, Lock, Info, LogOut, LogIn, Copy, ChevronRight, X, ArrowLeft, CheckCircle2, ExternalLink,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { user, fmt } from "@/lib/mock";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — PESAKI" },
      { name: "description", content: "Manage your PESAKI account, security, referrals and support." },
    ],
  }),
  component: ProfilePage,
});

const WHATSAPP_URL = "https://wa.me/254740399389";

type ModalKey =
  | "personal" | "password" | "phone" | "verification"
  | "notifications"
  | "help" | "support"
  | "terms" | "privacy" | "agreement" | "about"
  | null;

const groups: { title: string; items: { label: string; icon: any; key: Exclude<ModalKey, null> }[] }[] = [
  {
    title: "Account",
    items: [
      { label: "Personal Information", icon: User,        key: "personal" },
      { label: "Change Password",      icon: KeyRound,    key: "password" },
      { label: "Change Phone Number",  icon: Phone,       key: "phone" },
      { label: "Verification Status",  icon: ShieldCheck, key: "verification" },
    ],
  },
  {
    title: "Preferences",
    items: [
      { label: "Notification Settings", icon: Bell, key: "notifications" },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Help Center",     icon: HelpCircle,    key: "help" },
      { label: "Contact Support", icon: MessageCircle, key: "support" },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Terms and Conditions", icon: FileText, key: "terms" },
      { label: "Privacy Policy",       icon: Lock,     key: "privacy" },
      { label: "User Agreement",       icon: FileText, key: "agreement" },
      { label: "About PESAKI",         icon: Info,     key: "about" },
    ],
  },
];

function ProfilePage() {
  const { user: authUser, signOut } = useAuth();
  const navigate = useNavigate();
  const [modal, setModal] = useState<ModalKey>(null);
  const displayName = authUser?.user_metadata?.full_name || authUser?.email?.split("@")[0] || `${user.name} Otieno`;
  const displayEmail = authUser?.email ?? "+254 7•• ••• 482";

  const copyRef = async () => {
    try { await navigator.clipboard.writeText(user.referralCode); toast.success("Referral code copied"); }
    catch { toast.error("Could not copy code"); }
  };
  const shareRef = async () => {
    const text = `Join me on PESAKI — Africa's digital wealth ecosystem. Use my code ${user.referralCode} to sign up.`;
    if (navigator.share) { try { await navigator.share({ title: "PESAKI", text }); } catch {} }
    else { await navigator.clipboard.writeText(text); toast.success("Invite copied to clipboard"); }
  };

  return (
    <AppShell>
      <PageHeader title="Profile" subtitle="Your PESAKI account" />

      <section className="px-5 pt-5">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full gradient-primary text-lg font-bold text-primary-foreground">
              {(displayName[0] ?? "P").toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{displayName}</p>
              <p className="truncate text-xs text-muted-foreground">{displayEmail}</p>
              <div className="mt-1 flex gap-1.5">
                {authUser ? (
                  <Badge tone="success"><ShieldCheck className="h-2.5 w-2.5" /> Signed in</Badge>
                ) : (
                  <Badge tone="warning">Guest</Badge>
                )}
                <Badge tone="gold">Gold Tier</Badge>
              </div>
            </div>
          </div>

          {!authUser && (
            <Link
              to="/auth"
              className="mt-4 flex h-10 w-full items-center justify-center gap-2 rounded-lg gradient-primary text-sm font-semibold text-primary-foreground"
            >
              <LogIn className="h-4 w-4" /> Sign in or create account
            </Link>
          )}
        </Card>
      </section>

      <section className="mt-5 px-5">
        <SectionTitle title="Referral program" />
        <div className="relative overflow-hidden rounded-2xl gradient-gold p-5 text-gold-foreground">
          <Gift className="absolute -right-3 -top-3 h-24 w-24 opacity-20" />
          <p className="text-xs font-semibold uppercase tracking-wider">Invite & Earn</p>
          <p className="mt-1 text-lg font-bold">Earn 10% of every referral's first deposit</p>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-foreground/10 p-2.5">
              <p className="opacity-70">Referrals</p>
              <p className="mt-0.5 font-bold">{user.referrals}</p>
            </div>
            <div className="rounded-xl bg-foreground/10 p-2.5">
              <p className="opacity-70">Earnings</p>
              <p className="mt-0.5 font-bold">{fmt(user.referralEarnings)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2.5">
            <p className="truncate font-mono text-sm font-bold">{user.referralCode}</p>
            <button onClick={copyRef} className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background">
              <Copy className="h-3 w-3" /> Copy
            </button>
            <button onClick={shareRef} className="inline-flex items-center gap-1 rounded-full bg-foreground/80 px-3 py-1.5 text-[11px] font-semibold text-background">
              Share
            </button>
          </div>
        </div>
      </section>

      {groups.map((g) => (
        <section key={g.title} className="mt-5 px-5">
          <SectionTitle title={g.title} />
          <Card className="!p-2">
            <ul className="divide-y divide-border">
              {g.items.map((it) => (
                <li key={it.label}>
                  <button
                    onClick={() => setModal(it.key)}
                    className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-left"
                  >
                    <span className="grid h-9 w-9 place-items-center rounded-xl bg-muted text-foreground">
                      <it.icon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium">{it.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}

      {authUser && (
        <section className="mt-5 px-5">
          <button
            onClick={async () => { await signOut(); toast.success("Signed out"); navigate({ to: "/" }); }}
            className="flex h-11 w-full items-center justify-center gap-2 rounded-xl border border-destructive/30 bg-destructive/5 text-sm font-semibold text-destructive hover:bg-destructive/10"
          >
            <LogOut className="h-4 w-4" /> Sign out
          </button>
        </section>
      )}

      <p className="mt-6 px-5 pb-4 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PESAKI v1.0 · Africa's Digital Wealth Ecosystem
      </p>

      {modal && <ProfileModal which={modal} onClose={() => setModal(null)} email={displayEmail} name={displayName} />}
    </AppShell>
  );
}

/* ---------- Modal shell ---------- */

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
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-full bg-muted text-muted-foreground" aria-label="Close">
            <X className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const inputCls = "mt-1 w-full rounded-xl border border-border bg-background px-3 py-2.5 text-sm outline-none focus:ring-2 focus:ring-ring";
const label = "text-[11px] font-semibold uppercase tracking-wider text-muted-foreground";

function Success({ msg, onClose }: { msg: string; onClose: () => void }) {
  return (
    <div className="py-6 text-center">
      <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-success/15 text-success">
        <CheckCircle2 className="h-6 w-6" />
      </div>
      <p className="mt-3 text-base font-bold">Success</p>
      <p className="mt-1 text-xs text-muted-foreground">{msg}</p>
      <button onClick={onClose} className="mt-4 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Done</button>
    </div>
  );
}

function ProfileModal({ which, onClose, email, name }: { which: Exclude<ModalKey, null>; onClose: () => void; email: string; name: string }) {
  const titles: Record<Exclude<ModalKey, null>, string> = {
    personal: "Personal Information",
    password: "Change Password",
    phone: "Change Phone Number",
    verification: "Verification Status",
    notifications: "Notification Settings",
    help: "Help Center",
    support: "Contact Support",
    terms: "Terms and Conditions",
    privacy: "Privacy Policy",
    agreement: "User Agreement",
    about: "About PESAKI",
  };

  return (
    <SheetShell title={titles[which]} onClose={onClose}>
      {which === "personal" && <PersonalForm onClose={onClose} defaultName={name} defaultEmail={email} />}
      {which === "password" && <PasswordForm onClose={onClose} />}
      {which === "phone" && <PhoneForm onClose={onClose} />}
      {which === "verification" && <VerificationBlock />}
      {which === "notifications" && <NotificationsForm onClose={onClose} />}
      {which === "help" && <HelpBlock />}
      {which === "support" && <SupportBlock />}
      {which === "terms" && <LegalBlock body={TERMS} />}
      {which === "privacy" && <LegalBlock body={PRIVACY} />}
      {which === "agreement" && <LegalBlock body={AGREEMENT} />}
      {which === "about" && <AboutBlock />}
    </SheetShell>
  );
}

/* ---------- Individual forms ---------- */

function PersonalForm({ onClose, defaultName, defaultEmail }: { onClose: () => void; defaultName: string; defaultEmail: string }) {
  const [done, setDone] = useState(false);
  if (done) return <Success msg="Your personal information has been updated." onClose={onClose} />;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => { e.preventDefault(); toast.success("Profile updated"); setDone(true); }}
    >
      <div><label className={label}>Full name</label><input required defaultValue={defaultName} className={inputCls} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div><label className={label}>ID number</label><input required className={inputCls} placeholder="1234••••" /></div>
        <div><label className={label}>Date of birth</label><input required type="date" className={inputCls} /></div>
      </div>
      <div><label className={label}>Email</label><input required type="email" defaultValue={defaultEmail} className={inputCls} /></div>
      <div><label className={label}>Home address</label><input required className={inputCls} placeholder="Estate, City" /></div>
      <button type="submit" className="mt-2 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Save changes</button>
    </form>
  );
}

function PasswordForm({ onClose }: { onClose: () => void }) {
  const [done, setDone] = useState(false);
  const [pw, setPw] = useState({ curr: "", next: "", conf: "" });
  if (done) return <Success msg="Your password has been changed." onClose={onClose} />;
  const valid = pw.next.length >= 8 && pw.next === pw.conf && pw.curr.length > 0;
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!valid) { toast.error("Password must be 8+ chars and match confirmation"); return; }
        toast.success("Password changed"); setDone(true);
      }}
    >
      <div><label className={label}>Current password</label><input required type="password" value={pw.curr} onChange={(e) => setPw({ ...pw, curr: e.target.value })} className={inputCls} /></div>
      <div><label className={label}>New password (min 8 chars)</label><input required type="password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} /></div>
      <div><label className={label}>Confirm new password</label><input required type="password" value={pw.conf} onChange={(e) => setPw({ ...pw, conf: e.target.value })} className={inputCls} /></div>
      <button type="submit" disabled={!valid} className="mt-2 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground disabled:opacity-50">Update password</button>
    </form>
  );
}

function PhoneForm({ onClose }: { onClose: () => void }) {
  const [step, setStep] = useState<"enter" | "otp" | "done">("enter");
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  if (step === "done") return <Success msg={`Your phone number has been updated to ${phone}.`} onClose={onClose} />;
  if (step === "otp") {
    return (
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          if (otp.length < 4) { toast.error("Enter the 6-digit code"); return; }
          setStep("done");
        }}
      >
        <p className="text-xs text-muted-foreground">Enter the 6-digit code sent to <b>{phone}</b>.</p>
        <input required inputMode="numeric" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))} className={inputCls + " tracking-[0.4em] text-center text-lg"} placeholder="••••••" />
        <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Verify code</button>
        <button type="button" onClick={() => toast.success("New code sent")} className="h-10 w-full rounded-xl border border-border text-xs font-semibold">Resend code</button>
      </form>
    );
  }
  return (
    <form
      className="space-y-3"
      onSubmit={(e) => {
        e.preventDefault();
        if (!/^\+?\d{9,15}$/.test(phone.replace(/\s/g, ""))) { toast.error("Enter a valid phone number"); return; }
        toast.success("Verification code sent"); setStep("otp");
      }}
    >
      <div><label className={label}>New phone number</label><input required value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="+254 7•• ••• •••" /></div>
      <button type="submit" className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Send verification code</button>
    </form>
  );
}

function VerificationBlock() {
  const items = [
    { label: "Email verified", ok: true },
    { label: "Phone verified", ok: true },
    { label: "National ID", ok: false },
    { label: "Selfie / Liveness", ok: false },
    { label: "Proof of address", ok: false },
  ];
  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gold/10 p-3 text-xs">
        <p className="font-semibold text-gold-foreground">Tier 1 verified — Upgrade to Tier 2 to unlock higher limits.</p>
      </div>
      <ul className="divide-y divide-border rounded-xl border border-border">
        {items.map((i) => (
          <li key={i.label} className="flex items-center justify-between px-4 py-3 text-sm">
            <span>{i.label}</span>
            {i.ok
              ? <Badge tone="success"><CheckCircle2 className="h-2.5 w-2.5" /> Verified</Badge>
              : <Badge tone="warning">Pending</Badge>}
          </li>
        ))}
      </ul>
      <button onClick={() => toast.success("Verification checklist opened")} className="h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Complete verification</button>
    </div>
  );
}

function NotificationsForm({ onClose }: { onClose: () => void }) {
  const [prefs, setPrefs] = useState({
    transactions: true, marketing: false, jobs: true, security: true, savings: true,
  });
  const rows: { key: keyof typeof prefs; label: string; hint: string }[] = [
    { key: "transactions", label: "Transaction alerts", hint: "Deposits, withdrawals, transfers" },
    { key: "security",     label: "Security alerts",    hint: "Sign-ins, password changes" },
    { key: "jobs",         label: "KAZI Link updates",  hint: "New jobs and applicant messages" },
    { key: "savings",      label: "Savings & investing",hint: "Lock maturities and returns" },
    { key: "marketing",    label: "Promotions",         hint: "Offers and product news" },
  ];
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => { e.preventDefault(); toast.success("Notification preferences saved"); onClose(); }}
    >
      {rows.map((r) => (
        <div key={r.key} className="flex items-center justify-between rounded-xl border border-border p-3">
          <div>
            <p className="text-sm font-semibold">{r.label}</p>
            <p className="text-[11px] text-muted-foreground">{r.hint}</p>
          </div>
          <button
            type="button"
            onClick={() => setPrefs({ ...prefs, [r.key]: !prefs[r.key] })}
            className={`relative h-6 w-11 rounded-full transition-colors ${prefs[r.key] ? "bg-primary" : "bg-muted"}`}
            aria-pressed={prefs[r.key]}
          >
            <span className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-all ${prefs[r.key] ? "left-[22px]" : "left-0.5"}`} />
          </button>
        </div>
      ))}
      <button type="submit" className="mt-3 h-11 w-full rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">Save preferences</button>
    </form>
  );
}

function HelpBlock() {
  const faqs = [
    { q: "How do I deposit money?", a: "Open Wallet, tap Deposit, choose M-Pesa or bank, enter the amount and confirm. Funds arrive instantly." },
    { q: "How do withdrawals work?", a: "Tap Withdraw in Wallet. Fees are shown before you confirm: M-Pesa uses a tiered rate; bank transfers are 3% (min KES 50, max KES 1,000)." },
    { q: "How are locked savings paid out?", a: "Interest accrues daily and is paid on maturity. Early withdrawal is allowed at a reduced rate." },
    { q: "How do I apply for business funding?", a: "Go to Business Hub → Apply for Funding, and pick Startup or Existing business. Complete every section and submit." },
    { q: "How do I post or apply for a job?", a: "Open KAZI Link. Employers tap Post a Job; workers tap Apply now on any job card." },
  ];
  return (
    <div className="space-y-2">
      {faqs.map((f) => (
        <details key={f.q} className="rounded-xl border border-border p-3 text-sm">
          <summary className="cursor-pointer font-semibold">{f.q}</summary>
          <p className="mt-2 text-xs text-muted-foreground">{f.a}</p>
        </details>
      ))}
      <a href={WHATSAPP_URL} target="_blank" rel="noreferrer" className="mt-3 flex h-11 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground">
        <MessageCircle className="h-4 w-4" /> Still need help? Chat on WhatsApp
      </a>
    </div>
  );
}

function SupportBlock() {
  return (
    <div className="space-y-3">
      <p className="text-xs text-muted-foreground">Our team is on WhatsApp 7 days a week, 7:00 AM – 10:00 PM EAT.</p>
      <a
        href={WHATSAPP_URL}
        target="_blank"
        rel="noreferrer"
        className="flex h-12 w-full items-center justify-center gap-2 rounded-xl gradient-primary text-sm font-semibold text-primary-foreground"
      >
        <MessageCircle className="h-4 w-4" /> Open WhatsApp chat <ExternalLink className="h-3.5 w-3.5" />
      </a>
      <div className="rounded-xl border border-border p-3 text-xs">
        <p className="font-semibold">Direct number</p>
        <p className="mt-0.5 text-muted-foreground">+254 740 399 389</p>
      </div>
      <div className="rounded-xl border border-border p-3 text-xs">
        <p className="font-semibold">Email</p>
        <a href="mailto:support@pesaki.app" className="mt-0.5 block text-primary">support@pesaki.app</a>
      </div>
    </div>
  );
}

function LegalBlock({ body }: { body: { heading: string; text: string }[] }) {
  return (
    <div className="space-y-4">
      <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last updated: 15 July 2026</p>
      {body.map((s) => (
        <div key={s.heading}>
          <h4 className="text-sm font-bold">{s.heading}</h4>
          <p className="mt-1 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">{s.text}</p>
        </div>
      ))}
    </div>
  );
}

function AboutBlock() {
  return (
    <div className="space-y-3 text-xs">
      <div className="rounded-xl gradient-primary p-4 text-primary-foreground">
        <p className="text-[11px] uppercase tracking-widest opacity-80">PESAKI</p>
        <p className="mt-1 text-base font-bold">Africa's Digital Wealth Ecosystem</p>
        <p className="mt-1 opacity-90">v1.0 · Nairobi, Kenya</p>
      </div>
      <p className="text-muted-foreground">
        PESAKI is an all-in-one platform that combines a mobile-first bank, curated trading products,
        micro-work marketplace (KAZI Link) and a business funding hub — designed to help Kenyans grow,
        save and earn in one secure app.
      </p>
      <div className="rounded-xl border border-border p-3">
        <p className="font-semibold">Contact</p>
        <p className="mt-1 text-muted-foreground">WhatsApp: +254 740 399 389</p>
        <p className="text-muted-foreground">Email: hello@pesaki.app</p>
      </div>
    </div>
  );
}

/* ---------- Legal content ---------- */

const TERMS = [
  { heading: "1. Acceptance of Terms", text: "By creating an account or using the PESAKI mobile or web application (the \"Service\"), you agree to be bound by these Terms and Conditions. If you do not agree, do not use the Service." },
  { heading: "2. Eligibility", text: "You must be at least 18 years of age, a resident of Kenya, and legally able to enter binding contracts. You must provide accurate identification during onboarding." },
  { heading: "3. Accounts and Security", text: "You are responsible for safeguarding your login credentials, PIN and one-time passwords. Notify us immediately if you suspect unauthorised access. PESAKI is not liable for losses arising from your failure to protect your credentials." },
  { heading: "4. Wallet, Deposits and Withdrawals", text: "Deposits are credited on confirmation of funds. Withdrawals attract tiered M-Pesa fees or a 3% bank fee (minimum KES 50, maximum KES 1,000). You warrant that all funds moved through the Service are lawfully sourced." },
  { heading: "5. Savings and Locked Deposits", text: "Locked deposits earn interest at the advertised annual rate for the chosen term. Early withdrawal is permitted at a reduced interest rate. Balances are insured up to KES 500,000 per user." },
  { heading: "6. Loans and Business Funding", text: "Loans are offered at 5% per annum on the reducing balance basis, subject to eligibility and credit review. Business funding is repaid as a percentage of monthly profits until fully settled." },
  { heading: "7. Trading Products", text: "Binary FX, Up & Down, Avimarket, Spin and Invest are speculative products. You can lose part or all of your stake. Only trade with funds you can afford to lose." },
  { heading: "8. KAZI Link", text: "PESAKI facilitates introductions between workers and employers. We do not employ workers and are not liable for the conduct of either party, but we may suspend accounts that violate these Terms." },
  { heading: "9. Prohibited Use", text: "You may not use the Service for money laundering, fraud, financing of terrorism, or any illegal activity. We may freeze or close accounts and report to authorities where required." },
  { heading: "10. Changes and Termination", text: "We may update these Terms from time to time. Continued use after changes constitutes acceptance. We may suspend or terminate accounts for breach of these Terms." },
  { heading: "11. Governing Law", text: "These Terms are governed by the laws of the Republic of Kenya. Disputes shall be resolved in the courts of Nairobi." },
];

const PRIVACY = [
  { heading: "1. Information We Collect", text: "Identity data (name, ID number, date of birth), contact data (phone, email, address), financial data (M-Pesa and bank details, transactions), device data (IP, device model, OS) and usage data." },
  { heading: "2. How We Use Your Data", text: "To provide the Service, verify your identity (KYC), process transactions, prevent fraud, comply with regulators (CBK, CMA, KRA) and improve product experience." },
  { heading: "3. Legal Basis", text: "We rely on contract performance, legitimate interests (fraud prevention, product improvement), your consent (marketing) and legal obligations (AML/CFT)." },
  { heading: "4. Sharing", text: "We share data with payment partners (Safaricom M-Pesa, partner banks), identity verification providers, cloud infrastructure providers and regulators where required by law. We never sell your personal data." },
  { heading: "5. Retention", text: "Account and transaction records are retained for at least seven (7) years to meet regulatory requirements. Marketing data is retained until you withdraw consent." },
  { heading: "6. Your Rights", text: "Under the Kenya Data Protection Act 2019 you may access, correct, delete or port your data, object to processing, and lodge a complaint with the Office of the Data Protection Commissioner." },
  { heading: "7. Security", text: "Data is encrypted in transit (TLS 1.2+) and at rest (AES-256). Access is restricted, logged and reviewed. Passwords are hashed with industry-standard algorithms." },
  { heading: "8. Cookies", text: "Our web app uses strictly necessary cookies for authentication and preferences. Analytics cookies are optional and disabled by default." },
  { heading: "9. Contact", text: "Data protection queries: privacy@pesaki.app · WhatsApp +254 740 399 389." },
];

const AGREEMENT = [
  { heading: "1. Scope", text: "This User Agreement supplements the Terms and Conditions and Privacy Policy and sets out day-to-day rules for using PESAKI features." },
  { heading: "2. Fair Use", text: "You agree not to abuse the Service — no bot activity, scraping, multi-accounting, referral self-invites or attempts to circumvent limits, fees or verification." },
  { heading: "3. Referrals", text: "Referral rewards are 10% of a referred user's first deposit and are credited within 24 hours of the qualifying deposit. Fraudulent referrals will be reversed and the account suspended." },
  { heading: "4. KAZI Link Conduct", text: "Employers must post genuine jobs at fair rates. Workers must provide accurate profiles and honour agreed assignments. Ratings must reflect actual experience. Off-platform payment attempts to avoid fees are prohibited." },
  { heading: "5. Business Funding Repayment", text: "Approved businesses agree to remit the agreed profit share on the agreed schedule until fully repaid. Missed instalments may lead to collection action." },
  { heading: "6. Trading Responsibility", text: "You confirm that you understand each product's risk and that gains are not guaranteed. PESAKI does not provide financial advice." },
  { heading: "7. Communications", text: "We may contact you by SMS, email, WhatsApp and in-app notifications for account, security, transactional and (with your consent) marketing purposes." },
  { heading: "8. Dispute Resolution", text: "Raise disputes first with support@pesaki.app or WhatsApp +254 740 399 389. Unresolved matters may be escalated to the courts of Nairobi." },
  { heading: "9. Modification", text: "We may update this User Agreement. Material changes will be notified in-app at least 14 days before taking effect." },
];
