import { createFileRoute } from "@tanstack/react-router";
import { PlatformNotificationInbox } from "@/components/notifications/PlatformNotificationInbox";

export const Route = createFileRoute("/shareholder/notifications")({
  component: ShareholderNotificationsPage,
});

function ShareholderNotificationsPage() {
  return <PlatformNotificationInbox />;
}
