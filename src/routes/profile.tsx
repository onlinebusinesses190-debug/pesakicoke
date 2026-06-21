import { createFileRoute } from "@tanstack/react-router";
import {
  User, KeyRound, Phone, Gift, ShieldCheck, Bell,
  HelpCircle, MessageCircle, FileText, Lock, Info, LogOut, Copy, ChevronRight,
} from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card, Badge, SectionTitle } from "@/components/ui-bits";
import { user, fmt } from "@/lib/mock";

export const Route = createFileRoute("/profile")({
  head: () => ({
    meta: [
      { title: "Profile — PESAKI" },
      { name: "description", content: "Manage your PESAKI account, security, referrals and support." },
    ],
  }),
  component: ProfilePage,
});

const groups: { title: string; items: { label: string; icon: any; tone?: "destructive" }[] }[] = [
  {
    title: "Account",
    items: [
      { label: "Personal Information", icon: User },
      { label: "Change Password",      icon: KeyRound },
      { label: "Change Phone Number",  icon: Phone },
      { label: "Verification Status",  icon: ShieldCheck },
    ],
  },
  {
    title: "Preferences",
    items: [
      { label: "Notification Settings", icon: Bell },
    ],
  },
  {
    title: "Support",
    items: [
      { label: "Help Center",     icon: HelpCircle },
      { label: "Contact Support", icon: MessageCircle },
    ],
  },
  {
    title: "Legal",
    items: [
      { label: "Terms and Conditions", icon: FileText },
      { label: "Privacy Policy",       icon: Lock },
      { label: "About PESAKI",         icon: Info },
    ],
  },
  {
    title: " ",
    items: [{ label: "Logout", icon: LogOut, tone: "destructive" }],
  },
];

function ProfilePage() {
  return (
    <AppShell>
      <PageHeader title="Profile" subtitle="Your PESAKI account" />

      <section className="px-5 pt-5">
        <Card className="!p-4">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-full gradient-primary text-lg font-bold text-primary-foreground">
              {user.avatar}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold">{user.name} Otieno</p>
              <p className="truncate text-xs text-muted-foreground">+254 7•• ••• 482</p>
              <div className="mt-1 flex gap-1.5">
                <Badge tone="success"><ShieldCheck className="h-2.5 w-2.5" /> Verified</Badge>
                <Badge tone="gold">Gold Tier</Badge>
              </div>
            </div>
          </div>
        </Card>
      </section>

      {/* Referral */}
      <section className="mt-5 px-5">
        <SectionTitle title="Referral program" />
        <div className="relative overflow-hidden rounded-2xl gradient-gold p-5 text-gold-foreground">
          <Gift className="absolute -right-3 -top-3 h-24 w-24 opacity-20" />
          <p className="text-xs font-semibold uppercase tracking-wider">Invite & Earn</p>
          <p className="mt-1 text-lg font-bold">Earn 10% of every referral's first deposit</p>

          <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
            <div className="rounded-xl bg-foreground/10 p-2.5">
              <p className="opacity-70">Referrals</p>
              <p className="mt-0.5 font-bold">{user.referrals}</p>
            </div>
            <div className="rounded-xl bg-foreground/10 p-2.5">
              <p className="opacity-70">Earnings</p>
              <p className="mt-0.5 font-bold">{fmt(user.referralEarnings)}</p>
            </div>
          </div>

          <div className="mt-3 grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl bg-foreground/10 px-3 py-2.5">
            <p className="truncate font-mono text-sm font-bold">{user.referralCode}</p>
            <button className="inline-flex items-center gap-1 rounded-full bg-foreground px-3 py-1.5 text-[11px] font-semibold text-background">
              <Copy className="h-3 w-3" /> Copy
            </button>
          </div>
        </div>
      </section>

      {/* Groups */}
      {groups.map((g) => (
        <section key={g.title} className="mt-5 px-5">
          {g.title.trim() && <SectionTitle title={g.title} />}
          <Card className="!p-2">
            <ul className="divide-y divide-border">
              {g.items.map((it) => (
                <li key={it.label}>
                  <button className={`grid w-full grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-2 py-3 text-left ${
                    it.tone === "destructive" ? "text-destructive" : ""
                  }`}>
                    <span className={`grid h-9 w-9 place-items-center rounded-xl ${
                      it.tone === "destructive" ? "bg-destructive/10 text-destructive" : "bg-muted text-foreground"
                    }`}>
                      <it.icon className="h-4 w-4" />
                    </span>
                    <span className="truncate text-sm font-medium">{it.label}</span>
                    <ChevronRight className="h-4 w-4 text-muted-foreground" />
                  </button>
                </li>
              ))}
            </ul>
          </Card>
        </section>
      ))}

      <p className="mt-6 px-5 pb-4 text-center text-[10px] uppercase tracking-[0.2em] text-muted-foreground">
        PESAKI v1.0 · Africa's Digital Wealth Ecosystem
      </p>
    </AppShell>
  );
}
