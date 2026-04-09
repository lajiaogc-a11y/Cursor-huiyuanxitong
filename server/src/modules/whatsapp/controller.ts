/**
 * WhatsApp 工作台 Controller — HTTP 薄层
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import * as svc from './service.js';
import {
  normalizePhoneSchema,
  memberByPhoneSchema,
  conversationContextSchema,
  conversationStatusQuerySchema,
  updateConversationStatusSchema,
  bindMemberPhoneSchema,
  addNoteSchema,
} from './validators.js';

function requireStaff(req: AuthenticatedRequest, res: Response): boolean {
  if (!req.user || req.user.type === 'member') {
    res.status(403).json({ success: false, error: { code: 'FORBIDDEN', message: 'Staff only' } });
    return false;
  }
  return true;
}

function badRequest(res: Response, message: string) {
  res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message } });
}

export async function normalizePhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = normalizePhoneSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }
  const result = svc.normalizePhone(parsed.data.phone, parsed.data.countryCode);
  res.json({ success: true, data: result });
}

export async function memberByPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = memberByPhoneSchema.safeParse({ phone: req.query.phone });
  if (!parsed.success) { badRequest(res, 'phone query parameter required'); return; }
  const result = await svc.matchMemberByPhone(parsed.data.phone, req.user?.tenant_id ?? null);
  res.json({ success: true, data: result });
}

export async function conversationContextController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = conversationContextSchema.safeParse({
    phone: req.query.phone,
    accountId: req.query.accountId,
  });
  if (!parsed.success) { badRequest(res, 'phone query parameter required'); return; }
  const result = await svc.getConversationContext(
    parsed.data.phone, req.user?.tenant_id ?? null, parsed.data.accountId,
  );
  res.json({ success: true, data: result });
}

export async function getConversationStatusController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = conversationStatusQuerySchema.safeParse({
    accountId: req.query.accountId,
    phone: req.query.phone,
  });
  if (!parsed.success) { badRequest(res, 'accountId and phone required'); return; }
  const result = await svc.getStatus(parsed.data.accountId, parsed.data.phone, req.user?.tenant_id ?? null);
  res.json({ success: true, data: result });
}

export async function updateConversationStatusController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = updateConversationStatusSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }
  const result = await svc.updateStatus({
    ...parsed.data,
    tenantId: req.user?.tenant_id ?? null,
  });
  res.json({ success: true, data: result });
}

export async function bindMemberPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = bindMemberPhoneSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }
  await svc.bindMember(
    parsed.data.accountId, parsed.data.phone, parsed.data.memberId, req.user?.tenant_id ?? null,
  );
  res.json({ success: true, data: { bound: true } });
}

export async function listConversationStatusesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
  const statusFilter = req.query.status ? String(req.query.status) as Parameters<typeof svc.listStatuses>[2] : undefined;
  const rows = await svc.listStatuses(req.user?.tenant_id ?? null, accountId, statusFilter);
  res.json({ success: true, data: rows });
}

export async function addNoteController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = addNoteSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }
  const result = await svc.addNote({
    accountId: parsed.data.accountId,
    phone: parsed.data.phone,
    note: parsed.data.note,
    tenantId: req.user?.tenant_id ?? null,
    operatorId: req.user?.id ?? null,
    operatorName: req.user?.username ?? null,
  });
  res.json({ success: true, data: result });
}

export async function listNotesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const accountId = String(req.query.accountId || '');
  const phone = String(req.query.phone || '');
  if (!accountId || !phone) { badRequest(res, 'accountId and phone required'); return; }
  const rows = await svc.listNotes(accountId, phone, req.user?.tenant_id ?? null);
  res.json({ success: true, data: rows });
}
