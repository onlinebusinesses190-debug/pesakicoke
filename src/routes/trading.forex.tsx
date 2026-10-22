import { createFileRoute, ClientOnly, useNavigate } from "@tanstack/react-router";
import { Terminal } from "@/components/terminal/Terminal";
import { useAuth } from "@/hooks/useAuth";
import { useEffect } from "react";

export const Route = createFileRoute("/trading/forex")({
  validateSearch: (search: Record<string, unknown>) => ({
    mode: (search.mode as string) === "real" ? "real" : "demo",
  }),
  head: () => ({
    meta: [
      { title: "MetaTrader Web — Forex Trading Terminal" },
      { name: "description", content: "MT4/MT5-style forex trading terminal with live quotes, charts, market and pending orders, SL/TP and margin." },
    ],
  }),
  component: ForexPage,
});

function ForexPage() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const search = Route.useSearch();
  const mode = (search?.mode as string) === "real" ? "real" : "demo";

  useEffect(() => {
    if (mode === "real" && ready && !user) {
      navigate({
        to: "/auth",
        search: { mode: "signin", redirect: "/trading/forex?mode=real" } as never,
      });
    }
  }, [mode, user, ready, navigate]);

  if (!ready) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Loading…</div>;
  }

  if (mode === "real" && !user) {
    return <div className="flex min-h-screen items-center justify-center bg-background">Redirecting to sign-in…</div>;
  }

  return (
    <ClientOnly fallback={<div className="flex min-h-screen items-center justify-center bg-background">Loading the terminal…</div>}>
      <Terminal mode={mode} />
    </ClientOnly>
  );
}
