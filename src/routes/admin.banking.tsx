import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { AdminPageHeader, AdminCard, KPI } from "@/components/AdminShell";
import { fmtCompact, fmt } from "@/lib/admin-utils";
import { apiRequest } from "@/utils/api";
import { useAdminAuth } from "@/hooks/useAdmin";
import { toast } from "sonner";
import { Plus } from "lucide-react";

interface SavingsPlan {
  plan: string;
  apy: string;
  members: number;
  locked: number;
}

export const Route = createFileRoute("/admin/banking")({
  component: AdminBanking,
});

function AdminBanking() {
  const { loading: authLoading } = useAdminAuth();
  const [plans, setPlans] = useState<SavingsPlan[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (authLoading) return;
    apiRequest<{
      success: boolean;
      data: { plans: SavingsPlan[]; totalLocked: number; totalMembers: number };
    }>("/admin/banking/summary")
      .then((res) => {
        if (res.success && res.data) {
          setPlans(res.data.plans || []);
        }
        setLoading(false);
      })
      .catch(() => {
        toast.error("Could not load banking data");
        setLoading(false);
      });
  }, [authLoading]);

  const totalLocked = plans.reduce((s, p) => s + p.locked, 0);
  const totalMembers = plans.reduce((s, p) => s + p.members, 0);

  if (authLoading || loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <p className="text-muted-foreground">Loading banking data…</p>
      </div>
    );
  }

  return (
    <>
      <AdminPageHeader
        title="Banking Plans"
        subtitle="Manage savings products, APY tiers, and member balances."
        actions={
          <button className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90">
            <Plus className="h-4 w-4" /> New plan
          </button>
        }
      />

      <section className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        <KPI
          label="Total Locked"
          value={fmtCompact(totalLocked)}
          hint="Across all plans"
          tone="gold"
        />
        <KPI label="Members" value={fmt(totalMembers)} hint="Active savers" tone="success" />
        <KPI label="Avg. APY" value="10%" hint="Weighted" />
        <KPI label="Payouts (mo)" value={fmtCompact(2_840_000)} hint="Interest paid" />
      </section>

      <section className="mt-6 grid grid-cols-1 gap-4 lg:grid-cols-3">
        {plans.map((p) => (
          <AdminCard key={p.plan} title={p.plan}>
            <div className="flex items-baseline justify-between">
              <span className="text-3xl font-bold text-primary">{p.apy}</span>
              <span className="text-xs text-muted-foreground">APY</span>
            </div>
            <dl className="mt-4 space-y-2 text-sm">
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Members</dt>
                <dd className="font-semibold">{fmt(p.members)}</dd>
              </div>
              <div className="flex justify-between">
                <dt className="text-muted-foreground">Locked</dt>
                <dd className="font-semibold">{fmtCompact(p.locked)}</dd>
              </div>
            </dl>
            <div className="mt-4 flex gap-2">
              <button className="flex-1 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted">
                Edit
              </button>
              <button className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
                View members
              </button>
            </div>
          </AdminCard>
        ))}
      </section>
    </>
  );
}
