import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { SectionTitle } from "@/components/ui-bits";

export const Route = createFileRoute("/refund")({
  head: () => ({
    meta: [
      { title: "Refund Policy — PESAKI" },
      { name: "description", content: "PESAKI Refund Policy — what can and cannot be refunded on our platform." },
    ],
  }),
  component: RefundPage,
});

function RefundPage() {
  return (
    <AppShell>
      <PageHeader title="Refund Policy" subtitle="What can be refunded" />

      <div className="px-5 pt-5">
        <div className="rounded-2xl border border-border bg-card p-4">
          <p className="text-[11px] uppercase tracking-widest text-muted-foreground">Last updated: 28 September 2026</p>
        </div>

        <section className="mt-5">
          <SectionTitle title="1. Virtual Currency" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Virtual currency, trading stakes and in-app purchases are non-refundable once the transaction is confirmed. This includes all trading deposits and virtual goods.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="2. Failed M-Pesa Deposits" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              If an M-Pesa deposit fails or is reversed, we will credit your wallet automatically once the funds are received from Safaricom. Duplicate charges are refunded within 3–5 business days.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="3. Disputed KAZI Jobs" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              For KAZI Link jobs, platform fees are held in escrow and released only after work is confirmed. Disputes are reviewed by our support team. Refunds of platform fees are granted only when a worker fails to deliver agreed work.
            </p>
          </div>
        </section>

        <section className="mt-5">
          <SectionTitle title="4. Business Funding" />
          <div className="rounded-2xl border border-border bg-card p-4">
            <p className="text-sm text-muted-foreground">
              Business funding is governed by a separate agreement. Approved businesses agree to remit a share of monthly profit until the funded amount is fully repaid. Early settlement is permitted. No refunds of disbursed funds are available.
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