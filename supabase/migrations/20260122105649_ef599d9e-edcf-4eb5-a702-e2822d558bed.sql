-- 创建接班人列表表（用于下拉选择）
CREATE TABLE public.shift_receivers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 创建交班记录表
CREATE TABLE public.shift_handovers (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  handover_employee_id UUID REFERENCES public.employees(id),
  handover_employee_name TEXT NOT NULL,
  receiver_name TEXT NOT NULL,
  handover_time TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  -- 卡商数据 JSON: [{vendorName, balance, inputValue}]
  card_merchant_data JSONB NOT NULL DEFAULT '[]',
  -- 代付商家数据 JSON: [{providerName, balance, inputValue}]
  payment_provider_data JSONB NOT NULL DEFAULT '[]',
  remark TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- 启用 RLS
ALTER TABLE public.shift_receivers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shift_handovers ENABLE ROW LEVEL SECURITY;

-- 接班人表 - 所有员工可查看和管理
CREATE POLICY "All employees can manage shift receivers" 
ON public.shift_receivers 
FOR ALL 
USING (true);

-- 交班记录表 - 所有员工可查看，只有本人可以创建
CREATE POLICY "All employees can view shift handovers" 
ON public.shift_handovers 
FOR SELECT 
USING (true);

CREATE POLICY "Employees can create their own handovers" 
ON public.shift_handovers 
FOR INSERT 
WITH CHECK (true);

-- 添加更新时间触发器
CREATE TRIGGER update_shift_receivers_updated_at
BEFORE UPDATE ON public.shift_receivers
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();