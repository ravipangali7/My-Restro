import { createFileRoute } from "@tanstack/react-router";
import { TableFormPage } from "@/components/owner/TableFormPage";

export const Route = createFileRoute("/owner/tables_/$id/edit")({
  component: OwnerEditTablePage,
});

function OwnerEditTablePage() {
  const { id } = Route.useParams();
  const parsed = Number.parseInt(id, 10);
  const tableId = Number.isNaN(parsed) ? undefined : parsed;
  return <TableFormPage tableId={tableId} />;
}
