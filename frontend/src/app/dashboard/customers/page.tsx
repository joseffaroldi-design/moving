"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Search, Mail, Phone, Plus, Pencil } from "lucide-react";
import { useAuth } from "@/components/auth/AuthProvider";
import { PageHeader } from "@/components/ui/page-header";
import { DataTable, Thead, Th, Tbody, Tr, Td } from "@/components/ui/table";
import { TableSkeleton } from "@/components/ui/skeleton";
import { ErrorState } from "@/components/ui/error-state";
import { EmptyState } from "@/components/ui/empty-state";
import { Input, Label } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Drawer } from "@/components/ui/drawer";
import { useToast } from "@/components/ui/toast";
import { formatPhone } from "@/lib/format";
import {
  fetchCustomers,
  createCustomer,
  updateCustomer,
  type CustomerRecord,
  type CustomerInput,
} from "@/lib/customers";

const EMPTY: Omit<CustomerInput, "company_id"> = {
  first_name: "",
  last_name: "",
  email: "",
  phone: "",
  secondary_phone: "",
  billing_address_line1: "",
  billing_city: "",
  billing_state: "",
  billing_postal_code: "",
  notes: "",
};

export default function CustomersPage() {
  const { me, user } = useAuth();
  const toast = useToast();
  const companyId = (me?.profile as { company_id?: string } | null)?.company_id ?? null;
  const userId = user?.id ?? null;

  const [rows, setRows] = useState<CustomerRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [editing, setEditing] = useState<CustomerRecord | null>(null);
  const [showForm, setShowForm] = useState(false);

  const load = useCallback(async () => {
    if (!companyId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      setRows(await fetchCustomers(companyId));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load customers.");
    } finally {
      setLoading(false);
    }
  }, [companyId]);

  useEffect(() => {
    load();
  }, [load]);

  const filtered = useMemo(() => {
    const q = query.toLowerCase();
    return rows.filter((r) => {
      const name = `${r.first_name} ${r.last_name}`.toLowerCase();
      return (
        !q ||
        name.includes(q) ||
        String(r.email ?? "").toLowerCase().includes(q) ||
        String(r.phone ?? "").includes(q)
      );
    });
  }, [rows, query]);

  const canWrite = !!companyId && !!userId;

  function openNew() {
    setEditing(null);
    setShowForm(true);
  }
  function openEdit(c: CustomerRecord) {
    setEditing(c);
    setShowForm(true);
  }

  return (
    <div>
      <PageHeader
        title="Southern Magnolia Movers Customers"
        description="Your customer directory and history."
        breadcrumbs={[{ label: "Operations", href: "/dashboard" }, { label: "Customers" }]}
        actions={
          <Button data-testid="new-customer-button" disabled={!canWrite} onClick={openNew}>
            <Plus className="h-4 w-4" /> New Customer
          </Button>
        }
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
        <ErrorState title="Couldn't load customers" message={error} onRetry={load} />
      ) : loading ? (
        <TableSkeleton rows={5} cols={4} />
      ) : filtered.length === 0 ? (
        <EmptyState icon={Search} title="No customers found" description="Add your first customer to get started." />
      ) : (
        <DataTable data-testid="customers-table">
          <Thead>
            <Th>Name</Th>
            <Th>Email</Th>
            <Th>Phone</Th>
            <Th> </Th>
          </Thead>
          <Tbody>
            {filtered.map((c, i) => (
              <Tr key={c.id} data-testid={`customer-row-${i}`}>
                <Td className="font-medium text-navy">{c.first_name} {c.last_name}</Td>
                <Td className="text-slate-500">{c.email || "—"}</Td>
                <Td className="text-slate-500">{formatPhone(c.phone ?? undefined)}</Td>
                <Td>
                  <button
                    data-testid={`edit-customer-${i}`}
                    onClick={() => openEdit(c)}
                    className="inline-flex items-center gap-1 text-sm text-gold-hover hover:underline"
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                </Td>
              </Tr>
            ))}
          </Tbody>
        </DataTable>
      )}

      <CustomerFormDrawer
        open={showForm}
        onClose={() => setShowForm(false)}
        companyId={companyId}
        userId={userId}
        editing={editing}
        onSaved={(saved) => {
          setRows((prev) => {
            const exists = prev.some((r) => r.id === saved.id);
            return exists ? prev.map((r) => (r.id === saved.id ? saved : r)) : [saved, ...prev];
          });
          setShowForm(false);
          toast(editing ? "Customer updated." : "Customer created.", "success");
        }}
      />
    </div>
  );
}

