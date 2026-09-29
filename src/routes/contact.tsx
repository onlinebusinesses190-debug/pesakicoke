import { createFileRoute } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle } from "@/components/ui-bits";
import { Mail, Phone, MapPin, Clock, Send, MessageCircle } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/contact")({
  head: () => ({
    meta: [
      { title: "Contact PESAKI — Support" },
      {
        name: "description",
        content:
          "Contact PESAKI support. We're available Monday-Friday 8am-8pm EAT. Email support@pesaki.co.ke or call +254 700 000 000.",
      },
    ],
  }),
  component: ContactPage,
});

function ContactPage() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [subject, setSubject] = useState("");

  return (
    <AppShell>
      <PageHeader title="Contact Us" subtitle="We'd love to hear from you" />

      <div className="px-5 pt-5">
        <section className="mb-6">
          <SectionTitle title="Get in Touch" />
          <p className="text-sm text-muted-foreground mb-4">
            Have a question? Want to give feedback? Reach out to our support team and we'll respond
            within 24 hours.
          </p>

          <div className="space-y-3">
            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Mail className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Email</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">support@pesaki.co.ke</p>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-success/15 text-success">
                  <Phone className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Phone</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">+254 700 000 000</p>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl gradient-gold text-gold-foreground">
                  <MapPin className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Address</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    PESAKI Offices, Nairobi, Kenya
                  </p>
                </div>
              </div>
            </Card>

            <Card className="!p-4">
              <div className="flex items-start gap-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
                  <Clock className="h-5 w-5" />
                </span>
                <div className="min-w-0">
                  <p className="text-sm font-semibold">Support Hours</p>
                  <p className="mt-0.5 text-xs text-muted-foreground">
                    Mon-Fri: 8:00 AM – 8:00 PM EAT
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Send a Message" />
          <Card className="!p-4">
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
                onClick={() =>
                  alert(
                    `Thank you, ${name || "friend"}! We'll respond to ${email || "your email"} within 24 hours.`,
                  )
                }
                className="w-full rounded-xl gradient-primary py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
              >
                <span className="flex items-center justify-center gap-1.5">
                  <Send className="h-4 w-4" /> Send Message
                </span>
              </button>
            </div>
          </Card>
        </section>

        <p className="mt-8 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
          PESAKI · Earn. Invest. Grow.
        </p>
      </div>
    </AppShell>
  );
}
