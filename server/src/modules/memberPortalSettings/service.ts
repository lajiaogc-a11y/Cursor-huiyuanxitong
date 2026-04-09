/**
 * 会员门户设置服务 - MySQL 版本
 */
import { randomUUID } from 'crypto';
import { query, queryOne, execute } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import {
  DEFAULT_PRIVACY_EN,
  DEFAULT_PRIVACY_ZH,
  DEFAULT_TERMS_EN,
  DEFAULT_TERMS_ZH,
} from './legalDefaults.js';
import { parseMemberInboxCopyTemplatesFromDb, fillMemberInboxCopyDefaults } from '../memberInboxNotifications/copyTemplates.js';

export interface CreateVersionResult {
  success: boolean;
  version_id?: string;
  version_no?: number;
  is_applied?: boolean;
  error?: string;
}

export interface GetSettingsResult {
  success: boolean;
  tenant_id?: string | null;
  tenant_name?: string;
  settings?: Record<string, unknown>;
  /** 当前已应用到 member_portal_settings 的版本号（member_portal_settings_versions.is_applied=1） */
  published_version_no?: number | null;
  /** member_portal_settings.updated_at，用于多设备检测「已发布基线」是否被其他端更新 */
  settings_updated_at?: string | null;
  error?: string;
}

export interface VersionItem {
  id: string;
  version_no: number;
  note: string | null;
  effective_at: string | null;
  is_applied: boolean;
  approval_status?: string;
  review_note?: string | null;
  created_at: string;
  applied_at: string | null;
}

async function resolveEmployee(employeeId: string) {
  const rows = await query<{ tenant_id: string; role: string; is_super_admin: number; tenant_code: string }>(
    `SELECT e.tenant_id, e.role, COALESCE(e.is_super_admin, 0) as is_super_admin,
            COALESCE(t.tenant_code, '') as tenant_code
     FROM employees e LEFT JOIN tenants t ON t.id = e.tenant_id
     WHERE e.id = ? LIMIT 1`,
    [employeeId]
  );
  if (!rows.length) return null;
  const r = rows[0];
  return { ...r, is_super_admin: !!r.is_super_admin };
}

/**
 * 前端保存门户设置时，仅允许写入真实存在的列，避免 payload 多字段导致 Unknown column。
 */
const MEMBER_PORTAL_SETTINGS_WRITABLE_COLUMNS = new Set<string>([
  'company_name',
  'logo_url',
  'theme_primary_color',
  'welcome_title',
  'welcome_subtitle',
  'announcement',
  'announcements',
  'enable_spin',
  'enable_invite',
  'enable_check_in',
  'enable_share_reward',
  'checkin_reward_base',
  'checkin_reward_streak_3',
  'checkin_reward_streak_7',
  'share_reward_spins',
  'daily_share_reward_limit',
  'invite_reward_spins',
  'daily_invite_reward_limit',
  'daily_free_spins_per_day',
  'login_badges',
  'footer_text',
  'home_banners',
  'show_announcement_popup',
  'announcement_popup_frequency',
  'announcement_popup_title',
  'announcement_popup_content',
  'home_points_balance_hint_zh',
  'home_points_balance_hint_en',
  'points_mall_redeem_rules_title_zh',
  'points_mall_redeem_rules_title_en',
  'points_mall_redeem_daily_unlimited_zh',
  'points_mall_redeem_daily_unlimited_en',
  'points_mall_redeem_lifetime_unlimited_zh',
  'points_mall_redeem_lifetime_unlimited_en',
  'customer_service_label',
  'customer_service_link',
  'customer_service_agents',
  'home_module_order',
  'tenant_name',
  'invite_link_prefix',
  'login_carousel_slides',
  'login_carousel_interval_sec',
  'home_banners_carousel_interval_sec',
  'terms_of_service_zh',
  'terms_of_service_en',
  'privacy_policy_zh',
  'privacy_policy_en',
  'registration_require_legal_agreement',
  'home_first_trade_contact_zh',
  'home_first_trade_contact_en',
  'enable_member_inbox',
  'member_inbox_notify_order_spin',
  'member_inbox_notify_mall_redemption',
  'member_inbox_notify_announcement',
  'member_inbox_copy_templates',
  'poster_headline_zh',
  'poster_headline_en',
  'poster_subtext_zh',
  'poster_subtext_en',
  'poster_footer_zh',
  'poster_footer_en',
  'poster_frame_id',
  'poster_custom_bg_url',
]);

/** MySQL JSON 列可能为 Buffer / 字符串 / 已解析数组 — 统一解析为 JS 数组 */
function parseJsonArray(v: unknown): unknown[] {
  let raw: unknown = v;
  if (raw == null) return [];
  if (Buffer.isBuffer(raw)) {
    try { raw = JSON.parse(raw.toString('utf8')); } catch { return []; }
  }
  if (typeof raw === 'string') {
    try { raw = JSON.parse(raw); } catch { return []; }
  }
  return Array.isArray(raw) ? raw : [];
}

type AnnouncementPopupFrequency = 'off' | 'every_login' | 'daily_first';

function announcementPopupFrequencyFromRow(row: Record<string, unknown>): AnnouncementPopupFrequency {
  const v = String(row.announcement_popup_frequency ?? '')
    .trim()
    .toLowerCase();
  if (v === 'daily_first' || v === 'every_login' || v === 'off') return v;
  return row.show_announcement_popup ? 'every_login' : 'off';
}

