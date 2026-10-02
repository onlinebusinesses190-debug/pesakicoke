/**
 * PESAKI — PWA installation state.
 *
 * Wraps the browser's real installation mechanisms and nothing else. There is no
 * simulated download or fake "app" flow here: on Chromium the browser shows its
 * own install dialog, and on iOS we can only explain the manual steps because
 * that platform does not expose an install API.
 *
 * Kept as a standalone hook so the landing page, and any future surface, can
 * reuse it without duplicating event wiring or browser sniffing.
 */

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Chromium fires this before showing its own install UI. The event must be kept
 * and preventDefault() called, because otherwise the browser shows its mini
 * infobar and we lose the ability to drive the full dialog ourselves.
 */
interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
  prompt(): Promise<void>;
}

export type InstallState =
  /** Not yet known — the browser has not said anything yet. */
  | "checking"
  /** Running as an installed app. Installation must never be offered. */
  | "installed"
  /** Installable now; `prompt()` is available. */
  | "available"
  /** iOS: no programmatic install exists, so manual steps are shown instead. */
  | "ios-manual"
  /** Not installable in this browser. Nothing should be offered. */
  | "unavailable";

const DISMISS_KEY = "pesaki.install.dismissedAt";
/** Re-prompt at most once per this many days after an explicit dismissal. */
const DISMISS_COOLDOWN_MS = 14 * 24 * 60 * 60 * 1000;

/** True when PESAKI is already running as an installed app. */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  try {
    // Standard Chromium/Android signal.
    if (window.matchMedia?.("(display-mode: standalone)")?.matches) return true;
    // The minimal-ui variant some browsers report instead.
    if (window.matchMedia?.("(display-mode: minimal-ui)")?.matches) return true;
    // iOS Safari exposes only this non-standard property.
    const iosStandalone = (window.navigator as Navigator & { standalone?: boolean }).standalone;
    if (iosStandalone === true) return true;
  } catch {
    // matchMedia can throw in exotic embedded webviews; treat as not standalone.
    return false;
  }
  return false;
}

/** iOS/iPadOS detection. Used only to choose the manual-instructions path. */
export function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  const ua = navigator.userAgent || "";
  const iOSLike =
    /iPad|iPhone|iPod/.test(ua) ||
    // iPadOS 13+ reports as a desktop Mac, so the touch-point count is the tell.
    (navigator.platform === "MacIntel" && (navigator.maxTouchPoints || 0) > 1);
  return iOSLike;
}

function readDismissedAt(): number {
  if (typeof window === "undefined") return 0;
  try {
    return Number(window.localStorage.getItem(DISMISS_KEY) || 0);
  } catch {
    // Private browsing can throw on storage access. Treat as "not dismissed"
    // rather than blocking the install prompt entirely.
    return 0;
  }
}

/**
 * Whether the auto-popup has been dismissed recently enough that we should stay
 * quiet. Kept in localStorage so it survives navigation and reloads; session
 * storage would re-show it on every new tab.
 */
export function isPromptSuppressed(): boolean {
  const at = readDismissedAt();
  if (!at) return false;
  // A dismissal older than the cooldown is forgotten.
  if (Date.now() - at > DISMISS_COOLDOWN_MS) return false;
  return true;
}

export function dismissPromptForever(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, String(Date.now()));
  } catch {
    // Storage unavailable; the in-memory suppression in the component still holds
    // for this page view, so the popup will not loop.
  }
}

/** Lets a user ask again after previously choosing "Not now". */
export function clearPromptDismissal(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(DISMISS_KEY);
  } catch {
    // Nothing to do.
  }
}

export interface UsePwaInstall {
  state: InstallState;
  /** True only when a real install can be triggered right now. */
  canInstall: boolean;
  /** iOS: show the manual "Add to Home Screen" instructions instead. */
  needsManualSteps: boolean;
  /**
   * Ask the browser to install. Resolves to the outcome, or false if the browser
   * declined or no prompt was available.
   */
  install: () => Promise<boolean>;
}

export function usePwaInstall(): UsePwaInstall {
  const [state, setState] = useState<InstallState>("checking");
  // Held in a ref, not state: the event object is not serialisable and must not
  // trigger a re-render.
  const promptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;

    if (isStandalone()) {
      setState("installed");
      return;
    }

    const onBeforeInstallPrompt = (event: Event) => {
      // Suppress the browser's own mini-infobar so our branded UI is the single
      // install entry point.
      event.preventDefault();
      promptRef.current = event as BeforeInstallPromptEvent;
      setState("available");
    };

    const onInstalled = () => {
      // The app is now installed. Drop the prompt and never offer install again.
      promptRef.current = null;
      setState("installed");
      try {
        window.localStorage.removeItem(DISMISS_KEY);
      } catch {
        // Nothing to do.
      }
    };

    window.addEventListener("beforeinstallprompt", onBeforeInstallPrompt);
    window.addEventListener("appinstalled", onInstalled);

    // iOS has no install API. Detect it explicitly so we can offer instructions
    // rather than an entry point that would silently do nothing.
    if (isIos()) {
      setState("ios-manual");
    } else {
      // Not iOS and no prompt event yet: either the service worker is not yet
      // controlling the page, or the app is genuinely not installable. Give the
      // SW a moment to take control, then settle on "unavailable".
      const settle = window.setTimeout(() => {
        setState((current) => (current === "checking" ? "unavailable" : current));
      }, 2500);
      return () => {
        window.clearTimeout(settle);
        window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
        window.removeEventListener("appinstalled", onInstalled);
      };
    }

    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstallPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const install = useCallback(async () => {
    const prompt = promptRef.current;
    if (!prompt) return false;
    try {
      await prompt.prompt();
      const choice = await prompt.userChoice;
      // Clear regardless of outcome: a used prompt cannot be shown twice.
      promptRef.current = null;
      if (choice.outcome === "accepted") {
        setState("installed");
        return true;
      }
      // Dismissed. The capability is still there, but this specific event is
      // spent, so re-check availability rather than reusing a dead prompt.
      setState((current) => (current === "installed" ? current : "unavailable"));
      return false;
    } catch {
      // A rejected prompt (older Android, or the event was already consumed)
      // must not throw into the UI.
      promptRef.current = null;
      setState((current) => (current === "installed" ? current : "unavailable"));
      return false;
    }
  }, []);

  return {
    state,
    canInstall: state === "available",
    needsManualSteps: state === "ios-manual",
    install,
  };
}
