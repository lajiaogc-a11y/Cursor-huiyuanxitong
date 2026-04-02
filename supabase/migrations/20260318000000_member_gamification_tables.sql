-- 尼日利亚会员游戏化系统：members 扩展 + 新表
-- 整合方案阶段 1

-- 1. members 表扩展
ALTER TABLE members ADD COLUMN IF NOT EXISTS nickname text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS wallet_balance numeric DEFAULT 0;
ALTER TABLE members ADD COLUMN IF NOT EXISTS initial_password_sent_at timestamptz;
COMMENT ON COLUMN members.nickname IS '会员昵称';
COMMENT ON COLUMN members.password_hash IS '会员密码哈希（bcrypt）';
COMMENT ON COLUMN members.wallet_balance IS '钱包余额（NGN）';
COMMENT ON COLUMN members.initial_password_sent_at IS '初始密码发送时间';

-- 2. 奖品池
CREATE TABLE IF NOT EXISTS prizes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text NOT NULL,
  points_required numeric DEFAULT 0,
  stock integer DEFAULT -1,
  auto_issue boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);
COMMENT ON TABLE prizes IS '奖品池：airtime/cash/gift_card/phone/points';
COMMENT ON COLUMN prizes.stock IS '-1 表示无限库存';

-- 3. 抽奖记录
CREATE TABLE IF NOT EXISTS spins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id),
  spin_type text NOT NULL,
  source text NOT NULL,
  result text,
  prize_id uuid REFERENCES prizes(id),
  status text DEFAULT 'issued',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_spins_member_id ON spins(member_id);
CREATE INDEX IF NOT EXISTS idx_spins_created_at ON spins(created_at);
COMMENT ON TABLE spins IS '抽奖记录：wheel/scratch/lottery';

-- 4. 兑奖记录
CREATE TABLE IF NOT EXISTS redemptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id),
  prize_id uuid REFERENCES prizes(id),
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now(),
  processed_by uuid REFERENCES employees(id)
);
CREATE INDEX IF NOT EXISTS idx_redemptions_member_id ON redemptions(member_id);

-- 5. 每日签到（按 member_id + date 唯一）
CREATE TABLE IF NOT EXISTS check_ins (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id),
  phone_number text,
  check_in_date date NOT NULL,
  consecutive_days integer DEFAULT 1,
  reward_type text,
  reward_value numeric,
  created_at timestamptz DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_member_date ON check_ins(member_id, check_in_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_check_ins_phone_date ON check_ins(phone_number, check_in_date) WHERE phone_number IS NOT NULL;

-- 6. 会员邀请（自助邀请链接）
CREATE TABLE IF NOT EXISTS member_invites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  inviter_id uuid REFERENCES members(id),
  invitee_phone text NOT NULL,
  invite_code text UNIQUE,
  status text DEFAULT 'pending',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_invites_inviter ON member_invites(inviter_id);
CREATE INDEX IF NOT EXISTS idx_member_invites_invitee ON member_invites(invitee_phone);

-- 7. 钱包流水
CREATE TABLE IF NOT EXISTS member_transactions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  member_id uuid REFERENCES members(id),
  type text NOT NULL,
  amount numeric NOT NULL,
  status text DEFAULT 'completed',
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_member_transactions_member ON member_transactions(member_id);

-- 8. OTP 验证（可选，生产环境建议用 Redis）
CREATE TABLE IF NOT EXISTS otp_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  phone_number text NOT NULL,
  otp_code text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_otp_phone_expires ON otp_verifications(phone_number, expires_at);

-- 9. 会员密码验证 RPC
CREATE OR REPLACE FUNCTION verify_member_password(p_phone text, p_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM members
  WHERE phone_number = trim(p_phone) OR member_code = trim(p_phone)
  LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  IF v_member.password_hash IS NULL OR v_member.password_hash = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'NO_PASSWORD_SET');
  END IF;
  IF v_member.password_hash LIKE '$2%' AND v_member.password_hash = extensions.crypt(trim(p_password), v_member.password_hash) THEN
    RETURN jsonb_build_object(
      'success', true,
      'member', jsonb_build_object(
        'id', v_member.id,
        'member_code', v_member.member_code,
        'phone_number', v_member.phone_number,
        'nickname', v_member.nickname,
        'member_level', v_member.member_level,
        'wallet_balance', COALESCE(v_member.wallet_balance, 0)
      )
    );
  END IF;
  RETURN jsonb_build_object('success', false, 'error', 'WRONG_PASSWORD');
END;
$$;

-- 10. 会员设置密码 RPC（会员自己改密或首次设置）
CREATE OR REPLACE FUNCTION set_member_password(p_member_id uuid, p_old_password text, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member members%ROWTYPE;
BEGIN
  SELECT * INTO v_member FROM members WHERE id = p_member_id LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  IF v_member.password_hash IS NOT NULL AND v_member.password_hash != '' THEN
    IF p_old_password IS NULL OR trim(p_old_password) = '' THEN
      RETURN jsonb_build_object('success', false, 'error', 'OLD_PASSWORD_REQUIRED');
    END IF;
    IF v_member.password_hash NOT LIKE '$2%' OR v_member.password_hash != extensions.crypt(trim(p_old_password), v_member.password_hash) THEN
      RETURN jsonb_build_object('success', false, 'error', 'WRONG_PASSWORD');
    END IF;
  END IF;
  IF length(trim(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASSWORD_TOO_SHORT');
  END IF;
  UPDATE members SET
    password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
    updated_at = now()
  WHERE id = p_member_id;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 11. 管理员设置会员初始密码 RPC（员工后台使用）
CREATE OR REPLACE FUNCTION admin_set_member_initial_password(p_member_id uuid, p_new_password text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF length(trim(p_new_password)) < 6 THEN
    RETURN jsonb_build_object('success', false, 'error', 'PASSWORD_TOO_SHORT');
  END IF;
  UPDATE members SET
    password_hash = extensions.crypt(trim(p_new_password), extensions.gen_salt('bf')),
    initial_password_sent_at = now(),
    updated_at = now()
  WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 12. 插入默认奖品示例（仅当表为空时）
DO $$
BEGIN
  IF (SELECT COUNT(*) FROM prizes) = 0 THEN
    INSERT INTO prizes (name, type, points_required, stock, auto_issue) VALUES
      ('₦500 Airtime', 'airtime', 50, -1, true),
      ('₦1000 Airtime', 'airtime', 100, -1, true),
      ('1 Free Spin', 'spin', 10, -1, true),
      ('₦100 Cash', 'cash', 200, 100, false);
  END IF;
END $$;
