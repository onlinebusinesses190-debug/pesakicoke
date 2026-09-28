import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionTitle } from "@/components/ui-bits";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — PESAKI" },
      { name: "description", content: "PESAKI Terms of Service — the rules that govern use of our platform." },
    ],
  }),
  component: TermsPage,
});

function TermsPage() {
  return (
    <AppShell>
      <PageHeader title="Terms of Service" subtitle="The rules of the road" />

      <div className="px-5 pt-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last updated: 28 September 2026</p>
        </div>

        <section className="mt-5">
          <SectionTitle title="1. Eligibility" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              You must be at least 18 years of age and a resident of Kenya. By creating an account you confirm you meet these requirements.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="2. Account Rules" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <ul className="space-y-2 text-sm text-muted-foreground">
              <li>One account per person — no multi-accounting.</li>
              <li>You are responsible for all activity under your account.</li>
              <li>You must keep your credentials and phone secure.</li>
              <li>You warrant that all funds moved through PESAKI are lawfully sourced.</li>
            </ul>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="3. Trading Risk Warning" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Binary FX, Up & Down, Avimarket, Spin and Invest Prediction are speculative products. You can lose part or all of your stake. Only trade with funds you can afford to lose. PESAKI does not provide financial advice.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="4. Prohibited Activities" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Money laundering, fraud, financing of terrorism, bot activity, scraping, referral self-invites, and any attempt to circumvent limits, fees or verification are prohibited. Accounts in breach may be suspended or closed.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="5. Termination" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              We may suspend or terminate accounts for breach of these Terms, suspicious activity, or legal requirement. Upon termination, outstanding obligations (including repayments) survive.
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