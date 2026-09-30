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

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* ✅ Main content – now scrollable */}
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      {/* Floating CTA for public users */}
      {!isAuthed && ready && (
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
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-border bg-card/90 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        aria-label="Primary"
      >
        <ul className={nav.length > 7 ? "grid grid-cols-4" : "grid grid-cols-7"}>
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex">
                <Link
                  to={item.to}
                  className={[
                    "flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  <span
                    className={[
                      "grid h-8 w-8 place-items-center rounded-lg transition-all",
                      active ? "bg-primary/10" : "",
                    ].join(" ")}
                  >
                    <Icon className="h-4 w-4" strokeWidth={active ? 2.5 : 2} />
                  </span>
                  <span className="flex flex-col items-center leading-tight">
                    <span className="truncate">{item.label}</span>
                    {item.sub && <span className="truncate text-[9px] opacity-80">{item.sub}</span>}
                  </span>
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
            className="font-semibold text-primary hover:underline"
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
