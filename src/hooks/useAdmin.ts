import { useEffect, useState, useCallback } from "react";
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

  const checkAdmin = useCallback(() => {
    if (!ready) return;

    if (!user) {
      navigate({ to: "/auth", search: { redirect: "/admin" } as never });
      return;
    }

    apiRequest<{ success: boolean; data: { id: string; email: string; role: string } }>("/admin/me")
      .then((res) => {
        if (res.success && res.data) {
          setIsAdmin(true);
          setAdmin({ id: res.data.id, email: res.data.email, role: res.data.role });
          setLoading(false);
        } else {
          setIsAdmin(false);
          setLoading(false);
          navigate({ to: "/" });
        }
      })
      .catch(() => {
        setIsAdmin(false);
        setLoading(false);
        navigate({ to: "/" });
      });
  }, [ready, user, navigate]);

  useEffect(() => {
    checkAdmin();
  }, [checkAdmin]);

  return { isAdmin, admin, loading, user };
}
