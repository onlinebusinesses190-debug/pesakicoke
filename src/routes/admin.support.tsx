import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard, KPI, StatusPill } from "@/components/AdminShell";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";

interface Ticket {
  id: string;
  user: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
}

interface TicketResponse {
  id: string;
  user: string;
  subject: string;
  priority: string;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/admin/support")({
  component: AdminSupport,
});

function AdminSupport() {
  const { loading: authLoading } = useAdminAuth();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchTickets = useCallback(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; tickets: TicketResponse[] }>("/admin/support/tickets?limit=50")
      .then((res) => {
        const mapped = (res.tickets || []).map((t) => ({
          id: t.id,
          user: t.user || "Unknown",
          subject: t.subject || "",
          priority: t.priority || "med",
          status: t.status || "open",
          created_at: t.created_at,
        }));
        setTickets(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Support tickets fetch error:", err);
        toast.error("Could not load tickets");
        setLoading(false);
      });
  }, [authLoading]);

  useEffect(() => {
    fetchTickets();
  }, [authLoading, fetchTickets]);

  const openCount = tickets.filter((t) => t.status === "open").length;
  const inReviewCount = tickets.filter((t) => t.status === "in_review").length;
  const resolvedCount = tickets.filter((t) => t.status === "resolved").length;

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading tickets…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader title="Support Tickets" subtitle="Triage and resolve user inquiries." />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI label="Open" value={openCount.toString()} hint="Awaiting agent" tone="destructive" />
        <KPI
          label="In Review"
          value={inReviewCount.toString()}
          hint="Active investigation"
          tone="gold"
        />
        <KPI
          label="Resolved (7d)"
          value={resolvedCount.toString()}
          hint="Avg. 4h response"
          tone="success"
        />
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
                {tickets.map((t) => (
                  <tr key={t.id} className="border-b border-border/60 last:border-0">
                    <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">{t.id}</td>
                    <td className="py-3 pr-3 font-medium">{t.user}</td>
                    <td className="py-3 pr-3">{t.subject}</td>
                    <td className="py-3 pr-3">
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          t.priority === "Urgent"
                            ? "bg-destructive/15 text-destructive"
                            : t.priority === "High"
                              ? "bg-warning/20 text-warning-foreground"
                              : t.priority === "Med"
                                ? "bg-primary/10 text-primary"
                                : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {t.priority}
                      </span>
                    </td>
                    <td className="py-3 pr-3">
                      <StatusPill status={t.status} />
                    </td>
                    <td className="py-3">
                      <button
                        onClick={async () => {
                          try {
                            await apiRequest(`/admin/support/ticket/${t.id}/resolve`, {
                              method: "POST",
                            });
                            fetchTickets();
                            toast.success("Ticket resolved");
                          } catch (err) {
                            toast.error("Failed to resolve ticket");
                          }
                        }}
                        className="text-xs font-semibold text-primary hover:underline"
                      >
                        Resolve
                      </button>
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
