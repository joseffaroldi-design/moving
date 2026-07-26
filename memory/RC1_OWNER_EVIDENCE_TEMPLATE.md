# RC1 Owner Evidence Template

Fill this in after completing the runbook, then paste it back into Emergent.
⚠️ Paste METADATA and HTTP STATUS CODES only. NEVER paste passwords, JWTs, service-role keys, database
passwords, API secrets, customer records, or screenshots containing PII.

---
## 0. Environment
- Supabase project ref: __________ (the PROJECT_REF; not a secret)
- Date/time (UTC) of this run: __________

## 1. Read-only diagnostics (Section B)
- Diagnostic SQL execution date: __________
- Ran `RC1_diag_invoices_and_exposure.sql` fully? [ ] Yes  [ ] No
- Paste result sets 1–13 here (metadata only; block 14 optional):
```
(1 columns) ...
(2 constraints) ...
(3 FKs->invoices) ...
(4 indexes) ...
(5 sequences) ...
(6 triggers) ...
(7 RLS/FORCE all tables) ...
(8 policies) ...
(9 grants anon/auth/public/service) ...
(10 anon-readable tables) ...
(11 invoice functions) ...
(12 invoice enums) ...
(13 approx row counts) ...
```

## 2. Secure mvp-dashboard deployment (Section C)  [CHANGES PRODUCTION]
- Previous function code saved for rollback? [ ] Yes
- Deployment result: [ ] Success  [ ] Failed
- New function version id / timestamp: __________
- Error text if failed (redact any secrets): __________

## 3. Invoice emergency lockdown (Section D)  [CHANGES PRODUCTION]
- Backup/PITR confirmed before running (Section A2)? [ ] Yes  — latest backup timestamp: __________
- Ran `0019_invoices_security_lockdown.sql`? [ ] Yes
- Verification set 1 (RLS state) — paste:
```
table | rls_enabled | rls_forced
...
```
- Verification set 2 (anon/auth/public grants) — paste (ideal = ZERO rows):
```
...
```

## 4. Black-box verification (Section E / audit_probe.sh)
- Anonymous mvp-dashboard HTTP result:  BEFORE: ____   AFTER: ____  (target 401)
- Invalid-JWT mvp-dashboard HTTP result: ____  (target 401)
- Customer-JWT mvp-dashboard HTTP result (optional): ____  (target 403)
- Staff-JWT mvp-dashboard HTTP result (optional): ____  (target 200)  — PII fields present? [ ] No
- Anonymous invoices SELECT HTTP result:  BEFORE: ____   AFTER: ____  (target 401/403/404)
- Anonymous invoice_line_items SELECT HTTP result: AFTER: ____  (target 401/403/404)
- Anonymous invoice INSERT HTTP result: ____  (target 401/403/404)
- Protected tables (customers/leads/quotes/jobs/...) still denied to anon? [ ] Yes
- `me` anonymous → 401? [ ] Yes
- Public `/q/<token>` route still reachable? [ ] Yes  [ ] N/A
- Full probe final line: [ ] RESULT: PASS   [ ] RESULT: FAIL
- Paste the probe PASS/FAIL/BLOCKED block:
```
...
```

## 5. Supabase Auth signup setting (Section I)
- "Allow new users to sign up" is currently: [ ] ON  [ ] OFF
- Decision on account model: [ ] disable public  [ ] customer-only later  [ ] invite-only staff  [ ] undecided

## 6. Backup / PITR status (Section A2 / F)
- Backups listed? [ ] Yes  — latest: __________
- PITR enabled? [ ] Yes  [ ] No / not available on plan
- Manual snapshot taken before changes? [ ] Yes  [ ] No

## 7. Errors & rollback
- Any errors encountered (redacted): __________
- Any rollback performed? [ ] No  [ ] Yes — which: __________  — reason: __________

## 8. Backend containment (Section J) — info only
- Did Emergent Support confirm whether the deploy/health check depends on `/api/status`? [ ] Yes  [ ] No
- Decision: [ ] disable before prod  [ ] restrict  [ ] retain hardened  [ ] pending
