-- 将 data-backups 桶设为公开，以便通过 public URL 读取（用于恢复）
UPDATE storage.buckets SET public = true WHERE id = 'data-backups';
