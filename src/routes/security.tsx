import { createFileRoute } from "@tanstack/react-router";
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
          "PESAKI security: bank-grade encryption, M-Pesa secure integration, two-factor authentication, and fraud monitoring.",
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
                At PESAKI, your security is our top priority. We use industry-leading encryption,
                multi-layer authentication, and continuous fraud monitoring to protect your funds
                and data. All communications are encrypted end-to-end, and we comply with Kenyan
                financial regulations.
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
                  <p className="text-sm font-semibold">Bank-Grade Encryption</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    AES-256 encryption for all data at rest and TLS 1.3 for data in transit.
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
                  <p className="text-sm font-semibold">Two-Factor Authentication</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Secure your account with SMS or authenticator app verification.
                  </p>
                </div>
                <Badge tone="success">Available</Badge>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-gold/15 text-gold-foreground">
                  <Eye className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Fraud Monitoring</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    AI-powered detection for suspicious transactions, 24/7.
                  </p>
                </div>
                <Badge tone="success">24/7</Badge>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground">
                  <Key className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">M-Pesa Secure Integration</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Safaricom-approved integration for all M-Pesa transactions.
                  </p>
                </div>
                <Badge tone="success">Verified</Badge>
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
                  Never share your password, PIN, or OTP with anyone — PESAKI will never call or
                  email asking for these.
                </span>
              </li>
              <li className="flex items-start gap-2">
                <CheckCircle2 className="mt-0.5 h-4 w-4 text-success shrink-0" />
                <span>
                  Enable two-factor authentication from your Profile settings for extra protection.
                </span>
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
          <SectionTitle title="Regulatory Compliance" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <Globe className="mt-0.5 h-6 w-6 text-primary flex-shrink-0" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Licensed & Regulated in Kenya</p>
                <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                  Pesaki Marketing is registered in Kenya and complies with the Central Bank of
                  Kenya guidelines for mobile money operators. We are committed to meeting all
                  applicable Kenyan financial regulations.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI · Secure. Trusted. Reliable.
        </p>
      </div>
    </AppShell>
  );
}
