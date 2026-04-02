-- 活动赠送表添加 gift_number 字段，用于生成可读的赠送编号
-- 格式: GIFT-YYMMDD-XXXX (如 GIFT-250309-0001)

ALTER TABLE public.activity_gifts
ADD COLUMN IF NOT EXISTS gift_number text;

-- 为已有记录生成 gift_number（按创建时间排序）
DO $$
DECLARE
  r RECORD;
  v_date_prefix text;
  v_seq int := 0;
  v_prev_date text := '';
BEGIN
  FOR r IN
    SELECT id, created_at FROM public.activity_gifts ORDER BY created_at ASC
  LOOP
    v_date_prefix := to_char(r.created_at AT TIME ZONE 'UTC', 'YYMMDD');
    IF v_date_prefix != v_prev_date THEN
      v_seq := 0;
      v_prev_date := v_date_prefix;
    END IF;
    v_seq := v_seq + 1;
    UPDATE public.activity_gifts
    SET gift_number = 'GIFT-' || v_date_prefix || '-' || lpad(v_seq::text, 4, '0')
    WHERE id = r.id;
  END LOOP;
END $$;

-- 添加唯一约束（新生成的需保证唯一）
CREATE UNIQUE INDEX IF NOT EXISTS idx_activity_gifts_gift_number ON public.activity_gifts(gift_number) WHERE gift_number IS NOT NULL;

-- 创建生成唯一赠送编号的函数
CREATE OR REPLACE FUNCTION generate_unique_gift_number()
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  v_date_prefix text;
  v_candidate text;
  v_exists boolean;
  v_attempt int := 0;
BEGIN
  v_date_prefix := to_char(now() AT TIME ZONE 'UTC', 'YYMMDD');
  
  FOR v_attempt IN 1..10 LOOP
    v_candidate := 'GIFT-' || v_date_prefix || '-' || lpad(floor(random() * 10000)::int::text, 4, '0');
    
    SELECT EXISTS(SELECT 1 FROM public.activity_gifts WHERE gift_number = v_candidate) INTO v_exists;
    IF NOT v_exists THEN
      RETURN v_candidate;
    END IF;
  END LOOP;
  
  -- 冲突时加时间戳
  RETURN 'GIFT-' || v_date_prefix || '-' || extract(epoch from now())::bigint::text;
END;
$$;

-- 触发器：插入时若 gift_number 为空则自动生成
CREATE OR REPLACE FUNCTION set_activity_gift_number_if_null()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.gift_number IS NULL OR NEW.gift_number = '' THEN
    NEW.gift_number := generate_unique_gift_number();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_activity_gifts_set_gift_number ON public.activity_gifts;
CREATE TRIGGER trg_activity_gifts_set_gift_number
  BEFORE INSERT ON public.activity_gifts
  FOR EACH ROW
  EXECUTE FUNCTION set_activity_gift_number_if_null();