/** 会员端多条公告（JSON 数组） */
function parseAnnouncementsJson(v: unknown): unknown[] {
  return parseJsonArray(v);
}

/** 与前端 normalizeSettings 一致：JSON 数组无有效条目时回退旧版单列 announcement */
function parseLoginCarouselSlides(row: Record<string, unknown>): Array<{
  image_url: string;
  title_zh: string;
  title_en: string;
  body_zh: string;
  body_en: string;
  sort_order: number;
}> {
  const parsed = parseJsonArray(row.login_carousel_slides);
  return parsed
    .map((item, idx) => {
      if (!item || typeof item !== 'object') return null;
      const o = item as Record<string, unknown>;
      const image_url = o.image_url != null ? String(o.image_url).trim() : '';
      const title_zh = String(o.title_zh ?? o.title ?? '').trim();
      const title_en = String(o.title_en ?? '').trim();
      const body_zh = String(o.body_zh ?? o.body ?? '').trim();
      const body_en = String(o.body_en ?? '').trim();
      const sort_order = typeof o.sort_order === 'number' ? o.sort_order : idx + 1;
      if (!image_url && !title_zh && !title_en && !body_zh && !body_en) return null;
      return { image_url, title_zh, title_en, body_zh, body_en, sort_order };
    })
    .filter((x): x is NonNullable<typeof x> => x != null)
    .sort((a, b) => a.sort_order - b.sort_order)
    .slice(0, 8);
}

function clampLoginCarouselIntervalSec(raw: unknown): number {
  const n = Math.floor(Number(raw));
  if (!Number.isFinite(n)) return 5;
  return Math.min(60, Math.max(3, n));
}

function effectiveAnnouncementsForRow(row: Record<string, unknown>): unknown[] {
  const parsed = parseAnnouncementsJson(row.announcements);
  const usable = parsed.filter((item) => {
    if (!item || typeof item !== 'object') return false;
    const o = item as Record<string, unknown>;
    const title = String(o.title ?? o.subject ?? '').trim();
    const content = String(o.content ?? o.body ?? o.message ?? o.text ?? '').trim();
    const imgRaw = o.image_url ?? o.image ?? o.imageUrl;
    const image_url = imgRaw != null && String(imgRaw).trim() ? String(imgRaw).trim() : '';
    return !!(title || content || image_url);
  });
  if (usable.length > 0) return usable;
  const legacy = row.announcement != null ? String(row.announcement).trim() : '';
  if (legacy) return [{ title: '', content: legacy, sort_order: 1, image_url: '' }];
  return [];
}

function resolveTenantId(emp: { tenant_id: string; is_super_admin: boolean; tenant_code: string }, override?: string | null) {
  let tenantId = emp.tenant_id;
  const isPlatformAdmin = emp.is_super_admin && emp.tenant_code === 'platform';
  if (override && (isPlatformAdmin || emp.tenant_id === override)) {
    tenantId = override;
  }
  return tenantId;
}

function formatPortalSettingsUpdatedAtIso(row: Record<string, unknown>): string | null {
  const raw = row.updated_at;
  if (raw == null) return null;
  if (raw instanceof Date) return raw.toISOString();
  if (typeof raw === 'string') {
    const d = new Date(raw);
    return Number.isFinite(d.getTime()) ? d.toISOString() : raw;
  }
  return null;
}

/** MySQL JSON 列可能为 Buffer / 字符串 / 已解析对象 */
function parseCustomerServiceAgents(v: unknown): Array<{ name: string; avatar_url: string | null; whatsapp_number: string; link: string }> {
  let raw: unknown = v;
  if (raw == null) return [];
  if (Buffer.isBuffer(raw)) {
    try {
      raw = JSON.parse(raw.toString('utf8'));
    } catch {
      return [];
    }
  }
  if (typeof raw === 'string') {
    try {
      raw = JSON.parse(raw);
    } catch {
      return [];
    }
  }
  if (!Array.isArray(raw)) return [];
  return raw
    .map((a: Record<string, unknown>) => {
      // 员工端保存为 link；历史数据可能为 whatsapp_number
      const contact = String(a?.link ?? a?.whatsapp_number ?? '').trim();
      return {
        name: String(a?.name ?? '').trim(),
        avatar_url: a?.avatar_url != null && String(a.avatar_url).trim() ? String(a.avatar_url).trim() : null,
        whatsapp_number: contact,
        link: contact,
      };
    })
    .filter((a) => a.name && a.link);
}

