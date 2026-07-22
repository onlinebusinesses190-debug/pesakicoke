import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Landmark, ShieldCheck, Loader2 } from "lucide-react";
import { createClient } from "@/utils/supabase/client";
import { useAuth } from "@/hooks/useAuth";

export const Route = createFileRoute("/auth")({
  validateSearch: (s: Record<string, unknown>) => ({
    mode: (s.mode === "signup" ? "signup" : "signin") as "signin" | "signup",
  }),
  head: () => ({
    meta: [
      { title: "Sign in — PESAKI" },
      { description: "Sign in or create your PESAKI account to earn, save, invest and grow." },
    ],
  }),
  component: AuthPage,
});

// Helper: Convert local phone format (07...) to international (+2547...)
function formatPhoneNumber(raw: string): string {
  // Remove all non-numeric characters
  let cleaned = raw.replace(/\D/g, '');
  
  // If it starts with 0 and is 10 digits (e.g., 0712345678), convert to +254...
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '254' + cleaned.slice(1);
    return '+' + cleaned;
  }
  
  // If it starts with 7 and is 9 digits (e.g., 712345678), prepend +254
  if (cleaned.startsWith('7') && cleaned.length === 9) {
    cleaned = '254' + cleaned;
    return '+' + cleaned;
  }
  
  // If it already has +254 or is a different format, return it as-is
  if (raw.startsWith('+')) {
    return raw;
  }
  
  // If we couldn't format it, return the raw input (Supabase will validate)
  return raw;
}

function AuthPage() {
  const initialMode = Route.useSearch().mode;
  const [mode, setMode] = useState<"signin" | "signup">(initialMode);
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("email");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const { user, ready } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    if (ready && user) navigate({ to: "/" });
  }, [ready, user, navigate]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    const supabase = createClient();

    try {
      if (mode === "signup") {
        const options = {
          emailRedirectTo: window.location.origin,
          data: { full_name: name },
        };
        let result;
        if (loginMethod === "email") {
          result = await supabase.auth.signUp({
            email,
            password,
            options,
          });
        } else {
          // Auto-format phone before sending to Supabase
          const formattedPhone = formatPhoneNumber(phone);
          result = await supabase.auth.signUp({
            phone: formattedPhone,
            password,
            options,
          });
        }
        const { error } = result;
        if (error) throw error;
        setInfo("Account created. Check your email/phone to confirm, then sign in.");
        setMode("signin");
      } else {
        // Sign in
        let result;
        if (loginMethod === "email") {
          result = await supabase.auth.signInWithPassword({ email, password });
        } else {
          // Auto-format phone before sending to Supabase
          const formattedPhone = formatPhoneNumber(phone);
          result = await supabase.auth.signInWithPassword({ phone: formattedPhone, password });
        }
        const { error } = result;
        if (error) throw error;
        navigate({ to: "/" });
      }
    } catch (err: any) {
      setError(err?.message ?? "Something went wrong.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-sm">
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="grid h-14 w-14 place-items-center rounded-2xl gradient-primary text-primary-foreground shadow-lg">
            <Landmark className="h-6 w-6" />
          </span>
          <h1 className="mt-3 font-display text-2xl font-bold tracking-tight">PESAKI</h1>
          <p className="mt-1 text-xs text-muted-foreground">Earn. Invest. Grow.</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
          <div className="mb-5 grid grid-cols-2 rounded-lg bg-muted p-1 text-xs font-semibold">
            {(["signin", "signup"] as const).map((m) => (
              <button
                key={m}
                onClick={() => { setMode(m); setError(null); setInfo(null); }}
                className={`rounded-md py-2 transition-colors ${
                  mode === m ? "bg-card text-foreground shadow" : "text-muted-foreground"
                }`}
              >
                {m === "signin" ? "Sign in" : "Create account"}
              </button>
            ))}
          </div>

          <form onSubmit={submit} className="space-y-3">
            {mode === "signup" && (
              <Field label="Full name">
                <input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  required
                  className="input"
                  placeholder="Jane Otieno"
                />
              </Field>
            )}

            {/* Login method selector */}
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
              <Field label="Email address">
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="input"
                  placeholder="you@pesaki.africa"
                />
              </Field>
            ) : (
              <Field label="Phone number">
                <input
                  type="tel"
                  autoComplete="tel"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  required
                  className="input"
                  placeholder="0712 345 678" // ← Updated to local format
                />
              </Field>
            )}

            <Field label="Password">
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
            </Field>

            {error && (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
            )}
            {info && (
              <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">{info}</p>
            )}

            <button
              type="submit"
              disabled={loading}
              className="mt-1 flex h-11 w-full items-center justify-center gap-2 rounded-lg gradient-primary text-sm font-semibold text-primary-foreground shadow hover:opacity-95 disabled:opacity-60"
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
          <Link to="/" className="font-semibold text-primary hover:underline">
            ← Back to home
          </Link>
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="text-xs font-semibold text-muted-foreground">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
