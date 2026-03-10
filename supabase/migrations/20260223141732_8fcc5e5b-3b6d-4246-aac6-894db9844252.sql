
-- Create data_backups table for backup metadata and audit trail
CREATE TABLE public.data_backups (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  backup_name text NOT NULL,
  trigger_type text NOT NULL DEFAULT 'manual',
  status text NOT NULL DEFAULT 'in_progress',
  tables_backed_up text[] NOT NULL DEFAULT '{}',
  record_counts jsonb NOT NULL DEFAULT '{}'::jsonb,
  total_size_bytes bigint NOT NULL DEFAULT 0,
  storage_path text,
  error_message text,
  created_by uuid REFERENCES public.employees(id),
  created_by_name text NOT NULL DEFAULT '',
  created_at timestamptz NOT NULL DEFAULT now(),
  completed_at timestamptz
);

-- Enable RLS
ALTER TABLE public.data_backups ENABLE ROW LEVEL SECURITY;

-- RLS: Only super admins can access
CREATE POLICY "data_backups_super_admin_select" ON public.data_backups
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.employee_id = e.id
      WHERE p.id = auth.uid() AND e.is_super_admin = true
    )
  );

CREATE POLICY "data_backups_super_admin_insert" ON public.data_backups
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.employee_id = e.id
      WHERE p.id = auth.uid() AND e.is_super_admin = true
    )
  );

CREATE POLICY "data_backups_super_admin_update" ON public.data_backups
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.employee_id = e.id
      WHERE p.id = auth.uid() AND e.is_super_admin = true
    )
  );

CREATE POLICY "data_backups_super_admin_delete" ON public.data_backups
  FOR DELETE USING (
    EXISTS (
      SELECT 1 FROM employees e
      JOIN profiles p ON p.employee_id = e.id
      WHERE p.id = auth.uid() AND e.is_super_admin = true
    )
  );

-- Create private storage bucket for backup data
INSERT INTO storage.buckets (id, name, public) VALUES ('data-backups', 'data-backups', false);

-- Storage policies: authenticated users can manage files (super admin check in app layer)
CREATE POLICY "data_backups_storage_select" ON storage.objects
  FOR SELECT USING (
    bucket_id = 'data-backups' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "data_backups_storage_insert" ON storage.objects
  FOR INSERT WITH CHECK (
    bucket_id = 'data-backups' AND auth.uid() IS NOT NULL
  );

CREATE POLICY "data_backups_storage_delete" ON storage.objects
  FOR DELETE USING (
    bucket_id = 'data-backups' AND auth.uid() IS NOT NULL
  );
