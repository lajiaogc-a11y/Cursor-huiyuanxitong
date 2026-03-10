-- 为 tenants 表添加 admin_employee_id 列（若已存在则跳过）
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS admin_employee_id uuid REFERENCES public.employees(id);