export async function createMemberPortalSettingsVersion(
  employeeId: string,
  payload: Record<string, unknown>,
  note?: string | null,
  effectiveAt?: string | null,
  tenantIdOverride?: string | null
): Promise<CreateVersionResult> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) return { success: false, error: 'NO_PERMISSION' };

  const vRow = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 as next FROM member_portal_settings_versions WHERE tenant_id = ?`,
    [tenantId]
  );
  const nextVersion = vRow?.next ?? 1;
  const effectiveAtVal = effectiveAt || null;
  const applyNow = !effectiveAtVal || new Date(effectiveAtVal) <= new Date();
  const payloadJson = JSON.stringify(payload || {});
  const now = toMySqlDatetime(new Date());
  const newId = randomUUID();

  await execute(
    `INSERT INTO member_portal_settings_versions (
      id, tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at,
      approval_status, submitted_by, submitted_at, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'approved', ?, ?, ?, ?)`,
    [
      newId, tenantId, nextVersion, payloadJson, note || null,
      // is_applied / applied_at 由 applySettingsPayload 在落库后统一标记，避免先置 1 再被清零
      effectiveAtVal, 0, employeeId, null,
      employeeId, now, employeeId, now,
    ]
  );

  if (applyNow) {
    await applySettingsPayload(tenantId, payload, employeeId, newId);
  }

  return { success: true, version_id: newId, version_no: nextVersion, is_applied: applyNow };
}

/* ── 草稿系统 ── */

export interface DraftResult {
  success: boolean;
  draft_id?: string;
  error?: string;
}

/**
 * 保存草稿：写入 versions 表，approval_status = 'draft'，不应用到 member_portal_settings。
 * 同一租户只保留一条最新草稿，旧草稿被覆盖。
 */
export async function saveDraftSettings(
  employeeId: string,
  payload: Record<string, unknown>,
  note?: string | null,
  tenantIdOverride?: string | null
): Promise<DraftResult> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && emp.role !== 'manager' && !emp.is_super_admin) {
    return { success: false, error: 'NO_PERMISSION' };
  }

  const payloadJson = JSON.stringify(payload || {});
  const now = toMySqlDatetime(new Date());

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );

  if (existing) {
    await execute(
      `UPDATE member_portal_settings_versions
       SET payload = ?, note = ?, submitted_by = ?, submitted_at = ?
       WHERE id = ?`,
      [payloadJson, note || null, employeeId, now, existing.id]
    );
    return { success: true, draft_id: existing.id };
  }

  const newId = randomUUID();
  const vRow = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 as next FROM member_portal_settings_versions WHERE tenant_id = ?`,
    [tenantId]
  );
  const nextVersion = vRow?.next ?? 1;

  await execute(
    `INSERT INTO member_portal_settings_versions (
      id, tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at,
      approval_status, submitted_by, submitted_at, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, NULL, 0, ?, NULL, 'draft', ?, ?, NULL, NULL)`,
    [newId, tenantId, nextVersion, payloadJson, note || null, employeeId, employeeId, now]
  );

  return { success: true, draft_id: newId };
}

/**
 * 获取最新草稿（如果存在）
 */
export async function getLatestDraft(
  employeeId: string,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; draft?: { id: string; payload: Record<string, unknown>; note: string | null; updated_at: string } | null; error?: string }> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  const row = await queryOne<{ id: string; payload: string; note: string | null; submitted_at: string }>(
    `SELECT id, payload, note, submitted_at
     FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );

  if (!row) return { success: true, draft: null };

  let parsed: Record<string, unknown> = {};
  try {
    const raw = Buffer.isBuffer(row.payload) ? row.payload.toString('utf8') : row.payload;
    parsed = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch { /* empty */ }

  return {
    success: true,
    draft: { id: row.id, payload: parsed, note: row.note, updated_at: row.submitted_at },
  };
}

/**
 * 发布草稿：将最新草稿应用到 member_portal_settings，标记为已发布。
 * 如果没有草稿则返回错误。
 */
export async function publishDraft(
  employeeId: string,
  note?: string | null,
  tenantIdOverride?: string | null
): Promise<CreateVersionResult> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) return { success: false, error: 'NO_PERMISSION' };

  const draftRow = await queryOne<{ id: string; payload: string; version_no: number }>(
    `SELECT id, payload, version_no
     FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId]
  );

  if (!draftRow) return { success: false, error: 'NO_DRAFT' };

  let payload: Record<string, unknown> = {};
  try {
    const raw = Buffer.isBuffer(draftRow.payload) ? draftRow.payload.toString('utf8') : draftRow.payload;
    payload = typeof raw === 'string' ? JSON.parse(raw) : (raw as Record<string, unknown>);
  } catch { /* empty */ }

  const now = toMySqlDatetime(new Date());

  await execute(
    `UPDATE member_portal_settings_versions
     SET approval_status = 'approved',
         approved_by = ?, approved_at = ?, note = COALESCE(?, note)
     WHERE id = ?`,
    [employeeId, now, note || null, draftRow.id]
  );

  await applySettingsPayload(tenantId, payload, employeeId, draftRow.id);

  return { success: true, version_id: draftRow.id, version_no: draftRow.version_no, is_applied: true };
}

/**
 * 丢弃草稿
 */
export async function discardDraft(
  employeeId: string,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; error?: string }> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  await execute(
    `DELETE FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0`,
    [tenantId]
  );
  return { success: true };
}

function sanitizeDeadUrls(obj: Record<string, unknown>): void {
  for (const key of Object.keys(obj)) {
    const v = obj[key];
    if (typeof v === 'string' && (v.includes('supabase.co/') || v.includes('//localhost'))) {
      obj[key] = '';
    }
  }
}

