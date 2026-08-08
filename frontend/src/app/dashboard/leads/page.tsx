"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { MapPin, Pencil, Plus, Search, StickyNote } from "lucide-react";
import { useDashboardData } from "@/components/data/DashboardProvider";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge } from "@/components/ui/status-badge";
import { Input, Label, Select } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { formatDate, titleCase } from "@/lib/format";
import { leadName, addr, leadVolume, contactEmail, contactPhone } from "@/lib/entities";
import {
  LEAD_STATUSES,
  fetchLeads,
  fetchLeadById,
  createLeadWithCustomer,
  updateLeadStatus,
  updateLead,
  updateCustomerContact,
  type LeadRecord,
  type LeadCustomer,
  type LeadStatus,
} from "@/lib/leads";
import { fetchLeadNotes, addLeadNote, type LeadNote } from "@/lib/leadNotes";

const EMPTY_FORM = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  source: "",
  move_date: "",
  origin_address: "",
  destination_address: "",
  bedrooms: "",
  estimated_volume_cuft: "",
  notes: "",
};

const EMPTY_EDIT = { ...EMPTY_FORM };

interface WebsiteEstimateDetails {
  moveType: string | null;
  homeSize: string | null;
  services: string | null;
  isWebsiteEstimate: boolean;
}

function parseWebsiteEstimateDetails(value: unknown): WebsiteEstimateDetails {
  const text = typeof value === "string" ? value : "";
  const lines = text.split(/\r?\n/).map((line) => line.trim());
  const find = (label: string) => {
    const line = lines.find((item) => item.toLowerCase().startsWith(`${label.toLowerCase()}:`));
    return line ? line.slice(line.indexOf(":") + 1).trim() || null : null;
  };
  return {
    moveType: find("Move type"),
    homeSize: find("Home size"),
    services: find("Services"),
    isWebsiteEstimate: text.includes("Website Estimate Request") || !!find("Home size") || !!find("Services"),
  };
}

export default function LeadsPage() {
  const { data } = useDashboardData();
  const { me, user } = useAuth();
  const toast = useToast();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const userId = user?.id ?? null;

  const [leads, setLeads] = useState<LeadRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [status, setStatus] = useState("all");
  const [selected, setSelected] = useState<LeadRecord | null>(null);
  const [showNew, setShowNew] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setLeads((data?.recentLeads ?? []) as unknown as LeadRecord[]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setLeads(await fetchLeads(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load leads.");
    } finally {
      setLoading(false);
    }
  }, [companyId, data]);

  useEffect(() => {
    load();
  }, [load]);

  const statuses = useMemo(
    () => Array.from(new Set(leads.map((lead) => lead.status).filter(Boolean))) as string[],
    [leads]
  );

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return leads.filter((lead) => {
      const matchesQuery =
        !q ||
        leadName(lead).toLowerCase().includes(q) ||
        String(contactEmail(lead) ?? "").toLowerCase().includes(q);
      const matchesStatus = status === "all" || lead.status === status;
      return matchesQuery && matchesStatus;
    });
  }, [leads, query, status]);

  const canWrite = !!companyId && !!userId;

  return (
    <div>
      <PageHeader
        title="Leads"
        description="Track and qualify inbound moving leads."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Leads" }]}
        actions={
          <Button
            data-testid="new-lead-button"
            disabled={!canWrite}
            title={canWrite ? undefined : "Sign in as staff to add leads"}
            onClick={() => setShowNew(true)}
          >
            <Plus className="h-4 w-4" /> New Lead
          </Button>
        }
      />

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
          {statuses.map((item) => (
            <option key={item} value={item}>{titleCase(item)}</option>
          ))}
        </Select>
      </div>

      {error ? (
        <ErrorState title="Couldn't load leads" message={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={6} cols={7} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No leads found"
          description={leads.length === 0 ? "Add your first lead to get started." : "Try adjusting your search or filters."}
        />
      ) : (
        <>
          <div className="hidden md:block">
            <DataTable data-testid="leads-table">
              <Thead>
                <Th>Customer</Th>
                <Th>Route</Th>
                <Th>Move Date</Th>
                <Th>Home Size</Th>
                <Th>Source</Th>
                <Th>Volume</Th>
                <Th>Status</Th>
              </Thead>
              <Tbody>
                {filtered.map((lead, i) => {
                  const intake = parseWebsiteEstimateDetails(lead.notes);
                  return (
                    <Tr key={lead.id ?? i} data-testid={`lead-row-${i}`} onClick={() => setSelected(lead)}>
                      <Td className="font-medium text-navy">{leadName(lead)}</Td>
                      <Td className="max-w-[240px] truncate text-slate-500">
                        {addr(lead, "origin")} → {addr(lead, "destination")}
                      </Td>
                      <Td>{formatDate(lead.move_date as string)}</Td>
                      <Td>{intake.homeSize ?? (lead.bedrooms != null ? `${lead.bedrooms} BR` : "—")}</Td>
                      <Td>{titleCase((lead.source ?? "") as string) || "—"}</Td>
                      <Td>{leadVolume(lead)}</Td>
                      <Td><StatusBadge status={lead.status as string} /></Td>
                    </Tr>
                  );
                })}
              </Tbody>
            </DataTable>
          </div>

          <div className="space-y-3 md:hidden">
            {filtered.map((lead, i) => {
              const intake = parseWebsiteEstimateDetails(lead.notes);
              return (
                <button
                  key={lead.id ?? i}
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
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-400">
                    <span>{formatDate(lead.move_date as string)}</span>
                    {intake.homeSize && <span>{intake.homeSize}</span>}
                  </div>
                </button>
              );
            })}
          </div>
        </>
      )}

      <NewLeadDrawer
        open={showNew}
        onClose={() => setShowNew(false)}
        canWrite={canWrite}
        onCreated={() => {
          setShowNew(false);
          toast("Lead created.", "success");
          load();
        }}
      />

      <LeadDetailDrawer
        lead={selected}
        onClose={() => setSelected(null)}
        canWrite={canWrite}
        companyId={companyId}
        userId={userId}
        onStatusChanged={(id, nextStatus) => {
          setLeads((prev) => prev.map((lead) => (lead.id === id ? { ...lead, status: nextStatus } : lead)));
          setSelected((prev) => (prev && prev.id === id ? { ...prev, status: nextStatus } : prev));
        }}
        onSaved={async (id) => {
          try {
            const fresh = await fetchLeadById(id);
            if (fresh) {
              setLeads((prev) => prev.map((lead) => (lead.id === id ? fresh : lead)));
              setSelected(fresh);
            } else {
              load();
            }
          } catch {
            load();
          }
        }}
      />
    </div>
  );
}

