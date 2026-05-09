import { createFileRoute } from "@tanstack/react-router";
import { ProductFormPage } from "@/components/owner/ProductFormPage";

export const Route = createFileRoute("/owner/products/new")({
  component: OwnerNewProductPage,
});

function OwnerNewProductPage() {
  return <ProductFormPage />;
}
