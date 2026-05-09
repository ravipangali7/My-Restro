import { createFileRoute } from "@tanstack/react-router";
import { StaffFormPage } from "@/components/owner/StaffFormPage";

export const Route = createFileRoute("/owner/staff/new")({
  component: OwnerNewStaffPage,
});

function OwnerNewStaffPage() {
  return <StaffFormPage />;
}
