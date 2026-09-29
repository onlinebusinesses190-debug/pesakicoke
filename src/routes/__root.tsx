import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportLovableError } from "../lib/lovable-error-reporting";
import { CookieBanner } from "../components/CookieBanner";

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

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
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
      { name: "theme-color", content: "#0a3b2e" },
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
      { title: "PESAKI — Africa's Digital Wealth Ecosystem" },
      {
        name: "description",
        content:
          "PESAKI is Africa's digital wealth ecosystem — jobs, business funding, banking and wallet in one mobile app. Built in Nairobi, Kenya.",
      },
      { property: "og:title", content: "PESAKI — Africa's Digital Wealth Ecosystem" },
      {
        property: "og:description",
        content:
          "PESAKI is Africa's digital wealth ecosystem — jobs, business funding, banking and wallet in one mobile app. Built in Nairobi, Kenya.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://pesaki.co.ke/" },
      { property: "og:site_name", content: "PESAKI" },
      { property: "og:locale", content: "en_KE" },
      {
        property: "og:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fdeb1878-8ad9-4c0d-8b3b-d767051054a3/id-preview-76e24141--66b9a5aa-fbc6-43c7-a488-530b18a42bd2.lovable.app-1783818751962.png",
      },
      { property: "og:image:width", content: "1200" },
      { property: "og:image:height", content: "630" },
      { property: "og:image:alt", content: "PESAKI — Africa's Digital Wealth Ecosystem" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: "PESAKI — Africa's Digital Wealth Ecosystem" },
      {
        name: "twitter:description",
        content:
          "PESAKI is Africa's digital wealth ecosystem — jobs, business funding, banking and wallet in one mobile app. Built in Nairobi, Kenya.",
      },
      {
        name: "twitter:image",
        content:
          "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/fdeb1878-8ad9-4c0d-8b3b-d767051054a3/id-preview-76e24141--66b9a5aa-fbc6-43c7-a488-530b18a42bd2.lovable.app-1783818751962.png",
      },
      { name: "twitter:image:alt", content: "PESAKI — Africa's Digital Wealth Ecosystem" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
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
      <Outlet />
      <CookieBanner />
    </QueryClientProvider>
  );
}
