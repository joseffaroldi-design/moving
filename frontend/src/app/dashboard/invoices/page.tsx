"use client";

import { useMemo } from "react";
import { Receipt } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { formatCurrency, formatDate } from "@/lib/format";

export default function InvoicesPage() {
  const { data, loading, error, refetch } = useDashboardData();

  const invoices = useMemo(() => {
    const raw = data?.raw as Record<string, unknown> | undefined;
    const arr = (raw?.invoices ?? raw?.recent_invoices) as
      | Record<string, unknown>[]
      | undefined;
    return Array.isArray(arr) ? arr : [];
  }, [data]);

  return (
    <div>
      <PageHeader
        title="Invoices & Payments"
        description="Track billing, deposits, and outstanding balances."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Invoices" }]}
      />

      {error ? (
        <ErrorState title="Couldn't load invoices" message={error} onRetry={refetch} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={5} />
      ) : invoices.length === 0 ? (
        <EmptyState
          icon={Receipt}
          title="No invoices to show yet"
          description="Invoices are generated from completed jobs. Sign in to view your company's live invoices and payment history."
        />
      ) : (
        <DataTable data-testid="invoices-table">
          <Thead>
            <Th>Invoice #</Th>
            <Th>Customer</Th>
            <Th>Total</Th>
            <Th>Balance</Th>
            <Th>Status</Th>
          </Thead>
          <Tbody>
            {invoices.map((inv, i) => (
              <Tr key={(inv.id as string) ?? i} data-testid={`invoice-row-${i}`}>
                <Td className="font-medium text-navy">{String(inv.invoice_number ?? inv.number ?? "—")}</Td>
                <Td>{String(inv.customer_name ?? "Customer")}</Td>
                <Td className="font-medium text-navy">{formatCurrency(inv.total as number)}</Td>
                <Td>{formatCurrency((inv.balance ?? inv.outstanding_balance) as number)}</Td>
                <Td><StatusBadge status={inv.status as string} /></Td>
              </Tr>
            ))}
          </Tbody>
        </DataTable>
      )}
    </div>
  );
}
