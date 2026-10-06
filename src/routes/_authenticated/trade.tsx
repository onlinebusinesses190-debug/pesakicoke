import { createFileRoute } from "@tanstack/react-router";
import { FxTerminal } from "@/components/fx/FxTerminal";

export const Route = createFileRoute("/_authenticated/trade")({
  head: () => ({
    meta: [
      { title: "Trade — Pesaki FX" },
      { name: "description", content: "Trade EUR/USD, GBP/USD, gold and more with demo or real wallet in Kenyan shillings." },
      { property: "og:title", content: "Trade — Pesaki FX" },
      { property: "og:description", content: "Live forex charts, simple KSh trade amounts and one-tap close." },
    ],
  }),
  component: FxTerminal,
});