/**
 * 员工端通知：表代理 + 全部已读 RPC
 */
import { fetchTableSelectRaw } from "@/api/tableProxyRaw";
import { apiDelete, apiGet, apiPatch, apiPost } from "@/api/client";

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

const LIST_PATH = "/api/data/table/notifications?select=*&order=created_at.desc&limit=50";

export async function listNotifications(): Promise<Notification[]> {
  const data = await apiGet<Notification[]>(LIST_PATH);
  return (data || []) as Notification[];
}

/** 未读条数（表代理 count，与 PendingTasksPanel 原 supabase 行为一致） */
export async function countUnreadNotificationsForRecipient(recipientId: string): Promise<number> {
  const { count } = await fetchTableSelectRaw("notifications", {
    select: "*",
    count: "exact",
    limit: "0",
    recipient_id: `eq.${recipientId}`,
    is_read: "eq.false",
  });
  return Number(count) || 0;
}

export async function patchNotificationRead(id: string): Promise<void> {
  await apiPatch(`/api/data/table/notifications?id=eq.${encodeURIComponent(id)}`, {
    data: { is_read: true },
  });
}

export async function deleteNotificationById(id: string): Promise<void> {
  await apiDelete(`/api/data/table/notifications?id=eq.${encodeURIComponent(id)}`);
}

export async function markAllNotificationsReadRpc(): Promise<void> {
  await apiPost("/api/data/rpc/mark_all_notifications_read", {});
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
    await apiPost("/api/data/table/notifications", {
      data: {
        recipient_id: params.recipientId,
        title: params.title,
        message: params.message,
        type: params.type || "info",
        category: params.category || "system",
        link: params.link,
        metadata: params.metadata || {},
      },
    });
    return true;
  } catch {
    return false;
  }
}
