import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine,
  ArrowUpFromLine,
  ArrowLeftRight,
  ArrowRight,
  LineChart,
  Bell,
  Eye,
  EyeOff,
  TrendingUp,
  ChevronRight,
  Sparkles,
  LogIn,
  UserPlus,
  Briefcase,
  Building2,
  Landmark,
  Bot,
  Apple,
  ShieldCheck,
  Lock,
  FileText,
  Headset,
  CircleUser,
  Users,
  MapPin,
  CheckCircle2,
  Wallet,
  Landmark as LandmarkIcon,
  Scale,
  MessageCircle,
  CreditCard,
  Globe,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { AppShell } from "@/components/AppShell";
import { PesakiLogo, PesakiWordmark } from "@/components/PesakiLogo";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { apiRequest } from "../utils/api";
import { createClient } from "@supabase/supabase-js";
import { useAuth } from "@/hooks/useAuth";
import {
  ACCOUNT_VISIBILITY,
  COMPANY,
  HOW_IT_WORKS,
  OFFICES,
  REFERRAL,
  REGISTRATION_STATEMENT,
  REGULATORY_STATEMENT,
  SERVICES,
  organizationJsonLd,
} from "@/lib/pesaki-facts";

const fmt = (amount: number) => {
  return new Intl.NumberFormat("en-KE", {
    style: "currency",
    currency: "KES",
    minimumFractionDigits: 0,
  }).format(amount);
};

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PESAKI — Africa's Digital Wealth Ecosystem" },
      {
        name: "description",
        content:
          "PESAKI brings together your wallet, jobs, business funding and banking in one powerful mobile app. PESAKI MARKETING, BN-6ASR2E26, registered in Kenya.",
      },
      {
        name: "keywords",
        content:
          "PESAKI, PESAKI MARKETING, PESAKI Kenya, PESAKI wallet, KAZI Link PESAKI, PESAKI Business Hub, PESAKI Banking Hub, PESAKI referral, BN-6ASR2E26",
      },
      { property: "og:url", content: "https://pesaki.co.ke/" },
    ],
    links: [{ rel: "canonical", href: "https://pesaki.co.ke/" }],
  }),
  component: HomePage,
});

