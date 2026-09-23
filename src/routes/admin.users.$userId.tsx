import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, StatusPill } from "@/components/AdminShell";
import { fmtKES, fmtDate } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { ArrowLeft, Shield, ShieldOff, Wallet, RefreshCw, Flag, Copy } from "lucide-react";

interface UserDetail {
  id: string;
  email: string;
  full_name: string | null;
  phone: string | null;
  banned: boolean;
  ban_reason: string | null;
  kyc_status: string;
  balance: number;
  locked: number;
  demo_balance: number;
  referral_code: string | null;
  referred_by_email: string | null;
  flagged: boolean;
  last_sign_in_at: string | null;
  created_at: string;
  updated_at: string;
}

interface UserActivity {
  id: string;
  type: string;
  amount: number;
  status: string;
  created_at: string;
}

export const Route = createFileRoute("/admin/users/$userId")({
  component: AdminUserDetail,
});

function AdminUserDetail() {
  const { loading: authLoading } = useAdminAuth();
  const { userId } = Route.useParams();
  const navigate = useNavigate();
  const [user, setUser] = useState<UserDetail | null>(null);
  const [activity, setActivity] = useState<UserActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; data: UserDetail }>(`/admin/users/${userId}`)
      .then((res) => {
        if (res.success && res.data) {
          setUser(res.data);
        } else {
          navigate({ to: "/admin/users" });
        }
        setLoading(false);
      })
      .catch(() => {
        setLoading(false);
        navigate({ to: "/admin/users" });
      });
  }, [authLoading, userId, navigate]);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{ success: boolean; data: UserActivity[] }>(`/admin/users/${userId}/activity`)
      .then((res) => {
        if (res.success && Array.isArray(res.data)) {
          setActivity(res.data);
        }
      })
      .catch(() => {});
  }, [authLoading, userId]);

  const handleBan = async () => {
    if (!user) return;
    const reason = prompt("Enter ban reason (optional):", user.ban_reason || "") || "";
    const action = user.banned ? "unban" : "ban";
    await apiRequest(`/admin/users/${userId}/${action}`, {
      method: "POST",
      body: JSON.stringify({ reason }),
    });
    setUser({ ...user, banned: !user.banned, ban_reason: reason || null });
  };

  const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading user details…</p>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">User not found.</p>
      </div>
    );
  }

  const name = user.full_name || user.email?.split("@")[0] || "Unknown";
  const isBanned = user.banned;

  return (
    <>
      <AdminPageHeader
        title={name}
        subtitle={user.email}
        actions={
          <div className="flex gap-2">
            <Link
              to="/admin/users"
              className="inline-flex items-center gap-2 rounded-lg border border-border bg-card px-3 py-2 text-sm font-medium hover:bg-muted"
            >
              <ArrowLeft className="h-4 w-4" /> Back
            </Link>
            <button
              onClick={handleBan}
              className={`inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold ${
                isBanned
                  ? "border border-border bg-card text-foreground hover:bg-muted"
                  : "bg-destructive text-destructive-foreground hover:bg-destructive/90"
              }`}
            >
              {isBanned ? <ShieldOff className="h-4 w-4" /> : <Shield className="h-4 w-4" />}
              {isBanned ? "Unban user" : "Ban user"}
            </button>
          </div>
        }
      />

      <section className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <AdminCard title="Account info" className="lg:col-span-2">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              ID
            </dt>
            <dd className="flex items-center gap-1 font-mono text-xs text-foreground sm:col-span-2">
              {user.id}
              <button onClick={() => handleCopy(user.id)} className="opacity-40 hover:opacity-100">
                <Copy className="h-3 w-3" />
              </button>
            </dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Full name
            </dt>
            <dd className="text-sm font-medium text-foreground">{name}</dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Email
            </dt>
            <dd className="text-sm text-foreground">{user.email}</dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Phone
            </dt>
            <dd className="text-sm text-foreground">{user.phone || "N/A"}</dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Status
            </dt>
            <dd>
              <StatusPill
                status={
                  isBanned ? "Suspended" : user.kyc_status === "Pending" ? "Pending" : "Active"
                }
              />
            </dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              KYC status
            </dt>
            <dd>
              <StatusPill status={user.kyc_status} />
            </dd>
            {isBanned && user.ban_reason && (
              <>
                <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
                  Ban reason
                </dt>
                <dd className="text-sm text-destructive">{user.ban_reason}</dd>
              </>
            )}
          </dl>
        </AdminCard>

        <AdminCard title="Wallet" className="lg:col-span-1">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Main balance</span>
              <span className="font-semibold">{fmtKES(Number(user.balance || 0))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Locked balance</span>
              <span className="font-semibold">{fmtKES(Number(user.locked || 0))}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Demo balance</span>
              <span className="font-semibold text-muted-foreground">
                {fmtKES(Number(user.demo_balance || 0))}
              </span>
            </div>
          </div>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="Referral" className="lg:col-span-1">
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Referral code
            </dt>
            <dd className="flex items-center gap-1 font-mono text-sm text-foreground">
              {user.referral_code || "N/A"}
              {user.referral_code && (
                <button
                  onClick={() => handleCopy(user.referral_code!)}
                  className="opacity-40 hover:opacity-100"
                >
                  <Copy className="h-3 w-3" />
                </button>
              )}
            </dd>
            <dt className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
              Referred by
            </dt>
            <dd className="text-sm text-foreground">
              {user.referred_by_email || "Direct sign-up"}
            </dd>
          </dl>
        </AdminCard>
      </section>

      <section className="mt-6">
        <AdminCard title="Recent activity">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border text-left text-xs uppercase tracking-wider text-muted-foreground">
                  <th className="py-2 pr-3">ID</th>
                  <th className="py-2 pr-3">Type</th>
                  <th className="py-2 pr-3 text-right">Amount</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2">Date</th>
                </tr>
              </thead>
              <tbody>
                {activity.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sm text-muted-foreground">
                      No activity recorded.
                    </td>
                  </tr>
                ) : (
                  activity.map((a) => (
                    <tr key={a.id} className="border-b border-border/60 last:border-0">
                      <td className="py-3 pr-3 font-mono text-xs text-muted-foreground">
                        {a.id.slice(0, 8)}…
                      </td>
                      <td className="py-3 pr-3">{a.type}</td>
                      <td className="py-3 pr-3 text-right font-semibold">{fmtKES(a.amount)}</td>
                      <td className="py-3 pr-3">
                        <StatusPill status={a.status} />
                      </td>
                      <td className="py-3 text-muted-foreground">{fmtDate(a.created_at)}</td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </AdminCard>
      </section>
    </>
  );
}
