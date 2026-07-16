import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowDownToLine, ArrowUpFromLine, ArrowLeftRight, LineChart,
  Bell, Eye, EyeOff, TrendingUp, ChevronRight, Sparkles, LogIn,
  Briefcase, Building2, Landmark,
} from "lucide-react";
import { useState } from "react";
import { AppShell } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { user, stats, opportunities, fmt } from "@/lib/mock";
import { useAuth } from "@/hooks/useAuth";
import { useBalance } from "@/lib/balance";
import { useKazi } from "@/lib/kazi-store";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "PESAKI — Dashboard" },
      { name: "description", content: "Your PESAKI dashboard: wallet, earnings, trades, jobs, and opportunities." },
    ],
  }),
  component: HomePage,
});

function HomePage() {
  const [show, setShow] = useState(true);
  const { user: authUser } = useAuth();
  const state = useBalance();
  const displayName = authUser?.user_metadata?.full_name?.split(" ")[0] || authUser?.email?.split("@")[0] || user.name;


  return (
    <AppShell>
      {/* Hero */}
      <section className="gradient-primary relative overflow-hidden px-5 pb-8 pt-6 text-primary-foreground">
        <div className="absolute -right-16 -top-16 h-56 w-56 rounded-full bg-gold/20 blur-3xl" />
        <div className="relative flex items-start justify-between">
          <div className="min-w-0">
            <p className="text-xs/4 opacity-80">Welcome{authUser ? " back" : ""},</p>
            <h1 className="truncate text-2xl font-bold">{displayName} 👋</h1>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button className="grid h-10 w-10 place-items-center rounded-full bg-white/10 backdrop-blur">
              <Bell className="h-5 w-5" />
            </button>
            {authUser ? (
              <Link to="/profile" className="grid h-10 w-10 place-items-center rounded-full bg-gold text-gold-foreground font-bold">
                {(displayName[0] ?? "P").toUpperCase()}
              </Link>
            ) : (
              <div className="flex items-center gap-1.5">
                <Link
                  to="/auth"
                  search={{ mode: "signin" } as never}
                  className="inline-flex h-9 items-center gap-1 rounded-full bg-white/15 px-3 text-[11px] font-semibold backdrop-blur"
                >
                  <LogIn className="h-3.5 w-3.5" /> Log in
                </Link>
                <Link
                  to="/auth"
                  search={{ mode: "signup" } as never}
                  className="inline-flex h-9 items-center rounded-full bg-gold px-3 text-[11px] font-semibold text-gold-foreground"
                >
                  Sign up
                </Link>
              </div>
            )}
          </div>
        </div>

        <div className="relative mt-6 rounded-3xl bg-white/10 p-5 backdrop-blur-md ring-1 ring-white/15">
          <div className="flex items-center justify-between">
            <p className="text-xs uppercase tracking-wider opacity-80">Available Balance</p>
            <button onClick={() => setShow(!show)} className="opacity-80">
              {show ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
            </button>
          </div>
          <p className="mt-1 font-display text-3xl font-bold tracking-tight">
            {show ? fmt(state.available) : "•••••••"}

          </p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Total Earnings</p>
              <p className="mt-0.5 font-semibold">{show ? fmt(user.totalEarnings) : "•••"}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Referral Earnings</p>
              <p className="mt-0.5 font-semibold">{show ? fmt(user.referralEarnings) : "•••"}</p>
            </div>
          </div>
        </div>
      </section>

      {/* Quick actions */}
      <section className="-mt-5 px-5">
        <Card className="grid grid-cols-4 gap-2">
          {[
            { label: "Deposit",  icon: ArrowDownToLine, to: "/wallet" },
            { label: "Withdraw", icon: ArrowUpFromLine, to: "/wallet" },
            { label: "Transfer", icon: ArrowLeftRight,  to: "/wallet" },
            { label: "Trading",  icon: LineChart,       to: "/trading" },
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
            <Stat key={s.label} label={s.label} value={s.value} hint={s.trend} tone={s.tone} />
          ))}
        </div>
      </section>

      {/* Reminders */}
      <RemindersSection />



      {/* Explore hubs */}
      <section className="mt-6 px-5">
        <SectionTitle title="Explore hubs" />
        <div className="grid grid-cols-2 gap-3">
          <Link to="/trading" className="group relative overflow-hidden rounded-2xl gradient-primary p-4 text-primary-foreground shadow-[var(--shadow-card)]">
            <LineChart className="mb-6 h-5 w-5 opacity-90" />
            <p className="text-sm font-bold">Trading Floor</p>
            <p className="mt-0.5 text-[11px] opacity-80">FX · Up/Down · Aviator</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 opacity-70 transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/kazi" className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-primary/10 text-primary">
              <Briefcase className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">KAZI Link</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Find work · Hire talent</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/business" className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl gradient-gold text-gold-foreground">
              <Building2 className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">Business Funding</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Grow · Fund · Scale</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link to="/banking" className="group relative overflow-hidden rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)]">
            <span className="mb-6 grid h-9 w-9 place-items-center rounded-xl bg-success/15 text-success">
              <Landmark className="h-4 w-4" />
            </span>
            <p className="text-sm font-bold">Banking Hub</p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">Save · Lock · Borrow</p>
            <ChevronRight className="absolute bottom-3 right-3 h-4 w-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" />
          </Link>
        </div>
      </section>



      {/* Promo banner */}
      <section className="mt-6 px-5">
        <div className="relative overflow-hidden rounded-2xl gradient-gold p-5 text-gold-foreground">
          <Sparkles className="absolute -right-2 -top-2 h-24 w-24 opacity-20" />
          <p className="text-[11px] font-semibold uppercase tracking-wider">Featured</p>
          <h3 className="mt-1 max-w-[80%] text-lg font-bold leading-snug">
            Grow your savings at 12% APY
          </h3>
          <p className="mt-1 max-w-[85%] text-xs opacity-80">
            Lock funds for 90 days and earn premium interest.
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
        <SectionTitle title="Latest opportunities" action={<Link to="/kazi" className="text-xs font-semibold text-primary">See all</Link>} />
        <div className="space-y-2.5">
          {opportunities.map((o) => (
            <Card key={o.title} className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">{o.category}</p>
                  <p className="mt-0.5 truncate text-sm font-semibold">{o.title}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">{o.pay}</p>
                </div>
                <Badge tone={o.tag === "Urgent" ? "destructive" : o.tag === "Hot" ? "warning" : "gold"}>
                  {o.tag}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      {/* Recent transactions */}
      <section className="mt-7 px-5">
        <SectionTitle title="Recent transactions" action={<Link to="/wallet" className="text-xs font-semibold text-primary">View wallet</Link>} />
        <Card className="!p-2">
          <ul className="divide-y divide-border">
            {state.transactions.slice(0, 5).map((t) => {

              const positive = t.amount > 0;
              return (
                <li key={t.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 px-2 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-full ${positive ? "bg-success/15 text-success" : "bg-muted text-muted-foreground"}`}>
                      <TrendingUp className={`h-4 w-4 ${positive ? "" : "rotate-180"}`} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold">{t.type}</p>
                      <p className="truncate text-[11px] text-muted-foreground">{t.date} · {t.status}</p>
                    </div>
                  </div>
                  <p className={`text-sm font-bold ${positive ? "text-success" : "text-foreground"}`}>
                    {positive ? "+" : ""}{fmt(t.amount).replace("KES ", "")}
                  </p>
                </li>
              );
            })}
          </ul>
        </Card>
      </section>

      <p className="mt-8 px-5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PESAKI · Earn. Invest. Grow.
      </p>
    </AppShell>
  );
}

function RemindersSection() {
  const kazi = useKazi();
  const bal = useBalance();
  const items: { title: string; body: string; tone: "primary" | "gold" | "success" | "warning" }[] = [];

  const pending = kazi.applications.filter((a) => a.status === "Pending").length;
  const hired = kazi.applications.filter((a) => a.status === "Hired").length;
  const unreadMsgs = kazi.messages.filter((m) => m.from === "employer").length; // heuristic for worker side
  const unreadNotifs = kazi.notifications.filter((n) => !n.read).length;
  const pendingWithdrawal = bal.transactions.find((t) => t.status === "Pending");

  if (pending > 0) items.push({ title: `${pending} application${pending > 1 ? "s" : ""} pending`, body: "We'll notify you when an employer responds.", tone: "primary" });
  if (hired > 0) items.push({ title: `${hired} job${hired > 1 ? "s" : ""} confirmed`, body: "Head to KAZI Link → My Panel to receive your payout.", tone: "success" });
  if (unreadMsgs > 0) items.push({ title: `New messages`, body: "Employers have messaged you on KAZI Link.", tone: "gold" });
  if (unreadNotifs > 0) items.push({ title: `${unreadNotifs} new notification${unreadNotifs > 1 ? "s" : ""}`, body: "Open KAZI Link to review.", tone: "warning" });
  if (pendingWithdrawal) items.push({ title: "Pending wallet activity", body: `${pendingWithdrawal.type} · ${pendingWithdrawal.date}`, tone: "warning" });

  if (items.length === 0) return null;

  return (
    <section className="mt-6 px-5">
      <SectionTitle title="Reminders & alerts" action={<Link to="/kazi" className="text-xs font-semibold text-primary">Open</Link>} />
      <div className="space-y-2">
        {items.map((it, i) => (
          <Card key={i} className="!p-3 flex items-start gap-3">
            <span className={`mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-lg ${
              it.tone === "success" ? "bg-success/15 text-success" :
              it.tone === "gold" ? "bg-gold/15 text-gold-foreground" :
              it.tone === "warning" ? "bg-warning/15 text-warning" :
              "bg-primary/10 text-primary"
            }`}>
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
