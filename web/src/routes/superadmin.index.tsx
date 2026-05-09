import { createFileRoute } from "@tanstack/react-router";
import { SuperAdminHomeDashboard } from "@/components/superadmin/SuperAdminHomeDashboard";

export const Route = createFileRoute("/superadmin/")({
  component: SuperAdminHomeDashboard,
});
