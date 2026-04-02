-- 每周日 03:00 UTC 自动归档超过 90 天的旧数据
-- 使用已有的 archive_old_data(retention_days) 函数

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-archive-old-data');
EXCEPTION WHEN OTHERS THEN
  NULL;
END $$;

SELECT cron.schedule(
  'weekly-archive-old-data',
  '0 3 * * 0',
  $$ SELECT public.archive_old_data(90); $$
);