function NewLeadDrawer({
  open,
  onClose,
  canWrite,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  canWrite: boolean;
  onCreated: () => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  useEffect(() => {
    if (open) setForm(EMPTY_FORM);
  }, [open]);

  function update<K extends keyof typeof EMPTY_FORM>(key: K, value: string) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit() {
    if (savingRef.current) return;
    if (!canWrite) {
      toast("No company associated with your account.", "error");
      return;
    }
    if (!form.first_name.trim() || !form.last_name.trim()) {
      toast("Customer first and last name are required.", "error");
      return;
    }
    savingRef.current = true;
    setSaving(true);
    try {
      await createLeadWithCustomer({
        first_name: form.first_name.trim(),
        last_name: form.last_name.trim(),
        email: form.email.trim() || null,
        phone: form.phone.trim() || null,
        source: form.source.trim() || null,
        move_date: form.move_date || null,
        origin_address: form.origin_address.trim() || null,
        destination_address: form.destination_address.trim() || null,
        bedrooms: form.bedrooms ? Number(form.bedrooms) : null,
        estimated_volume_cuft: form.estimated_volume_cuft ? Number(form.estimated_volume_cuft) : null,
        notes: form.notes.trim() || null,
      });
      onCreated();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not create lead.", "error");
    } finally {
      savingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title="New Lead"
      footer={
        <div className="flex gap-2">
          <Button variant="gold" className="flex-1" loading={saving} onClick={submit} data-testid="submit-new-lead">
            Create Lead
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="First name *"><Input data-testid="lead-first-name" value={form.first_name} onChange={(e) => update("first_name", e.target.value)} /></Field>
        <Field label="Last name *"><Input data-testid="lead-last-name" value={form.last_name} onChange={(e) => update("last_name", e.target.value)} /></Field>
        <Field label="Email"><Input data-testid="lead-email" type="email" value={form.email} onChange={(e) => update("email", e.target.value)} /></Field>
        <Field label="Phone"><Input data-testid="lead-phone" value={form.phone} onChange={(e) => update("phone", e.target.value)} /></Field>
        <Field label="Source"><Input data-testid="lead-source" value={form.source} onChange={(e) => update("source", e.target.value)} placeholder="Website, referral…" /></Field>
        <Field label="Move date"><Input data-testid="lead-move-date" type="date" value={form.move_date} onChange={(e) => update("move_date", e.target.value)} /></Field>
        <Field label="Origin address" wide><Input data-testid="lead-origin" value={form.origin_address} onChange={(e) => update("origin_address", e.target.value)} /></Field>
        <Field label="Destination address" wide><Input data-testid="lead-destination" value={form.destination_address} onChange={(e) => update("destination_address", e.target.value)} /></Field>
        <Field label="Bedrooms"><Input data-testid="lead-bedrooms" type="number" min="0" value={form.bedrooms} onChange={(e) => update("bedrooms", e.target.value)} /></Field>
        <Field label="Est. volume (cu ft)"><Input data-testid="lead-volume" type="number" min="0" value={form.estimated_volume_cuft} onChange={(e) => update("estimated_volume_cuft", e.target.value)} /></Field>
        <Field label="Notes" wide>
          <textarea
            data-testid="lead-notes-input"
            value={form.notes}
            onChange={(e) => update("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </Field>
      </div>
    </Drawer>
  );
}

function customerOf(lead: LeadRecord): (LeadCustomer & Record<string, unknown>) | null {
  const customer = (lead.customers ?? (lead as Record<string, unknown>).customer) as unknown;
  if (Array.isArray(customer)) return (customer[0] as LeadCustomer & Record<string, unknown>) ?? null;
  if (customer && typeof customer === "object") return customer as LeadCustomer & Record<string, unknown>;
  return null;
}

function LeadDetailDrawer({
  lead,
  onClose,
  canWrite,
  companyId,
  userId,
  onStatusChanged,
  onSaved,
}: {
  lead: LeadRecord | null;
  onClose: () => void;
  canWrite: boolean;
  companyId: string | null;
  userId: string | null;
  onStatusChanged: (id: string, status: LeadStatus) => void;
  onSaved: (id: string) => void;
}) {
  const toast = useToast();
  const [notes, setNotes] = useState<LeadNote[]>([]);
  const [notesLoading, setNotesLoading] = useState(false);
  const [noteBody, setNoteBody] = useState("");
  const [posting, setPosting] = useState(false);
  const [savingStatus, setSavingStatus] = useState(false);
  const [editing, setEditing] = useState(false);
  const [editForm, setEditForm] = useState(EMPTY_EDIT);
  const [savingEdit, setSavingEdit] = useState(false);
  const savingEditRef = useRef(false);

  useEffect(() => {
    setNoteBody("");
    setNotes([]);
    setEditing(false);
    if (lead?.id && companyId) {
      setNotesLoading(true);
      fetchLeadNotes(lead.id)
        .then(setNotes)
        .catch(() => setNotes([]))
        .finally(() => setNotesLoading(false));
    }
  }, [lead?.id, companyId]);

  function startEdit() {
    if (!lead) return;
    const customer = customerOf(lead);
    setEditForm({
      first_name: (customer?.first_name as string) ?? "",
      last_name: (customer?.last_name as string) ?? "",
      email: contactEmail(lead) ?? "",
      phone: contactPhone(lead) ?? "",
      source: (lead.source as string) ?? "",
      move_date: ((lead.move_date as string) ?? "").slice(0, 10),
      origin_address: (lead.origin_address as string) ?? "",
      destination_address: (lead.destination_address as string) ?? "",
      bedrooms: lead.bedrooms != null ? String(lead.bedrooms) : "",
      estimated_volume_cuft: lead.estimated_volume_cuft != null ? String(lead.estimated_volume_cuft) : "",
      notes: (lead.notes as string) ?? "",
    });
    setEditing(true);
  }

  function updateEdit<K extends keyof typeof EMPTY_EDIT>(key: K, value: string) {
    setEditForm((current) => ({ ...current, [key]: value }));
  }

  async function saveEdit() {
    if (!lead || savingEditRef.current) return;
    if (!editForm.first_name.trim() || !editForm.last_name.trim()) {
      toast("Customer first and last name are required.", "error");
      return;
    }
    const email = editForm.email.trim();
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      toast("Enter a valid email address.", "error");
      return;
    }
    const bedrooms = editForm.bedrooms.trim();
    const volume = editForm.estimated_volume_cuft.trim();
    if (bedrooms && (Number.isNaN(Number(bedrooms)) || Number(bedrooms) < 0)) {
      toast("Bedrooms must be a non-negative number.", "error");
      return;
    }
    if (volume && (Number.isNaN(Number(volume)) || Number(volume) < 0)) {
      toast("Estimated volume must be a non-negative number.", "error");
      return;
    }

    savingEditRef.current = true;
    setSavingEdit(true);
    try {
      const customer = customerOf(lead);
      if (customer?.id) {
        await updateCustomerContact(customer.id as string, {
          first_name: editForm.first_name.trim(),
          last_name: editForm.last_name.trim(),
          email: email || null,
          phone: editForm.phone.trim() || null,
        });
      }
      await updateLead(lead.id, {
        source: editForm.source.trim() || null,
        move_date: editForm.move_date || null,
        origin_address: editForm.origin_address.trim() || null,
        destination_address: editForm.destination_address.trim() || null,
        bedrooms: bedrooms ? Number(bedrooms) : null,
        estimated_volume_cuft: volume ? Number(volume) : null,
        notes: editForm.notes.trim() || null,
      });
      toast("Lead updated.", "success");
      setEditing(false);
      onSaved(lead.id);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update lead.", "error");
    } finally {
      savingEditRef.current = false;
      setSavingEdit(false);
    }
  }

  async function changeStatus(nextStatus: LeadStatus) {
    if (!lead) return;
    setSavingStatus(true);
    try {
      await updateLeadStatus(lead.id, nextStatus);
      onStatusChanged(lead.id, nextStatus);
      toast("Status updated.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update status.", "error");
    } finally {
      setSavingStatus(false);
    }
  }

  async function postNote() {
    if (!lead || !companyId || !userId) return;
    if (!noteBody.trim()) {
      toast("Note cannot be empty.", "error");
      return;
    }
    setPosting(true);
    try {
      const note = await addLeadNote({
        lead_id: lead.id,
        company_id: lead.company_id ?? companyId,
        author_id: userId,
        body: noteBody.trim(),
      });
      setNotes((current) => [note, ...current]);
      setNoteBody("");
      toast("Note added.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not add note.", "error");
    } finally {
      setPosting(false);
    }
  }

  const intake = parseWebsiteEstimateDetails(lead?.notes);

  return (
    <Drawer
      open={!!lead}
      onClose={onClose}
      title={lead ? leadName(lead) : ""}
      footer={
        editing ? (
          <div className="flex gap-2">
            <Button variant="gold" className="flex-1" loading={savingEdit} onClick={saveEdit} data-testid="save-lead-edit">
              Save Changes
            </Button>
            <Button variant="outline" disabled={savingEdit} onClick={() => setEditing(false)} data-testid="cancel-lead-edit">
              Cancel
            </Button>
          </div>
        ) : undefined
      }
    >
      {lead && (
        <div className="space-y-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <StatusBadge status={lead.status as string} />
              {canWrite && (
                <Select
                  data-testid="lead-status-select"
                  value={lead.status}
                  disabled={savingStatus || editing}
                  onChange={(e) => changeStatus(e.target.value as LeadStatus)}
                >
                  {LEAD_STATUSES.map((item) => (
                    <option key={item} value={item}>{titleCase(item)}</option>
                  ))}
                </Select>
              )}
            </div>
            <span className="text-xs text-slate-400">Created {formatDate(lead.created_at as string)}</span>
          </div>

          {editing ? (
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name *"><Input data-testid="edit-first-name" value={editForm.first_name} onChange={(e) => updateEdit("first_name", e.target.value)} /></Field>
              <Field label="Last name *"><Input data-testid="edit-last-name" value={editForm.last_name} onChange={(e) => updateEdit("last_name", e.target.value)} /></Field>
              <Field label="Email"><Input data-testid="edit-email" type="email" value={editForm.email} onChange={(e) => updateEdit("email", e.target.value)} /></Field>
              <Field label="Phone"><Input data-testid="edit-phone" value={editForm.phone} onChange={(e) => updateEdit("phone", e.target.value)} /></Field>
              <Field label="Source"><Input data-testid="edit-source" value={editForm.source} onChange={(e) => updateEdit("source", e.target.value)} placeholder="Website, referral…" /></Field>
              <Field label="Move date"><Input data-testid="edit-move-date" type="date" value={editForm.move_date} onChange={(e) => updateEdit("move_date", e.target.value)} /></Field>
              <Field label="Origin address" wide><Input data-testid="edit-origin" value={editForm.origin_address} onChange={(e) => updateEdit("origin_address", e.target.value)} /></Field>
              <Field label="Destination address" wide><Input data-testid="edit-destination" value={editForm.destination_address} onChange={(e) => updateEdit("destination_address", e.target.value)} /></Field>
              <Field label="Bedrooms"><Input data-testid="edit-bedrooms" type="number" min="0" value={editForm.bedrooms} onChange={(e) => updateEdit("bedrooms", e.target.value)} /></Field>
              <Field label="Est. volume (cu ft)"><Input data-testid="edit-volume" type="number" min="0" value={editForm.estimated_volume_cuft} onChange={(e) => updateEdit("estimated_volume_cuft", e.target.value)} /></Field>
              <Field label="Notes" wide>
                <textarea
                  data-testid="edit-notes"
                  value={editForm.notes}
                  onChange={(e) => updateEdit("notes", e.target.value)}
                  rows={6}
                  className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                />
              </Field>
            </div>
          ) : (
            <>
              {canWrite && (
                <div className="flex justify-end">
                  <Button size="sm" variant="outline" onClick={startEdit} data-testid="edit-lead-button">
                    <Pencil className="h-4 w-4" /> Edit lead
                  </Button>
                </div>
              )}
              <div className="space-y-1">
                <DetailRow label="Email" value={contactEmail(lead) || "—"} />
                <DetailRow label="Phone" value={contactPhone(lead) || "—"} />
                <DetailRow label="Origin" value={addr(lead, "origin")} />
                <DetailRow label="Destination" value={addr(lead, "destination")} />
                <DetailRow label="Move Date" value={formatDate(lead.move_date as string)} />
                {intake.moveType && <DetailRow label="Move Type" value={intake.moveType} />}
                {intake.homeSize && <DetailRow label="Home Size" value={intake.homeSize} />}
                {intake.services && <DetailRow label="Services" value={intake.services} />}
                <DetailRow label="Estimated Volume" value={leadVolume(lead)} />
                <DetailRow label="Bedrooms" value={lead.bedrooms != null ? String(lead.bedrooms) : "—"} />
                <DetailRow label="Source" value={titleCase((lead.source ?? "") as string) || "—"} />
                <DetailBlock label="Notes" value={(lead.notes as string) || "—"} />
              </div>
            </>
          )}

          {!editing && (
            <div>
              <h4 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-slate-500">
                <StickyNote className="h-3.5 w-3.5" /> Staff Notes
              </h4>
              {canWrite && (
                <div className="mb-3 space-y-2">
                  <textarea
                    data-testid="note-body-input"
                    value={noteBody}
                    onChange={(e) => setNoteBody(e.target.value)}
                    rows={2}
                    placeholder="Add a note about this lead…"
                    className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
                  />
                  <Button size="sm" variant="gold" loading={posting} onClick={postNote} data-testid="add-note-button">
                    Add Note
                  </Button>
                </div>
              )}
              {notesLoading ? (
                <p className="text-sm text-slate-400">Loading notes…</p>
              ) : notes.length === 0 ? (
                <p className="text-sm text-slate-400">No staff notes yet.</p>
              ) : (
                <ul className="space-y-2" data-testid="lead-notes-list">
                  {notes.map((note) => (
                    <li key={note.id} className="rounded-md border border-slate-200 bg-slate-50 p-3">
                      <p className="whitespace-pre-wrap text-sm text-slate-700">{note.body}</p>
                      <p className="mt-1 text-[11px] text-slate-400">{formatDate(note.created_at)}</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}

function Field({ label, wide = false, children }: { label: string; wide?: boolean; children: React.ReactNode }) {
  return (
    <div className={wide ? "sm:col-span-2" : undefined}>
      <Label>{label}</Label>
      {children}
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-100 pb-2.5">
      <span className="shrink-0 text-sm text-slate-500">{label}</span>
      <span className="text-right text-sm font-medium text-navy">{value}</span>
    </div>
  );
}

function DetailBlock({ label, value }: { label: string; value: string }) {
  return (
    <div className="border-b border-slate-100 pb-2.5 pt-1">
      <span className="mb-1.5 block text-sm text-slate-500">{label}</span>
      <p className="whitespace-pre-wrap break-words text-left text-sm font-medium leading-6 text-navy">{value}</p>
    </div>
  );
}
