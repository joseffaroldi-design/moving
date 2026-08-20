# Production Edge Function Manifest

Project: `moveops` (`yrvgovkkukmtdmgejtxc`)
Reconciled: 2026-08-20

This file records the production configuration that must be preserved when deploying the corresponding source directories.

| Function | Source | verify_jwt | Production version/hash |
|---|---|---:|---|
| `approve-quote` | `supabase/functions/approve-quote/index.ts` | `true` | v2 / `cc0e6d038c233dddfa42713c67b13832427338ebafa0d033a1909bc7b6cb18b6` |
| `create-deposit-payment` | `supabase/functions/create-deposit-payment/index.ts` | `true` | v2 / `17a5e7663f5d10b9c502d39ff0df89152a13460f31621bca77d6197a1c04063c` |
| `customer-email` | `supabase/functions/customer-email/index.ts` | `false` | v2 / `c55037bd7d9edf90c8a5356d5bf18c7b3a20eea41841d42d910936779950e9cf` |

## Security notes

- `customer-email` intentionally has platform JWT verification disabled because its queue-processing mode uses service-role bearer authentication and its staff retry mode validates the caller with `auth.getUser()` plus an active staff/company check.
- `customer-email` `mode=process_queue` MUST require `Authorization: Bearer <service role>`.
- `approve-quote` is a disabled legacy staff endpoint and MUST remain JWT-protected; the customer-facing approval flow is the token-gated RPC path.
- `create-deposit-payment` is a disabled legacy endpoint and MUST remain JWT-protected until a real payment provider + webhook reconciliation flow replaces it.
- Do not restore the former unauthenticated pg_cron invocation. Production currently has zero cron jobs.

When any of these functions changes, update this manifest in the same commit as the source change and verify the deployed `verify_jwt` setting after deployment.