function HomePage() {
  const { session, ready } = useAuth();
  const isLoggedIn = ready && !!session;

  const [show, setShow] = useState(true);
  const [userName, setUserName] = useState("Guest");
  const [balance, setBalance] = useState(0);
  const [totalEarnings, setTotalEarnings] = useState(0);
  const [referralEarnings, setTotalReferralEarnings] = useState(0);
  const [transactions, setTransactions] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);

  const [stats, setStats] = useState([
    { label: "Active Trades", value: "0", hint: "+0", tone: "primary" as const },
    { label: "Jobs Completed", value: "0", hint: "+0", tone: "success" as const },
    { label: "Investment Growth", value: "0%", hint: "+0%", tone: "gold" as const },
    { label: "Businesses Funded", value: "0", hint: "0 Active", tone: "warning" as const },
  ]);

  const [opportunities, setOpportunities] = useState<any[]>([]);

  const isMounted = useRef(true);
  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!isLoggedIn) {
      setLoading(false);
      return;
    }

    setLoading(true);
    const fetchAll = async () => {
      try {
        const supabase = createClient(
          import.meta.env.VITE_SUPABASE_URL,
          import.meta.env.VITE_SUPABASE_ANON_KEY,
        );
        const {
          data: { session },
        } = await supabase.auth.getSession();
        if (isMounted.current && session?.user) {
          const fullName =
            session.user.user_metadata?.full_name || session.user.email || session.user.phone;
          setUserName(fullName?.split(" ")[0] || "User");
        }

        const balanceData = await apiRequest("/wallet/balance");
        if (isMounted.current) {
          setBalance(balanceData.balance || 0);
          setTotalEarnings(balanceData.totalEarnings || 0);
          setTotalReferralEarnings(balanceData.referralEarnings || 0);
        }

        const txData = await apiRequest("/wallet/transactions?limit=5");
        if (isMounted.current) {
          setTransactions(txData || []);
        }

        try {
          const statsData = await apiRequest("/user/stats");
          if (isMounted.current && statsData) {
            setStats([
              {
                label: "Active Trades",
                value: statsData.activeTrades || "0",
                hint: `+${statsData.tradesChange || 0}`,
                tone: "primary" as const,
              },
              {
                label: "Jobs Completed",
                value: statsData.jobsCompleted || "0",
                hint: `+${statsData.jobsChange || 0}`,
                tone: "success" as const,
              },
              {
                label: "Investment Growth",
                value: statsData.investmentGrowth || "0%",
                hint: `+${statsData.growthChange || 0}%`,
                tone: "gold" as const,
              },
              {
                label: "Businesses Funded",
                value: statsData.businessesFunded || "0",
                hint: `${statsData.activeBusinesses || 0} Active`,
                tone: "warning" as const,
              },
            ]);
          }
        } catch (e) {
          console.log("Stats endpoint not available");
        }

        try {
          const opps = await apiRequest("/trading/opportunities");
          if (isMounted.current) {
            setOpportunities(opps || []);
          }
        } catch (e) {
          console.log("Opportunities endpoint not available");
        }

        if (isMounted.current) {
          setLoading(false);
        }
      } catch (error) {
        console.error("Failed to load dashboard data:", error);
        if (isMounted.current) {
          setLoading(false);
        }
      }
    };
    fetchAll();
  }, [isLoggedIn]);

  if (!isLoggedIn && !loading) {
    return (
      <AppShell>
        <PublicHome />
      </AppShell>
    );
  }

  if (loading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center h-64">
          <p className="text-muted-foreground">Loading dashboard...</p>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      {/* Hero */}
      <section className="gradient-primary relative overflow-hidden px-5 pb-8 pt-6 text-primary-foreground">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs/4 opacity-80">Welcome back,</p>
            <h1 className="truncate text-2xl font-bold">{userName} 👋</h1>
          </div>
          <Link
            to="/profile"
            className="grid h-10 w-10 place-items-center rounded-full bg-gold text-gold-foreground font-bold"
          >
            {(userName[0] ?? "P").toUpperCase()}
          </Link>
        </div>

        <div className="relative mt-6 rounded-3xl bg-white/10 p-5 backdrop-blur-md ring-1 ring-white/15">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider opacity-80">Available Balance</p>
            <button onClick={() => setShow(!show)} className="opacity-80">
              {show ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">
            {show ? fmt(balance) : "•••••••"}
          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Total Earnings</p>
              <p className="mt-0.5 font-semibold">{show ? fmt(totalEarnings) : "•••"}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Referral Earnings</p>
              <p className="mt-0.5 font-semibold">{show ? fmt(referralEarnings) : "•••"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="-mt-5 px-5">
        <Card className="grid grid-cols-4 gap-2">
          {[
            { label: "Deposit", icon: ArrowDownToLine, to: "/wallet" },
            { label: "Withdraw", icon: ArrowUpFromLine, to: "/wallet" },
            { label: "Transfer", icon: ArrowLeftRight, to: "/wallet" },
            { label: "Trading", icon: LineChart, to: "/trading" },
          ].map((a) => (
            <Link
              key={a.label}
              to={a.to}
              className="flex flex-col items-center gap-1.5 rounded-xl p-2 transition-colors hover:bg-muted"
            >
              <span className="grid h-11 w-11 place-items-center rounded-xl gradient-primary text-primary-foreground">
                <a.icon className="h-5 w-5" />
              </span>
              <span className="text-[11px] font-medium">{a.label}</span>
            </Link>
          ))}
        </Card>
      </section>

      {/* Stats */}
      <section className="mt-5 px-5">
        <div className="grid grid-cols-2 gap-3">
          {stats.map((s) => (
            <Stat key={s.label} label={s.label} value={s.value} hint={s.hint} tone={s.tone} />
          ))}
        </div>
      </section>

      {/* Reminders */}
      <RemindersSection transactions={transactions} />

      {/* Explore hubs — reordered: KAZI, Business, Banking, Trading last */}
      <section className="mt-6 px-5">
        <SectionTitle title="Explore hubs" />
        <div className="grid grid-cols-2 gap-3">
          <Link
            to="/kazi"
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">KAZI Link</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Find work · Hire talent</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/business"
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl gradient-gold text-gold-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">Business Hub</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Grow · Fund · Scale</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/banking"
            className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]"
          >
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-success/15 text-success">
              <Landmark className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">Banking Hub</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Save · Lock · Borrow</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link
            to="/trading"
            className="group relative overflow-hidden rounded-2xl gradient-primary p-4 text-primary-foreground shadow-[var(--shadow-card)]"
          >
            <LineChart className="mb-6 h-5 w-5 opacity-90" />
            <p className="text-sm font-bold">Trading Floor</p>
            <p className="mt-0.5 text-[11px] opacity-80">FX · Up/Down · Aviator</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>

      {/* Promo banner */}
      <section className="mt-6 px-5">
        <div className="relative overflow-hidden rounded-2xl gradient-gold p-5 text-gold-foreground">
          <Sparkles className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
          <p className="text-[11px] font-semibold uppercase tracking-wider">Featured</p>
          <h3 className="mt-1 max-w-[80%] text-lg font-bold leading-snug">
            Save and earn interest
          </h3>
          <p className="mt-1 max-w-[85%] text-xs opacity-80">
            Lock funds for 90 days and earn competitive interest. Past performance does not predict
            future returns.
          </p>
          <Link
            to="/banking"
            className="mt-3 inline-flex items-center gap-1 rounded-full bg-foreground px-3.5 py-1.5 text-xs font-semibold text-background"
          >
            Start saving <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </section>

      {/* Opportunities */}
      <section className="mt-7 px-5">
        <SectionTitle
          title="Latest opportunities"
          action={
            <Link to="/kazi" className="text-xs font-semibold text-primary">
              See all
            </Link>
          }
        />
        <div className="space-y-2.5">
          {opportunities.length > 0 ? (
            opportunities.map((o) => (
              <Card key={o.title} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
                      {o.category}
                    </p>
                    <p className="mt-0.5 truncate text-sm font-semibold">{o.title}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">{o.pay}</p>
                  </div>
                  <Badge
                    tone={o.tag === "Urgent" ? "destructive" : o.tag === "Hot" ? "warning" : "gold"}
                  >
                    {o.tag}
                  </Badge>
                </div>
              </Card>
            ))
          ) : (
            <p className="text-sm text-muted-foreground">No opportunities available right now.</p>
          )}
        </div>
      </section>

      {/* Recent transactions */}
      <section className="mt-7 px-5">
        <SectionTitle
          title="Recent transactions"
          action={
            <Link to="/wallet" className="text-xs font-semibold text-primary">
              View wallet
            </Link>
          }
        />
        <Card className="!p-2">
          <ul className="divide-y divide-border">
            {transactions.length > 0 ? (
              transactions.slice(0, 5).map((t) => {
                const positive = t.amount > 0;
                return (
                  <li
                    key={t.id}
                    className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3"
                  >
                    <div className="flex min-w-0 items-center gap-3">
                      <span
                        className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${positive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}
                      >
                        <TrendingUp className={`h-4 w-4 ${positive ? "" : "rotate-180"}`} />
                      </span>
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">
                          {t.type || t.description || "Transaction"}
                        </p>
                        <p className="truncate text-[11px] text-muted-foreground">
                          {t.date || "Today"} · {t.status || "Completed"}
                        </p>
                      </div>
                    </div>
                    <p
                      className={`text-sm font-bold ${positive ? "text-success" : "text-foreground"}`}
                    >
                      {positive ? "+" : ""}
                      {fmt(t.amount)}
                    </p>
                  </li>
                );
              })
            ) : (
              <li className="py-4 text-center text-sm text-muted-foreground">
                No recent transactions.
              </li>
            )}
          </ul>
        </Card>
      </section>

      <p className="mt-8 px-5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PESAKI · Earn. Invest. Grow.
      </p>
    </AppShell>
  );
}

