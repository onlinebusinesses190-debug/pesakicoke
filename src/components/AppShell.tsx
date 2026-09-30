import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useEffect } from "react";
import { useAuth } from "@/hooks/useAuth";
import {
  Home,
  LineChart,
  Briefcase,
  Building2,
  Landmark,
  Wallet,
  User,
  Info,
  Shield,
  Mail,
  Scale,
  LogIn,
  LayoutDashboard,
  UserPlus,
} from "lucide-react";
import { registerSW } from "virtual:pwa-register";
import { PesakiLogo, PesakiWordmark } from "@/components/PesakiLogo";

const authedNav = [
  { to: "/", label: "Dashboard", sub: "", icon: LayoutDashboard },
  { to: "/wallet", label: "Wallet", sub: "", icon: Wallet },
  { to: "/kazi", label: "KAZI", sub: "Link", icon: Briefcase },
  { to: "/business", label: "Business", sub: "Hub", icon: Building2 },
  { to: "/banking", label: "Banking", sub: "Hub", icon: Landmark },
  { to: "/trading", label: "Trading", sub: "", icon: LineChart },
  { to: "/profile", label: "Profile", sub: "", icon: User },
] as const;

const publicNav = [
  { to: "/", label: "Home", sub: "", icon: Home },
  { to: "/kazi", label: "KAZI", sub: "Link", icon: Briefcase },
  { to: "/business", label: "Business", sub: "Hub", icon: Building2 },
  { to: "/banking", label: "Banking", sub: "Hub", icon: Landmark },
  { to: "/about", label: "About", sub: "", icon: Info },
  { to: "/compliance", label: "Compliance", sub: "", icon: Scale },
  { to: "/security", label: "Security", sub: "", icon: Shield },
  { to: "/contact", label: "Contact", sub: "", icon: Mail },
] as const;

const footerGroups = [
  {
    title: "Company",
    links: [
      { to: "/about", label: "About" },
      { to: "/business-funding", label: "Business Funding" },
      { to: "/security", label: "Security" },
      { to: "/contact", label: "Contact" },
    ],
  },
  {
    title: "Legal",
    links: [
      { to: "/compliance", label: "Compliance" },
      { to: "/terms", label: "Terms of Service" },
      { to: "/privacy", label: "Privacy Policy" },
    ],
  },
  {
    title: "Support",
    links: [
      { to: "/contact", label: "Help Center" },
      { to: "/wallet", label: "Wallet" },
      { to: "/profile", label: "Profile" },
    ],
  },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { session, ready } = useAuth();

  const isAuthed = ready && !!session;
  const nav = isAuthed ? authedNav : publicNav;

  useEffect(() => {
    const updateSW = registerSW({
      immediate: true,
      onNeedRefresh() {
        if (confirm("PESAKI has been updated. Reload now?")) {
          updateSW(true);
        }
      },
      onOfflineReady() {
        console.log("PESAKI is ready for offline use");
      },
    });
  }, []);

  const isLanding = pathname === "/";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* App header (after login) */}
      {isAuthed && (
        <header className="flex items-center justify-between gap-3 border-b border-border/70 bg-card/85 px-5 py-2.5 backdrop-blur-xl">
          <div className="flex min-w-0 items-center gap-2.5">
            <PesakiLogo size={36} tone="dark" className="glow-green" />
            <PesakiWordmark size="sm" tone="dark" tagline="" />
          </div>
          <Link
            to="/profile"
            aria-label="Profile"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-background text-brand-ink"
          >
            <User className="h-4 w-4" />
          </Link>
        </header>
      )}

      {/* ✅ Main content – now scrollable */}
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Floating CTA for public users (landing page has its own hero CTAs) */}
      {!isAuthed && ready && !isLanding && (
        <div className="fixed inset-x-0 bottom-20 z-40 mx-auto w-full max-w-md px-4 pointer-events-none">
          <div className="flex gap-2 pointer-events-auto">
            <Link
              to="/auth"
              search={{ mode: "signin" } as never}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl border border-border bg-background px-4 py-3 text-sm font-semibold transition-colors hover:bg-muted"
            >
              <LogIn className="h-4 w-4" /> Log in
            </Link>
            <Link
              to="/auth"
              search={{ mode: "signup" } as never}
              className="flex-1 inline-flex items-center justify-center gap-1.5 rounded-xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground transition-colors hover:opacity-90"
            >
              <UserPlus className="h-4 w-4" /> Get Started
            </Link>
          </div>
        </div>
      )}

      <nav
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-border/70 bg-card/92 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-1.5 backdrop-blur-xl"
        aria-label="Primary"
      >
        <ul className={nav.length > 7 ? "grid grid-cols-8" : "grid grid-cols-7"}>
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex">
                <Link
                  to={item.to}
                  className="flex w-full flex-col items-center gap-0.5 rounded-lg px-0.5 py-1 transition-colors"
                >
                  <Icon
                    className={
                      active
                        ? "h-[18px] w-[18px] text-brand-ink"
                        : "h-[18px] w-[18px] text-muted-foreground"
                    }
                    strokeWidth={active ? 2.4 : 1.9}
                  />
                  <span
                    className={[
                      "flex max-w-full flex-col items-center text-center leading-tight",
                      active ? "text-brand-ink" : "text-muted-foreground",
                    ].join(" ")}
                  >
                    <span className="truncate text-[9px] font-semibold">{item.label}</span>
                    {item.sub && <span className="truncate text-[8px] opacity-75">{item.sub}</span>}
                  </span>
                  <span
                    className={
                      active
                        ? "h-0.5 w-4 rounded-full bg-brand-gold"
                        : "h-0.5 w-4 rounded-full bg-transparent"
                    }
                  />
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Business details footer */}
      <footer className="border-t border-border bg-card/50 px-5 py-5 text-center">
        <div className="grid grid-cols-3 gap-3">
          {footerGroups.map((group) => (
            <div key={group.title} className="min-w-0">
              <p className="text-[10px] font-semibold uppercase tracking-[0.15em] text-muted-foreground">
                {group.title}
              </p>
              <ul className="mt-1.5 space-y-1">
                {group.links.map((link) => (
                  <li key={`${group.title}-${link.label}`}>
                    <Link
                      to={link.to}
                      className="block truncate text-[11px] font-medium text-foreground hover:text-primary"
                    >
                      {link.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[10px] leading-relaxed text-muted-foreground">
          PESAKI MARKETING · BN-6ASR2E26 · Nairobi, Kenya.{" "}
          <a
            href="https://wa.me/254140399389"
            target="_blank"
            rel="noopener noreferrer"
            className="font-semibold text-brand-ink hover:underline"
          >
            Help Center
          </a>
        </p>
      </footer>
    </div>
  );
}

export function PageHeader({
  title,
  subtitle,
  right,
}: {
  title: string;
  subtitle?: string;
  right?: ReactNode;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-5 py-4 backdrop-blur-xl">
      <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-xl font-bold tracking-tight">{title}</h1>
          {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        {right}
      </div>
    </header>
  );
}
