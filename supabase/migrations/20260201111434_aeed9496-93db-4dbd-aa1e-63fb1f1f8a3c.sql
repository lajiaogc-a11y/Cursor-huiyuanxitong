-- 创建余额变动明细表
CREATE TABLE public.balance_change_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  merchant_type TEXT NOT NULL, -- 'card_vendor' 或 'payment_provider'
  merchant_name TEXT NOT NULL, -- 商家名称
  change_type TEXT NOT NULL, -- 变动类型
  change_amount DECIMAL NOT NULL, -- 变动金额（正负表示增减）
  balance_before DECIMAL NOT NULL DEFAULT 0, -- 变动前余额
  balance_after DECIMAL NOT NULL DEFAULT 0, -- 变动后余额
  related_id TEXT, -- 关联ID（订单号/提款ID/充值ID/赠送ID）
  remark TEXT, -- 备注说明
  operator_id UUID, -- 操作人ID
  operator_name TEXT, -- 操作人姓名
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 添加索引
CREATE INDEX idx_balance_change_logs_merchant ON public.balance_change_logs(merchant_type, merchant_name);
CREATE INDEX idx_balance_change_logs_created_at ON public.balance_change_logs(created_at DESC);
CREATE INDEX idx_balance_change_logs_change_type ON public.balance_change_logs(change_type);

-- 启用 RLS
ALTER TABLE public.balance_change_logs ENABLE ROW LEVEL SECURITY;

-- 员工可查看
CREATE POLICY "balance_change_logs_employee_select" ON public.balance_change_logs
  FOR SELECT USING (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

-- 员工可插入
CREATE POLICY "balance_change_logs_employee_insert" ON public.balance_change_logs
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

-- 仅管理员可删除
CREATE POLICY "balance_change_logs_admin_delete" ON public.balance_change_logs
  FOR DELETE USING (has_role(auth.uid(), 'admin'::app_role));

-- 添加外键关系注释
COMMENT ON TABLE public.balance_change_logs IS '商家余额变动明细表，记录卡商和代付商家的每次余额变动';
COMMENT ON COLUMN public.balance_change_logs.merchant_type IS '商家类型：card_vendor（卡商）或 payment_provider（代付商家）';
COMMENT ON COLUMN public.balance_change_logs.change_type IS '变动类型：initial_balance, order_income, withdrawal, recharge, gift_income 等';