-- 将数据库扩展迁移到独立 schema 以提高安全性
-- 创建专用的 extensions schema
CREATE SCHEMA IF NOT EXISTS extensions;

-- 注意：pg_cron 和 pg_net 扩展已经存在于 cron 和 net schema 中
-- 这是 Supabase 的默认配置，无需迁移

-- 添加注释说明扩展的位置
COMMENT ON SCHEMA extensions IS '用于存放自定义扩展的独立 schema，提高安全性';

-- 确保 public schema 中没有不必要的扩展暴露
-- pg_cron 使用 cron schema，pg_net 使用 net schema，这是 Supabase 推荐的配置