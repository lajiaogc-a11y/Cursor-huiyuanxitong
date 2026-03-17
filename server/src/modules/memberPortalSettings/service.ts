/**
 * 会员门户设置服务 - 使用 pg 直连，绕过 Supabase auth.uid()
 * 员工使用 JWT 登录时 Supabase RPC 的 resolve_current_employee_id 返回 null
 * 通过后端 API + pg 实现发布/获取/版本管理
 */
import { queryPg } from '../../database/pg.js';

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

export async function createMemberPortalSettingsVersion(
  employeeId: string,
  payload: Record<string, unknown>,
  note?: string | null,
  effectiveAt?: string | null,
  tenantIdOverride?: string | null
): Promise<CreateVersionResult> {
  const rows = await queryPg<{ tenant_id: string; role: string; is_super_admin: boolean }>(
    `SELECT tenant_id, role, COALESCE(is_super_admin, false) as is_super_admin
     FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  if (!rows.length) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const emp = rows[0];
  let tenantId = emp.tenant_id;
  if (tenantIdOverride && (emp.is_super_admin || emp.tenant_id === tenantIdOverride)) {
    tenantId = tenantIdOverride;
  }
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) {
    return { success: false, error: 'NO_PERMISSION' };
  }

  const versionRows = await queryPg<{ next: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 as next
     FROM member_portal_settings_versions WHERE tenant_id = $1`,
    [tenantId]
  );
  const nextVersion = versionRows[0]?.next ?? 1;
  const effectiveAtVal = effectiveAt ? new Date(effectiveAt) : null;
  const applyNow = !effectiveAtVal || effectiveAtVal <= new Date();

  const payloadJson = JSON.stringify(payload || {});

  const insertRows = await queryPg<{ id: string }>(
    `INSERT INTO member_portal_settings_versions (
      tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at,
      approval_status, submitted_by, submitted_at, approved_by, approved_at
    ) VALUES ($1, $2, $3::jsonb, $4, $5, $6, $7, $8, 'approved', $7, now(), $7, now())
    RETURNING id`,
    [
      tenantId,
      nextVersion,
      payloadJson,
      note || null,
      effectiveAtVal,
      applyNow,
      employeeId,
      applyNow ? new Date() : null,
    ]
  );
  const newId = insertRows[0]?.id;
  if (!newId) return { success: false, error: 'INSERT_FAILED' };

  if (applyNow) {
    await queryPg(
      `SELECT apply_member_portal_settings_payload($1::uuid, $2::jsonb, $3::uuid)`,
      [tenantId, payloadJson, employeeId]
    );
  }

  return {
    success: true,
    version_id: newId,
    version_no: nextVersion,
    is_applied: applyNow,
  };
}

