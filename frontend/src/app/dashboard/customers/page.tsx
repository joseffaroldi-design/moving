"use client";

import { useMemo, useState } from "react";
import { Search, Mail, Phone } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input } from "@/components/ui/input";
import { Drawer } from "@/components/ui/drawer";
import { formatCurrency, formatDate, formatPhone } from "@/lib/format";
import { customerDisplayName, leadName, quoteCustomer, jobCustomer, contactEmail, contactPhone } from "@/lib/entities";

type CustomerRow = {
  id: string;
  name: string;
  email?: string;
  phone?: string;
};

export default function CustomersPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<CustomerRow | null>(null);

  // Prefer a real customers array; otherwise derive a directory from leads.
  const rows: CustomerRow[] = useMemo(() => {
    if (!data) return [];
    if (data.customers.length > 0) {
      return data.customers.map((c, i) => ({
        id: (c.id as string) ?? String(i),
        name: customerDisplayName(c as Record<string, unknown>),
        email: contactEmail(c as Record<string, unknown>),
        phone: contactPhone(c as Record<string, unknown>),
      }));
    }
    const seen = new Map<string, CustomerRow>();
    data.recentLeads.forEach((l, i) => {
      const name = leadName(l);
      if (!seen.has(name)) {
        seen.set(name, {
          id: (l.customer_id as string) || (l.id as string) || String(i),
          name,
          email: contactEmail(l),
          phone: contactPhone(l),
        });
      }
    });
    return Array.from(seen.values());
  }, [data]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter(
      (r) =>
        !q ||
        r.name.toLowerCase().includes(q) ||
        String(r.email ?? "").toLowerCase().includes(q) ||
        String(r.phone ?? "").includes(q)
    );
  }, [rows, query]);

  const relatedLeads = useMemo(
    () =>
      selected
        ? (data?.recentLeads ?? []).filter((l) => leadName(l) === selected.name)
        : [],
    [selected, data]
  );
  const relatedQuotes = useMemo(
    () =>
      selected
        ? (data?.recentQuotes ?? []).filter((q) => quoteCustomer(q) === selected.name)
        : [],
    [selected, data]
  );
  const relatedJobs = useMemo(
    () =>
      selected
        ? (data?.upcomingJobs ?? []).filter((j) => jobCustomer(j) === selected.name)
        : [],
    [selected, data]
  );

  return (
    <div>
      <PageHeader
        title="Southern Magnolia Movers Customers"
        description="Your customer directory and history."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Customers" }]}
      />

      <div className="mb-4 max-w-sm">
        <div className="relative">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="customers-search"
            placeholder="Search name, email, or phone…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
      </div>

      {error ? (
        <ErrorState title="Couldn't load customers" message={error} onRetry={refetch} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={3} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No customers found" />
      ) : (
        <DataTable data-testid="customers-table">
          <Thead>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
          </Thead>
          <Tbody>
            {filtered.map((c, i) => (
              <Tr key={c.id} data-testid={`customer-row-${i}`} onClick={() => setSelected(c)}>
                <Td className="font-medium text-navy">{c.name}</Td>
                <Td className="text-slate-500">{c.email || "—"}</Td>
                <Td className="text-slate-500">{formatPhone(c.phone)}</Td>
              </Tr>
            ))}
          </Tbody>
        </DataTable>
      )}

      <Drawer open={!!selected} onClose={() => setSelected(null)} title={selected?.name}>
        {selected && (
          <div className="space-y-5">
            <div className="space-y-1 text-sm">
              {selected.email && (
                <p className="flex items-center gap-2 text-slate-600">
                  <Mail className="h-4 w-4 text-slate-400" /> {selected.email}
                </p>
              )}
              {selected.phone && (
                <p className="flex items-center gap-2 text-slate-600">
                  <Phone className="h-4 w-4 text-slate-400" /> {formatPhone(selected.phone)}
                </p>
              )}
            </div>

            <RelatedSection title={`Leads (${relatedLeads.length})`}>
              {relatedLeads.map((l, i) => (
                <RelatedRow key={i} left={leadName(l)} right={<StatusBadge status={l.status as string} />} />
              ))}
            </RelatedSection>

            <RelatedSection title={`Quotes (${relatedQuotes.length})`}>
              {relatedQuotes.map((q, i) => (
                <RelatedRow
                  key={i}
                  left={`${q.quote_number || "Quote"} · ${formatCurrency(q.total ?? q.subtotal)}`}
                  right={<StatusBadge status={q.status as string} />}
                />
              ))}
            </RelatedSection>

            <RelatedSection title={`Jobs (${relatedJobs.length})`}>
              {relatedJobs.map((j, i) => (
                <RelatedRow
                  key={i}
                  left={`${j.job_number || "Job"} · ${formatDate(j.scheduled_start as string)}`}
                  right={<StatusBadge status={j.status as string} />}
                />
              ))}
            </RelatedSection>
          </div>
        )}
      </Drawer>
    </div>
  );
}

function RelatedSection({ title, children }: { title: string; children: React.ReactNode }) {
  const arr = Array.isArray(children) ? children : [children];
  const hasContent = arr.some((c) => c);
  return (
    <div>
      <h4 className="mb-2 text-xs font-semibold uppercase tracking-wider text-slate-500">{title}</h4>
      {hasContent ? (
        <div className="rounded-md border border-slate-200">{children}</div>
      ) : (
        <p className="text-sm text-slate-400">None yet.</p>
      )}
    </div>
  );
}

function RelatedRow({ left, right }: { left: React.ReactNode; right: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2 text-sm last:border-0">
      <span className="text-slate-700">{left}</span>
      {right}
    </div>
  );
}