const HUB_CARDS = [
  {
    title: "KAZI Link",
    subtitle: "Find work • Hire talent",
    to: "/kazi",
    icon: Briefcase,
    circle: "bg-brand-tint-green text-brand-ink",
  },
  {
    title: "Business Hub",
    subtitle: "Fund • Grow • Scale",
    to: "/business",
    icon: Building2,
    circle: "bg-brand-tint-gold text-brand-gold-deep",
  },
  {
    title: "Banking Hub",
    subtitle: "Manage finances • Access services",
    to: "/banking",
    icon: Landmark,
    circle: "bg-brand-tint-green text-brand-ink",
  },
] as const;

const SERVICE_ICONS = {
  kazi: Briefcase,
  business: Building2,
  banking: LandmarkIcon,
  wallet: Wallet,
} as const;

const TRUST_ITEMS = [
  {
    label: "Registered Kenyan business",
    value: COMPANY.legalName,
    icon: ShieldCheck,
    to: "/compliance",
  },
  {
    label: "Business Registration Number",
    value: COMPANY.registrationNumber,
    icon: Scale,
    to: "/compliance",
  },
  {
    label: "Registered through",
    value: COMPANY.registeringAuthority,
    icon: FileText,
    to: "/compliance",
  },
  {
    label: "Published Terms of Service",
    value: "Read before you proceed",
    icon: FileText,
    to: "/terms",
  },
  {
    label: "Published Privacy Policy",
    value: "How your data is handled",
    icon: Lock,
    to: "/privacy",
  },
  { label: "Customer support", value: COMPANY.whatsapp, icon: Headset, to: "/contact" },
  {
    label: "Security information",
    value: "How to keep your account safe",
    icon: ShieldCheck,
    to: "/security",
  },
  {
    label: "Transparent compliance information",
    value: "Registration and data protection status",
    icon: Scale,
    to: "/compliance",
  },
] as const;

