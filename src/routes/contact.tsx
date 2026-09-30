import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle } from "@/components/ui-bits";
import { Mail, Phone, MapPin, Send, MessageCircle, Globe, ShieldCheck } from "lucide-react";
import { useState } from "react";

const WHATSAPP_NUMBER = "254140399389";
const WHATSAPP_DISPLAY = "0140399389";
const CONTACT_EMAIL = "pesaki777@gmail.com";
const WEBSITE = "https://pesaki.co.ke";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact PESAKI — Help Center" },
      {
        name: "description",
        content:
          "Contact PESAKI MARKETING directly. WhatsApp Help Center 0140399389, email pesaki777@gmail.com, offices on Tom Mboya Street (under renovation) and Santon Business Center, Nairobi.",
      },
    ],
    links: [{ rel: "canonical", href: `${WEBSITE}/contact` }],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");

  function openEmailClient() {
    const body = [
      `Name: ${name || "Not provided"}`,
      `Reply email: ${email || "Not provided"}`,
      "",
      message || "I would like clarification about PESAKI.",
    ].join("\n");

    window.location.href = `mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent(
      subject ? `PESAKI enquiry — ${subject}` : "PESAKI enquiry",
    )}&body=${encodeURIComponent(body)}`;
  }

  return (
    <AppShell>
      <PageHeader title="Contact Us" subtitle="Ask PESAKI directly" />

      <div className="px-5 pt-5">
        <section className="mb-6">
          <SectionTitle title="Reach PESAKI Directly" />
          <p className="text-sm text-muted-foreground mb-4">
            You don't have to rely on social media, search engines or third parties to understand
            PESAKI. For questions about your account or any PESAKI service, contact us directly or
            visit our offices.
          </p>

          <div className="space-y-3">
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <MessageCircle className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">WhatsApp / Help Center</p>
                  <a
                    href={`https://wa.me/${WHATSAPP_NUMBER}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block text-xs font-semibold text-primary hover:underline"
                  >
                    {WHATSAPP_DISPLAY}
                  </a>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Email</p>
                  <a
                    href={`mailto:${CONTACT_EMAIL}`}
                    className="mt-0.5 block break-all text-xs font-semibold text-primary hover:underline"
                  >
                    {CONTACT_EMAIL}
                  </a>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-gold text-gold-foreground">
                  <Globe className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Official website</p>
                  <a
                    href={WEBSITE}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-0.5 block text-xs font-semibold text-primary hover:underline"
                  >
                    pesaki.co.ke
                  </a>
                </div>
              </div>
            </Card>

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
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Currently under renovation — contact the Help Center before visiting.
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
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Confirm the best time to visit with the Help Center in advance.
                  </p>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <ShieldCheck className="h-5 w-5" />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold">Who you are contacting</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    PESAKI MARKETING · BN-6ASR2E26 · Business Registration Service (BRS), Kenya
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Send a Message" />
          <Card className="!p-4">
            <p className="mb-3 text-xs text-muted-foreground">
              Fill this in and your email app will open a message addressed to PESAKI.
            </p>
            <div className="space-y-3">
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Name
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="Your full name"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="your.email@example.com"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Subject
                </label>
                <input
                  type="text"
                  value={subject}
                  onChange={(e) => setSubject(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="What is this about?"
                />
              </div>
              <div>
                <label className="text-xs font-semibold text-muted-foreground uppercase">
                  Message
                </label>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary"
                  placeholder="How can we help you?"
                  rows={4}
                />
              </div>
              <button
                onClick={openEmailClient}
                className="w-full rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Send className="h-4 w-4" /> Send via Email
                </span>
              </button>
            </div>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Before You Proceed" />
          <Card className="!p-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              Users should review the applicable{" "}
              <a href="/terms" className="font-semibold text-primary hover:underline">
                Terms of Service
              </a>{" "}
              and any service-specific agreements before proceeding. Funding, savings and any other
              service are subject to eligibility, assessment and approval, and the terms are
              disclosed and agreed before the service is provided.
            </p>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Verified Contact Details" />
          <Card className="!p-4">
            <p className="text-xs leading-relaxed text-muted-foreground">
              PESAKI is operated by PESAKI MARKETING, business registration number BN-6ASR2E26,
              registered through the Business Registration Service (BRS), Kenya. The official PESAKI
              website is <span className="font-semibold text-foreground">pesaki.co.ke</span>. Full
              company, leadership and policy information is published on the{" "}
              <a href="/compliance" className="font-semibold text-primary hover:underline">
                PESAKI Compliance &amp; Trust Center
              </a>
              .
            </p>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI MARKETING · BN-6ASR2E26
        </p>
      </div>
    </AppShell>
  );
}
