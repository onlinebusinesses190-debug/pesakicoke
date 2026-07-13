import { Link } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import type { ReactNode } from "react";
import { AppShell } from "@/components/AppShell";

export type TradeMode = "demo" | "real";

export function TradingSubShell({
  title,
  subtitle,
  mode,
  onModeChange,
  children,
}: {
  title: string;
  subtitle?: string;
  mode: TradeMode;
  onModeChange: (m: TradeMode) => void;
  children: ReactNode;
}) {
  return (
    <AppShell>
      <header className="sticky top-0 z-30 border-b border-border bg-background/85 px-5 py-3 backdrop-blur-xl">
        <div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3">
          <Link
            to="/trading"
            aria-label="Back to Trading"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-border bg-card text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div className="min-w-0">
            <h1 className="truncate text-lg font-bold tracking-tight">{title}</h1>
            {subtitle && <p className="truncate text-[11px] text-muted-foreground">{subtitle}</p>}
          </div>
          <div className="inline-flex shrink-0 rounded-full border border-border bg-card p-0.5 text-[11px] font-semibold">
            <button
              onClick={() => onModeChange("demo")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                mode === "demo" ? "bg-muted text-foreground" : "text-muted-foreground"
              }`}
            >
              Demo
            </button>
            <button
              onClick={() => onModeChange("real")}
              className={`rounded-full px-3 py-1.5 transition-colors ${
                mode === "real" ? "gradient-primary text-primary-foreground" : "text-muted-foreground"
              }`}
            >
              Real
            </button>
          </div>
        </div>
      </header>
      {children}
    </AppShell>
  );
}
