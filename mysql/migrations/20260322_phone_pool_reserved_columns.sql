-- 号码池提取/归还依赖 reserved_by、reserved_at；phone_reservations 需写入 tenant_id
-- 在已有库执行一次（若列已存在会报错，可忽略或手动注释已存在语句）

ALTER TABLE phone_pool
  ADD COLUMN reserved_by CHAR(36) NULL COMMENT '当前预留该号码的员工' AFTER assigned_member_id,
  ADD COLUMN reserved_at DATETIME(3) NULL AFTER reserved_by;
