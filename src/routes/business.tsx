import { createFileRoute } from "@tanstack/react-router";
import { Building2, FileText, TrendingUp, Award, BookOpen, ChevronRight } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Stat, SectionTitle, Badge } from "@/components/ui-bits";
import { businessApps, successStories, fmt } from "@/lib/mock";

export const Route = createFileRoute("/business")({
  head: () => ({
    meta: [
      { title: "Business Hub — PESAKI" },
      { name: "description", content: "Apply for funding, manage applications, and grow your business through PESAKI Business Hub." },
    ],
  }),
  component: BusinessPage,
});

const sections = [
  { label: "Apply for Funding",  icon: FileText,    tone: "primary" },
  { label: "My Applications",    icon: Building2,   tone: "gold" },
  { label: "My Investments",     icon: TrendingUp,  tone: "success" },
  { label: "Success Stories",    icon: Award,       tone: "gold" },
  { label: "Funding Guidelines", icon: BookOpen,    tone: "primary" },
] as const;

function BusinessPage() {
  return (
    <AppShell>
      <PageHeader title="Business Hub" subtitle="Fund. Build. Scale." />

      <section className="px-5 pt-5">
        <div className="gradient-primary rounded-2xl p-5 text-primary-foreground">
          <p className="text-xs uppercase tracking-widest opacity-80">Total Funding Received</p>
          <p className="mt-1 font-display text-3xl font-bold">{fmt(730000)}</p>
          <div className="mt-4 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Amount Repaid</p>
              <p className="mt-0.5 font-semibold">{fmt(142000)}</p>
            </div>
            <div className="rounded-xl bg-white/10 p-2.5">
              <p className="opacity-70">Profit Share Paid</p>
              <p className="mt-0.5 font-semibold">{fmt(38500)}</p>
            </div>
          </div>
        </div>
      </section>

      <section className="mt-5 grid grid-cols-3 gap-3 px-5">
        <Stat label="Open Apps" value="2" tone="primary" />
        <Stat label="Approved" value="3" tone="success" />
        <Stat label="Repayment" value="On time" tone="gold" />
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="Quick actions" />
        <Card className="!p-2">
          <ul className="divide-y divide-border">
            {sections.map((s) => (
              <li key={s.label}>
                <button className="grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-left">
                  <span className={`grid h-9 w-9 place-items-center rounded-xl ${
                    s.tone === "gold" ? "bg-gold/15 text-gold-foreground"
                    : s.tone === "success" ? "bg-success/15 text-success"
                    : "bg-primary/10 text-primary"
                  }`}>
                    <s.icon className="h-4 w-4" />
                  </span>
                  <span className="truncate text-sm font-semibold">{s.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </button>
              </li>
            ))}
          </ul>
        </Card>
      </section>

      <section className="mt-6 px-5">
        <SectionTitle title="My applications" />
        <div className="space-y-2.5">
          {businessApps.map((a) => (
            <Card key={a.name} className="!p-3.5">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">{a.name}</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Requested {fmt(a.amount)}</p>
                  {a.repaid > 0 && (
                    <p className="mt-1 text-[11px] text-success">Repaid {fmt(a.repaid)}</p>
                  )}
                </div>
                <Badge tone={a.status === "Approved" ? "success" : a.status === "Disbursed" ? "primary" : "warning"}>
                  {a.status}
                </Badge>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section className="mt-6 px-5 pb-2">
        <SectionTitle title="Success stories" />
        <div className="space-y-2.5">
          {successStories.map((s) => (
            <Card key={s.name} className="!p-4">
              <Badge tone="gold">{s.grew}</Badge>
              <p className="mt-2 text-sm font-semibold">{s.name}</p>
              <p className="mt-1 text-xs italic text-muted-foreground">"{s.quote}"</p>
            </Card>
          ))}
        </div>
      </section>
    </AppShell>
  );
}