async function applySettingsPayload(
  tenantId: string,
  payload: Record<string, unknown>,
  _employeeId: string,
  appliedVersionId?: string | null
) {
  const filtered: Record<string, unknown> = {};
  for (const k of Object.keys(payload || {})) {
    if (MEMBER_PORTAL_SETTINGS_WRITABLE_COLUMNS.has(k)) {
      filtered[k] = payload[k];
    }
  }
  sanitizeDeadUrls(filtered);

  if (Object.prototype.hasOwnProperty.call(filtered, 'announcement_popup_frequency')) {
    const raw = String((filtered as Record<string, unknown>).announcement_popup_frequency ?? '')
      .trim()
      .toLowerCase();
    const freq: AnnouncementPopupFrequency =
      raw === 'daily_first' || raw === 'every_login' || raw === 'off' ? raw : 'off';
    (filtered as Record<string, unknown>).announcement_popup_frequency = freq;
    (filtered as Record<string, unknown>).show_announcement_popup = freq !== 'off';
  } else if (Object.prototype.hasOwnProperty.call(filtered, 'show_announcement_popup')) {
    const on =
      (filtered as Record<string, unknown>).show_announcement_popup === true ||
      (filtered as Record<string, unknown>).show_announcement_popup === 1 ||
      (filtered as Record<string, unknown>).show_announcement_popup === '1';
    (filtered as Record<string, unknown>).announcement_popup_frequency = on ? 'every_login' : 'off';
  }

  if (Object.prototype.hasOwnProperty.call(filtered, 'registration_require_legal_agreement')) {
    const raw = (filtered as Record<string, unknown>).registration_require_legal_agreement;
    (filtered as Record<string, unknown>).registration_require_legal_agreement =
      raw === false || raw === 0 || raw === '0' ? 0 : 1;
  }

  const inboxBoolCols = [
    'enable_member_inbox',
    'member_inbox_notify_order_spin',
    'member_inbox_notify_mall_redemption',
    'member_inbox_notify_announcement',
  ] as const;
  for (const col of inboxBoolCols) {
    if (Object.prototype.hasOwnProperty.call(filtered, col)) {
      const raw = (filtered as Record<string, unknown>)[col];
      (filtered as Record<string, unknown>)[col] =
        raw === false || raw === 0 || raw === '0' ? 0 : 1;
    }
  }

  if (Object.prototype.hasOwnProperty.call(filtered, 'member_inbox_copy_templates')) {
    const raw = (filtered as Record<string, unknown>).member_inbox_copy_templates;
    if (typeof raw === 'string') {
      try {
        (filtered as Record<string, unknown>).member_inbox_copy_templates = JSON.parse(raw);
      } catch {
        delete (filtered as Record<string, unknown>).member_inbox_copy_templates;
      }
    } else if (raw != null && typeof raw !== 'object') {
      delete (filtered as Record<string, unknown>).member_inbox_copy_templates;
    }
  }

  /** 仅坐席列表生效：废弃全局统一链接，避免与会员端展示条数不一致 */
  if (Object.prototype.hasOwnProperty.call(filtered, 'customer_service_agents')) {
    filtered.customer_service_link = null;
    const rawAgents = filtered.customer_service_agents;
    if (Array.isArray(rawAgents)) {
      filtered.customer_service_agents = rawAgents
        .map((a) => {
          const o = a && typeof a === 'object' ? (a as Record<string, unknown>) : {};
          const link = String(o.link ?? o.whatsapp_number ?? '').trim();
          const name = String(o.name ?? '').trim();
          const av = o.avatar_url != null && String(o.avatar_url).trim() ? String(o.avatar_url).trim() : null;
          return { name, avatar_url: av, link };
        })
        .filter((a) => a.name && a.link);
    }
  }

  const existing = await queryOne('SELECT id FROM member_portal_settings WHERE tenant_id = ?', [tenantId]);
  const prevAnnouncementRow =
    existing
      ? await queryOne<Record<string, unknown>>(
          `SELECT announcements, announcement FROM member_portal_settings WHERE tenant_id = ?`,
          [tenantId],
        )
      : null;
  const cols = Object.keys(filtered);
  if (existing) {
    if (cols.length > 0) {
      const setClauses = cols.map(c => `\`${c}\` = ?`).join(', ');
      const vals = cols.map(c => {
        const v = (filtered as Record<string, unknown>)[c];
        if (v === null || v === undefined) return null;
        if (typeof v === 'object') return JSON.stringify(v);
        return v;
      });
      await execute(`UPDATE member_portal_settings SET ${setClauses} WHERE tenant_id = ?`, [...vals, tenantId]);
    }
  } else if (cols.length > 0) {
    const id = randomUUID();
    const allCols = ['id', 'tenant_id', ...cols];
    const allVals = [id, tenantId, ...cols.map(c => {
      const v = (filtered as Record<string, unknown>)[c];
      if (v === null || v === undefined) return null;
      if (typeof v === 'object') return JSON.stringify(v);
      return v;
    })];
    const placeholders = allCols.map(() => '?').join(', ');
    const colNames = allCols.map(c => `\`${c}\``).join(', ');
    await execute(`INSERT INTO member_portal_settings (${colNames}) VALUES (${placeholders})`, allVals);
  }

  const markNow = toMySqlDatetime(new Date());
  await execute(`UPDATE member_portal_settings_versions SET is_applied = 0 WHERE tenant_id = ?`, [tenantId]);
  if (appliedVersionId) {
    await execute(
      `UPDATE member_portal_settings_versions SET is_applied = 1, applied_at = ? WHERE id = ? AND tenant_id = ?`,
      [markNow, appliedVersionId, tenantId]
    );
  }

  const nextAnnouncementRow = await queryOne<Record<string, unknown>>(
    `SELECT announcements, announcement FROM member_portal_settings WHERE tenant_id = ?`,
    [tenantId],
  );
  if (nextAnnouncementRow) {
    try {
      const { syncMemberInboxAfterPortalAnnouncementsChange } = await import('../memberInboxNotifications/portalSync.js');
      await syncMemberInboxAfterPortalAnnouncementsChange(tenantId, prevAnnouncementRow, nextAnnouncementRow);
    } catch (e) {
      console.warn('[member-inbox] portal announcement sync:', ((e as Error).message || '').slice(0, 200));
    }
  }

  /** 门户「每日免费抽奖次数」与 lottery_settings 对齐，避免会员端文案与 /api/lottery 实际配额不一致 */
  if (Object.prototype.hasOwnProperty.call(filtered, 'daily_free_spins_per_day')) {
    const raw = (filtered as Record<string, unknown>).daily_free_spins_per_day;
    const n = Math.max(0, Math.floor(Number(raw) || 0));
    const { getLotterySettings, upsertLotterySettings } = await import('../lottery/repository.js');
    const cur = await getLotterySettings(tenantId);
    await upsertLotterySettings(tenantId, n, cur?.enabled !== 0);
  }
}

