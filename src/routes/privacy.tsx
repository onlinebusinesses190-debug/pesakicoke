import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionTitle } from "@/components/ui-bits";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — PESAKI" },
      { name: "description", content: "PESAKI Privacy Policy — how we collect, use and protect your data." },
    ],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  return (
    <AppShell>
      <PageHeader title="Privacy Policy" subtitle="How we protect your data" />

      <div className="px-5 pt-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last updated: 28 September 2026</p>
        </div>

        <section className="mt-5">
          <SectionTitle title="1. Data We Collect" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <ul className="space-y-2 text-sm">
              <li><span className="font-semibold">Name</span> — your full name for account and KYC verification.</li>
              <li><span className="font-semibold">Phone</span> — M-Pesa and account contact number.</li>
              <li><span className="font-semibold">Email</span> — for notifications and account recovery.</li>
              <li><span className="font-semibold">KYC data</span> — national ID, date of birth, selfie/liveness where required for regulatory compliance.</li>
            </ul>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="2. How We Use It" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <ul className="space-y-2 text-sm">
              <li><span className="font-semibold">Payments</span> — processing deposits, withdrawals and transfers.</li>
              <li><span className="font-semibold">Trading</span> — providing FX, prediction and market products.</li>
              <li><span className="font-semibold">KAZI</span> — matching workers with employers and managing job contracts.</li>
              <li><span className="font-semibold">Compliance</span> — verifying identity, preventing fraud and meeting Kenyan regulatory requirements.</li>
            </ul>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="3. Third Parties" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <ul className="space-y-2 text-sm">
              <li><span className="font-semibold">Supabase</span> — database and authentication infrastructure.</li>
              <li><span className="font-semibold">M-Pesa (Safaricom)</span> — mobile money deposit and withdrawal processing.</li>
              <li><span className="font-semibold">Palpluss</span> — partner payment gateway services.</li>
            </ul>
            <p className="mt-3 text-xs text-muted-foreground">We never sell your personal data to third parties.</p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="4. User Rights" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Under the Kenya Data Protection Act 2019 you have the right to access, correct, delete or port your data, object to processing, and lodge a complaint with the Office of the Data Protection Commissioner.
            </p>
            <p className="mt-3 text-xs text-muted-foreground">
              To exercise your rights, contact us at <span className="text-primary font-semibold">privacy@pesaki.co.ke</span>.
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