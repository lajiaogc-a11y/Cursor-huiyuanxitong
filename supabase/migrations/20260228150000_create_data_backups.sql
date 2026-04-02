-- Create data_backups table (idempotent)
CREATE TABLE IF NOT EXISTS public.data_backups (
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

-- RLS policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_backups' AND policyname='data_backups_super_admin_select') THEN
    CREATE POLICY "data_backups_super_admin_select" ON public.data_backups
      FOR SELECT USING (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN profiles p ON p.employee_id = e.id
          WHERE p.id = auth.uid() AND e.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_backups' AND policyname='data_backups_super_admin_insert') THEN
    CREATE POLICY "data_backups_super_admin_insert" ON public.data_backups
      FOR INSERT WITH CHECK (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN profiles p ON p.employee_id = e.id
          WHERE p.id = auth.uid() AND e.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_backups' AND policyname='data_backups_super_admin_update') THEN
    CREATE POLICY "data_backups_super_admin_update" ON public.data_backups
      FOR UPDATE USING (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN profiles p ON p.employee_id = e.id
          WHERE p.id = auth.uid() AND e.is_super_admin = true
        )
      );
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE tablename='data_backups' AND policyname='data_backups_super_admin_delete') THEN
    CREATE POLICY "data_backups_super_admin_delete" ON public.data_backups
      FOR DELETE USING (
        EXISTS (
          SELECT 1 FROM employees e
          JOIN profiles p ON p.employee_id = e.id
          WHERE p.id = auth.uid() AND e.is_super_admin = true
        )
      );
  END IF;
END $$;

-- Create storage bucket (idempotent)
INSERT INTO storage.buckets (id, name, public)
VALUES ('data-backups', 'data-backups', false)
ON CONFLICT (id) DO NOTHING;

-- Storage policies (idempotent)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='data_backups_storage_select') THEN
    CREATE POLICY "data_backups_storage_select" ON storage.objects
      FOR SELECT USING (bucket_id = 'data-backups' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='data_backups_storage_insert') THEN
    CREATE POLICY "data_backups_storage_insert" ON storage.objects
      FOR INSERT WITH CHECK (bucket_id = 'data-backups' AND auth.uid() IS NOT NULL);
  END IF;
END $$;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='storage' AND tablename='objects' AND policyname='data_backups_storage_delete') THEN
    CREATE POLICY "data_backups_storage_delete" ON storage.objects
      FOR DELETE USING (bucket_id = 'data-backups' AND auth.uid() IS NOT NULL);
  END IF;
END $$;
