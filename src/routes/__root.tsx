import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouterState,
  useNavigate,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { toast } from "sonner";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CookieBanner } from "../components/CookieBanner";
import { useAuth } from "@/hooks/useAuth";

// Routes reachable without a session. The landing page and the auth screens are
// public; everything else is guarded in RootComponent via AuthRouteGuard.
const PUBLIC_PATHS = [
  "/",
  "/auth",
  "/about",
  "/compliance",
  "/security",
  "/contact",
  "/business-funding",
  "/terms",
  "/privacy",
  "/refund",
  "/cookies",
  "/sitemap.xml",
];

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: unknown; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportLovableError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "theme-color", content: "#024812" },
      { name: "robots", content: "index, follow" },
      { name: "googlebot", content: "index, follow" },
      { name: "author", content: "PESAKI" },
      {
        name: "keywords",
        content:
          "PESAKI, Nairobi, Kenya, mobile money, M-Pesa, jobs, kazi, business funding, savings, wallet, digital banking, fintech, Africa",
      },
      { name: "geo.region", content: "KE-Nairobi" },
      { name: "geo.country", content: "Kenya" },
      { title: "PESAKI — One Platform. Work, Business & Financial Services." },
      {
        name: "description",
        content:
          "PESAKI brings together your wallet, jobs, business funding and banking in one powerful mobile app. PESAKI MARKETING, BN-6ASR2E26, registered in Kenya.",
      },
      {
        property: "og:title",
        content: "PESAKI — One Platform. Work, Business & Financial Services.",
      },
      {
        property: "og:description",
        content:
          "PESAKI brings together your wallet, jobs, business funding and banking in one powerful mobile app. PESAKI MARKETING, BN-6ASR2E26, registered in Kenya.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://pesaki.co.ke/" },
      { property: "og:site_name", content: "PESAKI" },
      { property: "og:locale", content: "en_KE" },
      { property: "og:image", content: "https://pesaki.co.ke/icons/icon-512.png" },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: "512" },
      { property: "og:image:height", content: "512" },
      {
        property: "og:image:alt",
        content: "PESAKI — One Platform. Work, Business & Financial Services.",
      },
      { name: "twitter:card", content: "summary_large_image" },
      {
        name: "twitter:title",
        content: "PESAKI — One Platform. Work, Business & Financial Services.",
      },
      {
        name: "twitter:description",
        content:
          "PESAKI brings together your wallet, jobs, business funding and banking in one powerful mobile app. PESAKI MARKETING, BN-6ASR2E26, registered in Kenya.",
      },
      { name: "twitter:image", content: "https://pesaki.co.ke/icons/icon-512.png" },
      {
        name: "twitter:image:alt",
        content: "PESAKI — One Platform. Work, Business & Financial Services.",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "canonical", href: "https://pesaki.co.ke/" },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      {
        rel: "stylesheet",
        href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@500;600;700&family=DM+Sans:wght@400;500;600;700&display=swap",
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  return (
    <QueryClientProvider client={queryClient}>
      {/* Required: nested routes render here. Removing <Outlet /> breaks all child routes. */}
      <AuthRouteGuard>
        <Outlet />
      </AuthRouteGuard>
      <CookieBanner />
    </QueryClientProvider>
  );
}

function AuthRouteGuard({ children }: { children: ReactNode }) {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const location = useRouterState({ select: (s) => s.location });
  const pathname = location.pathname;
  const search = location.searchStr;

  useEffect(() => {
    if (!ready) return;
    if (PUBLIC_PATHS.includes(pathname)) return;
    if (user) return;

    const redirectTarget = `${pathname}${search}`;
    const toastAction = {
      label: "Sign In",
      onClick: () => {
        navigate({ to: "/auth", search: { redirect: redirectTarget } as never });
      },
    };
    toast("Please sign up or log in to continue.", { action: toastAction });
    navigate({ to: "/auth", search: { redirect: redirectTarget } as never });
  }, [ready, user, pathname, search, navigate]);

  return <>{children}</>;
}
