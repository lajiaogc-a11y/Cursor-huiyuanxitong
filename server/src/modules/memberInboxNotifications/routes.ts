/**
 * 会员 JWT：收件箱列表 / 未读数 / 已读 / 删除
 */
import { Router, type Response } from 'express';
import { memberAuthMiddleware, type MemberAuthenticatedRequest } from '../memberAuth/middleware.js';
import {
  countUnreadMemberInbox,
  deleteMemberInboxRow,
  listMemberInbox,
  markAllMemberInboxRead,
  markMemberInboxRead,
} from './repository.js';
import { getMemberInboxNotifyPolicy } from './notifyPolicy.js';

const router = Router();

function tenantOr400(req: MemberAuthenticatedRequest, res: Response): string | null {
  const tid = req.member?.tenant_id != null ? String(req.member.tenant_id).trim() : '';
  if (!tid) {
    res.status(400).json({ success: false, error: { code: 'NO_TENANT', message: 'Member has no tenant' } });
    return null;
  }
  return tid;
}

router.get('/notifications', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response) => {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  if (!memberId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid member' } });
    return;
  }
  const lim = Math.min(200, Math.max(1, parseInt(String(req.query.limit || '80'), 10) || 80));
  const off = Math.max(0, parseInt(String(req.query.offset || '0'), 10) || 0);
  try {
    const policy = await getMemberInboxNotifyPolicy(tenantId);
    if (!policy.inboxEnabled) {
      res.json({ success: true, items: [], total: 0 });
      return;
    }
    const { items, total } = await listMemberInbox(memberId, tenantId, lim, off);
    res.json({ success: true, items, total });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'LIST_FAILED' },
    });
  }
});

router.get('/unread-count', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response) => {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  if (!memberId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid member' } });
    return;
  }
  try {
    const policy = await getMemberInboxNotifyPolicy(tenantId);
    if (!policy.inboxEnabled) {
      res.json({ success: true, unread: 0 });
      return;
    }
    const unread = await countUnreadMemberInbox(memberId, tenantId);
    res.json({ success: true, unread });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'COUNT_FAILED' },
    });
  }
});

router.post('/notifications/:id/read', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response) => {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  const id = String(req.params.id || '').trim();
  if (!memberId || !id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
    return;
  }
  try {
    const ok = await markMemberInboxRead(memberId, tenantId, id);
    res.json({ success: true, updated: ok });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'UPDATE_FAILED' },
    });
  }
});

router.post('/notifications/read-all', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response) => {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  if (!memberId) {
    res.status(401).json({ success: false, error: { code: 'UNAUTHORIZED', message: 'Invalid member' } });
    return;
  }
  try {
    const n = await markAllMemberInboxRead(memberId, tenantId);
    res.json({ success: true, updated: n });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'UPDATE_FAILED' },
    });
  }
});

router.delete('/notifications/:id', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response) => {
  const tenantId = tenantOr400(req, res);
  if (!tenantId) return;
  const memberId = String(req.member?.id || '').trim();
  const id = String(req.params.id || '').trim();
  if (!memberId || !id) {
    res.status(400).json({ success: false, error: { code: 'BAD_REQUEST', message: 'Invalid id' } });
    return;
  }
  try {
    const ok = await deleteMemberInboxRow(memberId, tenantId, id);
    res.json({ success: true, deleted: ok });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'DELETE_FAILED' },
    });
  }
});

export default router;
