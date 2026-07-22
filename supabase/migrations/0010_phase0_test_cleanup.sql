-- =====================================================================
-- 0010_phase0_test_cleanup.sql  (DESTRUCTIVE — user-approved, ID-scoped)
-- Removes ONLY the approved ZZTEST/ATOMIC/DUPE test records identified by the
-- read-only Phase 0 preview. FK order: lead_notes -> leads -> customers.
-- Each delete is doubly-scoped by exact id AND company_id as a safety guard.
-- Transactional. Touches no real customer/lead/quote/job/company data.
-- =====================================================================

begin;

-- 1. lead_notes (explicit; lead delete would also cascade this row)
delete from public.lead_notes
 where id = 'f7e8678a-ac0f-44b9-9a2e-11a41f3f59a7'
   and company_id = 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';

-- 2. leads (7 test leads)
delete from public.leads
 where company_id = 'f05941f2-13db-4779-a1f3-2d6a74ccffcd'
   and id in (
     '8409d2f3-b9b4-4b5e-b326-d6fcc5164520',
     '7498c13b-dd5b-4ce3-aff0-1b570c3f7dc9',
     '8c35c9b4-55e2-4c43-95d8-69dde919b7f7',
     'db0ef2b5-e99b-4bdc-bb2a-013c054c443a',
     '48cd6a76-89f9-423a-bf51-1a9856061faf',
     '41c7abc0-3c83-487f-ba81-f5f54f92d720',
     'd26af7c7-4c92-40f0-8581-799bc64d57b4'
   );

-- 3. customers (8 test customers, incl. the lead-less ZZTEST Cust-0722)
delete from public.customers
 where company_id = 'f05941f2-13db-4779-a1f3-2d6a74ccffcd'
   and id in (
     '49247b5c-1181-499f-a8b0-392f8c5e9557',
     '9fd1aa61-de35-4901-91a6-1fc17e4d04c0',
     '22e3ec24-4bed-4202-9755-0d27e22e9ff7',
     '3f9f75c5-9a7c-450e-b373-a82a8bdd6d02',
     '20b2b14a-42b5-4a63-87b9-04cb3fbeca99',
     '3d23565a-6f39-420e-9fd3-68876526430d',
     'a6efb6f7-989c-449c-bc92-d94a6aa3aa7a',
     '83f73f71-1b00-49fd-8db6-83a16b1f1c36'
   );

commit;
