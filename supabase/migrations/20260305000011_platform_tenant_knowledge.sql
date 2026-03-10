-- 平台总管理员查看租户时，获取该租户的公司文档（知识库）

CREATE OR REPLACE FUNCTION public.platform_get_tenant_knowledge_categories(p_tenant_id uuid)
RETURNS SETOF public.knowledge_categories
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT kc.*
  FROM public.knowledge_categories kc
  WHERE kc.is_active = true
    AND (
      kc.visibility = 'public'
      OR kc.created_by IN (SELECT id FROM public.employees WHERE tenant_id = p_tenant_id)
    )
  ORDER BY kc.sort_order;
END;
$fn$;

CREATE OR REPLACE FUNCTION public.platform_get_tenant_knowledge_articles(p_category_id uuid, p_tenant_id uuid)
RETURNS SETOF public.knowledge_articles
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
BEGIN
  IF NOT public.is_platform_super_admin(auth.uid()) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT ka.*
  FROM public.knowledge_articles ka
  WHERE ka.category_id = p_category_id
    AND (
      ka.visibility = 'public'
      OR ka.created_by IN (SELECT id FROM public.employees WHERE tenant_id = p_tenant_id)
    )
  ORDER BY ka.sort_order;
END;
$fn$;
