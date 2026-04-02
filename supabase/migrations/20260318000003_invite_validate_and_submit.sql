-- 邀请落地页：验证邀请码并提交（避免 RLS 限制对 members 的读取）

CREATE OR REPLACE FUNCTION validate_invite_and_submit(p_code text, p_invitee_phone text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_inviter_id uuid;
BEGIN
  IF trim(p_code) = '' OR trim(p_invitee_phone) = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_INPUT');
  END IF;

  SELECT id INTO v_inviter_id FROM members WHERE member_code = trim(p_code) LIMIT 1;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'INVALID_CODE');
  END IF;

  INSERT INTO member_invites (inviter_id, invitee_phone, invite_code, status)
  VALUES (v_inviter_id, trim(p_invitee_phone), trim(p_code), 'pending');

  RETURN jsonb_build_object('success', true);
EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
