import { createFileRoute, redirect } from "@tanstack/react-router";

/** Legacy full-page URL — opens the add flow on the restaurants list (modal). */
export const Route = createFileRoute("/owner/restaurants/add")({
  beforeLoad: () => {
    throw redirect({ to: "/owner/restaurants", search: { add: true }, replace: true });
  },
});
