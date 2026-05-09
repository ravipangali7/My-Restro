import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy URL — canonical path uses `/add`. */
export const Route = createFileRoute("/owner/restaurants/new")({
  beforeLoad: () => {
    throw redirect({ to: "/owner/restaurants", search: { add: true }, replace: true });
  },
});
