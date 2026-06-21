import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { adminTickets } from "@/lib/admin-mock";

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

function AdminSupport() {
  return (
    <>
      <AdminPageHeader title="Support Tickets" subtitle="Triage and resolve user inquiries." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Open" value="142" hint="Awaiting agent" tone="destructive" />
        <KPI label="In Review" value="58" hint="Active investigation" tone="gold" />
        <KPI label="Resolved (7d)" value="312" hint="Avg. 4h response" tone="success" />
        <KPI label="CSAT" value="4.7 / 5" hint="Last 30 days" />
      </section>

      <section className="mt-6">
        <AdminCard title="Tickets">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">User</th>
                  <th className="py-2 pr-3">Subject</th>
                  <th className="py-2 pr-3">Priority</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Action</th>
                </tr>
              </thead>
              <tbody>
                {adminTickets.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{t.id}</td>
                    <td className="py-3 pr-3 font-medium">{t.user}</td>
                    <td className="py-3 pr-3">{t.subject}</td>
                    <td className="py-3 pr-3">
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        t.priority === "Urgent" ? "bg-destructive/15 text-destructive" :
                        t.priority === "High"   ? "bg-warning/20 text-warning-foreground" :
                        t.priority === "Med"    ? "bg-primary/10 text-primary" :
                                                  "bg-muted text-muted-foreground"
                      }`}>{t.priority}</span>
                    </td>
                    <td className="py-3 pr-3"><StatusPill status={t.status} /></td>
                    <td className="py-3"><button className="text-xs font-semibold text-primary hover:underline">Open</button></td>
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
