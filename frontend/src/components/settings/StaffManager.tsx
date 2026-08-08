"use client";

import { useCallback, useEffect, useState } from "react";
import { ShieldCheck, UserCheck, UserPlus, UserX } from "lucide-react";
import { getBrowserClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/input";
import { useToast } from "@/components/ui/toast";
import { titleCase } from "@/lib/format";

const STAFF_ROLES = [
  "owner",
  "operations_manager",
  "dispatcher",
  "sales",
  "crew_lead",
  "mover",
] as const;

type StaffRole = (typeof STAFF_ROLES)[number];

type StaffProfile = {
  id: string;
  company_id: string | null;
  full_name: string | null;
  phone: string | null;
  role: StaffRole | "customer";
  is_active: boolean;
};

const EMPTY_INVITE = { email: "", full_name: "", phone: "", role: "mover" as StaffRole };

export function StaffManager({
  companyId,
  currentUserId,
  currentRole,
}: {
  companyId: string | null;
  currentUserId: string | null;
  currentRole: string | null;
}) {
  const toast = useToast();
  const [staff, setStaff] = useState<StaffProfile[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [inviting, setInviting] = useState(false);
  const [showInvite, setShowInvite] = useState(false);
  const [invite, setInvite] = useState(EMPTY_INVITE);

  const canManage = currentRole === "owner" || currentRole === "operations_manager";

  const load = useCallback(async () => {
    if (!companyId) {
      setStaff([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const supabase = getBrowserClient();
      const { data, error } = await supabase
        .from("profiles")
        .select("id,company_id,full_name,phone,role,is_active")
        .eq("company_id", companyId)
        .neq("role", "customer")
        .order("full_name", { ascending: true });
      if (error) throw error;
      setStaff((data ?? []) as StaffProfile[]);
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not load staff.", "error");
    } finally {
      setLoading(false);
    }
  }, [companyId, toast]);

  useEffect(() => {
    load();
  }, [load]);

  async function sendInvite() {
    if (!invite.full_name.trim()) {
      toast("Full name is required.", "error");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(invite.email.trim())) {
      toast("Enter a valid email address.", "error");
      return;
    }
    if (currentRole === "operations_manager" && invite.role === "owner") {
      toast("Only an owner may invite another owner.", "error");
      return;
    }

    setInviting(true);
    try {
      const supabase = getBrowserClient();
      const { data, error } = await supabase.functions.invoke("staff-invite", {
        body: {
          email: invite.email.trim(),
          full_name: invite.full_name.trim(),
          phone: invite.phone.trim(),
          role: invite.role,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(String(data.error));
      toast("Staff invitation sent.", "success");
      setInvite(EMPTY_INVITE);
      setShowInvite(false);
      await load();
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not send staff invitation.", "error");
    } finally {
      setInviting(false);
    }
  }

  async function changeRole(member: StaffProfile, nextRole: StaffRole) {
    if (!canManage || member.id === currentUserId || member.role === nextRole) return;
    setBusyId(member.id);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.rpc("admin_set_profile_role", {
        target_user_id: member.id,
        new_role: nextRole,
      });
      if (error) throw error;
      setStaff((rows) => rows.map((row) => row.id === member.id ? { ...row, role: nextRole } : row));
      toast("Staff role updated.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update role.", "error");
    } finally {
      setBusyId(null);
    }
  }

  async function setActive(member: StaffProfile, active: boolean) {
    if (!canManage || member.id === currentUserId || member.is_active === active) return;
    setBusyId(member.id);
    try {
      const supabase = getBrowserClient();
      const { error } = await supabase.rpc("admin_set_profile_active", {
        target_user_id: member.id,
        active,
      });
      if (error) throw error;
      setStaff((rows) => rows.map((row) => row.id === member.id ? { ...row, is_active: active } : row));
      toast(active ? "Staff account activated." : "Staff account deactivated.", "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Could not update staff account.", "error");
    } finally {
      setBusyId(null);
    }
  }

  if (!canManage) {
    return <p className="text-sm text-slate-500">Only owners and operations managers can manage staff.</p>;
  }

  return (
    <div className="space-y-4" data-testid="staff-manager">
      <div className="flex flex-wrap items-center justify-between gap-3 rounded-md bg-slate-50 p-3">
        <div className="flex items-center gap-2 text-xs text-slate-600">
          <ShieldCheck className="h-4 w-4 text-gold-hover" />
          Staff changes are limited to your company. You cannot change your own access here.
        </div>
        <Button size="sm" variant="gold" onClick={() => setShowInvite((v) => !v)} data-testid="invite-staff-button">
          <UserPlus className="h-4 w-4" /> Invite staff
        </Button>
      </div>

      {showInvite && (
        <div className="rounded-md border border-gold/30 bg-cream/30 p-4">
          <h4 className="mb-3 font-medium text-navy">Invite a staff member</h4>
          <div className="grid gap-3 md:grid-cols-2">
            <div>
              <Label>Full name</Label>
              <Input value={invite.full_name} onChange={(e) => setInvite((v) => ({ ...v, full_name: e.target.value }))} placeholder="Full name" />
            </div>
            <div>
              <Label>Email</Label>
              <Input type="email" value={invite.email} onChange={(e) => setInvite((v) => ({ ...v, email: e.target.value }))} placeholder="name@example.com" />
            </div>
            <div>
              <Label>Phone</Label>
              <Input value={invite.phone} onChange={(e) => setInvite((v) => ({ ...v, phone: e.target.value }))} placeholder="Optional" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={invite.role} onChange={(e) => setInvite((v) => ({ ...v, role: e.target.value as StaffRole }))}>
                {STAFF_ROLES.filter((r) => currentRole === "owner" || r !== "owner").map((role) => (
                  <option key={role} value={role}>{titleCase(role)}</option>
                ))}
              </Select>
            </div>
          </div>
          <div className="mt-4 flex gap-2">
            <Button variant="gold" size="sm" loading={inviting} onClick={sendInvite}>Send invitation</Button>
            <Button variant="outline" size="sm" disabled={inviting} onClick={() => { setShowInvite(false); setInvite(EMPTY_INVITE); }}>Cancel</Button>
          </div>
        </div>
      )}

      {loading ? (
        <p className="text-sm text-slate-400">Loading staff…</p>
      ) : staff.length === 0 ? (
        <p className="text-sm text-slate-500">No staff profiles are assigned to this company yet. Use Invite staff to add the first one.</p>
      ) : (
        staff.map((member) => {
          const isSelf = member.id === currentUserId;
          const busy = busyId === member.id;
          const opsCannotManageOwner = currentRole === "operations_manager" && member.role === "owner";
          const locked = isSelf || opsCannotManageOwner || busy;
          return (
            <div key={member.id} className="grid gap-3 rounded-md border border-slate-200 p-4 md:grid-cols-[1fr_220px_auto] md:items-center">
              <div>
                <div className="flex items-center gap-2">
                  <p className="font-medium text-navy">{member.full_name?.trim() || "Unnamed staff member"}</p>
                  {!member.is_active && (
                    <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-slate-500">Inactive</span>
                  )}
                  {isSelf && (
                    <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[10px] font-semibold uppercase text-amber-700">You</span>
                  )}
                </div>
                <p className="mt-0.5 text-xs text-slate-500">{member.phone || "No phone"} · {titleCase(member.role)}</p>
              </div>
              <Select
                value={member.role}
                disabled={locked}
                onChange={(e) => changeRole(member, e.target.value as StaffRole)}
                aria-label={`Role for ${member.full_name || "staff member"}`}
              >
                {STAFF_ROLES.filter((r) => currentRole === "owner" || r !== "owner").map((role) => (
                  <option key={role} value={role}>{titleCase(role)}</option>
                ))}
              </Select>
              <Button
                size="sm"
                variant="outline"
                disabled={locked}
                loading={busy}
                onClick={() => setActive(member, !member.is_active)}
              >
                {member.is_active ? <UserX className="h-4 w-4" /> : <UserCheck className="h-4 w-4" />}
                {member.is_active ? "Deactivate" : "Activate"}
              </Button>
            </div>
          );
        })
      )}
    </div>
  );
}
