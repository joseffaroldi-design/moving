-- Phase 19 Payments V1 verification.
-- Rollback-only: creates temporary payment data, asserts deposit credit + final
-- invoice reconciliation/idempotency, and rolls all rows back.
begin;

do $$
declare
  v_company uuid := 'f05941f2-13db-4779-a1f3-2d6a74ccffcd';
  v_customer uuid := gen_random_uuid();
  v_quote uuid := gen_random_uuid();
  v_invoice uuid := gen_random_uuid();
  v_deposit uuid := gen_random_uuid();
  v_paid numeric;
  v_balance numeric;
  v_count int;
begin
  insert into public.customers(id,company_id,first_name,last_name,email)
  values(v_customer,v_company,'Phase19','Rollback','phase19-verify@example.invalid');

  insert into public.quotes(id,company_id,customer_id,status,quote_number,total,deposit_percent,deposit_amount,tax_rate)
  values(v_quote,v_company,v_customer,'accepted','P19-VERIFY-Q',1000,25,250,0);

  insert into public.customer_deposits(id,company_id,customer_id,quote_id,amount,paid_at)
  values(v_deposit,v_company,v_customer,v_quote,250,now());

  insert into public.invoices(id,company_id,quote_id,customer_id,invoice_number,status,tax_rate)
  values(v_invoice,v_company,v_quote,v_customer,'P19-VERIFY-I','sent',0);
  insert into public.invoice_line_items(invoice_id,description,quantity,unit_price,total,sort_order)
  values(v_invoice,'Move',1,1000,1000,0);
  perform public._compute_invoice_totals(v_invoice);

  select amount_paid,balance into v_paid,v_balance from public.invoices where id=v_invoice;
  if v_paid <> 250 or v_balance <> 750 then
    raise exception 'Deposit credit failed: paid %, balance %',v_paid,v_balance;
  end if;

  insert into app_private.payment_checkout_sessions(
    company_id,customer_id,kind,invoice_id,amount,status,external_session_id
  ) values(v_company,v_customer,'invoice',v_invoice,750,'open','cs_phase19_verify');

  perform public.payment_finalize_stripe_checkout(
    'cs_phase19_verify','pi_phase19_verify',75000,'usd',now()
  );
  perform public.payment_finalize_stripe_checkout(
    'cs_phase19_verify','pi_phase19_verify',75000,'usd',now()
  );

  select amount_paid,balance into v_paid,v_balance from public.invoices where id=v_invoice;
  if v_paid <> 1000 or v_balance <> 0 then
    raise exception 'Final payment reconciliation failed: paid %, balance %',v_paid,v_balance;
  end if;
  if (select status::text from public.invoices where id=v_invoice) <> 'paid' then
    raise exception 'Invoice did not become paid';
  end if;
  select count(*) into v_count from public.invoice_payments
   where invoice_id=v_invoice and external_payment_id='pi_phase19_verify';
  if v_count <> 1 then raise exception 'Payment idempotency failed'; end if;
end $$;

rollback;

select case when
  (select count(*) from public.customers where email='phase19-verify@example.invalid')=0
  and (select count(*) from app_private.payment_checkout_sessions where external_session_id='cs_phase19_verify')=0
then 'PASS: Phase 19 payments rollback verification'
else 'FAIL: rollback residue detected'
end as result;
