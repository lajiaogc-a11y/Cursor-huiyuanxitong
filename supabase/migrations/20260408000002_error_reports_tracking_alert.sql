-- Error report tracking enhancement + basic alert notification
-- Phase-1: unified error_id and admin/manager alert on insert

ALTER TABLE public.error_reports
  ADD COLUMN IF NOT EXISTS error_id text,
  ADD COLUMN IF NOT EXISTS metadata jsonb NOT NULL DEFAULT '{}'::jsonb;

CREATE INDEX IF NOT EXISTS idx_error_reports_error_id ON public.error_reports(error_id);

CREATE OR REPLACE FUNCTION public.notify_error_report_admins()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Derive tenant from reporter employee
  IF NEW.employee_id IS NOT NULL THEN
    SELECT tenant_id INTO v_tenant_id
    FROM public.employees
    WHERE id = NEW.employee_id
    LIMIT 1;
  END IF;

  -- Notify platform super admins
  INSERT INTO public.notifications (
    recipient_id,
    title,
    message,
    type,
    category,
    link,
    metadata
  )
  SELECT
    e.id,
    '系统异常告警',
    COALESCE('错误ID: ' || NEW.error_id || '；', '') || LEFT(COALESCE(NEW.error_message, '未知异常'), 180),
    'warning',
    'system',
    '/staff/admin/settings/system-health',
    jsonb_build_object(
      'source', 'error_reports',
      'error_report_id', NEW.id,
      'error_id', NEW.error_id,
      'url', NEW.url
    )
  FROM public.employees e
  WHERE e.status = 'active'
    AND e.is_super_admin = true;

  -- Notify tenant admin/manager (if tenant can be resolved)
  IF v_tenant_id IS NOT NULL THEN
    INSERT INTO public.notifications (
      recipient_id,
      title,
      message,
      type,
      category,
      link,
      metadata
    )
    SELECT
      e.id,
      '租户异常告警',
      COALESCE('错误ID: ' || NEW.error_id || '；', '') || LEFT(COALESCE(NEW.error_message, '未知异常'), 180),
      'warning',
      'system',
      '/staff/settings?tab=production',
      jsonb_build_object(
        'source', 'error_reports',
        'error_report_id', NEW.id,
        'error_id', NEW.error_id,
        'tenant_id', v_tenant_id,
        'url', NEW.url
      )
    FROM public.employees e
    WHERE e.status = 'active'
      AND e.tenant_id = v_tenant_id
      AND e.role IN ('admin', 'manager');
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_notify_error_report_admins ON public.error_reports;
CREATE TRIGGER trg_notify_error_report_admins
AFTER INSERT ON public.error_reports
FOR EACH ROW
EXECUTE FUNCTION public.notify_error_report_admins();
