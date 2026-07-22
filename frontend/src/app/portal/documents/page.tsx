import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSignature } from "lucide-react";

export default function PortalDocuments() {
  return (
    <div>
      <PageHeader title="Documents" breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Documents" }]} />
      <EmptyState icon={FileSignature} title="No documents yet" description="Move agreements and signed documents will appear here." />
    </div>
  );
}