export async function getMemberPortalSettingsForEmployee(
  employeeId: string,
  tenantIdOverride?: string | null
): Promise<GetSettingsResult> {
  const rows = await queryPg<{ tenant_id: string; is_super_admin: boolean }>(
    `SELECT tenant_id, COALESCE(is_super_admin, false) as is_super_admin
     FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  if (!rows.length) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  let tenantId = rows[0].tenant_id;
  if (tenantIdOverride && (rows[0].is_super_admin || rows[0].tenant_id === tenantIdOverride)) {
    tenantId = tenantIdOverride;
  }
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  await queryPg(`SELECT apply_due_member_portal_versions_for_tenant($1::uuid)`, [tenantId]);

  const settingsRows = await queryPg<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = $1 LIMIT 1`,
    [tenantId]
  );
  const row = settingsRows[0];
  if (!row) {
    return {
      success: true,
      tenant_id: tenantId,
      tenant_name: '',
      settings: {},
    };
  }
  const tenantName = (row.tenant_name as string) || '';
  const settings = {
    company_name: row.company_name ?? 'Spin & Win',
    logo_url: row.logo_url,
    theme_primary_color: row.theme_primary_color ?? '#f59e0b',
    welcome_title: row.welcome_title ?? 'Premium Member Platform',
    welcome_subtitle: row.welcome_subtitle ?? 'Sign in to your member account',
    announcement: row.announcement,
    enable_spin: row.enable_spin ?? true,
    enable_invite: row.enable_invite ?? true,
    enable_check_in: row.enable_check_in ?? true,
    enable_share_reward: row.enable_share_reward ?? true,
    checkin_reward_base: Number(row.checkin_reward_base ?? 1),
    checkin_reward_streak_3: Number(row.checkin_reward_streak_3 ?? 1.5),
    checkin_reward_streak_7: Number(row.checkin_reward_streak_7 ?? 2),
    share_reward_spins: Number(row.share_reward_spins ?? 1),
    invite_reward_spins: Number(row.invite_reward_spins ?? 3),
    daily_free_spins_per_day: Number(row.daily_free_spins_per_day ?? 0),
    login_badges: row.login_badges ?? ['🏆 签到奖励', '🎁 积分兑换', '👥 邀请好友'],
    footer_text: row.footer_text ?? '账户数据安全加密，平台合规运营，请放心使用',
    home_banners: row.home_banners ?? [],
    show_announcement_popup: row.show_announcement_popup ?? false,
    announcement_popup_title: row.announcement_popup_title ?? '系统公告',
    announcement_popup_content: row.announcement_popup_content,
    customer_service_label: row.customer_service_label ?? '联系客服',
    customer_service_link: row.customer_service_link,
    home_background_preset: row.home_background_preset ?? 'deep_blue',
    home_module_order: row.home_module_order ?? ['shortcuts', 'tasks', 'security'],
  };
  return {
    success: true,
    tenant_id: tenantId,
    tenant_name: tenantName,
    settings,
  };
}

export async function listMemberPortalSettingsVersions(
  employeeId: string,
  limit: number,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; versions?: VersionItem[]; error?: string }> {
  const rows = await queryPg<{ tenant_id: string; is_super_admin: boolean }>(
    `SELECT tenant_id, COALESCE(is_super_admin, false) as is_super_admin
     FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  if (!rows.length) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  let tenantId = rows[0].tenant_id;
  if (tenantIdOverride && (rows[0].is_super_admin || rows[0].tenant_id === tenantIdOverride)) {
    tenantId = tenantIdOverride;
  }
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };

  const versionRows = await queryPg<VersionItem>(
    `SELECT id, version_no, note, effective_at, is_applied,
            approval_status, review_note, created_at, applied_at
     FROM member_portal_settings_versions
     WHERE tenant_id = $1
     ORDER BY version_no DESC
     LIMIT $2`,
    [tenantId, Math.min(limit, 100)]
  );
  return { success: true, versions: versionRows };
}

export async function rollbackMemberPortalSettingsVersion(
  employeeId: string,
  versionId: string,
  tenantIdOverride?: string | null
): Promise<{ success: boolean; error?: string }> {
  const empRows = await queryPg<{ tenant_id: string; role: string; is_super_admin: boolean }>(
    `SELECT tenant_id, role, COALESCE(is_super_admin, false) as is_super_admin
     FROM employees WHERE id = $1 LIMIT 1`,
    [employeeId]
  );
  if (!empRows.length) return { success: false, error: 'EMPLOYEE_NOT_FOUND' };
  const emp = empRows[0];
  let tenantId = emp.tenant_id;
  if (tenantIdOverride && (emp.is_super_admin || emp.tenant_id === tenantIdOverride)) {
    tenantId = tenantIdOverride;
  }
  if (!tenantId) return { success: false, error: 'TENANT_NOT_FOUND' };
  if (emp.role !== 'admin' && !emp.is_super_admin) return { success: false, error: 'NO_PERMISSION' };

  const verRows = await queryPg<{ tenant_id: string; payload: string }>(
    `SELECT tenant_id, payload FROM member_portal_settings_versions WHERE id = $1 AND tenant_id = $2 LIMIT 1`,
    [versionId, tenantId]
  );
  if (!verRows.length) return { success: false, error: 'VERSION_NOT_FOUND' };

  await queryPg(
    `SELECT apply_member_portal_settings_payload($1::uuid, $2::jsonb, $3::uuid)`,
    [tenantId, verRows[0].payload, employeeId]
  );
  return { success: true };
}
