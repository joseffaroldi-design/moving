# Southern Magnolia Movers — V1 Move Document Specification

Status: implementation specification; legal wording is intentionally not embedded here.

## Launch scope

V1 is designed for Louisiana intrastate operations first. Interstate household-goods compliance is a separate future activation gate and must not be represented as supported merely by changing a service-area setting.

## Design goal

Add the smallest document/signature layer needed to make a move record operationally complete while reusing the existing `documents`, `document_signatures`, `jobs`, customer portal, crew assignment, Storage, and activity-log architecture.

Do **not** build a template editor, DocuSign clone, claims system, interstate packet generator, or arbitrary form builder.

## Minimum V1 document workflow

### Already represented elsewhere
1. Written estimate / quote — existing Quotes flow.
2. Quote acceptance — existing secure approval-token / portal flow.
3. Final invoice — existing Invoices flow.
4. Payment receipt — existing Payments/Invoice flow; customer communication comes later.

### Add to move-day document layer
1. `service_agreement`
   - Presented before work begins.
   - Customer signature required when enabled for the company/job.
   - Exact legal/business wording must be supplied/reviewed outside this code specification.

2. `valuation_acknowledgment`
   - Presented before work begins when applicable.
   - Customer selection/acknowledgment required when enabled.
   - Legal wording and available valuation choices are configuration/content, not hard-coded legal advice.

3. `scope_change_authorization`
   - Created only when the agreed scope materially changes.
   - Customer acknowledgment/signature required before the change is treated as authorized where operationally appropriate.
   - New version/addendum; never mutate an already signed agreement.

4. `completion_acknowledgment`
   - Presented at move closeout.
   - Customer signature required before final crew completion when configured as required.

### Operational records, not formal contract templates
- Pre-existing condition / damage evidence: existing job photos + notes, categorized and timestamped.
- Incident record: later crew-closeout slice; does not constitute a claims module.

## Immutability requirements

A signed document version must never be silently edited.

Each finalized/signable version must preserve enough information to prove what was shown at signing time:
- company_id
- job_id
- customer_id where present
- document type
- version number
- title
- immutable content reference or rendered snapshot
- content hash
- created/finalized timestamps
- signer name
- signer role/type
- signed timestamp
- signature reference/data according to the existing live schema
- optional request metadata (IP/user agent) only if safely captured and actually useful

Any later change creates a new version or addendum.

## Authorization model

### Owner / operations manager
- May prepare/finalize required job document versions for company jobs.
- May view all company job documents/signatures.
- May void/reissue an unsigned version through an explicit workflow.
- Must not edit a finalized signed version in place.

### Dispatcher
- May view move-day document readiness for company jobs.
- No legal-content editing in V1.

### Sales
- Existing quote/estimate responsibility remains unchanged.
- No move-day contract mutation by default.

### Crew lead / mover
- Only for explicitly assigned jobs.
- May view customer-safe signable documents required for the assigned job.
- May initiate/present a signature flow, but may not alter template/legal wording.
- Crew-lead versus mover write permissions should remain least-privilege and be confirmed against the live schema.

### Customer
- Only their explicitly linked job/customer records.
- May view the exact finalized document version presented for signing.
- May sign/acknowledge through a narrow server-authorized path.
- Must never receive direct base-table access to internal/staff-only fields merely because RLS filters rows.

### Anonymous
- No base-table document/signature access.
- Any future public signing token must be scoped, expiring, non-enumerable, and separate from broad table grants.

## Completion gates for later Crew Move-Day 2.0

The document foundation should allow the later crew-completion RPC to require, per job/company configuration:
- required pre-move document(s) finalized/signed
- required completion acknowledgment signed
- required checklist complete
- no active crew clock entry when completing

This Step 2 slice does **not** yet change job completion rules. It only creates the safe document/version/signature foundation.

## Activity events

Only meaningful transitions should be logged, e.g.:
- `document.prepared`
- `document.finalized`
- `document.signed`
- `document.voided`

Do not log every keystroke.

## Explicit exclusions for V1

- No interstate Order for Service / Bill of Lading generator yet.
- No arbitrary template editor.
- No claims workflow.
- No customer-upload-anything document vault.
- No crew pricing authority.
- No field payment collection changes in this slice.
- No GPS/signature-location tracking.
- No biometric signature verification.
- No destructive rewrite of existing `documents` or `document_signatures` tables without live-schema evidence.

## Acceptance criteria

Step 2 is complete when:
1. Live `documents` / `document_signatures` schema is inventoried and reconciled.
2. Additive migration is authored against the real schema and reviewed.
3. Tenant isolation is enforced at the DB/RPC layer.
4. Signed versions are immutable by design.
5. Customer and crew access use narrow, explicit server surfaces rather than broad table exposure.
6. One test job can prepare a document version, present the exact finalized content, sign it, and re-read the immutable signed record.
7. Forbidden cross-company and unassigned-crew access fails.
8. Legal/business wording remains externally reviewed content, not invented by the implementation.
