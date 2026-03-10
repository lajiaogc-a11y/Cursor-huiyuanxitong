import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect } from 'react';

export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  category: string;
  is_read: boolean;
  link: string | null;
  metadata: Record<string, any>;
  created_at: string;
}

export function useNotifications() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();

  const { data: notifications = [], isLoading } = useQuery({
    queryKey: ['notifications', employee?.id],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return (data || []) as Notification[];
    },
    enabled: !!employee?.id,
  });

  const unreadCount = notifications.filter(n => !n.is_read).length;

  // Realtime subscription
  useEffect(() => {
    if (!employee?.id) return;
    const channel = supabase
      .channel('notifications-realtime')
      .on('postgres_changes', {
        event: '*',
        schema: 'public',
        table: 'notifications',
      }, () => {
        queryClient.invalidateQueries({ queryKey: ['notifications', employee.id] });
      })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [employee?.id, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee?.id] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      const { error } = await supabase
        .from('notifications')
        .update({ is_read: true })
        .eq('is_read', false);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee?.id] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from('notifications')
        .delete()
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee?.id] });
    },
  });

  return {
    notifications,
    unreadCount,
    isLoading,
    markAsRead: markAsRead.mutate,
    markAllAsRead: markAllAsRead.mutate,
    deleteNotification: deleteNotification.mutate,
  };
}

// Helper to create a notification
export async function createNotification(params: {
  recipientId: string;
  title: string;
  message: string;
  type?: 'info' | 'warning' | 'success' | 'error';
  category?: string;
  link?: string;
  metadata?: Record<string, any>;
}) {
  const { error } = await supabase.from('notifications').insert({
    recipient_id: params.recipientId,
    title: params.title,
    message: params.message,
    type: params.type || 'info',
    category: params.category || 'system',
    link: params.link,
    metadata: params.metadata || {},
  });
  return !error;
}
