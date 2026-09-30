import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle, Badge } from "@/components/ui-bits";
import { Shield, Lock, Key, Smartphone, Eye, CheckCircle2, Globe } from "lucide-react";

export const Route = createFileRoute("/security")({
  head: () => ({
    meta: [
      { title: "Security — PESAKI" },
      {
        name: "description",
        content:
          "PESAKI security information: account protections, encrypted connections, M-Pesa payments, and how to keep your account safe.",
      },
    ],
  }),
  component: SecurityPage,
});

function SecurityPage() {
  return (
    <AppShell>
      <PageHeader title="Security" subtitle="Your safety is our priority" />

      <div className="px-5 pt-5">
        <section className="mb-6">
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <Shield className="mt-0.5 h-6 w-6 text-success flex-shrink-0" />
              <p className="text-sm text-muted-foreground leading-relaxed">
                At PESAKI, protecting your account and your data is a standing priority. We use
                standard account protections, encrypted transport for data in transit, and access
                controls applied to the systems that hold your information. PESAKI is committed to
                complying with applicable Kenyan laws and regulatory requirements relevant to the
                services it provides.
              </p>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Security Features" />
          <div className="space-y-3">
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <Lock className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Secure Data in Transit</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Connections to PESAKI are encrypted using current standard transport security.
                  </p>
                </div>
                <Badge tone="success">Active</Badge>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Smartphone className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Account Password</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    A strong, unique password is the main protection on your PESAKI account. Never
                    reuse your PESAKI password on another site.
                  </p>
                </div>
                <Badge tone="success">Required</Badge>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-foreground">
                  <Eye className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Transaction Review</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Your wallet keeps a record of deposits, withdrawals and transfers so you can
                    check activity on your account at any time.
                  </p>
                </div>
                <Badge tone="success">In App</Badge>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground">
                  <Key className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">M-Pesa Payments</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    M-Pesa deposits and withdrawals run through Safaricom's Daraja payment API. You
                    approve every payment prompt on your own phone.
                  </p>
                </div>
                <Badge tone="success">In App</Badge>
              </div>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Security Tips" />
          <Card className="!p-4">
            <ul className="space-y-3 text-sm">
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                <span>
                  Use a unique password and do not share your password, PIN, or OTP with anyone —
                  PESAKI will never call or email asking for these.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                <span>Always review your wallet transaction history after a payment.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                <span>Always verify sender details before confirming M-Pesa transactions.</span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                <span>
                  Log out of shared devices and keep the app updated to the latest version.
                </span>
              </li>
            </ul>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Registration &amp; Compliance" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 h-6 w-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">A registered Kenyan business</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  PESAKI is operated by PESAKI MARKETING, registered in Kenya under the Business
                  Registration Service (BRS) with registration number BN-6ASR2E26. PESAKI is
                  committed to complying with applicable Kenyan laws and regulatory requirements
                  relevant to the services it provides.
                </p>
                <p className="mt-2 text-xs text-muted-foreground leading-relaxed">
                  Registration of a business name is not a licence or an authorization to carry out
                  activities that require separate regulatory approval. See the{" "}
                  <Link to="/compliance" className="font-semibold text-primary hover:underline">
                    PESAKI Compliance &amp; Trust Center
                  </Link>{" "}
                  for the full statement.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI · Work. Grow. Bank.
        </p>
      </div>
    </AppShell>
  );
}
