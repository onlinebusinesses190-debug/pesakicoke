import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionTitle } from "@/components/ui-bits";

export const Route = createFileRoute("/cookies")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — PESAKI" },
      { name: "description", content: "PESAKI Cookie Policy — what cookies we use and how to manage them." },
    ],
  }),
  component: CookiesPage,
});

function CookiesPage() {
  return (
    <AppShell>
      <PageHeader title="Cookie Policy" subtitle="How we use cookies" />

      <div className="px-5 pt-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last updated: 28 September 2026</p>
        </div>

        <section className="mt-5">
          <SectionTitle title="1. Essential Cookies" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              These cookies are required for the app to function. They keep you authenticated, remember your preferences and secure your session. You cannot disable them.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="2. Analytics Cookies" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              These cookies help us understand how you use PESAKI so we can improve the experience. They are optional and disabled by default. You can enable them at any time from the cookie consent banner.
            </p>
          </div>
        </section>

        <p className="mt-8 px-5 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI · Earn. Invest. Grow.
        </p>
      </div>
    </AppShell>
  );
}