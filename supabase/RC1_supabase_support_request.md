# Supabase Support Request — residual `supabase_admin` default privileges (schema `public`)

**To:** Supabase Support
**Project reference:** yrvgovkkukmtdmgejtxc
**Area:** Database security / role privileges / default ACLs
**Severity:** Security hardening (production readiness)

---

## Summary
As part of a security lockdown, we revoked the anonymous/authenticated default
privileges on schema `public`. We successfully removed the entries owned by the
`postgres` role, but an equivalent set of **default privileges owned by
`supabase_admin`** remains, and we cannot alter them from the SQL Editor (running
as `postgres`) — the command raises `ERROR: 42501 insufficient_privilege`.

We would like these residual defaults either removed, or an official written
confirmation that they are platform-managed and how they behave.

## What we ran (and the error)
Running as `postgres` in the SQL Editor:

```sql
alter default privileges for role supabase_admin in schema public
  revoke all on tables    from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on sequences from anon, authenticated;
alter default privileges for role supabase_admin in schema public
  revoke all on functions from anon, authenticated;
-- => ERROR: 42501: insufficient_privilege (cannot alter defaults owned by supabase_admin)
```

## The residual entries (24 rows) — from `pg_default_acl`
All in schema `public`, grantor `supabase_admin`, for grantees `anon` and `authenticated`:

- **Tables** (`objtype = r`): INSERT, SELECT, UPDATE, DELETE, TRUNCATE, REFERENCES, TRIGGER, MAINTAIN
- **Sequences** (`objtype = S`): USAGE, SELECT, UPDATE
- **Functions** (`objtype = f`): EXECUTE

(8 table + 3 sequence + 1 function privileges × 2 roles = 24 rows.)

Diagnostic query we used:

```sql
select pg_get_userbyid(d.defaclrole) as grantor,
       coalesce(n.nspname,'(all)') as schema,
       d.defaclobjtype::text as objtype,
       case when a.grantee = 0 then 'PUBLIC' else a.grantee::regrole::text end as grantee,
       a.privilege_type
from pg_default_acl d
left join pg_namespace n on n.oid = d.defaclnamespace
cross join lateral aclexplode(d.defaclacl) a
where coalesce(n.nspname,'') = 'public'
  and a.grantee::regrole::text in ('anon','authenticated')
order by grantor, objtype, grantee, privilege_type;
```

## Our concern
These defaults would cause any **future** `public`-schema object **created as
`supabase_admin`** to auto-grant `anon`/`authenticated` full table DML (including
`TRUNCATE`, which is not governed by RLS), sequence usage, and function `EXECUTE`.
We want to ensure no platform-created `public` object silently inherits anonymous
write/truncate access.

## Requests
1. **Remove** the `supabase_admin`-owned default privileges for `anon`/`authenticated`
   in schema `public` (tables, sequences, functions) — **or** —
2. **Confirm in writing** why they are required, whether they are platform-managed,
   and specifically **whether any platform-created `public`-schema objects can inherit
   these defaults** (i.e., are any `public` objects ever created as `supabase_admin`?).
3. Provide a **safe, supported remediation procedure** that does **not** modify
   Supabase-managed system schemas/roles/services and does not risk breaking the
   project (auth, storage, realtime, PostgREST/anon+authenticated access model).

## Context / what we have already done (so you can advise safely)
- We revoked all direct anon/authenticated/PUBLIC grants on our 42 application
  relations in `public` (existing-object lockdown) with no app regression.
- We removed the `postgres`-owned `public` default privileges for anon/authenticated.
- We rely on RLS + explicit least-privilege grants per object; we do **not** depend on
  broad default privileges for our app to function.

Thank you.
