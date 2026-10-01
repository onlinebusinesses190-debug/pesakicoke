import { Link, useRouterState, useNavigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  Home,
  LineChart,
  Briefcase,
  Building2,
  Landmark,
  Wallet,
  User,
  Info,
  ShieldCheck,
  Lock,
  Headset,
} from "lucide-react";
import { useAuth } from "@/hooks/useAuth";

/** Authenticated application navigation. Used everywhere inside the signed-in app. */
const appNav = [
  { to: "/", label: "Home", sub: "", icon: Home },
  { to: "/trading", label: "Trading", sub: "", icon: LineChart },
  { to: "/kazi", label: "KAZI", sub: "Link", icon: Briefcase },
  { to: "/business", label: "Business", sub: "Funding", icon: Building2 },
  { to: "/banking", label: "Banking", sub: "Hub", icon: Landmark },
  { to: "/wallet", label: "Wallet", sub: "", icon: Wallet },
  { to: "/profile", label: "Profile", sub: "", icon: User },
] as const;

/**
 * Public/guest navigation. Trading, Wallet and Profile are intentionally absent:
 * they are authenticated-only areas and must not be advertised to signed-out
 * visitors. All targets are real, publicly reachable routes.
 */
const publicNav = [
  { to: "/", label: "Home", sub: "", icon: Home },
  { to: "/kazi", label: "KAZI", sub: "Link", icon: Briefcase },
  { to: "/business", label: "Business", sub: "Hub", icon: Building2 },
  { to: "/banking", label: "Banking", sub: "Hub", icon: Landmark },
  { to: "/about", label: "About", sub: "", icon: Info },
  { to: "/compliance", label: "Compliance", sub: "", icon: ShieldCheck },
  { to: "/security", label: "Security", sub: "", icon: Lock },
  { to: "/contact", label: "Contact", sub: "", icon: Headset },
] as const;

export function AppShell({
  children,
  variant = "app",
}: {
  children: ReactNode;
  /** "public" shows the guest navigation, "app" shows the authenticated one. */
  variant?: "public" | "app";
}) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const { user, ready } = useAuth();

  const nav = variant === "public" ? publicNav : appNav;
  const isPublic = variant === "public";
  // All 8 public links must fit on ONE row; the 7-item app nav is unaffected.
  const columns = isPublic ? "grid-cols-8" : "grid-cols-7";

  return (
    <div className="mx-auto flex min-h-screen w-full max-w-md flex-col bg-background">
      {/* ✅ Main content – now scrollable */}
      <main className="flex-1 overflow-y-auto pb-24">{children}</main>

      <nav
        className="fixed inset-x-0 bottom-0 z-50 mx-auto w-full max-w-md border-t border-border bg-card/90 px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 backdrop-blur-xl"
        aria-label={variant === "public" ? "Public" : "Primary"}
      >
        <ul className={["grid", columns].join(" ")}>
          {nav.map((item) => {
            const active = item.to === "/" ? pathname === "/" : pathname.startsWith(item.to);
            const Icon = item.icon;
            // Public links are all reachable without a session; only the app nav
            // needs the guest redirect to /auth.
            const requiresAuth = variant !== "public" && item.to !== "/";
            return (
              <li key={item.to} className="flex">
                <Link
                  to={item.to}
                  onClick={(e) => {
                    if (requiresAuth && (!ready || !user)) {
                      e.preventDefault();
                      window.location.href = "/auth?redirect=" + encodeURIComponent(item.to);
                    }
                  }}
                  className={[
                    isPublic
                      ? "relative flex w-full flex-col items-center gap-0.5 rounded-lg px-0.5 py-1.5 text-[8.5px] font-medium leading-tight transition-colors"
                      : "flex w-full flex-col items-center gap-0.5 rounded-xl px-0.5 py-1.5 text-[10px] font-medium transition-colors",
                    isPublic
                      ? active
                        ? "text-brand-deep"
                        : "text-muted-foreground hover:text-foreground"
                      : active
                        ? "text-primary"
                        : "text-muted-foreground hover:text-foreground",
                  ].join(" ")}
                >
                  {isPublic && active && (
                    <span className="absolute -top-[0.3rem] left-1/2 h-[3px] w-5 -translate-x-1/2 rounded-full bg-brand-gold" />
                  )}
                  <span
                    className={[
                      isPublic
                        ? "grid h-7 w-7 place-items-center rounded-lg transition-all"
                        : "grid h-8 w-8 place-items-center rounded-lg transition-all",
                      !isPublic && active ? "bg-primary/10" : "",
                    ].join(" ")}
                  >
                    <Icon
                      className={isPublic ? "h-[15px] w-[15px]" : "h-4 w-4"}
                      strokeWidth={active ? 2.5 : 2}
                    />
                  </span>
                  <span className="flex flex-col items-center leading-tight">
                    <span className="truncate">{item.label}</span>
                    {item.sub && <span className="truncate text-[8px] opacity-80">{item.sub}</span>}
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
