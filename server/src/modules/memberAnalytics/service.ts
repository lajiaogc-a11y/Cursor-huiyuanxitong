/**
 * 网站统计与数据清理业务
 */
import { getShanghaiDateString } from '../../lib/shanghaiTime.js';
import {
  fetchWebsiteStatsRepository,
  getDataCleanupSettingsRepository,
  updateDataCleanupSettingsRepository,
  selectMembersMatchingCleanupRepository,
  purgeMembersByPolicyRepository,
  listTenantsWithCleanupEnabledRepository,
} from './repository.js';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_RANGE_DAYS = 366;

type StatsDateErrorCode = 'STATS_DATE_INVALID' | 'STATS_RANGE_INVALID_ORDER' | 'STATS_RANGE_TOO_LONG';

function parseISODate(s: string): { ok: true; t: number } | { ok: false; code: StatsDateErrorCode } {
  if (!DATE_RE.test(s.trim())) return { ok: false, code: 'STATS_DATE_INVALID' };
  const t = Date.parse(`${s.trim()}T12:00:00+08:00`);
  if (Number.isNaN(t)) return { ok: false, code: 'STATS_DATE_INVALID' };
  return { ok: true, t };
}

/** 错误码供前端 i18n；message 仅作日志/调试（英文） */
export function validateStatsDateRange(
  startDate: string,
  endDate: string,
): { ok: true } | { ok: false; code: StatsDateErrorCode; message: string } {
  const a = parseISODate(startDate);
  const b = parseISODate(endDate);
  if (!a.ok) return { ok: false, code: a.code, message: 'invalid date format, use YYYY-MM-DD' };
  if (!b.ok) return { ok: false, code: b.code, message: 'invalid date format, use YYYY-MM-DD' };
  if (a.t > b.t) return { ok: false, code: 'STATS_RANGE_INVALID_ORDER', message: 'start_date must be <= end_date' };
  const days = (b.t - a.t) / 86400000 + 1;
  if (days > MAX_RANGE_DAYS) {
    return { ok: false, code: 'STATS_RANGE_TOO_LONG', message: `range too long (max ${MAX_RANGE_DAYS} days)` };
  }
  return { ok: true };
}

export async function getWebsiteStatsService(params: {
  tenantId: string;
  startDate?: string | null;
  endDate?: string | null;
}) {
  const today = getShanghaiDateString();
  const startDate = (params.startDate || '').trim() || today;
  const endDate = (params.endDate || '').trim() || today;
  const vr = validateStatsDateRange(startDate, endDate);
  if (!vr.ok) {
    return { success: false as const, error: vr.message, errorCode: vr.code };
  }
  const row = await fetchWebsiteStatsRepository({
    tenantId: params.tenantId,
    rangeStartDate: startDate,
    rangeEndDate: endDate,
  });
  const n = (v: string | number | null | undefined) => Number(v) || 0;
  return {
    success: true as const,
    data: {
      scope: 'invite_register' as const,
      scope_description: '仅统计来自前端自助注册链接的会员数据（registration_source = invite_register）',
      data_source_description: '统计范围：前端邀请注册链接注册的用户，不含后台手工创建、批量导入等来源',
      calendar_today: today,
      range: { start_date: startDate, end_date: endDate },
      online_now: n(row.online_now),
      today: {
        login_users: n(row.today_login_users),
        register_count: n(row.today_register_count),
        trading_users: n(row.today_trading_users),
      },
      in_range: {
        login_users: n(row.range_login_users),
        register_count: n(row.range_register_count),
        trading_users: n(row.range_trading_users),
        total_transaction_amount: n(row.range_total_tx),
        card_value_sum: n(row.range_card_value_sum),
      },
      cumulative_invite_registers: n(row.cumulative_invite_registers),
      /** 仅含 invite_register 来源的累积会员数 */
      cumulative_members: n(row.cumulative_invite_registers),
    },
  };
}

const DEFAULT_CLEANUP_SETTINGS = {
  enabled: false,
  no_trade_months: null as number | null,
  no_login_months: null as number | null,
  max_points_below: null as number | null,
};

export async function getDataCleanupSettingsService(tenantId: string) {
  try {
    const row = await getDataCleanupSettingsRepository(tenantId);
    if (!row) {
      // 与 getMemberPortalSettingsForEmployee 一致：尚无门户设置行时视为默认规则，避免前端 404「请求失败」
      return { success: true as const, data: { ...DEFAULT_CLEANUP_SETTINGS } };
    }
    return {
      success: true as const,
      data: {
        enabled: !!row.data_cleanup_enabled,
        no_trade_months: row.data_cleanup_no_trade_months,
        no_login_months: row.data_cleanup_no_login_months,
        max_points_below: row.data_cleanup_max_points != null ? Number(row.data_cleanup_max_points) : null,
      },
    };
  } catch (e) {
    const msg = (e as Error)?.message || 'cleanup settings query failed';
    console.error('[memberAnalytics] getDataCleanupSettingsService', tenantId, e);
    // 缺列/表异常时仍返回默认规则，避免会员门户「数据管理」整页不可用；保存时会走 ensure 行并写列
    if (/Unknown column|doesn't exist|ER_BAD_FIELD_ERROR/i.test(msg)) {
      return { success: true as const, data: { ...DEFAULT_CLEANUP_SETTINGS } };
    }
    throw e;
  }
}

export async function updateDataCleanupSettingsService(
  tenantId: string,
  body: {
    enabled: boolean;
    no_trade_months: number | null;
    no_login_months: number | null;
    max_points_below: number | null;
  },
) {
  if (body.enabled) {
    if (body.no_trade_months == null || body.no_trade_months < 1) {
      return {
        success: false as const,
        error: 'no_trade_months required (>=1) when enabled',
        errorCode: 'CLEANUP_NO_TRADE_MONTHS_REQUIRED' as const,
      };
    }
    if (body.no_login_months == null || body.no_login_months < 1) {
      return {
        success: false as const,
        error: 'no_login_months required (>=1) when enabled',
        errorCode: 'CLEANUP_NO_LOGIN_MONTHS_REQUIRED' as const,
      };
    }
    if (body.max_points_below == null || Number.isNaN(Number(body.max_points_below))) {
      return {
        success: false as const,
        error: 'max_points_below required when enabled',
        errorCode: 'CLEANUP_MAX_POINTS_REQUIRED' as const,
      };
    }
  }
  await updateDataCleanupSettingsRepository(tenantId, {
    enabled: body.enabled,
    noTradeMonths: body.no_trade_months,
    noLoginMonths: body.no_login_months,
    maxPointsBelow: body.max_points_below,
  });
  return { success: true as const };
}

export async function previewCleanupService(tenantId: string) {
  const ids = await selectMembersMatchingCleanupRepository(tenantId);
  return { success: true as const, data: { count: ids.length } };
}

export async function runCleanupService(tenantId: string) {
  const ids = await selectMembersMatchingCleanupRepository(tenantId);
  const affected = await purgeMembersByPolicyRepository(ids);
  return { success: true as const, data: { matched: ids.length, purged: affected } };
}

export async function runCleanupForAllEnabledTenants(): Promise<void> {
  const tenantIds = await listTenantsWithCleanupEnabledRepository();
  for (const tid of tenantIds) {
    try {
      const r = await runCleanupService(tid);
      if (r.success && r.data.purged > 0) {
        console.log(`[member_analytics] auto cleanup tenant ${tid}: purged ${r.data.purged}`);
      }
    } catch (e) {
      console.warn(`[member_analytics] auto cleanup tenant ${tid} failed:`, (e as Error).message);
    }
  }
}
