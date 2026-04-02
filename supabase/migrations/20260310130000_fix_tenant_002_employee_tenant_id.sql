-- 修复租户 002 等数据不可见问题
-- 原因：orders/members 通过 creator_id、sales_user_id、recorder_id 关联 employees.tenant_id 过滤
-- 若员工 tenant_id 为 null 或错误，则订单/会员不会被任何租户看到
--
-- 修复策略：
-- 1. 租户管理员：确保 admin_employee_id 对应的员工 tenant_id 正确
-- 2. 其他员工：从订单/会员中推断（creator/sales/recorder 的 partner 有 tenant_id 时，同步给 null 的员工）

-- ========== 1. 修复租户管理员的 tenant_id ==========
UPDATE public.employees e
SET tenant_id = t.id
FROM public.tenants t
WHERE t.admin_employee_id = e.id
  AND (e.tenant_id IS NULL OR e.tenant_id != t.id);

-- ========== 2. 从订单推断：creator_id 或 sales_user_id 为 null 员工的 tenant_id ==========
-- 对每个 tenant_id 为 null 的员工，若其作为 creator 或 sales 的订单中，另一角色有 tenant_id，则同步
WITH order_inferred AS (
  SELECT DISTINCT ON (e.id) e.id AS emp_id, COALESCE(e_sales.tenant_id, e_creator.tenant_id) AS tenant_id
  FROM public.employees e
  JOIN public.orders o ON (o.creator_id = e.id OR o.sales_user_id = e.id)
  LEFT JOIN public.employees e_creator ON o.creator_id = e_creator.id AND e_creator.tenant_id IS NOT NULL
  LEFT JOIN public.employees e_sales ON o.sales_user_id = e_sales.id AND e_sales.tenant_id IS NOT NULL
  WHERE e.tenant_id IS NULL
    AND (e_sales.tenant_id IS NOT NULL OR e_creator.tenant_id IS NOT NULL)
  ORDER BY e.id, COALESCE(e_sales.tenant_id, e_creator.tenant_id)
)
UPDATE public.employees e
SET tenant_id = oi.tenant_id
FROM order_inferred oi
WHERE e.id = oi.emp_id AND e.tenant_id IS NULL;

-- ========== 3. 从会员推断：creator_id 或 recorder_id 为 null 员工的 tenant_id ==========
WITH member_inferred AS (
  SELECT DISTINCT ON (e.id) e.id AS emp_id, COALESCE(e_rec.tenant_id, e_cre.tenant_id) AS tenant_id
  FROM public.employees e
  JOIN public.members m ON (m.creator_id = e.id OR m.recorder_id = e.id)
  LEFT JOIN public.employees e_cre ON m.creator_id = e_cre.id AND e_cre.tenant_id IS NOT NULL
  LEFT JOIN public.employees e_rec ON m.recorder_id = e_rec.id AND e_rec.tenant_id IS NOT NULL
  WHERE e.tenant_id IS NULL
    AND (e_rec.tenant_id IS NOT NULL OR e_cre.tenant_id IS NOT NULL)
  ORDER BY e.id, COALESCE(e_rec.tenant_id, e_cre.tenant_id)
)
UPDATE public.employees e
SET tenant_id = mi.tenant_id
FROM member_inferred mi
WHERE e.id = mi.emp_id AND e.tenant_id IS NULL;
