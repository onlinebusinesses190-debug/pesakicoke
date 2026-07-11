import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Home, LineChart, Briefcase, Building2, Landmark, Wallet, User,
} from "lucide-react";

const nav = [
  { to: "/",         label: "Home",     sub: "",        icon: Home },
  { to: "/trading",  label: "Trading",  sub: "",        icon: LineChart },
  { to: "/kazi",     label: "KAZI",     sub: "Link",    icon: Briefcase },
  { to: "/business", label: "Business", sub: "Funding", icon: Building2 },
  { to: "/banking",  label: "Banking",  sub: "Hub",     icon: Landmark },
  { to: "/wallet",   label: "Wallet",   sub: "",        icon: Wallet },
  { to: "/profile",  label: "Profile",  sub: "",        icon: User },
] as const;

export function AppShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      <main className="flex-1 pb-24">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-border bg-card/90 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        aria-label="Primary"
      >
        <ul className="grid grid-cols-7">
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            return (
              <li key={item.to} className="flex">
                <Link
                  to={item.to}
                  className={[
                    "flex w-full flex-col items-center gap-0.5 rounded-xl px-1 py-1.5 text-[10px] font-medium transition-colors",
                    active
                      ? "text-primary"
                      : "text-muted-foreground hover:text-foreground",
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
    </div>
  );
}

export function PageHeader({ title, subtitle, right }: { title: string; subtitle?: string; right?: ReactNode }) {
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
