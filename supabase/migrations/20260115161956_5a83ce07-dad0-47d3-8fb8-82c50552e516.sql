-- 添加外币汇率字段到orders表
-- 用于存储订单提交时的实际外币汇率（奈拉汇率/赛地汇率/USDT汇率）
-- 与exchange_rate（卡片汇率）分开存储
ALTER TABLE public.orders ADD COLUMN foreign_rate numeric;

-- 添加注释说明字段用途
COMMENT ON COLUMN public.orders.foreign_rate IS '外币汇率：奈拉模式存储奈拉汇率，赛地模式存储赛地汇率，USDT模式存储USDT汇率（保留4位小数）';
COMMENT ON COLUMN public.orders.exchange_rate IS '卡片汇率：汇率计算器中用户输入的卡片汇率';