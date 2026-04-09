import { useQuery, useQueryClient, useMutation } from '@tanstack/react-query';
import {
  deleteNotificationById,
  listNotifications,
  markAllNotificationsReadRpc,
  patchNotificationRead,
  type Notification,
} from '@/services/notifications/notificationService';
import { useAuth } from '@/contexts/AuthContext';
import { useEffect, useMemo } from 'react';

export type { Notification };

/** 同一公告曾重复插入时，列表按 announcement_id 只保留一条（保留先出现的即最新） */
function dedupeAnnouncementNotifications(rows: Notification[]): Notification[] {
  const seen = new Set<string>();
  const out: Notification[] = [];
  for (const n of rows) {
    const aid =
      n.category === 'announcement' && n.metadata && typeof n.metadata === 'object'
        ? (n.metadata as { announcement_id?: unknown }).announcement_id
        : undefined;
    const key =
      aid != null && String(aid).trim() !== '' ? `ann:${String(aid)}` : n.id;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(n);
  }
  return out;
}

export function useNotifications() {
  const { employee } = useAuth();
  const queryClient = useQueryClient();

  const { data: rawNotifications = [], isLoading } = useQuery({
    queryKey: ['notifications', employee?.id],
    queryFn: () => listNotifications(),
    enabled: !!employee?.id,
  });

  const notifications = useMemo(() => dedupeAnnouncementNotifications(rawNotifications), [rawNotifications]);

  const unreadCount = notifications.filter(n => !n.is_read).length;

  useEffect(() => {
    if (!employee?.id) return;
    const interval = setInterval(() => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee.id] });
    }, 30000);
    return () => { clearInterval(interval); };
  }, [employee?.id, queryClient]);

  const markAsRead = useMutation({
    mutationFn: async (id: string) => {
      await patchNotificationRead(id);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee?.id] });
    },
  });

  const markAllAsRead = useMutation({
    mutationFn: async () => {
      await markAllNotificationsReadRpc();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['notifications', employee?.id] });
    },
  });

  const deleteNotification = useMutation({
    mutationFn: async (id: string) => {
      await deleteNotificationById(id);
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

export { createNotification } from '@/services/notifications/notificationService';
