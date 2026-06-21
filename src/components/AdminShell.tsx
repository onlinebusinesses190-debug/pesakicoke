import { Link, useRouterState, type LinkProps } from "@tanstack/react-router";
import { useState, type ReactNode } from "react";
import {
  LayoutDashboard, Users, Wallet, Briefcase, Building2, Landmark,
  LineChart, Bell, LifeBuoy, Share2, BarChart3, Search, Menu, X, Shield,
} from "lucide-react";

const nav: { to: LinkProps["to"]; label: string; icon: typeof Users }[] = [
  { to: "/admin",               label: "Dashboard",     icon: LayoutDashboard },
  { to: "/admin/users",         label: "Users & KYC",   icon: Users },
  { to: "/admin/finance",       label: "Finance",       icon: Wallet },
  { to: "/admin/kazi",          label: "KAZI Link",     icon: Briefcase },
  { to: "/admin/business",      label: "Business",      icon: Building2 },
  { to: "/admin/banking",       label: "Banking Plans", icon: Landmark },
  { to: "/admin/trading",       label: "Trading",       icon: LineChart },
  { to: "/admin/notifications", label: "Notifications", icon: Bell },
  { to: "/admin/support",       label: "Support",       icon: LifeBuoy },
  { to: "/admin/commissions",   label: "Commissions",   icon: Share2 },
  { to: "/admin/reports",       label: "Reports",       icon: BarChart3 },
];

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(false);

  return (
    <div className="min-h-screen w-full bg-muted/40 text-foreground">
      {/* Sidebar */}
      <aside
        className={[
          "fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-card transition-transform lg:translate-x-0",
          open ? "translate-x-0" : "-translate-x-full",
        ].join(" ")}
      >
        <div className="flex h-16 items-center justify-between gap-2 border-b border-border px-5">
          <Link to="/admin" className="flex items-center gap-2">
            <span className="grid h-9 w-9 place-items-center rounded-xl gradient-primary text-primary-foreground">
              <Shield className="h-4 w-4" />
            </span>
            <span className="flex flex-col leading-tight">
              <span className="font-display text-base font-bold tracking-tight">PESAKI</span>
              <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Admin Console</span>
            </span>
          </Link>
          <button
            className="rounded-md p-1.5 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(false)}
            aria-label="Close menu"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <nav className="px-3 py-4">
          <ul className="space-y-1">
            {nav.map((item) => {
              const active = item.to === "/admin" ? pathname === "/admin" : pathname.startsWith(item.to as string);
              const Icon = item.icon;
              return (
                <li key={item.to as string}>
                  <Link
                    to={item.to}
                    onClick={() => setOpen(false)}
                    className={[
                      "flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors",
                      active
                        ? "bg-primary/10 text-primary"
                        : "text-muted-foreground hover:bg-muted hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                    {item.label}
                  </Link>
                </li>
              );
            })}
          </ul>
          <div className="mt-6 rounded-xl border border-border bg-muted/50 p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">System</p>
            <p className="mt-1 text-xs text-foreground">All services operational</p>
            <div className="mt-2 flex items-center gap-1.5">
              <span className="h-2 w-2 animate-pulse rounded-full bg-success" />
              <span className="text-[11px] text-success">99.98% uptime</span>
            </div>
          </div>
        </nav>
      </aside>

      {/* Mobile backdrop */}
      {open && (
        <div className="fixed inset-0 z-30 bg-black/40 lg:hidden" onClick={() => setOpen(false)} />
      )}

      {/* Main */}
      <div className="lg:pl-64">
        <header className="sticky top-0 z-20 flex h-16 items-center gap-3 border-b border-border bg-background/90 px-4 backdrop-blur-xl sm:px-6">
          <button
            className="rounded-md p-2 text-muted-foreground hover:bg-muted lg:hidden"
            onClick={() => setOpen(true)}
            aria-label="Open menu"
          >
            <Menu className="h-5 w-5" />
          </button>
          <div className="relative hidden flex-1 max-w-md md:block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
            <input
              className="h-9 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm outline-none transition focus:border-primary"
              placeholder="Search users, transactions, tickets…"
            />
          </div>
          <div className="ml-auto flex items-center gap-3">
            <Link to="/" className="hidden text-xs font-medium text-muted-foreground hover:text-foreground sm:inline">
              ← Back to app
            </Link>
            <span className="grid h-9 w-9 place-items-center rounded-full bg-primary text-xs font-bold text-primary-foreground">AD</span>
          </div>
        </header>
        <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
      </div>
    </div>
  );
}

export function AdminPageHeader({
  title, subtitle, actions,
}: { title: string; subtitle?: string; actions?: ReactNode }) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
        {subtitle && <p className="mt-1 text-sm text-muted-foreground">{subtitle}</p>}
      </div>
      {actions}
    </div>
  );
}

export function AdminCard({
  children, className = "", title, action,
}: { children: ReactNode; className?: string; title?: string; action?: ReactNode }) {
  return (
    <div className={`rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)] ${className}`}>
      {title && (
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-sm font-semibold text-foreground">{title}</h3>
          {action}
        </div>
      )}
      {children}
    </div>
  );
}

export function KPI({
  label, value, hint, tone = "primary",
}: { label: string; value: string; hint?: string; tone?: "primary" | "gold" | "success" | "destructive" }) {
  const tones: Record<string, string> = {
    primary: "text-primary bg-primary/10",
    gold: "text-gold-foreground bg-gold/15",
    success: "text-success bg-success/15",
    destructive: "text-destructive bg-destructive/15",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-5 shadow-[var(--shadow-card)]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">{label}</p>
        <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${tones[tone]}`}>{tone === "destructive" ? "Alert" : "Live"}</span>
      </div>
      <p className="mt-2 text-2xl font-bold tracking-tight">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function StatusPill({ status }: { status: string }) {
  const map: Record<string, string> = {
    Active: "bg-success/15 text-success",
    Live: "bg-success/15 text-success",
    Completed: "bg-success/15 text-success",
    Verified: "bg-success/15 text-success",
    Approved: "bg-success/15 text-success",
    Resolved: "bg-success/15 text-success",
    Disbursed: "bg-primary/10 text-primary",
    Pending: "bg-warning/20 text-warning-foreground",
    Reviewing: "bg-warning/20 text-warning-foreground",
    "In Review": "bg-warning/20 text-warning-foreground",
    "Awaiting User": "bg-warning/20 text-warning-foreground",
    Open: "bg-primary/10 text-primary",
    Filled: "bg-muted text-muted-foreground",
    Paused: "bg-muted text-muted-foreground",
    Suspended: "bg-destructive/15 text-destructive",
    Rejected: "bg-destructive/15 text-destructive",
    Failed: "bg-destructive/15 text-destructive",
    Flagged: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}
