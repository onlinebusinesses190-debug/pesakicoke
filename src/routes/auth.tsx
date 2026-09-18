import { createFileRoute, useNavigate, useRouterState } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { Landmark, ShieldCheck, Loader2, Link as LinkIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { apiRequest } from "@/utils/api";
import { toast } from "sonner";

// Helper: format phone
function formatPhoneNumber(raw: string): string {
  let cleaned = raw.replace(/\D/g, "");
  if (cleaned.startsWith("0") && cleaned.length === 10) {
    cleaned = "254" + cleaned.slice(1);
    return "+" + cleaned;
  }
  if (cleaned.startsWith("7") && cleaned.length === 9) {
    cleaned = "254" + cleaned;
    return "+" + cleaned;
  }
  if (raw.startsWith("+")) return raw;
  return raw;
}

// Safely read localStorage (SSR-safe)
function getLocalStorage(key: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function setLocalStorage(key: string, value: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

function removeLocalStorage(key: string): void {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(key);
  } catch {
    // ignore
  }
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const navigate = useNavigate();
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Referral code state
  const [pendingRefCode, setPendingRefCode] = useState("");
  const [refManuallyEntered, setRefManuallyEntered] = useState(false);

  async function applyPendingReferralCode(): Promise<boolean> {
    const refCode = getLocalStorage("pendingReferralCode")?.trim();
    if (!refCode) return false;

    try {
      await apiRequest("/referrals/apply", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: refCode }),
      });
      removeLocalStorage("pendingReferralCode");
      removeLocalStorage("referralManualAt");
      setPendingRefCode("");
      toast.success("Referral code applied!");
      return true;
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "";
      if (message.includes("Authentication required")) return false;

      removeLocalStorage("pendingReferralCode");
      removeLocalStorage("referralManualAt");
      setPendingRefCode("");
      toast.warning("Signup successful — referral could not be applied.");
      return false;
    }
  }

  // Read redirect target from query string
  const search = useRouterState({ select: (s) => s.location.search });
  const redirectParam = new URLSearchParams(search).get("redirect") || "/";

  // ── On mount: capture ?ref=CODE from URL into localStorage ────────
  useEffect(() => {
    const refParam = new URLSearchParams(window.location.search).get("ref");
    if (refParam) {
      setLocalStorage("pendingReferralCode", refParam);
    }
    // Pre-fill from localStorage if available
    const pending = getLocalStorage("pendingReferralCode");
    if (pending) {
      setPendingRefCode(pending);
      // Check 7-day window for manual entry
      const enteredAt = getLocalStorage("referralManualAt");
      if (enteredAt) {
        const daysSince = (Date.now() - parseInt(enteredAt)) / (1000 * 60 * 60 * 24);
        if (daysSince < 7) {
          setRefManuallyEntered(false);
        } else {
          setRefManuallyEntered(true);
          setPendingRefCode("");
        }
      }
    }
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const options = { emailRedirectTo: window.location.origin, data: { full_name: name } };
        const result =
          loginMethod === "email"
            ? await supabase.auth.signUp({ email, password, options })
            : await supabase.auth.signUp({ phone: formatPhoneNumber(phone), password, options });
        if (result.error) throw result.error;

        await applyPendingReferralCode();

        setInfo("Account created! Check your phone/email and sign in.");
        setMode("signin");
      } else {
        const result =
          loginMethod === "email"
            ? await supabase.auth.signInWithPassword({ email, password })
            : await supabase.auth.signInWithPassword({ phone: formatPhoneNumber(phone), password });
        if (result.error) throw result.error;
        await applyPendingReferralCode();
        const target = redirectParam.startsWith("/") ? redirectParam : "/";
        navigate({ to: target });
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-lg">
            <Landmark className="h-6 w-6" />
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">PESAKI</h1>
          <p className="mt-1 text-xs text-muted-foreground">Earn. Invest. Grow.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-semibold">
            <button
              onClick={() => {
                setMode("signin");
                setError(null);
                setInfo(null);
              }}
              className={`rounded-md py-2 transition-colors ${
                mode === "signin" ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => {
                setMode("signup");
                setError(null);
                setInfo(null);
              }}
              className={`rounded-md py-2 transition-colors ${
                mode === "signup" ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Create account
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            {mode === "signup" && (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Full name</label>
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                  placeholder="Jane Otieno"
                />
              </div>
            )}

            <div className="flex gap-2 text-xs">
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  value="email"
                  checked={loginMethod === "email"}
                  onChange={() => setLoginMethod("email")}
                />
                Email
              </label>
              <label className="flex items-center gap-1">
                <input
                  type="radio"
                  value="phone"
                  checked={loginMethod === "phone"}
                  onChange={() => setLoginMethod("phone")}
                />
                Phone
              </label>
            </div>

            {loginMethod === "email" ? (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Email address</label>
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input"
                  placeholder="you@pesaki.africa"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-muted-foreground">Phone number</label>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="input"
                  placeholder="0712 345 678"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-muted-foreground">Password</label>
              <input
                type="password"
                autoComplete={mode === "signin" ? "current-password" : "new-password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {mode === "signup" && (
              <div>
                <label className="flex items-center gap-1.5 text-xs font-semibold text-muted-foreground">
                  <LinkIcon className="h-3 w-3" />
                  Referral code (optional)
                </label>
                <input
                  value={pendingRefCode}
                  onChange={(e) => {
                    setPendingRefCode(e.target.value);
                    setLocalStorage("pendingReferralCode", e.target.value.trim());
                    if (!getLocalStorage("referralManualAt")) {
                      setLocalStorage("referralManualAt", String(Date.now()));
                    }
                    setRefManuallyEntered(true);
                  }}
                  className="input"
                  placeholder="Enter referral code"
                />
                {refManuallyEntered && getLocalStorage("referralManualAt") && (
                  <p className="mt-1 text-[10px] text-muted-foreground">
                    Manual entry allowed within 7 days of your referral attempt.
                  </p>
                )}
              </div>
            )}

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </p>
            )}
            {info && (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">
                {info}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-br from-primary to-primary/70 text-sm font-semibold text-primary-foreground shadow hover:opacity-95 disabled:opacity-60"
            >
              {loading && <Loader2 className="h-4 w-4 animate-spin" />}
              {mode === "signin" ? "Sign in" : "Create account"}
            </button>
          </form>

          <div className="mt-5 flex items-center justify-center gap-1.5 text-[11px] text-muted-foreground">
            <ShieldCheck className="h-3 w-3 text-success" />
            Bank-grade encryption · Your data is protected
          </div>
        </div>

        <p className="mt-5 text-center text-xs text-muted-foreground">
          <a href="/" className="font-semibold text-primary hover:underline">
            ← Back to home
          </a>
        </p>
      </div>
      <style>{`
        .input {
          height: 2.5rem; width: 100%;
          border-radius: 0.5rem; border: 1px solid hsl(var(--border));
          background: hsl(var(--background));
          padding: 0 0.75rem; font-size: 0.875rem; outline: none;
        }
        .input:focus { border-color: hsl(var(--primary)); }
      `}</style>
    </div>
  );
}