export async function getMemberPortalSettingsForEmployee(
  employeeId: string,
  tenantIdOverride?: string | null
): Promise<GetSettingsResult> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? LIMIT 1`,
    [tenantId]
  );

  const appliedVer = await queryOne<{ version_no: number }>(
    `SELECT version_no FROM member_portal_settings_versions
     WHERE tenant_id = ? AND is_applied = 1
     ORDER BY COALESCE(applied_at, created_at) DESC LIMIT 1`,
    [tenantId]
  );
  const published_version_no = appliedVer?.version_no ?? null;

  if (!row) {
    return {
      success: true,
      tenant_id: tenantId,
      tenant_name: '',
      settings: {},
      published_version_no,
      settings_updated_at: null,
    };
  }

  const tenantName = (row.tenant_name as string) || '';
  const annPopupFreq = announcementPopupFrequencyFromRow(row);
  const settings = {
    company_name: row.company_name ?? 'Spin & Win',
    logo_url: row.logo_url,
    theme_primary_color: row.theme_primary_color ?? '#4d8cff',
    welcome_title: row.welcome_title ?? 'Premium Member Platform',
    welcome_subtitle: row.welcome_subtitle ?? 'Sign in to your member account',
    announcement: row.announcement,
    announcements: effectiveAnnouncementsForRow(row),
    enable_spin: row.enable_spin ?? true,
    enable_invite: row.enable_invite ?? true,
    enable_check_in: row.enable_check_in ?? true,
    enable_share_reward: row.enable_share_reward ?? true,
    checkin_reward_base: Number(row.checkin_reward_base ?? 1),
    checkin_reward_streak_3: Number(row.checkin_reward_streak_3 ?? 1.5),
    checkin_reward_streak_7: Number(row.checkin_reward_streak_7 ?? 2),
    share_reward_spins: Number(row.share_reward_spins ?? 1),
    daily_share_reward_limit: Number(row.daily_share_reward_limit ?? 0),
    invite_reward_spins: Number(row.invite_reward_spins ?? 3),
    daily_invite_reward_limit: Number(row.daily_invite_reward_limit ?? 0),
    daily_free_spins_per_day: Number(row.daily_free_spins_per_day ?? 0),
    login_badges: parseJsonArray(row.login_badges).length > 0 ? parseJsonArray(row.login_badges) : ['🏆 Check-in reward', '🎁 Points redemption', '👥 Invite friends'],
    footer_text: row.footer_text ?? 'Your data is securely encrypted. The platform operates in compliance.',
    home_banners: parseJsonArray(row.home_banners),
    show_announcement_popup: annPopupFreq !== 'off',
    announcement_popup_frequency: annPopupFreq,
    announcement_popup_title: row.announcement_popup_title ?? 'System announcement',
    announcement_popup_content: row.announcement_popup_content,
    home_points_balance_hint_zh: row.home_points_balance_hint_zh ?? '',
    home_points_balance_hint_en: row.home_points_balance_hint_en ?? '',
    points_mall_redeem_rules_title_zh: row.points_mall_redeem_rules_title_zh ?? '',
    points_mall_redeem_rules_title_en: row.points_mall_redeem_rules_title_en ?? '',
    points_mall_redeem_daily_unlimited_zh: row.points_mall_redeem_daily_unlimited_zh ?? '',
    points_mall_redeem_daily_unlimited_en: row.points_mall_redeem_daily_unlimited_en ?? '',
    points_mall_redeem_lifetime_unlimited_zh: row.points_mall_redeem_lifetime_unlimited_zh ?? '',
    points_mall_redeem_lifetime_unlimited_en: row.points_mall_redeem_lifetime_unlimited_en ?? '',
    customer_service_label: row.customer_service_label ?? 'Contact support',
    customer_service_link: null,
    customer_service_agents: parseCustomerServiceAgents(row.customer_service_agents),
    home_module_order: parseJsonArray(row.home_module_order).length > 0 ? parseJsonArray(row.home_module_order) : ['shortcuts', 'tasks', 'security'],
    invite_link_prefix: row.invite_link_prefix ?? null,
    login_carousel_slides: parseLoginCarouselSlides(row),
    login_carousel_interval_sec: clampLoginCarouselIntervalSec(row.login_carousel_interval_sec),
    home_banners_carousel_interval_sec: clampLoginCarouselIntervalSec(row.home_banners_carousel_interval_sec),
    terms_of_service_zh: legalBodyOrDefault(row.terms_of_service_zh, DEFAULT_TERMS_ZH),
    terms_of_service_en: legalBodyOrDefault(row.terms_of_service_en, DEFAULT_TERMS_EN),
    privacy_policy_zh: legalBodyOrDefault(row.privacy_policy_zh, DEFAULT_PRIVACY_ZH),
    privacy_policy_en: legalBodyOrDefault(row.privacy_policy_en, DEFAULT_PRIVACY_EN),
    registration_require_legal_agreement: registrationRequireLegalFromRow(row.registration_require_legal_agreement),
    home_first_trade_contact_zh: row.home_first_trade_contact_zh ?? '',
    home_first_trade_contact_en: row.home_first_trade_contact_en ?? '',
    enable_member_inbox: row.enable_member_inbox ?? true,
    member_inbox_notify_order_spin: row.member_inbox_notify_order_spin ?? true,
    member_inbox_notify_mall_redemption: row.member_inbox_notify_mall_redemption ?? true,
    member_inbox_notify_announcement: row.member_inbox_notify_announcement ?? true,
    member_inbox_copy_templates: fillMemberInboxCopyDefaults(parseMemberInboxCopyTemplatesFromDb(row.member_inbox_copy_templates)),
    poster_headline_zh: row.poster_headline_zh ?? '',
    poster_headline_en: row.poster_headline_en ?? '',
    poster_subtext_zh: row.poster_subtext_zh ?? '',
    poster_subtext_en: row.poster_subtext_en ?? '',
    poster_footer_zh: row.poster_footer_zh ?? '',
    poster_footer_en: row.poster_footer_en ?? '',
    poster_frame_id: row.poster_frame_id ?? 'gold',
    poster_custom_bg_url: row.poster_custom_bg_url ?? null,
  };
  return {
    success: true,
    tenant_id: tenantId,
    tenant_name: tenantName,
    settings,
    published_version_no,
    settings_updated_at: formatPortalSettingsUpdatedAtIso(row),
  };
}

export async function listMemberPortalSettingsVersions(
  employeeId: string,
  limit: number,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; versions?: VersionItem[]; error?: string }> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  const safeLimit = Math.min(Number(limit) || 50, 100);
  const versions = await query<VersionItem>(
    `SELECT id, version_no, note, effective_at, is_applied,
            approval_status, review_note, created_at, applied_at
     FROM member_portal_settings_versions
     WHERE tenant_id = ?
     ORDER BY version_no DESC
     LIMIT ${safeLimit}`,
    [tenantId]
  );
  return { success: true, versions };
}

function legalBodyOrDefault(v: unknown, fallback: string): string {
  const s = String(v ?? '').trim();
  return s.length > 0 ? s : fallback;
}

function registrationRequireLegalFromRow(v: unknown): boolean {
  if (v === false || v === 0 || v === '0') return false;
  return true;
}

/**
 * 从数据库行构建面向会员端的完整 settings 对象。
 * 所有 JSON 列（login_badges / home_banners / home_module_order / announcements / customer_service_agents）
 * 均在此处统一解析，避免 MySQL JSON / Buffer / string 差异导致前端收到非数组值而回退默认。
 */
function buildPublicSettings(row: Record<string, unknown>): Record<string, unknown> {
  const loginBadges = parseJsonArray(row.login_badges);
  const homeBanners = parseJsonArray(row.home_banners);
  const homeModuleOrder = parseJsonArray(row.home_module_order);
  const popupFreq = announcementPopupFrequencyFromRow(row);

  return {
    company_name: row.company_name ?? 'Spin & Win',
    logo_url: row.logo_url ?? null,
    theme_primary_color: row.theme_primary_color ?? '#4d8cff',
    welcome_title: row.welcome_title ?? 'Premium Member Platform',
    welcome_subtitle: row.welcome_subtitle ?? 'Sign in to your member account',
    announcement: row.announcement ?? null,
    announcements: effectiveAnnouncementsForRow(row),
    enable_spin: row.enable_spin ?? true,
    enable_invite: row.enable_invite ?? true,
    enable_check_in: row.enable_check_in ?? true,
    enable_share_reward: row.enable_share_reward ?? true,
    checkin_reward_base: Number(row.checkin_reward_base ?? 1),
    checkin_reward_streak_3: Number(row.checkin_reward_streak_3 ?? 1.5),
    checkin_reward_streak_7: Number(row.checkin_reward_streak_7 ?? 2),
    share_reward_spins: Number(row.share_reward_spins ?? 1),
    daily_share_reward_limit: Number(row.daily_share_reward_limit ?? 0),
    invite_reward_spins: Number(row.invite_reward_spins ?? 3),
    daily_invite_reward_limit: Number(row.daily_invite_reward_limit ?? 0),
    daily_free_spins_per_day: Number(row.daily_free_spins_per_day ?? 0),
    login_badges: loginBadges.length > 0 ? loginBadges : ['🏆 Check-in reward', '🎁 Points redemption', '👥 Invite friends'],
    footer_text: row.footer_text ?? 'Your data is securely encrypted. The platform operates in compliance.',
    home_banners: homeBanners,
    show_announcement_popup: popupFreq !== 'off',
    announcement_popup_frequency: popupFreq,
    announcement_popup_title: row.announcement_popup_title ?? 'System announcement',
    announcement_popup_content: row.announcement_popup_content ?? null,
    home_points_balance_hint_zh: row.home_points_balance_hint_zh ?? '',
    home_points_balance_hint_en: row.home_points_balance_hint_en ?? '',
    points_mall_redeem_rules_title_zh: row.points_mall_redeem_rules_title_zh ?? '',
    points_mall_redeem_rules_title_en: row.points_mall_redeem_rules_title_en ?? '',
    points_mall_redeem_daily_unlimited_zh: row.points_mall_redeem_daily_unlimited_zh ?? '',
    points_mall_redeem_daily_unlimited_en: row.points_mall_redeem_daily_unlimited_en ?? '',
    points_mall_redeem_lifetime_unlimited_zh: row.points_mall_redeem_lifetime_unlimited_zh ?? '',
    points_mall_redeem_lifetime_unlimited_en: row.points_mall_redeem_lifetime_unlimited_en ?? '',
    customer_service_label: row.customer_service_label ?? 'Contact support',
    customer_service_link: null,
    customer_service_agents: parseCustomerServiceAgents(row.customer_service_agents),
    home_module_order: homeModuleOrder.length > 0 ? homeModuleOrder : ['shortcuts', 'tasks', 'security'],
    invite_link_prefix: row.invite_link_prefix ?? null,
    login_carousel_slides: parseLoginCarouselSlides(row),
    login_carousel_interval_sec: clampLoginCarouselIntervalSec(row.login_carousel_interval_sec),
    home_banners_carousel_interval_sec: clampLoginCarouselIntervalSec(row.home_banners_carousel_interval_sec),
    terms_of_service_zh: legalBodyOrDefault(row.terms_of_service_zh, DEFAULT_TERMS_ZH),
    terms_of_service_en: legalBodyOrDefault(row.terms_of_service_en, DEFAULT_TERMS_EN),
    privacy_policy_zh: legalBodyOrDefault(row.privacy_policy_zh, DEFAULT_PRIVACY_ZH),
    privacy_policy_en: legalBodyOrDefault(row.privacy_policy_en, DEFAULT_PRIVACY_EN),
    registration_require_legal_agreement: registrationRequireLegalFromRow(row.registration_require_legal_agreement),
    home_first_trade_contact_zh: row.home_first_trade_contact_zh ?? '',
    home_first_trade_contact_en: row.home_first_trade_contact_en ?? '',
    enable_member_inbox: row.enable_member_inbox ?? true,
    member_inbox_notify_order_spin: row.member_inbox_notify_order_spin ?? true,
    member_inbox_notify_mall_redemption: row.member_inbox_notify_mall_redemption ?? true,
    member_inbox_notify_announcement: row.member_inbox_notify_announcement ?? true,
    poster_headline_zh: row.poster_headline_zh ?? '',
    poster_headline_en: row.poster_headline_en ?? '',
    poster_subtext_zh: row.poster_subtext_zh ?? '',
    poster_subtext_en: row.poster_subtext_en ?? '',
    poster_footer_zh: row.poster_footer_zh ?? '',
    poster_footer_en: row.poster_footer_en ?? '',
    poster_frame_id: row.poster_frame_id ?? 'gold',
    poster_custom_bg_url: row.poster_custom_bg_url ?? null,
  };
}

export async function getDefaultPortalSettingsPublic(): Promise<GetSettingsResult> {
  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     ORDER BY s.created_at ASC LIMIT 1`
  );

  const defaultSettings: Record<string, unknown> = {
    company_name: 'Spin & Win',
    logo_url: null,
    theme_primary_color: '#4d8cff',
    welcome_title: 'Premium Member Platform',
    welcome_subtitle: 'Sign in to your member account',
    announcement: null,
    announcements: [],
    enable_spin: true,
    enable_invite: true,
    enable_check_in: true,
    enable_share_reward: true,
    login_badges: ['🏆 Check-in reward', '🎁 Points redemption', '👥 Invite friends'],
    footer_text: 'Your data is securely encrypted. The platform operates in compliance.',
    home_banners: [],
    show_announcement_popup: false,
    announcement_popup_frequency: 'off',
    announcement_popup_title: 'System announcement',
    announcement_popup_content: null,
    home_points_balance_hint_zh: '',
    home_points_balance_hint_en: '',
    points_mall_redeem_rules_title_zh: '',
    points_mall_redeem_rules_title_en: '',
    points_mall_redeem_daily_unlimited_zh: '',
    points_mall_redeem_daily_unlimited_en: '',
    points_mall_redeem_lifetime_unlimited_zh: '',
    points_mall_redeem_lifetime_unlimited_en: '',
    customer_service_label: 'Contact support',
    customer_service_link: null,
    customer_service_agents: [] as Array<{ name: string; avatar_url: string | null; whatsapp_number: string; link: string }>,
    home_module_order: ['shortcuts', 'tasks', 'security'],
    login_carousel_slides: [],
    login_carousel_interval_sec: 5,
    home_banners_carousel_interval_sec: 5,
    terms_of_service_zh: DEFAULT_TERMS_ZH,
    terms_of_service_en: DEFAULT_TERMS_EN,
    privacy_policy_zh: DEFAULT_PRIVACY_ZH,
    privacy_policy_en: DEFAULT_PRIVACY_EN,
    registration_require_legal_agreement: true,
    home_first_trade_contact_zh: '',
    home_first_trade_contact_en: '',
    enable_member_inbox: true,
    member_inbox_notify_order_spin: true,
    member_inbox_notify_mall_redemption: true,
    member_inbox_notify_announcement: true,
  };

  if (!row) {
    return { success: true, tenant_id: null, tenant_name: '', settings: defaultSettings };
  }

  return {
    success: true,
    tenant_id: (row.tenant_id as string) || null,
    tenant_name: (row.tenant_name as string) || '',
    settings: buildPublicSettings(row),
  };
}

