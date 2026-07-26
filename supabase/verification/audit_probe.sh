#!/usr/bin/env bash
# =====================================================================
# supabase/verification/audit_probe.sh
# RC1 black-box security probe (safe to run from any machine).
#
# Verifies the live security posture WITHOUT exposing secrets or PII.
#   - Never prints tokens/keys.
#   - Never prints full API responses; redacts emails/phones/addresses.
#   - Prints PASS / FAIL / BLOCKED per check.
#   - Exits NONZERO if any confirmed SECURITY FAILURE is found.
#   - Does NOT fail merely because optional STAFF/CUSTOMER JWTs are absent
#     (those checks report BLOCKED instead).
#
# REQUIRED env:
#   SUPABASE_URL   e.g. https://<ref>.supabase.co
#   ANON_KEY       the anon/publishable key (public; still not printed)
# OPTIONAL env (enable extra checks; NEVER commit these):
#   STAFF_JWT      a valid staff access token (owner/ops/dispatch/sales)
#   CUSTOMER_JWT   a valid customer access token
#
# Usage:
#   SUPABASE_URL=... ANON_KEY=... ./audit_probe.sh
#   SUPABASE_URL=... ANON_KEY=... STAFF_JWT=... CUSTOMER_JWT=... ./audit_probe.sh
# =====================================================================
set -u

FAILED=0
pass()    { echo "PASS    | $1"; }
fail()    { echo "FAIL    | $1"; FAILED=1; }
blocked() { echo "BLOCKED | $1"; }

if [ -z "${SUPABASE_URL:-}" ] || [ -z "${ANON_KEY:-}" ]; then
  echo "ERROR: set SUPABASE_URL and ANON_KEY"; exit 2
fi
BASE="${SUPABASE_URL%/}"

# HTTP status only (body discarded).
code() { curl -s -m 20 -o /dev/null -w "%{http_code}" "$@"; }
# Redact any PII-looking tokens from a body sample before printing.
redact() {
  sed -E \
    -e 's/[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/<email-redacted>/g' \
    -e 's/(\+?[0-9][0-9()-]{6,}[0-9])/<phone-redacted>/g' \
    -e 's/[0-9]{1,6} +[A-Za-z0-9. ]+ (St|Street|Ave|Avenue|Rd|Road|Blvd|Ln|Lane|Dr|Drive|Ct|Court)\b/<address-redacted>/gi'
}

echo "=== RC1 black-box security probe ==="
echo "target: $BASE"
echo "---------------------------------------------"

# ---- Anonymous checks (always run) ----
c=$(code "$BASE/functions/v1/mvp-dashboard" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
[ "$c" = "401" ] && pass "mvp-dashboard anonymous -> 401" || fail "mvp-dashboard anonymous -> $c (expected 401; B1 open if 200)"

c=$(code "$BASE/functions/v1/mvp-dashboard" -H "apikey: $ANON_KEY" -H "Authorization: Bearer not.a.jwt")
[ "$c" = "401" ] && pass "mvp-dashboard invalid JWT -> 401" || fail "mvp-dashboard invalid JWT -> $c (expected 401)"

c=$(code "$BASE/functions/v1/me" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
[ "$c" = "401" ] && pass "me anonymous -> 401" || fail "me anonymous -> $c (expected 401)"

for t in invoices invoice_line_items; do
  c=$(code "$BASE/rest/v1/$t?select=id&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
  { [ "$c" = "401" ] || [ "$c" = "403" ] || [ "$c" = "404" ]; } \
    && pass "anon SELECT $t -> $c (denied)" \
    || fail "anon SELECT $t -> $c (expected 401/403/404; B2 open if 200)"
done

# Anonymous invoice WRITE must be denied.
c=$(code -X POST "$BASE/rest/v1/invoices" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY" \
      -H "Content-Type: application/json" -d '{"invoice_number":"PROBE-DENY"}')
{ [ "$c" = "401" ] || [ "$c" = "403" ] || [ "$c" = "404" ]; } \
  && pass "anon INSERT invoices -> $c (denied)" \
  || fail "anon INSERT invoices -> $c (expected denial)"

# Protected business tables must stay denied to anon.
for t in customers leads quotes quote_line_items jobs trucks dispatch_assignments profiles; do
  c=$(code "$BASE/rest/v1/$t?select=id&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
  { [ "$c" = "401" ] || [ "$c" = "403" ]; } \
    && pass "anon SELECT $t -> $c (denied)" \
    || fail "anon SELECT $t -> $c (expected 401/403)"
done

# companies (B4): after 0020 revoke this should be 401; before it, 200 is a KNOWN MEDIUM.
c=$(code "$BASE/rest/v1/companies?select=id&limit=1" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $ANON_KEY")
if [ "$c" = "401" ] || [ "$c" = "403" ]; then pass "anon SELECT companies -> $c (denied)";
else echo "WARN    | anon SELECT companies -> $c (B4 grant still open; not a hard fail)"; fi

# Public quote-approval route should remain reachable (front-end route).
if [ -n "${APP_BASE_URL:-}" ]; then
  c=$(code "${APP_BASE_URL%/}/q/probe-token")
  [ "$c" = "200" ] && pass "public /q/<token> route -> 200 (functional)" \
    || echo "WARN    | /q/<token> -> $c (set APP_BASE_URL to your web origin)"
else
  blocked "public /q/<token> route (set APP_BASE_URL to the web origin to test)"
fi

# ---- Staff JWT checks (optional) ----
if [ -n "${STAFF_JWT:-}" ]; then
  c=$(code "$BASE/functions/v1/mvp-dashboard" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $STAFF_JWT")
  [ "$c" = "200" ] && pass "mvp-dashboard staff JWT -> 200" || fail "mvp-dashboard staff JWT -> $c (expected 200)"

  # PII leakage scan on the staff response (body sampled + redacted, never fully printed).
  body=$(curl -s -m 20 "$BASE/functions/v1/mvp-dashboard" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $STAFF_JWT")
  if echo "$body" | grep -qiE '"(email|phone|address|origin_address|destination_address|notes)"[[:space:]]*:[[:space:]]*"[^"]'; then
    fail "staff dashboard response contains PII fields (email/phone/address/notes) — should be excluded"
    echo "        sample (redacted): $(echo "$body" | redact | head -c 200)"
  else
    pass "staff dashboard response excludes customer PII fields"
  fi
else
  blocked "staff-JWT checks (set STAFF_JWT to verify 200 + no-PII)"
fi

# ---- Customer JWT checks (optional) ----
if [ -n "${CUSTOMER_JWT:-}" ]; then
  c=$(code "$BASE/functions/v1/mvp-dashboard" -H "apikey: $ANON_KEY" -H "Authorization: Bearer $CUSTOMER_JWT")
  [ "$c" = "403" ] && pass "mvp-dashboard customer JWT -> 403" || fail "mvp-dashboard customer JWT -> $c (expected 403)"
else
  blocked "customer-JWT check (set CUSTOMER_JWT to verify 403)"
fi

echo "---------------------------------------------"
if [ "$FAILED" -ne 0 ]; then
  echo "RESULT: FAIL — at least one confirmed security failure."; exit 1
fi
echo "RESULT: PASS — no confirmed security failures (see BLOCKED items for gaps)."; exit 0
