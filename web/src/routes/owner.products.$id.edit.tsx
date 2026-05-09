import { createFileRoute } from "@tanstack/react-router";
import { ProductFormPage } from "@/components/owner/ProductFormPage";

export const Route = createFileRoute("/owner/products/$id/edit")({
  component: OwnerEditProductPage,
});

function OwnerEditProductPage() {
  const { id } = Route.useParams();
  const parsed = Number.parseInt(id, 10);
  const productId = Number.isNaN(parsed) ? undefined : parsed;
  return <ProductFormPage productId={productId} />;
}
