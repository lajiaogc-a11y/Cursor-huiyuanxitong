
-- Enable pg_cron and pg_net extensions for scheduled backups
CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA extensions;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

-- Grant usage to postgres role
GRANT USAGE ON SCHEMA cron TO postgres;
GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA cron TO postgres;

-- Schedule backup every 6 hours
SELECT cron.schedule(
  'scheduled-backup-every-6h',
  '0 */6 * * *',
  $$
  SELECT extensions.http_post(
    url := current_setting('app.settings.supabase_url', true) || '/functions/v1/scheduled-backup',
    body := '{"trigger_type":"auto"}'::jsonb,
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || current_setting('app.settings.service_role_key', true)
    )
  );
  $$
);
