-- 会员更新昵称 RPC（绕过 RLS）
CREATE OR REPLACE FUNCTION public.member_update_nickname(p_member_id uuid, p_nickname text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE members SET nickname = NULLIF(trim(p_nickname), ''), updated_at = now()
  WHERE id = p_member_id;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'MEMBER_NOT_FOUND');
  END IF;
  RETURN jsonb_build_object('success', true);
END;
$$;

-- 会员获取自身信息 RPC（用于 refreshMember，绕过 RLS）
CREATE OR REPLACE FUNCTION public.member_get_info(p_member_id uuid)
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
END;
$$;
