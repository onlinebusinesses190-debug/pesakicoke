import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI } from "@/components/AdminShell";
import { adminCommissions, fmtCompact } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/commissions")({
  component: AdminCommissions,
});

function AdminCommissions() {
  const total = adminCommissions.reduce((s, t) => s + t.payout, 0);
  return (
    <>
      <AdminPageHeader title="Commissions" subtitle="Referral programs, affiliate tiers, and payouts." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Total Paid" value={fmtCompact(total)} hint="All time" tone="gold" />
        <KPI label="Active Affiliates" value="4,820" hint="Earning monthly" tone="success" />
        <KPI label="Top Earner" value="KES 184K" hint="This month" />
        <KPI label="Pending Payouts" value={fmtCompact(820_000)} hint="Next cycle" tone="destructive" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-4">
        {adminCommissions.map((t) => (
          <AdminCard key={t.tier} title={t.tier}>
            <p className="text-xs uppercase tracking-wider text-muted-foreground">{t.referrals} referrals</p>
            <p className="mt-2 text-3xl font-bold text-primary">{t.rate}</p>
            <p className="mt-1 text-xs text-muted-foreground">Commission rate</p>
            <div className="mt-3 border-t border-border pt-3">
              <p className="text-xs text-muted-foreground">Paid this year</p>
              <p className="text-lg font-semibold">{fmtCompact(t.payout)}</p>
            </div>
          </AdminCard>
        ))}
      </section>
    </>
  );
}
