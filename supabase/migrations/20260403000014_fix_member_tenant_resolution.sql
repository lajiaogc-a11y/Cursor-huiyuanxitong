-- 修复会员租户解析：优先使用 members.tenant_id
-- 原逻辑仅依赖 creator_id / recorder_id，导致历史会员大量解析不到租户

CREATE OR REPLACE FUNCTION public.member_resolve_tenant_id(p_member_id uuid)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- 1) 优先：members.tenant_id（最直接、最可靠）
  SELECT m.tenant_id
    INTO v_tenant_id
  FROM public.members m
  WHERE m.id = p_member_id
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- 2) 兼容旧数据：creator / recorder 对应员工租户
  SELECT COALESCE(ec.tenant_id, er.tenant_id)
    INTO v_tenant_id
  FROM public.members m
  LEFT JOIN public.employees ec ON ec.id = m.creator_id
  LEFT JOIN public.employees er ON er.id = m.recorder_id
  WHERE m.id = p_member_id
  LIMIT 1;

  IF v_tenant_id IS NOT NULL THEN
    RETURN v_tenant_id;
  END IF;

  -- 3) 最后兜底：member_activity.tenant_id
  SELECT ma.tenant_id
    INTO v_tenant_id
  FROM public.member_activity ma
  WHERE ma.member_id = p_member_id
    AND ma.tenant_id IS NOT NULL
  LIMIT 1;

  RETURN v_tenant_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.member_resolve_tenant_id(uuid) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
