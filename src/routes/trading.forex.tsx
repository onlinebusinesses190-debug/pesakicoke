import { createFileRoute, ClientOnly } from "@tanstack/react-router";
import { Terminal } from "@/components/terminal/Terminal";

export const Route = createFileRoute("/trading/forex")({
  head: () => ({
    meta: [
      { title: "MetaTrader Web — Forex Trading Terminal" },
      {
        name: "description",
        content: "MT4/MT5-style forex trading terminal with live quotes, charts, market and pending orders, SL/TP and margin.",
      },
      { property: "og:title", content: "MetaTrader Web — Forex Trading Terminal" },
      {
        property: "og:description",
        content: "Trade forex and gold on a demo account with live charts, one-click trading and full order management.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: ForexPage,
});

function ForexPage() {
  return (
    <ClientOnly fallback={<div className="flex min-h-screen items-center justify-center bg-background">Connecting to trade server…</div>}>
      <Terminal />
    </ClientOnly>
  );
}
