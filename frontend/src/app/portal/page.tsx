import { PageHeader } from "@/components/ui/page-header";
import { Card, CardHeader } from "@/components/ui/card";
import { EmptyState } from "@/components/ui/empty-state";
import { FileText, Receipt, FileSignature } from "lucide-react";
import Link from "next/link";

export default function PortalHome() {
  return (
    <div>
      <PageHeader
        title="Southern Magnolia Movers Customer Portal"
        description="Review your quotes, make payments, and track your move."
      />
      <div className="grid gap-4 sm:grid-cols-3">
        <PortalCard href="/portal/quotes" icon={FileText} title="Quotes" desc="Review and approve your moving estimate." />
        <PortalCard href="/portal/payments" icon={Receipt} title="Payments" desc="Pay deposits and view invoices." />
        <PortalCard href="/portal/documents" icon={FileSignature} title="Documents" desc="Sign and download move documents." />
      </div>
      <div className="mt-6">
        <Card>
          <CardHeader title="Your Move" />
          <div className="p-4">
            <EmptyState title="Sign in to view your move" description="Your quotes, payments, and job status appear here once you sign in through your customer link." />
          </div>
        </Card>
      </div>
    </div>
  );
}

function PortalCard({ href, icon: Icon, title, desc }: { href: string; icon: typeof FileText; title: string; desc: string }) {
  return (
    <Link href={href} className="rounded-md border border-slate-200 bg-white p-5 shadow-card transition-colors hover:border-gold">
      <div className="mb-3 flex h-9 w-9 items-center justify-center rounded-md bg-gold-soft">
        <Icon className="h-5 w-5 text-navy" />
      </div>
      <h3 className="font-serif text-lg font-bold text-navy">{title}</h3>
      <p className="mt-1 text-sm text-muted">{desc}</p>
    </Link>
  );
}
