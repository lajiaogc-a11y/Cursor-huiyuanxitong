-- 将 pg_net 扩展从 public schema 迁移到 extensions schema
-- 先删除再重新创建在正确的 schema 中
DROP EXTENSION IF EXISTS pg_net;
CREATE EXTENSION pg_net SCHEMA extensions;