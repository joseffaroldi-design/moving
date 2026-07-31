# Phase 9 P2 Slice 1 — Crew Mobile (jobs read) · Owner Acceptance Test Runbook

Prereq: migration `0027` applied (Part B) and Part C verified. Sign in at `/login`
as an ACTIVE crew user (`crew_lead` or `mover`) who is assigned to at least one job
(there are 8 `job_crew` rows). You should be able to reach `/mobile/jobs`.

Automated coverage already done (no-credentials boundary): tsc PASS, prod build PASS
(routes `/mobile/jobs`, `/mobile/jobs/[id]` emitted), crew fixture tests 3/3 PASS,
unauth `/mobile/jobs` + `/mobile/jobs/[id]` → 307 /login.

## 1. Jobs list (`/mobile/jobs`)
- [ ] Loads; bottom nav (Jobs/Clock/Photos/Checklists) intact; "Jobs" highlighted.
- [ ] "Active" tab shows only your assigned scheduled/confirmed/in_progress jobs, soonest first.
- [ ] "Completed" tab shows your completed/cancelled jobs, newest first.
- [ ] Each card shows: job #, status badge, your role, schedule, pickup→dropoff, customer
      name + phone, crew size, truck count.
- [ ] A crew user with NO assigned jobs in that scope sees the empty state.

## 2. Job detail (`/mobile/jobs/<id>`)
- [ ] Tapping a card opens the detail; "My Jobs" back link returns to the list.
- [ ] Shows: job # + status + your role, schedule (start/end), route, customer name +
      tap-to-call phone, dispatch notes (if any), and the full crew roster with your row
      marked "(You)".
- [ ] Opening a job you are NOT assigned to (edit the URL id) shows "This job isn't
      assigned to you." (RPC raises Job not found — no data leak).

## 3. Authorization / security
- [ ] Sign in as a NON-crew account (owner/ops/sales/customer) and open `/mobile/jobs`
      → "Crew access only" state (crew RPCs raise Not authorized as crew).
- [ ] Network tab shows ONLY `rpc/crew_list_jobs` and `rpc/crew_get_job` calls — no direct
      reads of jobs/job_crew/customers.
- [ ] Confirm NO internal_notes, financials, quote/invoice data, or customer email appear anywhere.

## Notes
- This slice is READ-ONLY. Clock in/out, job status/checklist, photos, and signature are
  later slices (0028–0031) and are still the existing mocked screens for now.
