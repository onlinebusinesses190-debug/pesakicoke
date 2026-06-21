import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminTrading, fmtCompact } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/trading")({
  component: AdminTrading,
});

function AdminTrading() {
  const volume = adminTrading.reduce((s, t) => s + t.volume, 0);
  const users = adminTrading.reduce((s, t) => s + t.users, 0);
  return (
    <>
      <AdminPageHeader title="Trading Products" subtitle="Monitor and configure platform trading games." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Active Traders" value={users.toLocaleString()} hint="Across all products" tone="success" />
        <KPI label="24h Volume" value={fmtCompact(volume)} hint="All products" tone="gold" />
        <KPI label="House Edge" value="6.2%" hint="Avg." />
        <KPI label="Flagged Trades" value="9" hint="Anti-fraud" tone="destructive" />
      </section>

      <section className="mt-6">
        <AdminCard title="Products">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">Product</th>
                  <th className="py-2 pr-3 text-right">Active users</th>
                  <th className="py-2 pr-3 text-right">Volume</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {adminTrading.map((p) => (
                  <tr key={p.product} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-medium">{p.product}</td>
                    <td className="py-3 pr-3 text-right">{p.users.toLocaleString()}</td>
                    <td className="py-3 pr-3 text-right font-semibold">{fmtCompact(p.volume)}</td>
                    <td className="py-3 pr-3"><StatusPill status={p.status} /></td>
                    <td className="py-3">
                      <button className="text-xs font-semibold text-primary hover:underline">Configure</button>
                    </td>
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
