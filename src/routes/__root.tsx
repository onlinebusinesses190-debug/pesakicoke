import { createFileRoute, Outlet } from "@tanstack/react-router";

export const Route = createFileRoute("__root")({
  component: Root,
});

function Root() {
  return <Outlet />;
}
