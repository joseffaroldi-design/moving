-- Phase 11: restore automatic customer-email processing securely.
-- The scheduler secret is generated inside Postgres and stored only in Supabase Vault.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'customer_email_cron_secret') THEN
    PERFORM vault.create_secret(
      encode(extensions.gen_random_bytes(32), 'hex'),
      'customer_email_cron_secret',
      'Dedicated secret for the customer-email queue cron'
    );
  END IF;

  IF NOT EXISTS (SELECT 1 FROM vault.secrets WHERE name = 'customer_email_project_url') THEN
    PERFORM vault.create_secret(
      'https://yrvgovkkukmtdmgejtxc.supabase.co',
      'customer_email_project_url',
      'Supabase project URL used by the customer-email scheduler'
    );
  END IF;
END
$$;

CREATE OR REPLACE FUNCTION public._verify_customer_email_cron_secret(p_secret text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'vault', 'pg_temp'
AS $$
DECLARE
  v_expected text;
BEGIN
  IF p_secret IS NULL OR char_length(p_secret) < 32 OR char_length(p_secret) > 256 THEN
    RETURN false;
  END IF;

  SELECT decrypted_secret
    INTO v_expected
  FROM vault.decrypted_secrets
  WHERE name = 'customer_email_cron_secret'
  LIMIT 1;

  RETURN v_expected IS NOT NULL AND p_secret = v_expected;
END;
$$;

REVOKE ALL ON FUNCTION public._verify_customer_email_cron_secret(text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public._verify_customer_email_cron_secret(text) TO service_role;

DO $$
DECLARE
  v_job record;
BEGIN
  FOR v_job IN
    SELECT jobid FROM cron.job WHERE jobname = 'customer_email_process_queue_secure'
  LOOP
    PERFORM cron.unschedule(v_job.jobid);
  END LOOP;
END
$$;

SELECT cron.schedule(
  'customer_email_process_queue_secure',
  '*/5 * * * *',
  $cron$
  SELECT net.http_post(
    url := (
      SELECT decrypted_secret
      FROM vault.decrypted_secrets
      WHERE name = 'customer_email_project_url'
      LIMIT 1
    ) || '/functions/v1/customer-email',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'x-customer-email-cron-secret', (
        SELECT decrypted_secret
        FROM vault.decrypted_secrets
        WHERE name = 'customer_email_cron_secret'
        LIMIT 1
      )
    ),
    body := '{"mode":"process_queue"}'::jsonb
  ) AS request_id;
  $cron$
);
