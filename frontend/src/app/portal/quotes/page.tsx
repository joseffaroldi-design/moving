import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText } from "lucide-react";

export default function PortalQuotes() {
  return (
    <div>
      <PageHeader title="Your Quotes" breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Quotes" }]} />
      <EmptyState icon={FileText} title="No quotes yet" description="Quotes shared with you will appear here. Sign in through your customer link to review and approve them." />
    </div>
  );
}
