-- 确保会员 tenant_id 正确关联，使后台发布与前端会员端同步
-- 1. INSERT 时若 tenant_id 为空，从 creator_id/recorder_id 自动推断
-- 2. 补充回填：从 member_activity 推断尚未关联的会员

-- 触发器函数：INSERT 时自动设置 tenant_id
CREATE OR REPLACE FUNCTION public.trg_members_set_tenant_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.tenant_id IS NULL AND (NEW.creator_id IS NOT NULL OR NEW.recorder_id IS NOT NULL) THEN
    NEW.tenant_id := COALESCE(
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = NEW.creator_id LIMIT 1),
      (SELECT e.tenant_id FROM public.employees e WHERE e.id = NEW.recorder_id LIMIT 1)
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_members_set_tenant_id ON public.members;
CREATE TRIGGER trg_members_set_tenant_id
  BEFORE INSERT ON public.members
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_members_set_tenant_id();

-- 补充回填：从 member_activity 推断（无 creator/recorder 的会员）
UPDATE public.members m
SET tenant_id = (
  SELECT ma.tenant_id
  FROM public.member_activity ma
  WHERE ma.member_id = m.id
    AND ma.tenant_id IS NOT NULL
  LIMIT 1
)
WHERE m.tenant_id IS NULL
  AND EXISTS (
    SELECT 1 FROM public.member_activity ma
    WHERE ma.member_id = m.id AND ma.tenant_id IS NOT NULL
  );

NOTIFY pgrst, 'reload schema';
