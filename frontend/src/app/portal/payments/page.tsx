import { PageHeader } from "@/components/ui/page-header";
import { EmptyState } from "@/components/ui/empty-state";
import { Receipt } from "lucide-react";

export default function PortalPayments() {
  return (
    <div>
      <PageHeader title="Payments" breadcrumbs={[{ label: "Portal", href: "/portal" }, { label: "Payments" }]} />
      <EmptyState icon={Receipt} title="No payments due" description="Deposits and invoices will appear here. Online payment (Stripe) is not yet connected." />
    </div>
  );
}
