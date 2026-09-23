import type { ReactNode } from "react";

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-2xl border border-border bg-card p-4 shadow-[var(--shadow-card)] ${className}`}
    >
      {children}
    </div>
  );
}

export function Badge({
  children,
  tone = "neutral",
}: {
  children: ReactNode;
  tone?: "neutral" | "primary" | "gold" | "success" | "warning" | "destructive";
}) {
  const tones: Record<string, string> = {
    neutral:     "bg-muted text-muted-foreground",
    primary:     "bg-primary/10 text-primary",
    gold:        "bg-gold/15 text-gold-foreground",
    success:     "bg-success/15 text-success",
    warning:     "bg-warning/20 text-warning-foreground",
    destructive: "bg-destructive/15 text-destructive",
  };
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide ${tones[tone]}`}>
      {children}
    </span>
  );
}

export function SectionTitle({ title, action }: { title: string; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="text-sm font-semibold text-foreground">{title}</h2>
      {action}
    </div>
  );
}

export function Stat({
  label, value, hint, tone = "primary",
}: { label: string; value: string; hint?: string; tone?: "primary" | "gold" | "success" }) {
  const accent: Record<string, string> = {
    primary: "text-primary",
    gold:    "text-gold-foreground",
    success: "text-success",
  };
  return (
    <div className="rounded-2xl border border-border bg-card p-3">
      <p className="text-[11px] font-medium text-muted-foreground">{label}</p>
      <p className={`mt-1 text-lg font-bold tracking-tight ${accent[tone]}`}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

export function Progress({ value }: { value: number }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-muted">
      <div
        className="h-full rounded-full gradient-primary transition-all"
        style={{ width: `${v}%` }}
      />
    </div>
  );
}
