import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { Landmark, ShieldCheck, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

// Helper: format phone
function formatPhoneNumber(raw: string): string {
  let cleaned = raw.replace(/\D/g, '');
  if (cleaned.startsWith('0') && cleaned.length === 10) {
    cleaned = '254' + cleaned.slice(1);
    return '+' + cleaned;
  }
  if (cleaned.startsWith('7') && cleaned.length === 9) {
    cleaned = '254' + cleaned;
    return '+' + cleaned;
  }
  if (raw.startsWith('+')) return raw;
  return raw;
}

export const Route = createFileRoute("/auth")({
  component: AuthPage,
});

function AuthPage() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [loginMethod, setLoginMethod] = useState<"email" | "phone">("phone");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);

  // Uses the app-wide singleton — avoids spawning a new GoTrueClient on every render.

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);
    setLoading(true);

    try {
      if (mode === "signup") {
        const options = { emailRedirectTo: window.location.origin, data: { full_name: name } };
        const result = loginMethod === "email"
          ? await supabase.auth.signUp({ email, password, options })
          : await supabase.auth.signUp({ phone: formatPhoneNumber(phone), password, options });
        if (result.error) throw result.error;
        setInfo("Account created! Check your phone/email and sign in.");
        setMode("signin");
      } else {
        const result = loginMethod === "email"
          ? await supabase.auth.signInWithPassword({ email, password })
          : await supabase.auth.signInWithPassword({ phone: formatPhoneNumber(phone), password });
        if (result.error) throw result.error;
        // Redirect safely
        window.location.href = "/";
      }
    } catch (err: any) {
      setError(err?.message || "Something went wrong.");
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
              onClick={() => { setMode("signin"); setError(null); setInfo(null); }}
              className={`rounded-md py-2 transition-colors ${
                mode === "signin" ? "bg-card text-foreground shadow" : "text-muted-foreground"
              }`}
            >
              Sign in
            </button>
            <button
              onClick={() => { setMode("signup"); setError(null); setInfo(null); }}
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
                  onChange={e => setName(e.target.value)}
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
                  onChange={e => setEmail(e.target.value)}
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
                  onChange={e => setPhone(e.target.value)}
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
                onChange={e => setPassword(e.target.value)}
                required
                minLength={6}
                className="input"
                placeholder="••••••••"
              />
            </div>

            {error && <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>}
            {info && <p className="rounded-lg bg-success/10 px-3 py-2 text-xs font-medium text-success">{info}</p>}

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
          <a href="/" className="font-semibold text-primary hover:underline">← Back to home</a>
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