function CustomerFormDrawer({
  open,
  onClose,
  companyId,
  userId,
  editing,
  onSaved,
}: {
  open: boolean;
  onClose: () => void;
  companyId: string | null;
  userId: string | null;
  editing: CustomerRecord | null;
  onSaved: (c: CustomerRecord) => void;
}) {
  const toast = useToast();
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setForm({
        first_name: editing.first_name ?? "",
        last_name: editing.last_name ?? "",
        email: editing.email ?? "",
        phone: editing.phone ?? "",
        secondary_phone: editing.secondary_phone ?? "",
        billing_address_line1: editing.billing_address_line1 ?? "",
        billing_city: editing.billing_city ?? "",
        billing_state: editing.billing_state ?? "",
        billing_postal_code: editing.billing_postal_code ?? "",
        notes: editing.notes ?? "",
      });
    } else {
      setForm(EMPTY);
    }
  }, [open, editing]);

  function upd<K extends keyof typeof EMPTY>(k: K, v: string) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  async function submit() {
    if (!companyId) {
      toast("No company associated with your account.", "error");
      return;
    }
    if (!form.first_name?.trim() || !form.last_name?.trim()) {
      toast("First and last name are required.", "error");
      return;
    }
    setSaving(true);
    try {
      const payload = {
        first_name: form.first_name!.trim(),
        last_name: form.last_name!.trim(),
        email: form.email?.trim() || null,
        phone: form.phone?.trim() || null,
        secondary_phone: form.secondary_phone?.trim() || null,
        billing_address_line1: form.billing_address_line1?.trim() || null,
        billing_city: form.billing_city?.trim() || null,
        billing_state: form.billing_state?.trim() || null,
        billing_postal_code: form.billing_postal_code?.trim() || null,
        notes: form.notes?.trim() || null,
      };
      const saved = editing
        ? await updateCustomer(editing.id, payload)
        : await createCustomer({ company_id: companyId, created_by: userId ?? undefined, ...payload });
      onSaved(saved);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not save customer.", "error");
    } finally {
      setSaving(false);
    }
  }

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={editing ? "Edit Customer" : "New Customer"}
      footer={
        <div className="flex gap-2">
          <Button variant="gold" className="flex-1" loading={saving} onClick={submit} data-testid="submit-customer">
            {editing ? "Save Changes" : "Create Customer"}
          </Button>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
        </div>
      }
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <div>
          <Label>First name *</Label>
          <Input data-testid="customer-first-name" value={form.first_name} onChange={(e) => upd("first_name", e.target.value)} />
        </div>
        <div>
          <Label>Last name *</Label>
          <Input data-testid="customer-last-name" value={form.last_name} onChange={(e) => upd("last_name", e.target.value)} />
        </div>
        <div>
          <Label>Email</Label>
          <Input data-testid="customer-email" value={form.email ?? ""} onChange={(e) => upd("email", e.target.value)} />
        </div>
        <div>
          <Label>Phone</Label>
          <Input data-testid="customer-phone" value={form.phone ?? ""} onChange={(e) => upd("phone", e.target.value)} />
        </div>
        <div>
          <Label>Secondary phone</Label>
          <Input value={form.secondary_phone ?? ""} onChange={(e) => upd("secondary_phone", e.target.value)} />
        </div>
        <div>
          <Label>Postal code</Label>
          <Input value={form.billing_postal_code ?? ""} onChange={(e) => upd("billing_postal_code", e.target.value)} />
        </div>
        <div className="sm:col-span-2">
          <Label>Billing address</Label>
          <Input value={form.billing_address_line1 ?? ""} onChange={(e) => upd("billing_address_line1", e.target.value)} placeholder="Street address" />
        </div>
        <div>
          <Label>City</Label>
          <Input value={form.billing_city ?? ""} onChange={(e) => upd("billing_city", e.target.value)} />
        </div>
        <div>
          <Label>State</Label>
          <Input value={form.billing_state ?? ""} onChange={(e) => upd("billing_state", e.target.value)} placeholder="LA" />
        </div>
        <div className="sm:col-span-2">
          <Label>Notes</Label>
          <textarea
            value={form.notes ?? ""}
            onChange={(e) => upd("notes", e.target.value)}
            rows={3}
            className="w-full rounded-md border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-accent focus:outline-none focus:ring-1 focus:ring-accent"
          />
        </div>
      </div>
    </Drawer>
  );
}
