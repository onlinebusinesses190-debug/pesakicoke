import type { ReactNode } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle, Badge } from "@/components/ui-bits";
import {
  ShieldCheck,
  Building2,
  MapPin,
  Phone,
  Mail,
  Globe,
  FileText,
  Lock,
  Database,
  Scale,
  MessageCircle,
  ExternalLink,
} from "lucide-react";

const WHATSAPP_NUMBER = "254140399389";
const CONTACT_EMAIL = "pesaki777@gmail.com";
const WEBSITE = "https://pesaki.co.ke";

export const Route = createFileRoute("/compliance")({
  head: () => ({
    meta: [
      { title: "PESAKI Compliance & Trust Center" },
      {
        name: "description",
        content:
          "PESAKI Compliance & Trust Center: business registration details for PESAKI MARKETING (BN-6ASR2E26, Kenya BRS), leadership, offices, policies and data protection status.",
      },
      {
        name: "keywords",
        content:
          "PESAKI Kenya, PESAKI MARKETING, PESAKI compliance, PESAKI trust center, PESAKI business registration, PESAKI Kenya BRS, PESAKI data protection",
      },
      { property: "og:title", content: "PESAKI Compliance & Trust Center" },
      {
        property: "og:description",
        content:
          "Transparency, security and responsible digital services. Business registration, leadership, policies and contacts for PESAKI MARKETING.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${WEBSITE}/compliance` },
      { name: "twitter:card", content: "summary_large_image" },
    ],
    links: [{ rel: "canonical", href: `${WEBSITE}/compliance` }],
  }),
  component: CompliancePage,
});

function Row({ label, value }: { label: string; value: ReactNode }) {
  return (
    <li className="flex flex-col gap-0.5 border-b border-border/60 py-2 last:border-0 sm:flex-row sm:items-baseline sm:gap-3">
      <span className="text-xs font-semibold text-muted-foreground sm:w-40 sm:shrink-0">
        {label}
      </span>
      <span className="text-sm text-foreground">{value}</span>
    </li>
  );
}

function CompliancePage() {
  return (
    <AppShell variant="public">
      <PageHeader
        title="PESAKI Compliance & Trust Center"
        subtitle="Transparency, security and responsible digital services."
      />

      <div className="px-5 pt-5">
        <section className="mb-6">
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-6 w-6 flex-shrink-0 text-success" />
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-bold">Registered in Kenya</p>
                  <Badge tone="success">BRS Registered</Badge>
                </div>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  PESAKI MARKETING is a business registered in the Republic of Kenya under the
                  Business Registration Service (BRS) with registration number{" "}
                  <span className="font-semibold text-foreground">BN-6ASR2E26</span>. This page sets
                  out the information we can verify today, together with the policies and contacts
                  you need to hold us accountable.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Business Registration" />
          <Card className="!p-4">
            <ul>
              <Row label="Registered name" value="PESAKI MARKETING" />
              <Row
                label="Registration number"
                value={<span className="font-semibold">BN-6ASR2E26</span>}
              />
              <Row
                label="Registering authority"
                value="Business Registration Service (BRS), Kenya"
              />
              <Row label="Country of registration" value="Republic of Kenya" />
              <Row label="Operating name" value="PESAKI" />
            </ul>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Regulatory Notice" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <Scale className="mt-0.5 h-5 w-5 flex-shrink-0 text-gold-foreground" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                Registration of PESAKI MARKETING as a business name should not be interpreted as a
                licence or authorization to conduct activities that require separate regulatory
                approval. PESAKI is committed to identifying and meeting applicable regulatory
                requirements as its services develop.
              </p>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Leadership" />
          <div className="space-y-3">
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Michael Ndung&apos;u</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Founder and Chief Executive Officer, PESAKI MARKETING
                  </p>
                </div>
              </div>
            </Card>
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl gradient-gold text-gold-foreground">
                  <Building2 className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Hans Jaoko</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Director, PESAKI MARKETING — Founder, Stratum Energy Ventures Ltd
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Offices" />
          <div className="space-y-3">
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Nairobi Office</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Along Tom Mboya Street, Nairobi
                  </p>
                  <div className="mt-2">
                    <Badge tone="warning">Under Renovation</Badge>
                  </div>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    This office is currently under renovation. Please contact the Help Center before
                    visiting, as walk-in availability is not guaranteed during this period.
                  </p>
                </div>
              </div>
            </Card>
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Santon Business Center</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">Santon, Nairobi</p>
                  <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
                    Our business location. Please confirm the best time to visit with the Help
                    Center in advance.
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Our Policies" />
          <div className="space-y-3">
            <Card className="!p-4">
              <Link to="/terms" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <FileText className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Terms of Service</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    The agreement that governs your use of PESAKI services.
                  </span>
                </span>
              </Link>
            </Card>
            <Card className="!p-4">
              <Link to="/privacy" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <Lock className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Privacy Policy</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    How we collect, use, store and protect your personal information.
                  </span>
                </span>
              </Link>
            </Card>
            <Card className="!p-4">
              <Link to="/security" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-gold text-gold-foreground">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Security</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Security guidance and how to keep your account safe.
                  </span>
                </span>
              </Link>
            </Card>
            <Card className="!p-4">
              <Link to="/contact" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-primary text-primary-foreground">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Contact &amp; Help Center</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Reach our team by WhatsApp or email for questions and complaints.
                  </span>
                </span>
              </Link>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Data Protection" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <Database className="mt-0.5 h-5 w-5 flex-shrink-0 text-primary" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">Data Protection Status</p>
                <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
                  PESAKI is implementing its data protection compliance requirements and will update
                  this page with applicable registration information when available.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  For how we handle your information today, see the{" "}
                  <Link to="/privacy" className="font-semibold text-primary hover:underline">
                    Privacy Policy
                  </Link>
                  .
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Verified Contact Details" />
          <Card className="!p-4">
            <ul>
              <Row
                label="WhatsApp / Help Center"
                value={
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Phone className="h-3.5 w-3.5" /> 0140399389
                  </a>
                }
              />
              <Row
                label="Email"
                value={
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Mail className="h-3.5 w-3.5" /> {CONTACT_EMAIL}
                  </a>
                }
              />
              <Row
                label="Website"
                value={
                  <a
                    href={WEBSITE}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-primary hover:underline"
                  >
                    <Globe className="h-3.5 w-3.5" /> pesaki.co.ke
                    <ExternalLink className="h-3 w-3 opacity-70" />
                  </a>
                }
              />
            </ul>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Raise a Concern" />
          <Card className="!p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              If you have a question or concern about PESAKI MARKETING, its registration, or how we
              handle your data, contact us through the verified details above. We will review your
              concern and respond as soon as we reasonably can.
            </p>
            <a
              href={`https://wa.me/${WHATSAPP_NUMBER}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-primary px-4 py-3 text-sm font-semibold text-primary-foreground"
            >
              <MessageCircle className="h-4 w-4" /> Contact PESAKI
            </a>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI MARKETING · BN-6ASR2E26 · Nairobi, Kenya
        </p>
      </div>
    </AppShell>
  );
}
