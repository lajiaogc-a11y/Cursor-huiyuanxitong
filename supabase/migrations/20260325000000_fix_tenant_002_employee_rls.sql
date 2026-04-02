-- 修复租户 002 员工看不到数据：RLS 策略增加 002 孤儿数据可见性
-- 当 002 员工查看时，也允许看到 creator/sales/recorder 已删除或 tenant_id 为 null 的订单/会员

-- ========== orders 表 ==========
DROP POLICY IF EXISTS orders_employee_select ON public.orders;
CREATE POLICY orders_employee_select ON public.orders FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        -- 正常：creator 或 sales 属于同租户
        EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
        OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
        -- 002 孤儿：当前用户是 002 员工，且 creator/sales 已删除或 tenant_id 为 null 或皆空
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (orders.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.creator_id LIMIT 1) IS NULL
            ))
            OR (orders.sales_user_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.sales_user_id LIMIT 1) IS NULL
            ))
            OR (orders.creator_id IS NULL AND orders.sales_user_id IS NULL)
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS orders_employee_update ON public.orders;
CREATE POLICY orders_employee_update ON public.orders FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
        OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (orders.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.creator_id LIMIT 1) IS NULL
            ))
            OR (orders.sales_user_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.sales_user_id LIMIT 1) IS NULL
            ))
            OR (orders.creator_id IS NULL AND orders.sales_user_id IS NULL)
          )
        )
      )
    )
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS orders_admin_manager_delete ON public.orders;
CREATE POLICY orders_admin_manager_delete ON public.orders FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id AND e2.tenant_id = e.tenant_id)
        OR EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id AND e2.tenant_id = e.tenant_id)
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (orders.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.creator_id LIMIT 1) IS NULL
            ))
            OR (orders.sales_user_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = orders.sales_user_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = orders.sales_user_id LIMIT 1) IS NULL
            ))
            OR (orders.creator_id IS NULL AND orders.sales_user_id IS NULL)
          )
        )
      )
    )
  )
);

-- ========== members 表 ==========
DROP POLICY IF EXISTS members_employee_select ON public.members;
CREATE POLICY members_employee_select ON public.members FOR SELECT TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
        OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (members.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.creator_id LIMIT 1) IS NULL
            ))
            OR (members.recorder_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.recorder_id LIMIT 1) IS NULL
            ))
            OR (members.creator_id IS NULL AND members.recorder_id IS NULL)
          )
        )
      )
    )
  )
);

DROP POLICY IF EXISTS members_employee_update ON public.members;
CREATE POLICY members_employee_update ON public.members FOR UPDATE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
        OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (members.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.creator_id LIMIT 1) IS NULL
            ))
            OR (members.recorder_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.recorder_id LIMIT 1) IS NULL
            ))
            OR (members.creator_id IS NULL AND members.recorder_id IS NULL)
          )
        )
      )
    )
  )
)
WITH CHECK (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role) OR public.has_role(auth.uid(), 'staff'::app_role))
);

DROP POLICY IF EXISTS members_employee_delete ON public.members;
CREATE POLICY members_employee_delete ON public.members FOR DELETE TO authenticated
USING (
  (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'manager'::app_role))
  AND (
    public.is_platform_super_admin(auth.uid())
    OR EXISTS (
      SELECT 1 FROM public.profiles p
      JOIN public.employees e ON e.id = p.employee_id
      WHERE p.id = auth.uid() AND e.tenant_id IS NOT NULL
      AND (
        (members.creator_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id AND e2.tenant_id = e.tenant_id))
        OR (members.recorder_id IS NOT NULL AND EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id AND e2.tenant_id = e.tenant_id))
        OR (
          e.tenant_id = (SELECT id FROM public.tenants WHERE tenant_code = '002' LIMIT 1)
          AND (
            (members.creator_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.creator_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.creator_id LIMIT 1) IS NULL
            ))
            OR (members.recorder_id IS NOT NULL AND (
              NOT EXISTS (SELECT 1 FROM public.employees e2 WHERE e2.id = members.recorder_id)
              OR (SELECT e2.tenant_id FROM public.employees e2 WHERE e2.id = members.recorder_id LIMIT 1) IS NULL
            ))
            OR (members.creator_id IS NULL AND members.recorder_id IS NULL)
          )
        )
      )
    )
  )
);
