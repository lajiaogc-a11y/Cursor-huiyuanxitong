import { memberInboxApi } from "@/api/memberInbox";

export type MemberInboxApiCategory = "trade" | "redemption" | "announcement" | "other";

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

export type MemberInboxPage = { items: MemberInboxApiItem[]; total: number };

function asTotal(raw: unknown): number {
  if (raw && typeof raw === "object" && typeof (raw as { total?: unknown }).total === "number") {
    return Math.max(0, Math.floor((raw as { total: number }).total));
  }
  return 0;
}

export async function fetchMemberInboxNotifications(limit = 40, offset = 0): Promise<MemberInboxPage> {
  const raw = await memberInboxApi.list({ limit, offset });
  return { items: asItems(raw), total: asTotal(raw) };
}

export async function fetchMemberInboxUnreadCount(): Promise<number> {
  const raw = await memberInboxApi.getUnreadCount();
  return asUnread(raw);
}

export async function postMemberInboxMarkRead(id: string): Promise<void> {
  await memberInboxApi.markRead(id);
}

export async function postMemberInboxMarkAllRead(): Promise<number> {
  const raw = await memberInboxApi.markAllRead();
  if (raw && typeof raw === "object" && typeof (raw as { updated?: unknown }).updated === "number") {
    return Math.max(0, Math.floor((raw as { updated: number }).updated));
  }
  return 0;
}

export async function deleteMemberInboxNotification(id: string): Promise<void> {
  await memberInboxApi.del(id);
}
