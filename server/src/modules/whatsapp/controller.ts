/**
 * WhatsApp 工作台 Controller — HTTP 薄层
 *
 * Step 11: 新增审计日志（复用 auditLogService）
 *
 * 职责：解析 request → 调用 service → 格式化 response
 * 禁止：业务逻辑、直接 SQL
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import * as svc from './service.js';
import { auditLogService } from '../data/operationLogsService.js';
import {
  normalizePhoneSchema,
  memberByPhoneSchema,
  conversationContextSchema,
  conversationStatusQuerySchema,
  updateConversationStatusSchema,
  bindMemberPhoneSchema,
  unbindMemberPhoneSchema,
  searchMembersSchema,
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

// ── POST /normalize-phone ──

export async function normalizePhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = normalizePhoneSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }

  const result = svc.normalizePhone(parsed.data.phone, parsed.data.countryCode);
  res.json({
    success: true,
    data: { rawPhone: result.original, normalizedPhone: result.normalized },
  });
}

// ── GET /member-by-phone ──

export async function memberByPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = memberByPhoneSchema.safeParse({ phone: req.query.phone });
  if (!parsed.success) { badRequest(res, 'phone query parameter required'); return; }

  const result = await svc.matchMemberByPhone(parsed.data.phone, req.user?.tenant_id ?? null);
  res.json({ success: true, data: result });
}

// ── GET /conversation-context ──

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

// ── GET /conversation-status ──

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

// ── POST /conversation-status ──

export async function updateConversationStatusController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = updateConversationStatusSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }

  const result = await svc.updateStatus({
    ...parsed.data,
    tenantId: req.user?.tenant_id ?? null,
  });

  auditLogService({
    operator_id: req.user?.id ?? null,
    operator_account: req.user?.username ?? 'unknown',
    operator_role: req.user?.type ?? 'staff',
    module: 'whatsapp',
    operation_type: 'update_conversation_status',
    object_id: `${parsed.data.accountId}|${parsed.data.phone}`,
    object_description: `状态变更: ${parsed.data.status}`,
    before_data: null,
    after_data: { status: parsed.data.status, phone: parsed.data.phone },
    ip_address: req.ip ?? null,
  });

  res.json({ success: true, data: result });
}

// ── POST /bind-member-phone ──

export async function bindMemberPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = bindMemberPhoneSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }

  const result = await svc.bindMember({
    accountId: parsed.data.accountId,
    phone: parsed.data.phone,
    memberId: parsed.data.memberId,
    tenantId: req.user?.tenant_id ?? null,
    operatorId: req.user?.id ?? null,
    note: parsed.data.note,
  });

  auditLogService({
    operator_id: req.user?.id ?? null,
    operator_account: req.user?.username ?? 'unknown',
    operator_role: req.user?.type ?? 'staff',
    module: 'whatsapp',
    operation_type: 'bind_member_phone',
    object_id: parsed.data.memberId,
    object_description: `绑定会员 ${parsed.data.memberId} → ${parsed.data.phone}`,
    before_data: null,
    after_data: { phone: parsed.data.phone, memberId: parsed.data.memberId },
    ip_address: req.ip ?? null,
  });

  res.json({ success: true, data: result });
}

// ── POST /unbind-member-phone ──

export async function unbindMemberPhoneController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = unbindMemberPhoneSchema.safeParse(req.body);
  if (!parsed.success) { badRequest(res, parsed.error.issues[0]?.message ?? 'Invalid input'); return; }

  await svc.unbindMember(parsed.data.phone, req.user?.tenant_id ?? null);

  auditLogService({
    operator_id: req.user?.id ?? null,
    operator_account: req.user?.username ?? 'unknown',
    operator_role: req.user?.type ?? 'staff',
    module: 'whatsapp',
    operation_type: 'unbind_member_phone',
    object_id: parsed.data.phone,
    object_description: `解绑手机号 ${parsed.data.phone}`,
    before_data: null,
    after_data: { phone: parsed.data.phone },
    ip_address: req.ip ?? null,
  });

  res.json({ success: true, data: { unbound: true } });
}

// ── GET /search-members ──

export async function searchMembersController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const parsed = searchMembersSchema.safeParse({ keyword: req.query.keyword });
  if (!parsed.success) { badRequest(res, 'keyword (min 2 chars) required'); return; }

  const results = await svc.searchMembers(parsed.data.keyword, req.user?.tenant_id ?? null);
  res.json({ success: true, data: results });
}

// ── GET /conversation-statuses ──

export async function listConversationStatusesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const accountId = req.query.accountId ? String(req.query.accountId) : undefined;
  const statusFilter = req.query.status
    ? String(req.query.status) as Parameters<typeof svc.listStatuses>[2]
    : undefined;
  const rows = await svc.listStatuses(req.user?.tenant_id ?? null, accountId, statusFilter);
  res.json({ success: true, data: rows });
}

// ── POST /notes ──

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

// ── GET /notes ──

export async function listNotesController(req: AuthenticatedRequest, res: Response): Promise<void> {
  if (!requireStaff(req, res)) return;
  const accountId = String(req.query.accountId || '');
  const phone = String(req.query.phone || '');
  if (!accountId || !phone) { badRequest(res, 'accountId and phone required'); return; }

  const rows = await svc.listNotes(accountId, phone, req.user?.tenant_id ?? null);
  res.json({ success: true, data: rows });
}
