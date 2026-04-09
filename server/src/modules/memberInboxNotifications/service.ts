/**
 * Member Inbox Notifications Service — 业务逻辑封装
 */
import {
  countUnreadMemberInbox,
  deleteMemberInboxRow,
  listMemberInbox,
  markAllMemberInboxRead,
  markMemberInboxRead,
} from './repository.js';
import { getMemberInboxNotifyPolicy } from './notifyPolicy.js';

export async function listMemberInboxService(
  memberId: string,
  tenantId: string,
  limit: number,
  offset: number,
): Promise<{ items: unknown[]; total: number }> {
  const policy = await getMemberInboxNotifyPolicy(tenantId);
  if (!policy.inboxEnabled) return { items: [], total: 0 };
  return listMemberInbox(memberId, tenantId, limit, offset);
}

export async function countUnreadMemberInboxService(
  memberId: string,
  tenantId: string,
): Promise<number> {
  const policy = await getMemberInboxNotifyPolicy(tenantId);
  if (!policy.inboxEnabled) return 0;
  return countUnreadMemberInbox(memberId, tenantId);
}

export async function markMemberInboxReadService(
  memberId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return markMemberInboxRead(memberId, tenantId, id);
}

export async function markAllMemberInboxReadService(
  memberId: string,
  tenantId: string,
): Promise<number> {
  return markAllMemberInboxRead(memberId, tenantId);
}

export async function deleteMemberInboxRowService(
  memberId: string,
  tenantId: string,
  id: string,
): Promise<boolean> {
  return deleteMemberInboxRow(memberId, tenantId, id);
}
