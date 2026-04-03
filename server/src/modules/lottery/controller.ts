/**
 * 抽奖系统 HTTP 控制器
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { draw, getQuota } from './service.js';
import {
  listPrizes,
  upsertPrizes,
  listLotteryLogs,
  countLotteryLogsForMember,
  listAllLotteryLogs,
  countAllLotteryLogs,
  getLotterySettings,
  upsertLotterySettings,
  getMemberTenantId,
  type LotteryPrize,
} from './repository.js';
import { execute } from '../../database/index.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';

/* ──── 会员端 ──── */

export async function drawController(req: AuthenticatedRequest, res: Response) {
  const memberId = req.user?.id;
  if (!memberId) { res.status(401).json({ success: false, error: 'UNAUTHORIZED' }); return; }
  const result = await draw(memberId);
  res.json(result);
}

/**
 * 会员 JWT：仅能查自己（忽略或校验 URL 中的 memberId）。
 * 员工 JWT：必须用 URL 中的 memberId，且 memberId 必须属于员工的同一租户。
 */
export async function resolveMemberScope(
  req: AuthenticatedRequest,
  paramMemberId: string | undefined,
): Promise<{ memberId: string | null; forbidden: boolean }> {
  const uid = req.user?.id;
  if (!uid) return { memberId: null, forbidden: false };
  const param = paramMemberId?.trim() || undefined;
  if (req.user?.type === 'member') {
    if (param && param !== uid) return { memberId: null, forbidden: true };
    return { memberId: uid, forbidden: false };
  }
  if (!param) return { memberId: null, forbidden: false };
  // 员工查询：校验 memberId 归属于员工的同一租户
  if (req.user?.tenant_id) {
    const memberTenant = await getMemberTenantId(param);
    if (memberTenant !== req.user.tenant_id) {
      return { memberId: null, forbidden: true };
    }
  }
  return { memberId: param, forbidden: false };
}

export async function quotaController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.status(400).json({ success: false, error: 'MISSING_MEMBER_ID' });
    return;
  }
  const quota = await getQuota(memberId);
  res.json({ success: true, ...quota });
}

export async function myLogsController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.status(400).json({ success: false, error: 'MISSING_MEMBER_ID' });
    return;
  }
  const limit = Math.min(500, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const [logs, total] = await Promise.all([
    listLotteryLogs(memberId, limit, offset),
    countLotteryLogsForMember(memberId),
  ]);
  res.json({ success: true, logs, total });
}

export async function memberPrizesController(req: AuthenticatedRequest, res: Response) {
  const { memberId, forbidden } = await resolveMemberScope(req, req.params.memberId);
  if (forbidden) {
    res.status(403).json({ success: false, error: 'FORBIDDEN' });
    return;
  }
  if (!memberId) {
    res.setHeader('Cache-Control', 'private, no-store');
    res.json({ success: true, prizes: [], probability_notice: null });
    return;
  }
  const tenantId = await getMemberTenantId(memberId);
  const { listEnabledPrizes } = await import('./repository.js');
  const allPrizes = await listEnabledPrizes(tenantId);
  const prizes = allPrizes.slice(0, 8);
  const settings = await getLotterySettings(tenantId);
  const enabled = !settings || settings.enabled !== 0;
  const ocEn = Number(settings?.order_completed_spin_enabled) === 1;
  const ocAmt = Math.max(0, Math.floor(Number(settings?.order_completed_spin_amount) || 0));
  res.setHeader('Cache-Control', 'private, no-store');
  res.json({
    success: true,
    prizes,
    probability_notice: settings?.probability_notice ?? null,
    enabled,
    order_completed_spin_enabled: ocEn,
    order_completed_spin_amount: ocAmt,
  });
}

/* ──── 管理端 ──── */

export async function adminListPrizesController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const prizes = await listPrizes(tenantId);
  res.json({ success: true, prizes });
}

export async function adminSavePrizesController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const { prizes } = req.body;
  if (!Array.isArray(prizes)) {
    res.status(400).json({ success: false, error: 'INVALID_PRIZES' });
    return;
  }

  const total = prizes.reduce((sum: number, p: any) => sum + Number(p.probability || 0), 0);
  if (Math.abs(total - 100) > 0.001) {
    res.status(400).json({ success: false, error: 'PROBABILITY_SUM_NOT_100', total });
    return;
  }

  const hasNone = prizes.some((p: any) => p.type === 'none');
  if (!hasNone) {
    res.status(400).json({ success: false, error: 'MUST_HAVE_THANKS_PRIZE' });
    return;
  }

  const parseDisplayProbability = (v: unknown): number | null => {
    if (v == null || v === '') return null;
    const n = Number(v);
    if (!Number.isFinite(n)) return null;
    return Math.min(100, Math.max(0, n));
  };

  const normalized = prizes.map((p: Record<string, unknown>, idx: number) => ({
    id: typeof p.id === 'string' && p.id.trim() ? p.id.trim() : '',
    tenant_id: tenantId,
    name: String(p.name ?? ''),
    type: p.type as 'points' | 'custom' | 'none',
    value: Number(p.value) || 0,
    description: (p.description as string | null) ?? null,
    probability: Number(p.probability),
    display_probability: parseDisplayProbability(p.display_probability),
    image_url: (p.image_url as string | null) ?? null,
    sort_order: Number(p.sort_order) || idx,
  }));

  await upsertPrizes(tenantId, normalized as Omit<LotteryPrize, 'enabled'>[]);
  res.json({ success: true });
}

