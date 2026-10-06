import { createFileRoute, rootRouteId, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { ArrowLeft, Check, Loader2, Search, Sparkles } from "lucide-react";
import { AppShell, PageHeader } from "@/components/AppShell";
import { Card } from "@/components/ui-bits";

export const Route = createFileRoute("/kazi/google-card-help")({
  getParentRoute: () => rootRouteId,
  head: () => ({
    meta: [
      { title: "Add Yourself to Google Search — KAZI Link Help" },
      {
        name: "description",
        content: "Step-by-step guide to create a Google People Card and appear in search results.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: GoogleCardHelp,
});

const STEPS = [
  {
    number: 1,
    title: "Open Google on your phone",
    description: "Use the Chrome app or go to google.com in your mobile browser.",
  },
  {
    number: 2,
    title: "Search \"add me to search\"",
    description: 'Type <span className="font-mono bg-muted px-1.5 py-0.5 rounded">add me to search</span> in the Google search bar and tap the first result.',
  },
{
    number: 3,
    title: "Tap \"Get started\"",
    description: 'You will see a card that says "Add yourself to Google Search". Tap the <span className="font-bold">Get started</span> button.',
  },
  {
    number: 4,
    title: "Fill in your details",
    description: "Enter your name, location, occupation, a short bio, and upload a photo. Use the same details as your KAZI Link profile for consistency.",
  },
  {
    number: 5,
    title: "Add your KAZI profile link",
    description: 'In the <span className="font-bold">Links</span> section, add your KAZI Link public profile URL: <br /><span className="font-mono text-xs bg-muted px-2 py-1 rounded block mt-1 break-all">https://pesaki.co.ke/kazi/m/your-slug</span>',
  },
{
    number: 6,
    title: "Preview and submit",
    description: 'Review your card, make sure everything looks correct, then tap <span className="font-bold">Submit</span>. Google will review it and typically publishes within a few hours.',
  },
];

const TIPS = [
  "Use a clear, recent photo of your face — this helps people recognize you.",
  "Keep your bio concise (under 500 characters) and highlight your key skills.",
  "Your KAZI profile link lets potential employers see your full portfolio, reviews, and contact options.",
  "You can edit your People Card anytime by searching \"add me to search\" again.",
  "Google requires a phone number for verification during setup.",
];

function GoogleCardHelp() {
  const navigate = useNavigate();
  const [activeStep, setActiveStep] = useState(0);

  useEffect(() => {
    document.title = "Add Yourself to Google Search — KAZI Link Help";
  }, []);

  return (
    <AppShell>
      <PageHeader
        title="Add Yourself to Google Search"
        subtitle="Create a Google People Card to appear when someone searches your name"
        right={
          <button
            onClick={() => navigate({ to: "/kazi" })}
            aria-label="Back to KAZI Link"
            className="grid h-9 w-9 place-items-center rounded-full bg-muted text-foreground"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
        }
      />

      <div className="space-y-4 px-5 pt-4 pb-20">
        {/* Progress indicator */}
        <div className="flex items-center justify-between">
          {STEPS.map((_, i) => (
            <div key={i} className="flex items-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full text-xs font-bold transition-colors ${
                  i <= activeStep
                    ? "bg-primary text-primary-foreground"
                    : "bg-muted text-muted-foreground"
                }`}
              >
                {i + 1}
              </div>
              {i < STEPS.length - 1 && (
                <div
                  className={`w-16 h-0.5 mx-2 rounded ${
                    i < activeStep ? "bg-primary" : "bg-muted"
                  }`}
                />
              )}
            </div>
          ))}
        </div>

        {/* Step content */}
        <Card className="!p-5">
          <div className="space-y-4">
            <div className="flex items-center gap-3">
              <div
                className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary"
              >
                <Search className="h-6 w-6" />
              </div>
              <div>
                <h3 className="text-base font-semibold text-foreground">{STEPS[activeStep].title}</h3>
                <p className="mt-1 text-sm text-muted-foreground" dangerouslySetInnerHTML={{ __html: STEPS[activeStep].description }} />
              </div>
            </div>

            {/* Step navigation */}
            <div className="flex items-center justify-between pt-4 border-t border-border">
              <button
                onClick={() => setActiveStep((s) => Math.max(0, s - 1))}
                disabled={activeStep === 0}
                className="inline-flex items-center gap-1.5 rounded-full border border-border px-4 py-2 text-sm font-semibold text-foreground disabled:opacity-50"
              >
                <ArrowLeft className="h-4 w-4" /> Previous
              </button>
              <span className="text-sm text-muted-foreground">
                Step {activeStep + 1} of {STEPS.length}
              </span>
              {activeStep < STEPS.length - 1 ? (
                <button
                  onClick={() => setActiveStep((s) => Math.min(STEPS.length - 1, s + 1))}
                  className="inline-flex items-center gap-1.5 rounded-full gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  Next <ArrowLeft className="h-4 w-4 -rotate-180" />
                </button>
              ) : (
                <button
                  onClick={() => setActiveStep(0)}
                  className="inline-flex items-center gap-1.5 rounded-full gradient-primary px-4 py-2 text-sm font-semibold text-primary-foreground"
                >
                  <Sparkles className="h-4 w-4" /> Restart
                </button>
              )}
            </div>
          </div>
        </Card>

        {/* Tips */}
        <Card className="!p-5">
          <h3 className="flex items-center gap-2 text-sm font-semibold text-foreground">
            <Sparkles className="h-4 w-4 text-gold-foreground" /> Tips for a great People Card
          </h3>
          <ul className="mt-3 space-y-2">
            {TIPS.map((tip, i) => (
              <li key={i} className="flex items-start gap-2 text-sm text-muted-foreground">
                <Check className="h-4 w-4 shrink-0 text-emerald-600 mt-0.5" />
                {tip}
              </li>
            ))}
          </ul>
        </Card>

        {/* Quick link to own profile */}
        <Card className="!p-5 text-center">
          <p className="text-sm text-muted-foreground">Have a KAZI Link profile?</p>
          <p className="mt-1 text-xs font-mono text-muted-foreground break-all">
            https://pesaki.co.ke/kazi/m/your-slug
          </p>
          <button
            onClick={() => navigator.clipboard.writeText("https://pesaki.co.ke/kazi/m/your-slug")}
            className="mt-3 inline-flex items-center justify-center gap-2 rounded-full border border-border px-4 py-2 text-xs font-semibold text-foreground"
          >
            Copy link format
          </button>
        </Card>
      </div>
    </AppShell>
  );
}