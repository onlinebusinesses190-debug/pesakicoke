import { useCallback } from "react";
import { useNavigate, useLocation } from "@tanstack/react-router";
import { toast } from "sonner";
import { useAuth } from "@/hooks/useAuth";

export function useRequireAuth() {
  const { user, ready } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const requireAuth = useCallback(() => {
    if (!ready) {
      return false;
    }
    if (user) {
      return true;
    }
    toast("Please sign up or log in to continue.", {
      action: {
        label: "Sign In",
        onClick: () => {
          const to = `${location.pathname}?redirect=${encodeURIComponent(location.pathname)}`;
          navigate({ to });
        },
      },
    });
    return false;
  }, [user, ready, navigate, location]);

  return { requireAuth, user, ready };
}
