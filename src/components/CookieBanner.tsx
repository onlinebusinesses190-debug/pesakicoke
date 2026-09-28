import { useState, useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { X, Cookie } from "lucide-react";

const STORAGE_KEY = "pesaki_cookie_consent";

type ConsentChoice = "all" | "essential" | null;

function getStoredConsent(): ConsentChoice {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === "all" || raw === "essential") return raw;
    return null;
  } catch {
    return null;
  }
}

export function CookieBanner() {
  const [visible, setVisible] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
    const stored = getStoredConsent();
    if (!stored) {
      // Show banner after a short delay for better UX
      const t = setTimeout(() => setVisible(true), 1500);
      return () => clearTimeout(t);
    }
  }, []);

  const handleChoice = (choice: ConsentChoice) => {
    try {
      localStorage.setItem(STORAGE_KEY, choice!);
    } catch {
      // ignore storage errors
    }
    setVisible(false);
  };

  if (!mounted || !visible) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-[100] mx-auto w-full max-w-md px-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="relative overflow-hidden rounded-2xl border border-border bg-card/95 p-4 shadow-[var(--shadow-elevated)] backdrop-blur-xl">
        <button
          onClick={() => setVisible(false)}
          className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-muted text-muted-foreground hover:bg-muted/80"
          aria-label="Dismiss cookie notice"
        >
          <X className="h-3.5 w-3.5" />
        </button>

        <div className="flex items-start gap-3 pr-6">
          <span className="mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-primary/10 text-primary">
            <Cookie className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold">We use cookies</h3>
            <p className="mt-0.5 text-xs text-muted-foreground">
              Essential cookies keep you signed in. Analytics cookies help us improve PESAKI.{" "}
              <Link to="/cookies" className="font-semibold text-primary hover:underline">
                Learn more
              </Link>
            </p>
          </div>
        </div>

        <div className="mt-3 flex items-center gap-2">
          <button
            onClick={() => handleChoice("essential")}
            className="flex-1 rounded-xl border border-border bg-background px-3 py-2 text-xs font-semibold hover:bg-muted"
          >
            Essential Only
          </button>
          <button
            onClick={() => handleChoice("all")}
            className="flex-1 rounded-xl gradient-primary px-3 py-2 text-xs font-semibold text-primary-foreground"
          >
            Accept All
          </button>
        </div>
      </div>
    </div>
  );
}