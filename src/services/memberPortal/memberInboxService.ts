import { apiDelete, apiGet, apiPost } from "@/api/client";

export type MemberInboxApiCategory = "system" | "reward" | "activity" | "invite" | "order";

export type MemberInboxApiItem = {
  id: string;
  category: MemberInboxApiCategory;
  title_zh: string;
  title_en: string;
  content_zh: string;
  content_en: string;
  link: string | null;
  read: boolean;
  created_at: string;
};

function asItems(raw: unknown): MemberInboxApiItem[] {
  if (raw && typeof raw === "object" && Array.isArray((raw as { items?: unknown }).items)) {
    return (raw as { items: MemberInboxApiItem[] }).items;
  }
  return [];
}

function asUnread(raw: unknown): number {
  if (raw && typeof raw === "object" && typeof (raw as { unread?: unknown }).unread === "number") {
    return Math.max(0, Math.floor((raw as { unread: number }).unread));
  }
  return 0;
}

export async function fetchMemberInboxNotifications(limit = 80): Promise<MemberInboxApiItem[]> {
  const raw = await apiGet<unknown>(`/api/member-inbox/notifications?limit=${encodeURIComponent(String(limit))}`);
  return asItems(raw);
}

export async function fetchMemberInboxUnreadCount(): Promise<number> {
  const raw = await apiGet<unknown>("/api/member-inbox/unread-count");
  return asUnread(raw);
}

export async function postMemberInboxMarkRead(id: string): Promise<void> {
  await apiPost<unknown>(`/api/member-inbox/notifications/${encodeURIComponent(id)}/read`, {});
}

export async function postMemberInboxMarkAllRead(): Promise<number> {
  const raw = await apiPost<unknown>("/api/member-inbox/notifications/read-all", {});
  if (raw && typeof raw === "object" && typeof (raw as { updated?: unknown }).updated === "number") {
    return Math.max(0, Math.floor((raw as { updated: number }).updated));
  }
  return 0;
}

export async function deleteMemberInboxNotification(id: string): Promise<void> {
  await apiDelete<unknown>(`/api/member-inbox/notifications/${encodeURIComponent(id)}`);
}
