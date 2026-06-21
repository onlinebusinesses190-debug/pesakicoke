import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminStats, adminTx, fmtCompact, fmtKES } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/finance")({
  component: AdminFinance,
});

function AdminFinance() {
  return (
    <>
      <AdminPageHeader title="Finance" subtitle="Deposits, withdrawals, and revenue oversight." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Total Deposits" value={fmtCompact(adminStats.totalDeposits)} hint="All time" tone="success" />
        <KPI label="Total Withdrawals" value={fmtCompact(adminStats.totalWithdrawals)} hint="All time" />
        <KPI label="Pending Withdrawals" value={fmtCompact(adminStats.pendingWithdrawals)} hint="Awaiting approval" tone="destructive" />
        <KPI label="Platform Revenue" value={fmtCompact(adminStats.platformRevenue)} hint="+12.4% MoM" tone="gold" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard title="Pending withdrawals" className="lg:col-span-2">
          <ul className="space-y-3 text-sm">
            {adminTx.filter((t) => t.type === "Withdrawal").map((t) => (
              <li key={t.id} className="flex items-center justify-between rounded-xl border border-border bg-muted/40 p-3">
                <div>
                  <p className="font-semibold">{t.user}</p>
                  <p className="text-xs text-muted-foreground">{t.id} · {t.method}</p>
                </div>
                <div className="text-right">
                  <p className="font-bold text-destructive">{fmtKES(t.amount)}</p>
                  <div className="mt-1 flex justify-end gap-2">
                    <button className="rounded-md bg-success px-3 py-1 text-xs font-semibold text-success-foreground">Approve</button>
                    <button className="rounded-md border border-border px-3 py-1 text-xs font-semibold">Reject</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </AdminCard>

        <AdminCard title="Payment methods">
          <ul className="space-y-3 text-sm">
            <Method name="M-PESA" share={62} />
            <Method name="Bank Transfer" share={22} />
            <Method name="Card" share={11} />
            <Method name="Crypto" share={5} />
          </ul>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="All transactions">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Method</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {adminTx.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{t.id}</td>
                    <td className="py-3 pr-3 font-medium">{t.user}</td>
                    <td className="py-3 pr-3">{t.type}</td>
                    <td className={`py-3 pr-3 text-right font-semibold ${t.amount < 0 ? "text-destructive" : "text-success"}`}>{fmtKES(t.amount)}</td>
                    <td className="py-3 pr-3 text-muted-foreground">{t.method}</td>
                    <td className="py-3 pr-3"><StatusPill status={t.status} /></td>
                    <td className="py-3 text-muted-foreground">{t.date}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </section>
    </>
  );
}

function Method({ name, share }: { name: string; share: number }) {
  return (
    <li>
      <div className="flex items-center justify-between text-xs">
        <span className="font-medium">{name}</span>
        <span className="text-muted-foreground">{share}%</span>
      </div>
      <div className="mt-1 h-2 w-full overflow-hidden rounded-full bg-muted">
        <div className="h-full gradient-primary" style={{ width: `${share}%` }} />
      </div>
    </li>
  );
}
