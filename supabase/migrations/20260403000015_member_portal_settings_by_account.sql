-- 会员登录页按手机号/会员编号预览所属租户配置

CREATE OR REPLACE FUNCTION public.member_get_portal_settings_by_account(p_account text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_member_id uuid;
BEGIN
  SELECT m.id
    INTO v_member_id
  FROM public.members m
  WHERE m.phone_number = trim(COALESCE(p_account, ''))
     OR m.member_code = trim(COALESCE(p_account, ''))
  LIMIT 1;

  RETURN public.member_get_portal_settings(v_member_id);
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_get_portal_settings_by_account(text) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
