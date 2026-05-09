import { createFileRoute } from "@tanstack/react-router";
import { ShareholderHomeDashboard } from "@/components/shareholder/ShareholderHomeDashboard";

export const Route = createFileRoute("/shareholder/")({
  component: ShareholderHome,
});

function ShareholderHome() {
  return <ShareholderHomeDashboard />;
}
