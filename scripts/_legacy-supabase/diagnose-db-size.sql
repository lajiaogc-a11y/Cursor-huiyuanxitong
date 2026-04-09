-- ================================================================
-- 数据库空间占用诊断脚本
-- 在 Supabase 控制台 → SQL Editor 中执行，查看各表/存储的占用
-- ================================================================

-- 1. 各表的数据 + 索引 总占用（按大小排序）
SELECT
  schemaname AS "Schema",
  relname AS "表名",
  pg_size_pretty(pg_total_relation_size(relid)) AS "总大小",
  pg_size_pretty(pg_relation_size(relid)) AS "数据大小",
  pg_size_pretty(pg_total_relation_size(relid) - pg_relation_size(relid)) AS "索引大小",
  n_live_tup AS "行数"
FROM pg_stat_user_tables
ORDER BY pg_total_relation_size(relid) DESC;

-- 2. 整个数据库总占用
SELECT pg_size_pretty(pg_database_size(current_database())) AS "数据库总大小";

-- 3. Storage 存储桶占用（Supabase 文件存储）
SELECT
  bucket_id AS "存储桶",
  COUNT(*) AS "文件数",
  pg_size_pretty(SUM(COALESCE((metadata->>'size')::bigint, 0))) AS "估算总大小"
FROM storage.objects
GROUP BY bucket_id
ORDER BY SUM(COALESCE((metadata->>'size')::bigint, 0)) DESC;

-- 4. 可能持续增长的表（按行数排序）
SELECT
  schemaname AS "Schema",
  relname AS "表名",
  n_live_tup AS "行数",
  n_dead_tup AS "死行数",
  last_vacuum AS "上次 vacuum",
  last_autovacuum AS "上次自动 vacuum"
FROM pg_stat_user_tables
WHERE n_live_tup > 0
ORDER BY n_live_tup DESC
LIMIT 20;
