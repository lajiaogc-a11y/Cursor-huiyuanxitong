-- 将备份计划从每 6 小时改为每 24 小时（每天 0 点 UTC）
-- 1. 取消原有 6 小时任务
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-backup-every-6h');
EXCEPTION WHEN OTHERS THEN
  NULL; -- 任务不存在时忽略
END $$;

-- 2. 新建 24 小时任务（每天 00:00 UTC）
SELECT cron.schedule(
  'scheduled-backup-every-24h',
  '0 0 * * *',
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
