import { createFileRoute, Link } from "@tanstack/react-router";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, SectionTitle } from "@/components/ui-bits";
import { PesakiLogo } from "@/components/PesakiLogo";
import {
  Briefcase,
  Building2,
  Landmark,
  Wallet,
  TrendingUp,
  Globe,
  Shield,
  ShieldCheck,
} from "lucide-react";

export const Route = createFileRoute("/about")({
  head: () => ({
    meta: [
      { title: "About PESAKI — Digital Wealth Ecosystem" },
      {
        name: "description",
        content:
          "PESAKI is Africa's digital wealth ecosystem — jobs, business funding, banking and wallet in one app. Built in Nairobi, Kenya.",
      },
    ],
  }),
  component: AboutPage,
});

function AboutPage() {
  return (
    <AppShell>
      <PageHeader title="About PESAKI" subtitle="Africa's Digital Wealth Ecosystem" />

      <div className="px-5 pt-5">
        <section className="gradient-brand-deep relative mb-6 overflow-hidden rounded-3xl p-6 text-white shadow-soft">
          <div className="pointer-events-none absolute -right-16 -top-16 h-52 w-52 rounded-full bg-brand-gold/20 blur-3xl" />
          <div className="relative flex flex-col items-center text-center">
            <PesakiLogo size={64} tone="light" className="glow-green-dark" />
            <h2 className="mt-4 font-display text-2xl font-bold tracking-tight">PESAKI</h2>
            <p className="mt-1 text-[8px] font-medium tracking-[0.22em] text-white/70">
              WORK • GROW • BANK
            </p>
            <span className="mt-4 inline-flex items-center gap-1.5 rounded-full border border-white/15 bg-white/5 px-3 py-1.5 text-[10px] font-medium">
              <ShieldCheck className="h-3 w-3 text-brand-gold" />
              PESAKI MARKETING · BN-6ASR2E26 · BRS, Kenya
            </span>
          </div>
        </section>

        <section className="mb-6">
          <Card className="!p-5">
            <p className="text-sm text-muted-foreground leading-relaxed">
              PESAKI is a Nairobi, Kenya-based fintech platform that brings together financial
              services, employment, and business growth tools into a single mobile app. We built
              PESAKI to solve a simple problem: access to financial services, job opportunities, and
              business funding in Africa are fragmented and often out of reach for most people.
            </p>
            <p className="mt-3 text-sm text-muted-foreground leading-relaxed">
              Our platform serves over 100,000 users across Kenya, providing tools to earn, save,
              invest, and build wealth — all from a single, secure app.
            </p>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Our Hubs" />
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-primary/10 text-primary mx-auto">
                <Briefcase className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">KAZI Link</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Connecting workers with fair-paying jobs and employers with reliable talent.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl gradient-gold text-gold-foreground mx-auto">
                <Building2 className="h-5 w-4" />
              </span>
              <p className="text-sm font-bold">Business Hub</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Funding and growth tools for small businesses to scale sustainably.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl bg-success/15 text-success mx-auto">
                <Landmark className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">Banking Hub</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Savings, fixed deposits, and credit products built for Kenyan savers.
              </p>
            </div>
            <div className="rounded-2xl border border-border bg-card p-4 text-center">
              <span className="mb-3 grid h-10 w-10 place-items-center rounded-xl gradient-primary text-primary-foreground mx-auto">
                <Wallet className="h-5 w-5" />
              </span>
              <p className="text-sm font-bold">PESAKI Wallet</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Digital wallet with M-Pesa integration for deposits, withdrawals, and transfers.
              </p>
            </div>
          </div>
        </section>

        <section className="mb-6">
          <SectionTitle title="Our Mission" />
          <Card className="!p-4">
            <p className="text-sm text-muted-foreground leading-relaxed">
              Our mission is to democratize access to financial services across Africa. We believe
              that everyone — regardless of their background — should have the tools to earn, save,
              invest, and build wealth. By combining job matching, business funding, banking, and
              digital payments into one platform, we're creating pathways to financial inclusion for
              millions of Africans.
            </p>
          </Card>
        </section>

        <section className="mb-6">
          <SectionTitle title="Company" />
          <Card className="!p-4">
            <ul className="space-y-2 text-sm">
              <li>
                <span className="font-semibold">Company:</span> PESAKI MARKETING
              </li>
              <li>
                <span className="font-semibold">Registration:</span> BN-6ASR2E26 (BRS, Kenya)
              </li>
              <li>
                <span className="font-semibold">Location:</span> Santon Business Center, Nairobi
              </li>
              <li>
                <span className="font-semibold">Founded:</span> 2025
              </li>
              <li>
                <span className="font-semibold">Support:</span>{" "}
                <a href="mailto:pesaki777@gmail.com" className="text-primary font-semibold">
                  pesaki777@gmail.com
                </a>
              </li>
              <li>
                <Link to="/compliance" className="font-semibold text-primary hover:underline">
                  Compliance &amp; Trust Center →
                </Link>
              </li>
            </ul>
          </Card>
        </section>

        <section className="mt-8 text-center">
          <Link
            to="/kazi"
            className="inline-flex items-center justify-center gap-2 rounded-full gradient-primary px-6 py-3 text-sm font-semibold text-primary-foreground"
          >
            Explore KAZI Link <Briefcase className="h-4 w-4" />
          </Link>
        </section>
      </div>
    </AppShell>
  );
}
