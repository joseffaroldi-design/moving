import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileSignature } from "lucide-react";

export default function PortalDocuments() {
  return (
    <div data-testid="portal-documents">
      <PageHeader
        title="Documents"
        breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Documents" }]}
        description="Move agreements and signed paperwork."
      />
      <EmptyState
        icon={FileSignature}
        title="Document signing is coming soon"
        description="Soon you'll be able to review and sign your move agreement right here. In the meantime, you can print your quotes and invoices from their detail pages."
        data-testid="portal-documents-empty"
      />
    </div>
  );
}
