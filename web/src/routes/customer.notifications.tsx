import { createFileRoute } from "@tanstack/react-router";
import { PlatformNotificationInbox } from "@/components/notifications/PlatformNotificationInbox";

export const Route = createFileRoute("/customer/notifications")({
  component: CustomerNotificationsPage,
});

function CustomerNotificationsPage() {
  return (
    <div className="px-4 pt-6 pb-4">
      <PlatformNotificationInbox />
    </div>
  );
}
