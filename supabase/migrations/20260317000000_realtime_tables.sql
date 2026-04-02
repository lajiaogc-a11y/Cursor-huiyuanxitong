-- 为实时更新系统启用 Realtime 的表
-- 用于 RealtimeManager 监听数据变化并推送 update 事件

DO $$
DECLARE
  t text;
  tables text[] := ARRAY['shared_data_store', 'points_ledger', 'ledger_transactions', 'tasks', 'task_items', 'audit_records'];
BEGIN
  FOREACH t IN ARRAY tables
  LOOP
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = t
    ) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
      RAISE NOTICE 'Added % to supabase_realtime', t;
    END IF;
  END LOOP;
END $$;
