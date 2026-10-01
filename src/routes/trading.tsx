import { hasActiveSession } from "@/lib/require-session";
import { createFileRoute, Outlet, useNavigate, redirect } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

export const Route = createFileRoute("/trading")({
  beforeLoad: async () => {
    if (!(await hasActiveSession())) {
      throw redirect({ to: "/auth", search: { mode: "signup" } });
    }
  },
  component: () => <Outlet />,
});
