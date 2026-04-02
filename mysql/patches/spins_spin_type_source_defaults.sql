-- 修复：会员抽奖 INSERT 未带 spin_type/source 时报错
-- Field 'spin_type' doesn't have a default value
-- 在服务器 MySQL 执行一次即可（与是否部署新后端无关）

ALTER TABLE spins
  MODIFY COLUMN spin_type VARCHAR(50) NOT NULL DEFAULT 'wheel';

ALTER TABLE spins
  MODIFY COLUMN source VARCHAR(100) NOT NULL DEFAULT 'member_portal';
