"use client";

import { useMemo, useState } from "react";
import { Search, Plus, FileText, StickyNote, MapPin } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { formatDate, titleCase } from "@/lib/format";
import { leadName, addr, leadVolume, contactEmail, contactPhone } from "@/lib/entities";
import type { Lead } from "@/lib/types";

export default function LeadsPage() {
  const { data, loading, error, refetch } = useDashboardData();
  const toast = useToast();
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [source, setSource] = useState("all");
  const [selected, setSelected] = useState<Lead | null>(null);

  const leads = data?.recentLeads ?? [];

  const statuses = useMemo(
    () => Array.from(new Set(leads.map((l) => l.status).filter(Boolean))) as string[],
    [leads]
  );
  const sources = useMemo(
    () =>
      Array.from(
        new Set(leads.map((l) => (l.source || l.lead_source) as string).filter(Boolean))
      ),
    [leads]
  );

  const filtered = useMemo(() => {
    return leads.filter((l) => {
      const name = leadName(l).toLowerCase();
      const matchesQuery =
        !query ||
        name.includes(query.toLowerCase()) ||
        String(l.email ?? "").toLowerCase().includes(query.toLowerCase());
      const matchesStatus = status === "all" || l.status === status;
      const src = (l.source || l.lead_source) as string;
      const matchesSource = source === "all" || src === source;
      return matchesQuery && matchesStatus && matchesSource;
    });
  }, [leads, query, status, source]);

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track and qualify inbound moving leads."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Leads" }]}
        actions={
          <Button data-testid="new-lead-button" onClick={() => toast("Lead intake form coming next.", "info")}>
            <Plus className="h-4 w-4" /> New Lead
          </Button>
        }
      />

      {/* Filters */}
      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative min-w-[220px] flex-1">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            data-testid="leads-search"
            placeholder="Search by name or email…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            className="pl-8"
          />
        </div>
        <Select data-testid="leads-status-filter" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="all">All statuses</option>
          {statuses.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </Select>
        <Select data-testid="leads-source-filter" value={source} onChange={(e) => setSource(e.target.value)}>
          <option value="all">All sources</option>
          {sources.map((s) => (
            <option key={s} value={s}>{titleCase(s)}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load leads" message={error} onRetry={refetch} />
      ) : loading ? (
        <TableSkeleton rows={6} cols={6} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No leads found"
          description={leads.length === 0 ? "New leads will appear here as they come in." : "Try adjusting your search or filters."}
        />
      ) : (
        <>
          {/* Desktop table */}
          <div className="hidden md:block">
            <DataTable data-testid="leads-table">
              <Thead>
                <Th>Customer</Th>
                <Th>Route</Th>
                <Th>Move Date</Th>
                <Th>Source</Th>
                <Th>Volume</Th>
                <Th>Status</Th>
              </Thead>
              <Tbody>
                {filtered.map((lead, i) => (
                  <Tr
                    key={(lead.id as string) ?? i}
                    data-testid={`lead-row-${i}`}
                    onClick={() => setSelected(lead)}
                  >
                    <Td className="font-medium text-navy">{leadName(lead)}</Td>
                    <Td className="max-w-[240px] truncate text-slate-500">
                      {addr(lead, "origin")} → {addr(lead, "destination")}
                    </Td>
                    <Td>{formatDate(lead.move_date as string)}</Td>
                    <Td>{titleCase((lead.source || lead.lead_source) as string)}</Td>
                    <Td>
                      {leadVolume(lead)}
                    </Td>
                    <Td><StatusBadge status={lead.status as string} /></Td>
                  </Tr>
                ))}
              </Tbody>
            </DataTable>
          </div>

          {/* Mobile cards */}
          <div className="space-y-3 md:hidden">
            {filtered.map((lead, i) => (
              <button
                key={(lead.id as string) ?? i}
                data-testid={`lead-card-${i}`}
                onClick={() => setSelected(lead)}
                className="w-full rounded-md border border-slate-200 bg-white p-4 text-left shadow-card"
              >
                <div className="flex items-center justify-between">
                  <p className="font-medium text-navy">{leadName(lead)}</p>
                  <StatusBadge status={lead.status as string} />
                </div>
                <p className="mt-1 flex items-center gap-1 text-xs text-slate-500">
                  <MapPin className="h-3 w-3" />
                  {addr(lead, "origin")} → {addr(lead, "destination")}
                </p>
                <p className="mt-1 text-xs text-slate-400">{formatDate(lead.move_date as string)}</p>
              </button>
            ))}
          </div>
        </>
      )}

      {/* Detail drawer */}
      <Drawer
        open={!!selected}
        onClose={() => setSelected(null)}
        title={selected ? leadName(selected) : ""}
        footer={
          selected && (
            <div className="flex gap-2">
              <Button variant="primary" className="flex-1" onClick={() => toast("Quote builder coming next.", "info")}>
                <FileText className="h-4 w-4" /> Create Quote
              </Button>
              <Button variant="outline" onClick={() => toast("Note added.", "success")}>
                <StickyNote className="h-4 w-4" /> Add Note
              </Button>
            </div>
          )
        }
      >
        {selected && (
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <StatusBadge status={selected.status as string} />
              <span className="text-xs text-slate-400">
                Created {formatDate(selected.created_at as string)}
              </span>
            </div>
            <DetailRow label="Email" value={contactEmail(selected) || "—"} />
            <DetailRow label="Phone" value={contactPhone(selected) || "—"} />
            <DetailRow label="Origin" value={addr(selected, "origin")} />
            <DetailRow label="Destination" value={addr(selected, "destination")} />
            <DetailRow label="Move Date" value={formatDate(selected.move_date as string)} />
            <DetailRow label="Estimated Volume" value={leadVolume(selected)} />
            <DetailRow label="Source" value={titleCase((selected.source || selected.lead_source) as string)} />
          </div>
        )}
      </Drawer>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2.5">
      <span className="text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-navy">{value}</span>
    </div>
  );
}
