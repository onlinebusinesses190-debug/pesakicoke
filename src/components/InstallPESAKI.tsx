/**
 * PESAKI — "Install PESAKI" prompt.
 *
 * Two distinct behaviours, because the platform genuinely differs:
 *
 *  * Chromium (Android, desktop): pressing Install calls the browser's real
 *    install prompt and lets its own dialog decide the outcome. We never fake it.
 *  * iOS/iPadOS: no install API exists, so this explains the manual
 *    "Add to Home Screen" steps instead of pretending a dialog can appear.
 *
 * The popup is rendered inline rather than through a global dialog service so it
 * stays scoped to the landing page and cannot interfere with login or signup.
 * Dismissal is remembered so it does not nag on every render or navigation.
 */

import { useEffect, useState } from "react";
import { Share, Smartphone, X, PlusSquare, Check } from "lucide-react";
import { PesakiLogo } from "./PesakiLogo";
import { dismissPromptForever, isPromptSuppressed, usePwaInstall } from "@/hooks/usePwaInstall";

/** Delay before offering installation, so it never competes with the hero. */
const AUTO_SHOW_DELAY_MS = 4000;

export function InstallPESAKI({
  /** Rendered as a dismissible popup on first eligible visit. */
  autoPrompt = true,
  className = "",
}: {
  autoPrompt?: boolean;
  className?: string;
}) {
  const { state, canInstall, needsManualSteps, install } = usePwaInstall();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showManual, setShowManual] = useState(false);

  // Never offer to install an app that is already installed, or in a browser
  // that cannot install.
  const eligible = canInstall || needsManualSteps;

  useEffect(() => {
    if (!autoPrompt || !eligible || open) return;
    // Respect an earlier dismissal.
    if (isPromptSuppressed()) return;

    const timer = window.setTimeout(() => {
      // Re-check at fire time: the user may have installed in another tab.
      if (isPromptSuppressed()) return;
      setShowManual(needsManualSteps);
      setOpen(true);
    }, AUTO_SHOW_DELAY_MS);

    return () => window.clearTimeout(timer);
  }, [autoPrompt, eligible, open, needsManualSteps]);

  const close = () => {
    dismissPromptForever();
    setOpen(false);
  };

  const onInstall = async () => {
    if (needsManualSteps) {
      // Nothing to trigger; keep the instructions visible.
      setShowManual(true);
      return;
    }
    setBusy(true);
    try {
      // The browser shows its own confirmation dialog and decides the outcome.
      await install();
      // Close either way: an accepted install makes the UI disappear anyway,
      // and a dismissed one should not immediately reappear.
      dismissPromptForever();
      setOpen(false);
    } finally {
      setBusy(false);
    }
  };

  // ── Small optional entry point ──────────────────────────────────────────────
  // Rendered only when installation is genuinely possible, so a permanently
  // visible button never appears on browsers that cannot install. Hidden while
  // the popup is open to avoid a duplicate affordance.
  if (!open && eligible) {
    return (
      <button
        onClick={() => {
          setShowManual(needsManualSteps);
          setOpen(true);
        }}
        className={[
          "inline-flex items-center gap-1.5 rounded-full bg-brand-gold px-3 py-1.5 text-[11px] font-bold text-brand-deep transition-opacity hover:opacity-95",
          className,
        ].join(" ")}
      >
        <Smartphone className="h-3.5 w-3.5" />
        Install PESAKI
      </button>
    );
  }

  if (!open || !eligible) return null;

  return (
    <div
      className="fixed inset-x-0 bottom-0 z-[60] flex justify-center px-3 pb-3 sm:bottom-auto sm:top-4 sm:justify-end sm:px-4"
      role="dialog"
      aria-modal="false"
      aria-labelledby="pesaki-install-title"
    >
      <div className="w-full max-w-sm overflow-hidden rounded-2xl border border-white/10 bg-[#0a2e1a] shadow-2xl shadow-black/40">
        {/* Header */}
        <div className="flex items-start gap-3 p-4">
          <PesakiLogo size={40} tone="light" />
          <div className="min-w-0 flex-1">
            <h2
              id="pesaki-install-title"
              className="font-display text-[15px] font-bold leading-tight text-white"
            >
              Install PESAKI
            </h2>
            <p className="mt-1 text-[12px] leading-relaxed text-white/70">
              Install PESAKI on your device for faster access to Work, Business &amp; Financial
              Services.
            </p>
          </div>
          <button
            onClick={close}
            aria-label="Close install prompt"
            className="-mr-1 -mt-1 grid h-7 w-7 shrink-0 place-items-center rounded-full text-white/60 transition-colors hover:bg-white/10 hover:text-white"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* iOS manual steps. iOS exposes no install API, so this is the honest
            alternative rather than a button that would do nothing. */}
        {showManual && (
          <div className="mx-4 mb-3 rounded-xl border border-white/10 bg-[#1a4f2e]/50 p-3">
            <p className="text-[11px] font-semibold text-white">
              Install PESAKI from your browser menu:
            </p>
            <ol className="mt-1.5 space-y-1 text-[11px] leading-relaxed text-white/70">
              <li className="flex items-center gap-1.5">
                <span className="font-bold text-brand-gold">1.</span>
                <Share className="h-3 w-3 shrink-0" /> Tap Share.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-bold text-brand-gold">2.</span>
                <PlusSquare className="h-3 w-3 shrink-0" /> Select &lsquo;Add to Home Screen&rsquo;.
              </li>
              <li className="flex items-center gap-1.5">
                <span className="font-bold text-brand-gold">3.</span>
                <Check className="h-3 w-3 shrink-0" /> Tap Add.
              </li>
            </ol>
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 border-t border-white/10 p-3">
          <button
            onClick={close}
            className="flex-1 rounded-full border border-white/20 py-2.5 text-[12px] font-semibold text-white/80 transition-colors hover:bg-white/10"
          >
            Not now
          </button>
          {needsManualSteps ? (
            <button
              onClick={() => {
                setShowManual(false);
                dismissPromptForever();
                setOpen(false);
              }}
              className="flex-1 rounded-full bg-brand-gold py-2.5 text-[12px] font-bold text-brand-deep transition-opacity hover:opacity-95"
            >
              Got it
            </button>
          ) : (
            <button
              onClick={() => void onInstall()}
              disabled={busy}
              className="flex-1 rounded-full bg-brand-gold py-2.5 text-[12px] font-bold text-brand-deep transition-opacity hover:opacity-95 disabled:opacity-70"
            >
              {busy ? "Installing…" : "Install PESAKI"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export default InstallPESAKI;
