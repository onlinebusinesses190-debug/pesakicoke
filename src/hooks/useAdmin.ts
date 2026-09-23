import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useAuth } from "@/hooks/useAuth";
import { apiRequest } from "@/utils/api";

export interface AdminUser {
  id: string;
  email: string;
  role: string;
}

export function useAdminAuth() {
  const { user, ready, session } = useAuth();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [admin, setAdmin] = useState<AdminUser | null>(null);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    if (!ready) return;

    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/admin" } as never });
      return;
    }

    apiRequest("/admin/me")
      .then((res: { success: boolean; user: AdminUser }) => {
        setIsAdmin(true);
        setAdmin(res.user);
        setLoading(false);
      })
      .catch(() => {
        setIsAdmin(false);
        setLoading(false);
        navigate({ to: "/" });
      });
  }, [ready, user, session, navigate]);

  return { isAdmin, admin, loading, user };
}
