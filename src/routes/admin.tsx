import { createFileRoute, Outlet } from "@tanstack/react-router";
import { AdminShell } from "@/components/AdminShell";
import { Info } from "lucide-react";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

// Admin auth + role checks will be added later once the admin role table is wired.
// For now this is an open preview of the admin surface.
function AdminLayout() {
  return (
    <AdminShell>
      <div className="mb-4 flex items-center gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2 text-[11px] text-muted-foreground">
        <Info className="h-3.5 w-3.5" />
        Admin preview — role-based access will be added in a later step.
      </div>
      <Outlet />
    </AdminShell>
  );
}

function AdminLogin({ onSuccess }: { onSuccess: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    if (email.trim().toLowerCase() === DEMO_EMAIL && password === DEMO_PASSWORD) {
      sessionStorage.setItem(STORAGE_KEY, "1");
      setError(null);
      onSuccess();
    } else {
      setError("Invalid admin credentials.");
    }
  }

  return (
    <div className="grid min-h-screen w-full place-items-center bg-muted/40 px-4">
      <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 shadow-[var(--shadow-card)]">
        <div className="mb-5 flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-xl gradient-primary text-primary-foreground">
            <Shield className="h-5 w-5" />
          </span>
          <div>
            <h1 className="font-display text-lg font-bold tracking-tight">PESAKI Admin</h1>
            <p className="text-xs text-muted-foreground">Authorized personnel only</p>
          </div>
        </div>

        <form onSubmit={submit} className="space-y-3">
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Email</label>
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              placeholder="admin@pesaki.africa"
              required
            />
          </div>
          <div>
            <label className="text-xs font-semibold text-muted-foreground">Password</label>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none focus:border-primary"
              required
            />
          </div>

          {error && (
            <p className="rounded-lg bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">{error}</p>
          )}

          <button
            type="submit"
            className="h-10 w-full rounded-lg gradient-primary text-sm font-semibold text-primary-foreground shadow hover:opacity-95"
          >
            Sign in to admin
          </button>
        </form>

        <div className="mt-5 rounded-lg border border-dashed border-border bg-muted/40 p-3 text-[11px] leading-relaxed text-muted-foreground">
          <p className="font-semibold text-foreground">Demo credentials</p>
          <p className="mt-1">Email: <span className="font-mono">{DEMO_EMAIL}</span></p>
          <p>Password: <span className="font-mono">{DEMO_PASSWORD}</span></p>
          <p className="mt-2 text-[10px]">Wire this to Lovable Cloud auth + a roles table for production.</p>
        </div>
      </div>
    </div>
  );
}
