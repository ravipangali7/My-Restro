import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/owner/")({
  beforeLoad: () => {
    throw redirect({ to: "/dashboard" });
  },
});
