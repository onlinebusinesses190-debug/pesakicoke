import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle, Badge } from "@/components/ui-bits";
import { PesakiLogo } from "@/components/PesakiLogo";
import {
  Briefcase,
  Building2,
  CheckCircle2,
  CircleCheck,
  FileSignature,
  GraduationCap,
  LineChart,
  ListChecks,
  MessageCircle,
  ShieldCheck,
  TrendingUp,
} from "lucide-react";
import { BUSINESS_FUNDING, COMPANY } from "@/lib/pesaki-facts";

export const Route = createFileRoute("/business-funding")({
  head: () => ({
    meta: [
      { title: "Business Hub Funding Model — PESAKI" },
      {
        name: "description",
        content:
          "How PESAKI Business Hub funding works: mentorship for small and emerging businesses, eligibility and approval, the agreement, monitoring, and the agreed return of 10% of monthly business profit.",
      },
      {
        name: "keywords",
        content:
          "PESAKI Business Hub, PESAKI business funding Kenya, SME mentorship PESAKI, business profit share, PESAKI funding terms",
      },
      { property: "og:title", content: "Business Hub Funding Model — PESAKI" },
      {
        property: "og:description",
        content:
          "Mentorship, eligibility, the agreement, monitoring, and the agreed return. A share of monthly business profit — not company ownership.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${COMPANY.website}/business-funding` },
    ],
    links: [{ rel: "canonical", href: `${COMPANY.website}/business-funding` }],
  }),
  component: BusinessFundingPage,
});

function BusinessFundingPage() {
  return (
    <AppShell>
      <PageHeader title="Business Hub Funding" subtitle="How the funding model works" />

      <div className="px-5 pt-5">
        <section className="mb-6">
          <Card className="!p-5">
            <div className="flex items-start gap-3">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-brand-tint-gold text-brand-gold-deep">
                <Building2 className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-bold text-brand-deep">Business Hub funding, explained</p>
                <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
                  PESAKI&apos;s Business Hub is designed to support small and emerging businesses.
                  Where a business is approved for funding, the agreed return is{" "}
                  <span className="font-semibold text-foreground">{BUSINESS_FUNDING.summary}</span>{" "}
                  set out in the agreement signed by both parties.
                </p>
                <div className="mt-3">
                  <Badge tone="gold">Profit share — not company ownership</Badge>
                </div>
              </div>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Eligibility and approval" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
              <p className="text-sm leading-relaxed text-muted-foreground">
                {BUSINESS_FUNDING.approvalNotice} Not every applicant is approved, and approval does
                not guarantee a specific amount. The terms that apply to your business are disclosed
                to you in full before any funding is provided.
              </p>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Mentorship before funding" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
                <GraduationCap className="h-5 w-5" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold">{BUSINESS_FUNDING.mentorship.duration}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
                  Eligible entrepreneurs may receive approximately 3 hours of structured mentorship
                  focused on {BUSINESS_FUNDING.mentorship.focus}. The mentorship is intended to help
                  the entrepreneur understand:
                </p>
              </div>
            </div>
            <ul className="mt-3 space-y-2">
              {BUSINESS_FUNDING.mentorship.covers.map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CheckCircle2 className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="What happens once you are approved" />
          <div className="space-y-3">
            {BUSINESS_FUNDING.steps.map((step, i) => (
              <Card key={step} className="!p-4">
                <div className="flex items-start gap-3">
                  <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full gradient-brand text-[11px] font-bold text-white">
                    {i + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm leading-relaxed text-foreground">{step}</p>
                  </div>
                </div>
              </Card>
            ))}
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="What the agreed return is" />
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <TrendingUp className="mt-0.5 h-5 w-5 shrink-0 text-brand-gold-deep" />
              <div className="min-w-0">
                <p className="text-sm font-semibold">
                  The current intended model is {BUSINESS_FUNDING.summary}
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  This is a contractual share of the business&apos;s monthly profit. It is not a
                  sale of ownership in your company, and PESAKI does not take a shareholding or
                  equity interest unless a signed agreement you have read expressly says so.
                </p>
                <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
                  The agreed percentage, payment schedule and any monitoring obligations are set out
                  in the agreement you sign. Read that agreement before proceeding.
                </p>
              </div>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Terms to review" />
          <div className="space-y-3">
            <Card className="!p-4">
              <Link to="/terms" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
                  <ListChecks className="h-5 w-5" />
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
              <Link to="/business" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint-gold text-brand-gold-deep">
                  <Briefcase className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Apply through Business Hub</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    Start an application and see the funding guidelines in the app.
                  </span>
                </span>
              </Link>
            </Card>
            <Card className="!p-4">
              <Link to="/privacy" className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-tint-green text-brand-ink">
                  <FileSignature className="h-5 w-5" />
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">Privacy Policy</span>
                  <span className="mt-0.5 block text-xs text-muted-foreground">
                    How business and financial information you submit is handled.
                  </span>
                </span>
              </Link>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Need clarification?" />
          <Card className="!p-4">
            <p className="text-sm leading-relaxed text-muted-foreground">
              If anything here is unclear before you apply, ask the PESAKI Help Center first. We
              would rather answer a question now than have you agree to terms you did not
              understand.
            </p>
            <div className="mt-3 space-y-2 text-xs text-muted-foreground">
              <p>
                <span className="font-semibold text-foreground">WhatsApp / Help Center:</span>{" "}
                <a
                  href={`https://wa.me/${COMPANY.whatsappDial}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="font-semibold text-brand-ink hover:underline"
                >
                  {COMPANY.whatsapp}
                </a>
              </p>
              <p>
                <span className="font-semibold text-foreground">Email:</span>{" "}
                <a
                  href={`mailto:${COMPANY.email}`}
                  className="font-semibold text-brand-ink hover:underline"
                >
                  {COMPANY.email}
                </a>
              </p>
            </div>
            <a
              href={`https://wa.me/${COMPANY.whatsappDial}`}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-xl gradient-brand px-4 py-3 text-sm font-semibold text-white"
            >
              <MessageCircle className="h-4 w-4" /> Ask PESAKI
            </a>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Verify PESAKI" />
          <Card className="!p-4">
            <ul className="space-y-2.5">
              {[
                `${COMPANY.legalName} is a registered Kenyan business.`,
                `Business Registration Number ${COMPANY.registrationNumber}.`,
                `Registered through the ${COMPANY.registeringAuthority}.`,
              ].map((item) => (
                <li key={item} className="flex items-start gap-2 text-xs text-muted-foreground">
                  <CircleCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-brand-ink" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
            <Link
              to="/compliance"
              className="mt-3 inline-flex items-center gap-1.5 text-xs font-semibold text-brand-ink hover:underline"
            >
              <PesakiLogo size={18} tone="dark" /> Open the PESAKI Compliance &amp; Trust Center
            </Link>
          </Card>
        </section>

        <section className="mb-6">
          <Card className="!p-4">
            <div className="flex items-start gap-3">
              <LineChart className="mt-0.5 h-5 w-5 shrink-0 text-brand-ink" />
              <p className="text-xs leading-relaxed text-muted-foreground">
                {COMPANY.legalName} is committed to complying with applicable Kenyan laws and
                regulatory requirements relevant to the services it provides. Registration of the
                business name is not a licence or an authorization to carry out activities that
                require separate regulatory approval.
              </p>
            </div>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          {COMPANY.legalName} · {COMPANY.registrationNumber}
        </p>
      </div>
    </AppShell>
  );
}
