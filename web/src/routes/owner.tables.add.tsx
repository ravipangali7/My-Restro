import { createFileRoute } from "@tanstack/react-router";
import { TableFormPage } from "@/components/owner/TableFormPage";

export const Route = createFileRoute("/owner/tables/add")({
  component: OwnerAddTablePage,
});

function OwnerAddTablePage() {
  return <TableFormPage />;
}
