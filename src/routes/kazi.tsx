import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Search, Star, MapPin, ShieldCheck, Plus } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { jobCategories, workers } from "@/lib/mock";

export const Route = createFileRoute("/kazi")({
  head: () => ({
    meta: [
      { title: "KAZI Link — PESAKI" },
      { name: "description", content: "Find work or hire trusted workers on KAZI Link — house helps, drivers, plumbers, tutors and more." },
    ],
  }),
  component: KaziPage,
});

function KaziPage() {
  const [tab, setTab] = useState<"find" | "hire">("find");

  return (
    <AppShell>
      <PageHeader title="KAZI Link" subtitle="Connecting workers and employers" />

      <div className="px-5 pt-4">
        <div className="grid grid-cols-2 gap-1 rounded-full bg-muted p-1">
          {(["find", "hire"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={`rounded-full py-2 text-xs font-semibold transition-all ${
                tab === t ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              {t === "find" ? "Find Work" : "Hire Workers"}
            </button>
          ))}
        </div>
      </div>

      <section className="mt-4 px-5">
        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            placeholder={tab === "find" ? "Search jobs near you" : "Search workers by skill"}
            className="w-full rounded-full border border-border bg-card py-2.5 pl-9 pr-4 text-sm outline-none focus:ring-2 focus:ring-ring"
          />
        </div>
      </section>

      <section className="mt-5 px-5">
        <SectionTitle title="Categories" />
        <div className="flex gap-2 overflow-x-auto pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {jobCategories.map((c) => (
            <button key={c} className="shrink-0 rounded-full border border-border bg-card px-3 py-1.5 text-xs font-medium hover:bg-muted">
              {c}
            </button>
          ))}
        </div>
      </section>

      {tab === "find" ? (
        <section className="mt-5 px-5">
          <SectionTitle title="Open jobs near you" />
          <div className="space-y-2.5">
            {[
              { t: "Live-in House Help", l: "Karen, Nairobi", p: "KES 25,000/mo", b: "Urgent" as const },
              { t: "Evening Tutor (Math)", l: "Kileleshwa",   p: "KES 1,200/hr", b: "New" as const },
              { t: "Event Cleaner",       l: "Westlands",     p: "KES 1,800/day", b: "Hot" as const },
            ].map((j) => (
              <Card key={j.t} className="!p-3.5">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold">{j.t}</p>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {j.l}
                    </p>
                    <p className="mt-1 text-sm font-bold text-primary">{j.p}</p>
                  </div>
                  <Badge tone={j.b === "Urgent" ? "destructive" : j.b === "Hot" ? "warning" : "gold"}>{j.b}</Badge>
                </div>
                <button className="mt-3 w-full rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground">
                  Apply now
                </button>
              </Card>
            ))}
          </div>
        </section>
      ) : (
        <section className="mt-5 px-5">
          <SectionTitle
            title="Top workers"
            action={
              <button className="inline-flex items-center gap-1 rounded-full gradient-primary px-3 py-1.5 text-[11px] font-semibold text-primary-foreground">
                <Plus className="h-3 w-3" /> Post a job
              </button>
            }
          />
          <div className="space-y-2.5">
            {workers.map((w) => (
              <Card key={w.name} className="!p-3.5">
                <div className="flex items-start gap-3">
                  <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full gradient-primary text-sm font-bold text-primary-foreground">
                    {w.name.split(" ").map(n => n[0]).slice(0,2).join("")}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-semibold">{w.name}</p>
                      <Badge tone={w.badge === "Top Rated" ? "gold" : w.badge === "Verified" ? "success" : "primary"}>
                        {w.badge}
                      </Badge>
                    </div>
                    <p className="mt-0.5 flex items-center gap-1 text-xs text-muted-foreground">
                      <MapPin className="h-3 w-3" /> {w.loc}
                    </p>
                    <div className="mt-1.5 flex items-center gap-3 text-xs">
                      <span className="inline-flex items-center gap-0.5 font-semibold">
                        <Star className="h-3 w-3 fill-gold text-gold" /> {w.rating}
                      </span>
                      <span className="text-muted-foreground">{w.jobs} jobs</span>
                      <span className="inline-flex items-center gap-0.5 text-success">
                        <ShieldCheck className="h-3 w-3" /> Verified
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1">
                      {w.skills.map((s) => (
                        <span key={s} className="rounded-full bg-muted px-2 py-0.5 text-[10px] font-medium text-muted-foreground">{s}</span>
                      ))}
                    </div>
                  </div>
                </div>
                <div className="mt-3 grid grid-cols-2 gap-2">
                  <button className="rounded-full border border-border py-2 text-xs font-semibold">Message</button>
                  <button className="rounded-full gradient-primary py-2 text-xs font-semibold text-primary-foreground">Hire</button>
                </div>
              </Card>
            ))}
          </div>
        </section>
      )}
    </AppShell>
  );
}
