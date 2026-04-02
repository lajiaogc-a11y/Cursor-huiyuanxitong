-- 会员门户：客服坐席列表（JSON 数组），与前端 MemberPortalSettings.customer_service_agents 对应
-- 若表结构已由 fix_columns.sql / fix_schema.mjs 更新，可忽略本脚本。

ALTER TABLE member_portal_settings
  ADD COLUMN IF NOT EXISTS customer_service_agents JSON NULL
  AFTER customer_service_link;