export async function getPortalSettingsByAccount(account: string): Promise<GetSettingsResult> {
  const member = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM members WHERE (phone_number = ? OR member_code = ?) AND tenant_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [account, account]
  );
  if (!member?.tenant_id) {
    return getDefaultPortalSettingsPublic();
  }

  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? LIMIT 1`,
    [member.tenant_id]
  );
  if (!row) {
    return getDefaultPortalSettingsPublic();
  }

  return {
    success: true,
    tenant_id: (row.tenant_id as string) || null,
    tenant_name: (row.tenant_name as string) || '',
    settings: buildPublicSettings(row),
  };
}

export async function getPortalSettingsByMember(memberId: string): Promise<GetSettingsResult> {
  const member = await queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM members WHERE id = ? LIMIT 1`,
    [memberId]
  );
  if (!member?.tenant_id) return getDefaultPortalSettingsPublic();

  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? LIMIT 1`,
    [member.tenant_id]
  );
  if (!row) return getDefaultPortalSettingsPublic();

  return {
    success: true,
    tenant_id: (row.tenant_id as string) || null,
    tenant_name: (row.tenant_name as string) || '',
    settings: buildPublicSettings(row),
  };
}

export async function getPortalSettingsByInviteToken(token: string): Promise<GetSettingsResult> {
  const code = String(token || '').trim();
  if (!code) {
    return getDefaultPortalSettingsPublic();
  }
  const tenants = await query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM members
     WHERE tenant_id IS NOT NULL
       AND (BINARY invite_token = ? OR (referral_code IS NOT NULL AND referral_code <> '' AND BINARY referral_code = ?))`,
    [code, code],
  );
  if (tenants.length !== 1 || !tenants[0]?.tenant_id) {
    return getDefaultPortalSettingsPublic();
  }
  const tenantId = tenants[0].tenant_id;

  const row = await queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? LIMIT 1`,
    [tenantId]
  );
  if (!row) return getDefaultPortalSettingsPublic();

  return {
    success: true,
    tenant_id: (row.tenant_id as string) || null,
    tenant_name: (row.tenant_name as string) || '',
    settings: buildPublicSettings(row),
  };
}

/* ── Spin Wheel Prizes ── */

export async function listSpinWheelPrizesForEmployee(
  employeeId: string,
  tenantIdOverride?: string | null
) {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);

  const items = await query<Record<string, unknown>>(
    `SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC`,
    [tenantId]
  );
  return { success: true, items };
}

export async function listSpinWheelPrizesForMember(memberId: string) {
  const member = await queryOne<{ tenant_id: string }>('SELECT tenant_id FROM members WHERE id = ? LIMIT 1', [memberId]);
  const tenantId = member?.tenant_id;

  if (!tenantId) return { success: true, items: [] };
  const items = await query('SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC', [tenantId]);
  return { success: true, items };
}

export async function upsertSpinWheelPrizes(
  employeeId: string,
  items: Array<Record<string, unknown>>,
  tenantIdOverride?: string | null
) {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) return { success: false, error: 'NO_PERMISSION' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);

  if (!Array.isArray(items) || items.length < 6 || items.length > 10) {
    return { success: false, error: 'ITEM_COUNT_OUT_OF_RANGE' };
  }
  const enabled = items.filter(i => Number(i.hit_rate) > 0);
  if (enabled.length < 6) return { success: false, error: 'ENABLED_ITEMS_TOO_FEW' };

  const rateSum = enabled.reduce((s, i) => s + Number(i.hit_rate || 0), 0);
  if (Math.abs(rateSum - 100) > 0.5) return { success: false, error: 'RATE_SUM_NOT_100' };

  await execute('DELETE FROM member_spin_wheel_prizes WHERE tenant_id = ?', [tenantId]);

  const genId = () => randomUUID();

  for (let i = 0; i < items.length; i++) {
    const it = items[i];
    await execute(
      `INSERT INTO member_spin_wheel_prizes (id, tenant_id, name, prize_type, hit_rate, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [genId(), tenantId, it.name || '', it.prize_type || 'custom', Number(it.hit_rate || 0), Number(it.sort_order ?? i)]
    );
  }
  return { success: true };
}

export async function rollbackMemberPortalSettingsVersion(
  employeeId: string,
  versionId: string,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; error?: string }> {
  const emp = await resolveEmployee(employeeId);
  if (!emp) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const tenantId = resolveTenantId(emp, tenantIdOverride);
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) return { success: false, error: 'NO_PERMISSION' };

  const ver = await queryOne<{ tenant_id: string; payload: string }>(
    `SELECT tenant_id, payload FROM member_portal_settings_versions WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [versionId, tenantId]
  );
  if (!ver) return { success: false, error: 'VERSION_NOT_FOUND' };

  const payload = typeof ver.payload === 'string' ? JSON.parse(ver.payload) : ver.payload;
  await applySettingsPayload(tenantId, payload, employeeId, versionId);
  return { success: true };
}

import { selectMemberTenantIdByMemberId } from './repository.js';

/** 根据会员 ID 获取所属租户 ID（供 Controller 层权限校验使用） */
export async function getMemberTenantIdForPortalService(
  memberId: string,
): Promise<{ tenant_id: string | null } | null> {
  return selectMemberTenantIdByMemberId(memberId);
}
