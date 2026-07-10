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
