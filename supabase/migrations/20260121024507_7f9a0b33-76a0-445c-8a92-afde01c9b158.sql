-- 添加排序字段到 vendors 和 payment_providers 表
ALTER TABLE public.vendors ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;
ALTER TABLE public.payment_providers ADD COLUMN IF NOT EXISTS sort_order integer DEFAULT 0;

-- 为现有记录设置初始排序顺序（按创建时间）
WITH numbered_vendors AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.vendors
)
UPDATE public.vendors v
SET sort_order = nv.rn
FROM numbered_vendors nv
WHERE v.id = nv.id;

WITH numbered_providers AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as rn
  FROM public.payment_providers
)
UPDATE public.payment_providers p
SET sort_order = np.rn
FROM numbered_providers np
WHERE p.id = np.id;