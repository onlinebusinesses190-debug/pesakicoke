import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, useCallback } from "react";
import { AdminShell } from "@/components/AdminShell";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/utils/api";

export const Route = createFileRoute("/admin")({
  component: AdminLayout,
});

interface AdminInfo {
  id: string;
  email: string;
  role: string;
}

function AdminLayout() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [loading, setLoading] = useState(true);

  const checkAdmin = useCallback(() => {
    if (!ready) return;

    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/admin" } as never });
      return;
    }

    apiRequest<{ success: boolean; data: AdminInfo }>("/admin/me")
      .then((res) => {
        if (res.success) {
          setIsAdmin(true);
        } else {
          setIsAdmin(false);
          navigate({ to: "/", search: {} as never });
        }
        setLoading(false);
      })
      .catch(() => {
        setIsAdmin(false);
        setLoading(false);
        navigate({ to: "/", search: {} as never });
      });
  }, [ready, user, navigate]);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  if (!ready || loading || isAdmin === null) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <p className="text-muted-foreground">Verify admin access…</p>
      </div>
    );
  }

  return (
    <AdminShell>
      <Outlet />
    </AdminShell>
  );
}