export async function adminListLogsController(req: AuthenticatedRequest, res: Response) {
  const resolved = resolveTenantIdForActivityDataList(req);
  let tenantId: string | null = null;
  if (resolved.ok) {
    tenantId = resolved.tenantId;
  } else {
    const code = (resolved.body?.error as { code?: string } | undefined)?.code;
    if (code === 'TENANT_ID_REQUIRED') {
      tenantId = (req.user?.tenant_id != null ? String(req.user.tenant_id).trim() : '') || null;
      if (!tenantId) {
        res.status(resolved.status).json(resolved.body);
        return;
      }
    } else {
      res.status(resolved.status).json(resolved.body);
      return;
    }
  }
  const limit = Math.min(2000, Math.max(1, Number(req.query.limit) || 50));
  const offset = Math.max(0, Number(req.query.offset) || 0);
  const phone = typeof req.query.phone === 'string' ? req.query.phone : '';
  const memberCode = typeof req.query.member_code === 'string' ? req.query.member_code : '';
  const filter =
    phone.trim() || memberCode.trim()
      ? { phone: phone.trim() || undefined, memberCode: memberCode.trim() || undefined }
      : undefined;
  const [rawLogs, total] = await Promise.all([
    listAllLotteryLogs(tenantId, limit, offset, filter),
    countAllLotteryLogs(tenantId, filter),
  ]);
  const logs = rawLogs.map((row) => ({
    id: String(row.id),
    member_id: String(row.member_id),
    prize_name: String(row.prize_name ?? ''),
    prize_type: String(row.prize_type ?? ''),
    prize_value: Number(row.prize_value ?? 0),
    created_at: row.created_at != null ? String(row.created_at) : '',
    phone_number: row.phone_number != null && String(row.phone_number).trim() !== '' ? String(row.phone_number).trim() : null,
    nickname: row.nickname != null && String(row.nickname).trim() !== '' ? String(row.nickname).trim() : null,
    member_code: row.member_code != null && String(row.member_code).trim() !== '' ? String(row.member_code).trim() : null,
  }));
  res.json({ success: true, logs, total });
}

export async function adminGetSettingsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const settings = await getLotterySettings(tenantId);
  res.json({
    success: true,
    daily_free_spins: settings?.daily_free_spins ?? 1,
    enabled: settings?.enabled !== 0,
    probability_notice: settings?.probability_notice ?? null,
    order_completed_spin_enabled: Number(settings?.order_completed_spin_enabled) === 1,
    order_completed_spin_amount: Math.max(0, Math.floor(Number(settings?.order_completed_spin_amount) || 0)),
  });
}

export async function adminSaveSettingsController(req: AuthenticatedRequest, res: Response) {
  const tenantId = req.user?.tenant_id ?? null;
  const body = req.body || {};
  const { daily_free_spins, enabled } = body;
  const parsed = Number(daily_free_spins);
  const n = Number.isFinite(parsed) ? Math.max(0, Math.floor(parsed)) : 1;
  const noticePatch = Object.prototype.hasOwnProperty.call(body, 'probability_notice')
    ? body.probability_notice == null || String(body.probability_notice).trim() === ''
      ? null
      : String(body.probability_notice).trim()
    : undefined;
  const orderSpin =
    Object.prototype.hasOwnProperty.call(body, 'order_completed_spin_enabled') ||
    Object.prototype.hasOwnProperty.call(body, 'order_completed_spin_amount')
      ? {
          enabled: body.order_completed_spin_enabled !== false && body.order_completed_spin_enabled !== 0,
          amount: Math.max(0, Math.floor(Number(body.order_completed_spin_amount) || 0)),
        }
      : undefined;
  await upsertLotterySettings(tenantId, n, enabled !== false, noticePatch, orderSpin);
  if (tenantId) {
    await execute(
      'UPDATE member_portal_settings SET daily_free_spins_per_day = ? WHERE tenant_id = ?',
      [n, tenantId],
    );
  }
  res.json({ success: true });
}
