-- 临时允许 data-backups 桶公开读取，用于数据恢复（恢复完成后可删除此策略）
-- 备份路径为 UUID，不易被猜测
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='data_backups_public_select') THEN
    CREATE POLICY "data_backups_public_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'data-backups');
  END IF;
END $$;
