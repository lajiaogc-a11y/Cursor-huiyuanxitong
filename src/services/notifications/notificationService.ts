/**
 * 员工端通知：表代理 + 全部已读 RPC
 */
import { fetchFilteredCount } from "@/api/adminStatsApi";
import {
  listNotificationsData,
  patchNotificationReadData,
  deleteNotificationData,
  createNotificationData,
} from "@/api/notificationData";
import { notificationsApi } from "@/api/notifications";

export interface Notification {
  id: string;
  recipient_id: string;
  title: string;
  message: string;
  type: "info" | "warning" | "success" | "error";
  category: string;
  is_read: boolean;
  link: string | null;
  metadata: Record<string, unknown>;
  created_at: string;
}

export async function listNotifications(): Promise<Notification[]> {
  const data = await listNotificationsData<Notification[]>();
  return (data || []) as Notification[];
}

/** 未读条数 */
export async function countUnreadNotificationsForRecipient(recipientId: string): Promise<number> {
  return fetchFilteredCount('notifications', [
    { column: 'recipient_id', op: 'eq', value: recipientId },
    { column: 'is_read', op: 'eq', value: 'false' },
  ]);
}

export async function patchNotificationRead(id: string): Promise<void> {
  await patchNotificationReadData(id);
}

export async function deleteNotificationById(id: string): Promise<void> {
  await deleteNotificationData(id);
}

export async function markAllNotificationsReadRpc(): Promise<void> {
  await notificationsApi.markAllRead();
}

export async function createNotification(params: {
  recipientId: string;
  title: string;
  message: string;
  type?: "info" | "warning" | "success" | "error";
  category?: string;
  link?: string;
  metadata?: Record<string, unknown>;
}): Promise<boolean> {
  try {
    await createNotificationData({
      recipient_id: params.recipientId,
      title: params.title,
      message: params.message,
      type: params.type || "info",
      category: params.category || "system",
      link: params.link,
      metadata: params.metadata || {},
    });
    return true;
  } catch {
    return false;
  }
}
