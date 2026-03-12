-- 员工后台「设置密码」功能：确保 admin_set_member_initial_password RPC 存在
-- 若 20260318000000 已执行，本迁移仅会 REPLACE 函数；若未执行，会先添加必要列再创建函数

-- 1. 确保 members 表有密码相关列（与游戏化迁移兼容）
ALTER TABLE members ADD COLUMN IF NOT EXISTS password_hash text;
ALTER TABLE members ADD COLUMN IF NOT EXISTS initial_password_sent_at timestamptz;

-- 2. 管理员设置会员初始密码 RPC（员工后台使用）
CREATE OR REPLACE FUNCTION public.admin_set_member_initial_password(p_member_id uuid, p_new_password text)
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

-- 3. 通知 PostgREST 刷新 schema 缓存，使 RPC 立即可用
NOTIFY pgrst, 'reload schema';
