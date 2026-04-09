/**
 * MemberInboxNotifications Controller
 */
import type { Response } from 'express';
import type { MemberAuthenticatedRequest } from '../memberAuth/middleware.js';
import {
  listMemberInboxService,
  countUnreadMemberInboxService,
  markMemberInboxReadService,
  markAllMemberInboxReadService,
  deleteMemberInboxRowService,
} from './service.js';

function tenantOr400(req: MemberAuthenticatedRequest, res: Response): string | null {
  const tid = req.member?.tenant_id != null ? String(req.member.tenant_id).trim() : '';
  if (!tid) {
    res.status(400).json({ success: false, error: { code: 'NO_TENANT', message: 'Member has no tenant' } });
    return null;
  }
  return tid;
}

function memberIdOr401(req: MemberAuthenticatedRequest, res: Response): string | null {
  const id = String(req.member?.id || '').trim();
  if (!id) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid member' } });
    return null;
  }
  return id;
}

export async function listNotificationsController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = memberIdOr401(req, res);
  if (!memberId) return;
  const lim = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '80'), 10) || 80));
  const off = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
  try {
    const { items, total } = await listMemberInboxService(memberId, tenantId, lim, off);
    res.json({ success: true, items, total });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: (e as Error).message || 'LIST_FAILED' } });
  }
}

export async function unreadCountController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = memberIdOr401(req, res);
  if (!memberId) return;
  try {
    const unread = await countUnreadMemberInboxService(memberId, tenantId);
    res.json({ success: true, unread });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: (e as Error).message || 'COUNT_FAILED' } });
  }
}

export async function markReadController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  const id = String(req.params.id || '').trim();
  if (!memberId || !id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
    return;
  }
  try {
    const ok = await markMemberInboxReadService(memberId, tenantId, id);
    res.json({ success: true, updated: ok });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: (e as Error).message || 'UPDATE_FAILED' } });
  }
}

export async function markAllReadController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = memberIdOr401(req, res);
  if (!memberId) return;
  try {
    const n = await markAllMemberInboxReadService(memberId, tenantId);
    res.json({ success: true, updated: n });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: (e as Error).message || 'UPDATE_FAILED' } });
  }
}

export async function deleteNotificationController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  const id = String(req.params.id || '').trim();
  if (!memberId || !id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
    return;
  }
  try {
    const ok = await deleteMemberInboxRowService(memberId, tenantId, id);
    res.json({ success: true, deleted: ok });
  } catch (e) {
    res.status(500).json({ success: false, error: { code: 'INTERNAL', message: (e as Error).message || 'DELETE_FAILED' } });
  }
}
