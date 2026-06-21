import { createFileRoute } from "@tanstack/react-router";
import { AdminPageHeader, AdminCard } from "@/components/AdminShell";
import { adminNotifs } from "@/lib/admin-mock";
import { Send } from "lucide-react";

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotifications,
});

function AdminNotifications() {
  return (
    <>
      <AdminPageHeader title="Notifications" subtitle="Compose and broadcast in-app announcements." />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard className="lg:col-span-2" title="Compose">
          <form className="space-y-3">
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Title</label>
              <input className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary" placeholder="e.g. Maintenance window" />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Message</label>
              <textarea rows={5} className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary" placeholder="Write a clear, helpful message…" />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Audience</label>
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option>All users</option>
                  <option>Verified only</option>
                  <option>Unverified</option>
                  <option>Traders</option>
                  <option>Business owners</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Channel</label>
                <select className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm">
                  <option>In-app</option>
                  <option>Push</option>
                  <option>SMS</option>
                  <option>Email</option>
                </select>
              </div>
            </div>
            <button type="button" className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
              <Send className="h-4 w-4" /> Send notification
            </button>
          </form>
        </AdminCard>

        <AdminCard title="Recent broadcasts">
          <ul className="space-y-3">
            {adminNotifs.map((n) => (
              <li key={n.title} className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <span className="text-[10px] text-muted-foreground">{n.sent}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-primary">→ {n.audience}</p>
              </li>
            ))}
          </ul>
        </AdminCard>
      </section>
    </>
  );
}