function PublicHome() {
  /* PublicHome only ever renders for signed-out visitors (see HomePage), so
     hub cards always route to sign up — no session flash on first paint. */
  return (
    <div className="bg-brand-paper">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(organizationJsonLd()) }}
      />
      {/* ───────────── Hero ───────────── */}
      <section className="gradient-primary relative min-h-[40vh] overflow-hidden px-5 pb-6 pt-4 text-white">
        <div className="pointer-events-none absolute -right-24 -top-24 h-64 w-64 rounded-full bg-brand-gold/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-24 top-32 h-56 w-56 rounded-full bg-brand-gold/10 blur-3xl" />

        {/* Header */}
        <div className="relative flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-3">
            <PesakiLogo size={44} tone="light" className="glow-green-dark" />
            <PesakiWordmark size="lg" tone="light" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Link
              to="/profile"
              aria-label="Notifications"
              className="relative grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/5 text-white/90 transition-colors hover:bg-white/10"
            >
              <Bell className="h-[18px] w-[18px]" />
              <span className="absolute right-2.5 top-2.5 h-2 w-2 rounded-full bg-brand-gold ring-2 ring-white/25" />
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signin" } as never}
              aria-label="Account"
              className="grid h-10 w-10 place-items-center rounded-full border border-white/25 bg-white/5 text-white/90 transition-colors hover:bg-white/10"
            >
              <CircleUser className="h-[18px] w-[18px]" />
            </Link>
          </div>
        </div>

        {/* Registered business pill */}
        <Link
          to="/about"
          className="relative mt-3 flex items-center gap-2 rounded-full border border-white/15 bg-white/5 py-2 pl-3 pr-2.5 text-[11px] font-medium text-white transition-colors hover:bg-white/10"
        >
          <ShieldCheck className="h-3.5 w-3.5 shrink-0 text-brand-gold" />
          <span className="truncate">Kenyan Registered Business</span>
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-white/70" />
        </Link>

        {/* Headline */}
        <h1 className="relative mt-4 font-display text-[28px] font-extrabold leading-[1.15] tracking-tight">
          <span className="block text-white">Africa&apos;s Digital</span>
          <span className="block text-brand-gold">Wealth Ecosystem.</span>
        </h1>

        <p className="relative mt-3 text-[14px] leading-relaxed text-white/85">
          PESAKI brings together your wallet, jobs, business funding and banking in one powerful
          mobile app.
        </p>

        {/* CTAs */}
        <div className="relative mt-5 flex gap-3">
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full bg-brand-gold text-sm font-bold text-brand-deep shadow-lg shadow-black/25 transition-opacity hover:opacity-95"
          >
            <UserPlus className="h-4 w-4" /> Get Started
          </Link>
          <Link
            to="/auth"
            search={{ mode: "signin" } as never}
            className="flex h-12 flex-1 items-center justify-center gap-2 rounded-full border border-white/40 text-sm font-semibold text-white transition-colors hover:bg-white/10"
          >
            <LogIn className="h-4 w-4" /> Log in
          </Link>
        </div>

        {/* App availability */}
        <div className="relative mt-5 flex items-center justify-center gap-3 text-white/75">
          <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide">
            <Bot className="h-4 w-4 text-brand-gold" /> Available on Android
          </span>
          <span className="h-3.5 w-px bg-white/20" />
          <span className="flex items-center gap-1.5 text-[11px] font-medium tracking-wide text-white/40">
            <Apple className="h-4 w-4" /> iOS Coming Soon
          </span>
        </div>
      </section>

      {/* ───────────── Everything in one app ───────────── */}
      <section className="px-5 pb-2 pt-7">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Everything in one app
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />

        <div className="mt-4 grid grid-cols-2 gap-3">
          {HUB_CARDS.map((hub) => (
            <Link
              key={hub.to}
              to="/auth"
              search={{ mode: "signup" } as never}
              className="group flex flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-soft transition-transform hover:-translate-y-0.5"
            >
              <span className={`grid h-11 w-11 place-items-center rounded-full ${hub.circle}`}>
                <hub.icon className="h-5 w-5" />
              </span>
              <span className="mt-4 flex items-center gap-1 text-[13px] font-bold text-brand-deep">
                {hub.title}
                <ChevronRight className="h-3.5 w-3.5 text-brand-ink/60 transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="mt-1 text-[11px] leading-snug text-muted-foreground">
                {hub.subtitle}
              </span>
            </Link>
          ))}

          {/* Get Started CTA card */}
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="group flex flex-col justify-between rounded-2xl gradient-primary p-4 text-white shadow-soft"
          >
            <span className="grid h-11 w-11 place-items-center rounded-full border border-white/30">
              <ArrowRight className="h-5 w-5" />
            </span>
            <span className="mt-4 flex items-center gap-1 text-[13px] font-bold">
              Get Started
              <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
            </span>
            <span className="mt-1 text-[11px] text-white/70">Join PESAKI today</span>
          </Link>
        </div>
      </section>

      {/* ───────────── Registered business badge ───────────── */}
      <section className="px-5 pt-6">
        <Link
          to="/about"
          className="flex items-center gap-3 rounded-2xl border border-brand-ink/15 bg-white p-4 shadow-soft transition-transform hover:-translate-y-0.5"
        >
          <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
            <ShieldCheck className="h-5 w-5" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block text-[13px] font-bold uppercase tracking-wide text-brand-deep">
              PESAKI MARKETING
            </span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">
              Registered Business Name
            </span>
            <span className="mt-0.5 block text-[10px] text-muted-foreground/80">
              BN-6ASR2E26 • BRS, Kenya
            </span>
          </span>
          <ChevronRight className="h-4 w-4 shrink-0 text-brand-ink/60" />
        </Link>
      </section>

      {/* ───────────── Why PESAKI? ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Why PESAKI?
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          PESAKI brings together practical digital services for work, business and financial access
          in one platform.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {SERVICES.map((service) => {
            const Icon = SERVICE_ICONS[service.key];
            return (
              <Link
                key={service.key}
                to="/auth"
                search={{ mode: "signup" } as never}
                className="group flex flex-col rounded-2xl border border-black/5 bg-white p-4 shadow-soft transition-transform hover:-translate-y-0.5"
              >
                <span className="grid h-10 w-10 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
                  <Icon className="h-[18px] w-[18px]" />
                </span>
                <span className="mt-3 flex items-center gap-1 text-[13px] font-bold text-brand-deep">
                  {service.name}
                  <ChevronRight className="h-3.5 w-3.5 text-brand-ink/60 transition-transform group-hover:translate-x-0.5" />
                </span>
                <span className="mt-1 text-[11px] leading-snug text-muted-foreground">
                  {service.description}
                </span>
              </Link>
            );
          })}
        </div>
      </section>

      {/* ───────────── How PESAKI works ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          How PESAKI works
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <div className="mt-4 overflow-hidden rounded-2xl bg-white shadow-soft">
          <ol>
            {HOW_IT_WORKS.map((step, i) => (
              <li
                key={step.title}
                className="flex items-start gap-3 border-b border-black/5 px-4 py-3.5 last:border-0"
              >
                <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full gradient-brand text-[11px] font-bold text-white">
                  {i + 1}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-[13px] font-semibold text-brand-deep">
                    {step.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] leading-snug text-muted-foreground">
                    {step.body}
                  </span>
                </span>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* ───────────── Business Hub funding model ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Business Hub: how funding works
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <Card className="mt-4 !p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-tint-gold text-brand-gold-deep">
              <Building2 className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-brand-deep">Mentorship, then an agreement</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                Business Hub is designed to support small and emerging businesses. Eligible
                entrepreneurs may receive approximately 3 hours of structured mentorship focused on
                understanding and starting or growing an SME — covering business fundamentals, how
                the business will operate, the responsibilities that come with funding, and how the
                business will be monitored.
              </p>
            </div>
          </div>
          <ul className="mt-3 space-y-2">
            {[
              "The parties agree on the applicable terms.",
              "The entrepreneur signs the relevant agreement.",
              "Funding is provided according to the agreement.",
              "PESAKI monitors the supported business and provides ongoing guidance.",
              "The entrepreneur provides the agreed return according to the contract.",
            ].map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <div className="mt-3 rounded-xl bg-brand-tint-gold p-3">
            <p className="text-[11px] leading-relaxed text-brand-gold-deep">
              The current intended model is{" "}
              <span className="font-bold">an agreed 10% of monthly business profit</span> under the
              signed agreement. This is a share of profit, not company ownership.
            </p>
          </div>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Funding is subject to eligibility, assessment and approval. Terms are disclosed and
            agreed before funding is provided.
          </p>
          <Link
            to="/business-funding"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Read the full funding model <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>

      {/* ───────────── Referrals ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Earn through referrals
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <Card className="mt-4 !p-4">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
              <Users className="h-[18px] w-[18px]" />
            </span>
            <div className="min-w-0">
              <p className="text-[13px] font-bold text-brand-deep">{REFERRAL.headline}</p>
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                You earn 10% of your referred user&apos;s first qualifying deposit,{" "}
                {REFERRAL.creditWindow}. Your referred user receives a {REFERRAL.welcomeBonus}.
              </p>
            </div>
          </div>
          <ol className="mt-3 space-y-1.5">
            {[
              "Register for PESAKI.",
              "Log in to your account.",
              "Open the Referral section in your profile.",
              "Find your unique referral link or code.",
              "Share it with people you know.",
              "Eligible referral activity generates earnings according to the current referral programme.",
              "Track referral activity and earnings from your account.",
              "Withdraw or use earnings according to the currently supported withdrawal rules.",
            ].map((item, i) => (
              <li key={item} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <span className="mt-px grid h-4 w-4 shrink-0 place-items-center rounded-full bg-brand-tint-green text-[9px] font-bold text-brand-ink">
                  {i + 1}
                </span>
                <span>{item}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            Earn 10% of your referred user&apos;s first qualifying deposit, and they receive a{" "}
            {REFERRAL.welcomeBonus}. Eligibility conditions: {REFERRAL.conditions.join(" ")}
          </p>
          <Link
            to="/auth"
            search={{ mode: "signup" } as never}
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Create your account to get a referral code <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>

      {/* ───────────── Account visibility ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Your account &amp; transaction visibility
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <Card className="mt-4 !p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Once you are logged in, the current application shows you:
          </p>
          <ul className="mt-3 grid grid-cols-1 gap-2">
            {ACCOUNT_VISIBILITY.map((item) => (
              <li key={item} className="flex items-start gap-2 text-[11px] text-muted-foreground">
                <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
          <p className="mt-3 text-[11px] leading-relaxed text-muted-foreground">
            These are the account records PESAKI provides inside the app. If a figure does not look
            right, contact the Help Center and we will look into it with you.
          </p>
          <Link
            to="/terms"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Review the Terms of Service <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>

      {/* ───────────── Need clarification? ───────────── */}
      <section className="px-5 pb-2 pt-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Need clarification?
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <Card className="mt-4 !p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            You don&apos;t have to rely on information from social media, search engines or third
            parties to understand PESAKI. For questions about your account or any PESAKI service,
            contact us directly or visit our offices.
          </p>
          <div className="mt-3 space-y-2">
            {[
              {
                label: "WhatsApp / Help Center",
                value: COMPANY.whatsapp,
                href: `https://wa.me/${COMPANY.whatsappDial}`,
              },
              { label: "Email", value: COMPANY.email, href: `mailto:${COMPANY.email}` },
              { label: "Official website", value: "pesaki.co.ke", href: COMPANY.website },
            ].map((row) => (
              <a
                key={row.label}
                href={row.href}
                target={row.href.startsWith("http") ? "_blank" : undefined}
                rel="noopener noreferrer"
                className="flex items-center justify-between gap-3 rounded-xl bg-brand-tint-green px-3 py-2.5"
              >
                <span className="min-w-0">
                  <span className="block text-[10px] uppercase tracking-wide text-brand-ink/70">
                    {row.label}
                  </span>
                  <span className="block truncate text-[12px] font-semibold text-brand-deep">
                    {row.value}
                  </span>
                </span>
                <ChevronRight className="h-3.5 w-3.5 shrink-0 text-brand-ink/60" />
              </a>
            ))}
          </div>
          <div className="mt-3 space-y-2">
            {OFFICES.map((office) => (
              <div key={office.name} className="flex items-start gap-2.5">
                <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                <div className="min-w-0">
                  <p className="text-[11px] font-semibold text-foreground">
                    {office.name} — {office.address}
                  </p>
                  <p className="mt-0.5 text-[10px] leading-relaxed text-muted-foreground">
                    {office.note}
                  </p>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-3 text-[10px] leading-relaxed text-muted-foreground">
            Users should review the applicable Terms of Service and service-specific agreements
            before proceeding.
          </p>
          <Link
            to="/contact"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Contact PESAKI <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
      </section>

      {/* ───────────── Why trust PESAKI? ───────────── */}
      <section className="px-5 py-8">
        <h2 className="font-display text-lg font-bold tracking-tight text-brand-deep">
          Why trust PESAKI?
        </h2>
        <span className="mt-2 block h-1 w-9 rounded-full bg-brand-gold" />
        <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
          Not a promise — verifiable information. Anyone can check the following.
        </p>
        <div className="mt-4 grid grid-cols-2 gap-3">
          {TRUST_ITEMS.map((item) => {
            const content = (
              <>
                <span className="grid h-9 w-9 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
                  <item.icon className="h-4 w-4" />
                </span>
                <span className="mt-2 block text-[11px] font-bold text-brand-deep">
                  {item.label}
                </span>
                <span className="mt-0.5 block text-[10px] leading-snug text-muted-foreground">
                  {item.value}
                </span>
              </>
            );
            const className =
              "flex flex-col rounded-2xl border border-black/5 bg-white p-3.5 shadow-soft";
            return (
              <Link key={item.label} to={item.to} className={className}>
                {content}
              </Link>
            );
          })}
        </div>
        <Card className="mt-3 !p-4">
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            {REGULATORY_STATEMENT} {REGISTRATION_STATEMENT}
          </p>
          <Link
            to="/compliance"
            className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-semibold text-brand-ink hover:underline"
          >
            Open the Compliance &amp; Trust Center <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </Card>
        <p className="mt-6 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {COMPANY.legalName} · {COMPANY.registrationNumber} · Nairobi, Kenya
        </p>
      </section>
    </div>
  );
}

function RemindersSection({ transactions }: { transactions: any[] }) {
  const items: { title: string; body: string; tone: "primary" | "gold" | "success" | "warning" }[] =
    [];

  const pendingWithdrawal = transactions.find((t) => t.status === "Pending");
  if (pendingWithdrawal) {
    items.push({
      title: "Pending wallet activity",
      body: `${pendingWithdrawal.type || "Transaction"} · ${pendingWithdrawal.date || "Today"}`,
      tone: "warning",
    });
  }

  if (items.length === 0) return null;

  return (
    <section className="mt-6 px-5">
      <SectionTitle
        title="Reminders & alerts"
        action={
          <Link to="/kazi" className="text-xs font-semibold text-primary">
            Open
          </Link>
        }
      />
      <div className="space-y-2">
        {items.map((it, i) => (
          <Card key={i} className="!p-3 flex items-start gap-3">
            <span
              className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
                it.tone === "success"
                  ? "bg-success/15 text-success"
                  : it.tone === "gold"
                    ? "bg-gold/15 text-gold-foreground"
                    : it.tone === "warning"
                      ? "bg-warning/15 text-warning"
                      : "bg-primary/10 text-primary"
              }`}
            >
              <Bell className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <p className="text-sm font-semibold">{it.title}</p>
              <p className="text-[11px] text-muted-foreground">{it.body}</p>
            </div>
          </Card>
        ))}
      </div>
    </section>
  );
}
