-- 会员积分商城兑换幂等：同一会员 + 同一 client_request_id 仅生效一次（需配合 server tableProxy）
-- 若列或索引已存在，可忽略重复执行报错

ALTER TABLE redemptions
  ADD COLUMN client_request_id VARCHAR(64) NULL COMMENT '会员端幂等键';

CREATE UNIQUE INDEX uk_redemptions_member_client_req ON redemptions (member_id, client_request_id);
