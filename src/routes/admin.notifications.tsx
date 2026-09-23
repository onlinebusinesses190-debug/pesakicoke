import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminPageHeader, AdminCard } from "@/components/AdminShell";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { Send } from "lucide-react";

interface Notification {
  id: string;
  title: string;
  body: string;
  audience: string;
  channel: string;
  sent: string;
}

interface NotificationResponse {
  id: string;
  title: string;
  body: string;
  audience: string;
  channel: string;
  created_at: string;
}

export const Route = createFileRoute("/admin/notifications")({
  component: AdminNotifications,
});

function AdminNotifications() {
  const { loading: authLoading } = useAdminAuth();
  const [notifs, setNotifs] = useState<Notification[]>([]);
  const [loading, setLoading] = useState(true);

  const fetchNotifs = useCallback(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; notifications: NotificationResponse[] }>("/admin/notifications")
      .then((res) => {
        const mapped = (res.notifications || []).map((n) => ({
          id: n.id,
          title: n.title,
          body: n.body,
          audience: n.audience || "All users",
          channel: n.channel || "in_app",
          sent: n.created_at,
        }));
        setNotifs(mapped);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Notifications fetch error:", err);
        toast.error("Could not load notifications");
        setLoading(false);
      });
  }, [authLoading]);

  useEffect(() => {
    fetchNotifs();
  }, [fetchNotifs]);

  if (authLoading || loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">Loading notifications…</p>
      </div>
    );
  }

  async function handleSend(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;
    const title = (form.elements.namedItem("title") as HTMLInputElement).value;
    const message = (form.elements.namedItem("message") as HTMLTextAreaElement).value;
    const audience = (form.elements.namedItem("audience") as HTMLSelectElement).value;
    const channel = (form.elements.namedItem("channel") as HTMLSelectElement).value;

    if (!title || !message) {
      toast.error("Title and message are required");
      return;
    }

    try {
      await apiRequest("/admin/notifications", {
        method: "POST",
        body: JSON.stringify({ title, message, audience, channel }),
      });
      toast.success("Notification sent");
      form.reset();
      fetchNotifs();
    } catch {
      toast.error("Failed to send notification");
    }
  }

  return (
    <>
      <AdminPageHeader
        title="Notifications"
        subtitle="Compose and broadcast in-app announcements."
      />

      <section className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <AdminCard className="lg:col-span-2" title="Compose">
          <form className="space-y-3" onSubmit={handleSend}>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Title
              </label>
              <input
                name="title"
                className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
                placeholder="e.g. Maintenance window"
              />
            </div>
            <div>
              <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Message
              </label>
              <textarea
                name="message"
                rows={5}
                className="mt-1 w-full rounded-lg border border-border bg-background p-3 text-sm outline-none focus:border-primary"
                placeholder="Write a clear, helpful message…"
              />
            </div>
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Audience
                </label>
                <select
                  name="audience"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="all">All users</option>
                  <option value="verified">Verified only</option>
                  <option value="unverified">Unverified</option>
                  <option value="traders">Traders</option>
                  <option value="business">Business owners</option>
                </select>
              </div>
              <div>
                <label className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                  Channel
                </label>
                <select
                  name="channel"
                  className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm"
                >
                  <option value="in_app">In-app</option>
                  <option value="push">Push</option>
                  <option value="sms">SMS</option>
                  <option value="email">Email</option>
                </select>
              </div>
            </div>
            <button
              type="submit"
              className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90"
            >
              <Send className="h-4 w-4" /> Send notification
            </button>
          </form>
        </AdminCard>

        <AdminCard title="Recent broadcasts">
          <ul className="space-y-3">
            {notifs.map((n) => (
              <li key={n.id} className="rounded-xl border border-border bg-muted/40 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">{n.title}</p>
                  <span className="text-[10px] text-muted-foreground">{n.sent}</span>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">{n.body}</p>
                <p className="mt-2 text-[10px] uppercase tracking-wider text-primary">
                  → {n.audience}
                </p>
              </li>
            ))}
          </ul>
        </AdminCard>
      </section>
    </>
  );
}
