-- 任务海报存储桶：用于保存汇率海报图片，避免大 base64 存入数据库
INSERT INTO storage.buckets (id, name, public)
VALUES ('task-posters', 'task-posters', true)
ON CONFLICT (id) DO NOTHING;

-- 认证用户可上传（幂等）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='task_posters_storage_insert') THEN
    CREATE POLICY "task_posters_storage_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'task-posters' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

-- 公开可读（幂等）
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='task_posters_storage_select') THEN
    CREATE POLICY "task_posters_storage_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'task-posters');
  END IF;
END $$;
