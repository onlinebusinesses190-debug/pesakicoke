import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";
import { useEffect } from "react";

export const Route = createFileRoute("/trading")({
  beforeLoad: async () => {
    const supabase = createClient(
      import.meta.env.VITE_SUPABASE_URL,
      import.meta.env.VITE_SUPABASE_ANON_KEY,
    );
    const {
      data: { session },
    } = await supabase.auth.getSession();
    if (!session) {
      throw { to: "/auth" };
    }
  },
  component: () => <Outlet />,
});
