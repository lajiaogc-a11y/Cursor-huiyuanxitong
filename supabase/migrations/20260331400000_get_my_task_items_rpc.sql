-- 任务列表/看板 RPC：获取当前员工分配到的任务项（含海报 data_url）
-- 解决 profiles.employee_id 为空时 RLS 拦截导致加载失败

CREATE OR REPLACE FUNCTION public.get_my_task_items()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $fn$
DECLARE
  v_employee_id uuid;
  v_tenant_id uuid;
  v_result jsonb := '[]'::jsonb;
BEGIN
  SELECT e.id, e.tenant_id INTO v_employee_id, v_tenant_id
  FROM profiles p
  JOIN employees e ON e.id = p.employee_id
  WHERE p.id = auth.uid()
  LIMIT 1;

  IF v_employee_id IS NULL THEN
    SELECT e.id, e.tenant_id INTO v_employee_id, v_tenant_id
    FROM profiles p
    JOIN employees e ON e.username = split_part(COALESCE(p.email, ''), '@', 1)
    WHERE p.id = auth.uid() AND COALESCE(p.email, '') != ''
    LIMIT 1;
  END IF;

  IF v_employee_id IS NULL THEN
    RETURN v_result;
  END IF;

  SELECT COALESCE(jsonb_agg(grp ORDER BY first_created DESC), '[]'::jsonb) INTO v_result
  FROM (
    SELECT
      jsonb_build_object(
        'task', to_jsonb(t.*),
        'items', COALESCE(
          (SELECT jsonb_agg(
            to_jsonb(ti.*) || jsonb_build_object('poster_data_url',
              (SELECT tp.data_url FROM task_posters tp WHERE tp.id = ti.poster_id LIMIT 1))
            ORDER BY ti.created_at DESC
          )
          FROM task_items ti
          WHERE ti.task_id = t.id
            AND ti.assigned_to = v_employee_id
            AND ti.status IN ('todo', 'done')),
          '[]'::jsonb
        ),
        'doneCount', (
          SELECT count(*)::int FROM task_items ti
          WHERE ti.task_id = t.id AND ti.assigned_to = v_employee_id
            AND ti.status = 'done'
        )
      ) AS grp,
      (SELECT min(ti.created_at) FROM task_items ti WHERE ti.task_id = t.id AND ti.assigned_to = v_employee_id) AS first_created
    FROM tasks t
    WHERE t.status = 'open'
      AND (t.tenant_id = v_tenant_id OR public.is_platform_super_admin(auth.uid()))
      AND EXISTS (
        SELECT 1 FROM task_items ti
        WHERE ti.task_id = t.id AND ti.assigned_to = v_employee_id
          AND ti.status IN ('todo', 'done')
      )
  ) sub;

  RETURN COALESCE(v_result, '[]'::jsonb);
END;
$fn$;

GRANT EXECUTE ON FUNCTION public.get_my_task_items() TO authenticated;
