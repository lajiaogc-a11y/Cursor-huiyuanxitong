/**
 * 后台：抽奖假人「模拟设置」— 批量昵称 → 存库 → 失效进程缓存
 * GET：requireEmployee；POST：路由层 requireAdminRole
 */
import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import { resolveTenantIdForActivityDataList } from '../memberPortalSettings/activityDataTenant.js';
import {
  buildPoolFromRawText,
  deleteLotterySimFakeSettings,
  getLotterySimFakeSettingsRow,
  upsertLotterySimFakeSettings,
} from './simFakeSettingsRepository.js';
import { invalidateSpinFakePoolCache } from './simFakePoolResolver.js';
import { coerceMysqlJsonToArray, parseNicknameLines } from './spinFakeNicknameParse.js';

export async function adminGetSimFakeSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { tenantId } = resolved;
  const row = await getLotterySimFakeSettingsRow(tenantId);
  if (!row) {
    res.json({
      success: true,
      nicknames_raw: '',
      pool_count: 100,
      nickname_tokens_count: 0,
      source: 'builtin' as const,
      updated_at: null,
    });
    return;
  }
  const arr = coerceMysqlJsonToArray(row.pool_json as unknown);
  const poolCount = arr?.length === 100 ? 100 : arr?.length ?? 0;
  const nickname_tokens_count = parseNicknameLines(row.nicknames_raw ?? '').length;
  res.json({
    success: true,
    nicknames_raw: row.nicknames_raw ?? '',
    pool_count: poolCount,
    nickname_tokens_count,
    source: 'custom' as const,
    updated_at: row.updated_at instanceof Date ? row.updated_at.toISOString() : String(row.updated_at),
  });
}

export async function adminSaveSimFakeSettingsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const resolved = resolveTenantIdForActivityDataList(req);
  if (!resolved.ok) {
    res.status(resolved.status).json(resolved.body);
    return;
  }
  const { tenantId } = resolved;
  const raw = typeof req.body?.nicknames_raw === 'string' ? req.body.nicknames_raw : '';
  const trimmed = raw.trim();

  if (!trimmed) {
    await deleteLotterySimFakeSettings(tenantId);
    invalidateSpinFakePoolCache(tenantId);
    res.json({ success: true, source: 'builtin', pool_count: 100, nickname_tokens_count: 0 });
    return;
  }

  const pool = buildPoolFromRawText(raw);
  if (!pool || pool.length === 0) {
    res.status(400).json({ success: false, error: { code: 'INVALID_NICKNAMES', message: '无有效昵称，请至少输入一行' } });
    return;
  }

  await upsertLotterySimFakeSettings(tenantId, raw, pool);
  invalidateSpinFakePoolCache(tenantId);
  res.json({
    success: true,
    source: 'custom',
    pool_count: 100,
    nickname_tokens_count: parseNicknameLines(raw).length,
  });
}
