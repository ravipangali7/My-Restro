import { createFileRoute } from "@tanstack/react-router";
import { StaffFormPage } from "@/components/owner/StaffFormPage";

export const Route = createFileRoute("/owner/staff_/$id/edit")({
  component: OwnerEditStaffPage,
});

function OwnerEditStaffPage() {
  const { id } = Route.useParams();
  const parsed = Number.parseInt(id, 10);
  const staffId = Number.isNaN(parsed) ? undefined : parsed;
  return <StaffFormPage staffId={staffId} />;
}
