
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  recipient_id uuid NOT NULL,
  title text NOT NULL,
  message text NOT NULL,
  type text NOT NULL DEFAULT 'info',
  category text NOT NULL DEFAULT 'system',
  is_read boolean NOT NULL DEFAULT false,
  link text,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Employees can only see their own notifications
CREATE POLICY "notifications_select_own" ON public.notifications
  FOR SELECT USING (
    recipient_id = (SELECT p.employee_id FROM profiles p WHERE p.id = auth.uid())
  );

-- Employees can update (mark read) their own notifications
CREATE POLICY "notifications_update_own" ON public.notifications
  FOR UPDATE USING (
    recipient_id = (SELECT p.employee_id FROM profiles p WHERE p.id = auth.uid())
  );

-- Employees can delete their own notifications
CREATE POLICY "notifications_delete_own" ON public.notifications
  FOR DELETE USING (
    recipient_id = (SELECT p.employee_id FROM profiles p WHERE p.id = auth.uid())
  );

-- System/admin can insert notifications for anyone
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role) OR 
    has_role(auth.uid(), 'manager'::app_role) OR 
    has_role(auth.uid(), 'staff'::app_role)
  );

-- Index for fast lookup
CREATE INDEX idx_notifications_recipient_unread ON public.notifications(recipient_id, is_read) WHERE is_read = false;
CREATE INDEX idx_notifications_created_at ON public.notifications(created_at DESC);

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;
