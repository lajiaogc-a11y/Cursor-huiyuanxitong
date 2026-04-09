/**
 * 会员门户设置模块 — 唯一 DB 访问层
 */
import { query, queryOne, execute } from '../../database/index.js';

// ── Employee ──

export async function queryEmployeeWithTenant(employeeId: string) {
  const rows = await query<{ tenant_id: string; role: string; is_super_admin: number; tenant_code: string }>(
    `SELECT e.tenant_id, e.role, COALESCE(e.is_super_admin, 0) as is_super_admin,
            COALESCE(t.tenant_code, '') as tenant_code
     FROM employees e LEFT JOIN tenants t ON t.id = e.tenant_id
     WHERE e.id = ? LIMIT 1`,
    [employeeId],
  );
  return rows[0] ?? null;
}

// ── Member tenant lookup ──

export async function selectMemberTenantIdByMemberId(
  memberId: string,
): Promise<{ tenant_id: string | null } | null> {
  return queryOne<{ tenant_id: string | null }>(
    'SELECT tenant_id FROM members WHERE id = ? LIMIT 1',
    [memberId],
  );
}

export async function selectMemberTenantByAccount(account: string) {
  return queryOne<{ tenant_id: string }>(
    `SELECT tenant_id FROM members WHERE (phone_number = ? OR member_code = ?) AND tenant_id IS NOT NULL ORDER BY created_at DESC LIMIT 1`,
    [account, account],
  );
}

export async function selectTenantsByInviteCode(code: string) {
  return query<{ tenant_id: string }>(
    `SELECT DISTINCT tenant_id FROM members
     WHERE tenant_id IS NOT NULL
       AND (BINARY invite_token = ? OR (referral_code IS NOT NULL AND referral_code <> '' AND BINARY referral_code = ?))`,
    [code, code],
  );
}

// ── Portal settings (main table) ──

export async function selectPortalSettingsWithTenant(tenantId: string) {
  return queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     WHERE s.tenant_id = ? LIMIT 1`,
    [tenantId],
  );
}

export async function selectFirstPortalSettingsWithTenant() {
  return queryOne<Record<string, unknown>>(
    `SELECT s.*, t.tenant_name
     FROM member_portal_settings s
     LEFT JOIN tenants t ON t.id = s.tenant_id
     ORDER BY s.created_at ASC LIMIT 1`,
  );
}

export async function checkPortalSettingsExist(tenantId: string) {
  return queryOne<{ id: string }>('SELECT id FROM member_portal_settings WHERE tenant_id = ?', [tenantId]);
}

export async function selectAnnouncementFields(tenantId: string) {
  return queryOne<Record<string, unknown>>(
    `SELECT announcements, announcement FROM member_portal_settings WHERE tenant_id = ?`,
    [tenantId],
  );
}

export async function updatePortalSettingsDynamic(tenantId: string, setClauses: string, vals: unknown[]) {
  await execute(`UPDATE member_portal_settings SET ${setClauses} WHERE tenant_id = ?`, [...vals, tenantId]);
}

export async function insertPortalSettingsDynamic(colNames: string, placeholders: string, allVals: unknown[]) {
  await execute(`INSERT INTO member_portal_settings (${colNames}) VALUES (${placeholders})`, allVals);
}

// ── Versions ──

export async function getNextVersionNo(tenantId: string) {
  const row = await queryOne<{ next: number }>(
    `SELECT COALESCE(MAX(version_no), 0) + 1 as next FROM member_portal_settings_versions WHERE tenant_id = ?`,
    [tenantId],
  );
  return row?.next ?? 1;
}

export async function insertVersionRecord(params: {
  id: string;
  tenantId: string;
  versionNo: number;
  payloadJson: string;
  note: string | null;
  effectiveAt: string | null;
  isApplied: number;
  createdBy: string;
  appliedAt: string | null;
  approvalStatus: string;
  submittedBy: string;
  submittedAt: string;
  approvedBy: string | null;
  approvedAt: string | null;
}) {
  await execute(
    `INSERT INTO member_portal_settings_versions (
      id, tenant_id, version_no, payload, note, effective_at, is_applied, created_by, applied_at,
      approval_status, submitted_by, submitted_at, approved_by, approved_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      params.id, params.tenantId, params.versionNo, params.payloadJson, params.note,
      params.effectiveAt, params.isApplied, params.createdBy, params.appliedAt,
      params.approvalStatus, params.submittedBy, params.submittedAt, params.approvedBy, params.approvedAt,
    ],
  );
}

export async function selectAppliedVersionNo(tenantId: string) {
  return queryOne<{ version_no: number }>(
    `SELECT version_no FROM member_portal_settings_versions
     WHERE tenant_id = ? AND is_applied = 1
     ORDER BY COALESCE(applied_at, created_at) DESC LIMIT 1`,
    [tenantId],
  );
}

export async function clearAppliedVersions(tenantId: string) {
  await execute(`UPDATE member_portal_settings_versions SET is_applied = 0 WHERE tenant_id = ?`, [tenantId]);
}

export async function markVersionApplied(versionId: string, tenantId: string, appliedAt: string) {
  await execute(
    `UPDATE member_portal_settings_versions SET is_applied = 1, applied_at = ? WHERE id = ? AND tenant_id = ?`,
    [appliedAt, versionId, tenantId],
  );
}

export async function listVersions(tenantId: string, limit: number) {
  return query<Record<string, unknown>>(
    `SELECT id, version_no, note, effective_at, is_applied,
            approval_status, review_note, created_at, applied_at
     FROM member_portal_settings_versions
     WHERE tenant_id = ?
     ORDER BY version_no DESC
     LIMIT ${Math.min(Number(limit) || 50, 100)}`,
    [tenantId],
  );
}

export async function selectVersionPayload(versionId: string, tenantId: string) {
  return queryOne<{ tenant_id: string; payload: string }>(
    `SELECT tenant_id, payload FROM member_portal_settings_versions WHERE id = ? AND tenant_id = ? LIMIT 1`,
    [versionId, tenantId],
  );
}

// ── Draft ──

export async function selectLatestDraftId(tenantId: string) {
  return queryOne<{ id: string }>(
    `SELECT id FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
}

export async function updateDraftVersion(draftId: string, payloadJson: string, note: string | null, submittedBy: string, submittedAt: string) {
  await execute(
    `UPDATE member_portal_settings_versions
     SET payload = ?, note = ?, submitted_by = ?, submitted_at = ?
     WHERE id = ?`,
    [payloadJson, note, submittedBy, submittedAt, draftId],
  );
}

export async function selectLatestDraftFull(tenantId: string) {
  return queryOne<{ id: string; payload: string; note: string | null; submitted_at: string }>(
    `SELECT id, payload, note, submitted_at
     FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
}

export async function selectLatestDraftForPublish(tenantId: string) {
  return queryOne<{ id: string; payload: string; version_no: number }>(
    `SELECT id, payload, version_no
     FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0
     ORDER BY created_at DESC LIMIT 1`,
    [tenantId],
  );
}

export async function approveDraft(draftId: string, approvedBy: string, approvedAt: string, note: string | null) {
  await execute(
    `UPDATE member_portal_settings_versions
     SET approval_status = 'approved',
         approved_by = ?, approved_at = ?, note = COALESCE(?, note)
     WHERE id = ?`,
    [approvedBy, approvedAt, note, draftId],
  );
}

export async function deleteDrafts(tenantId: string) {
  await execute(
    `DELETE FROM member_portal_settings_versions
     WHERE tenant_id = ? AND approval_status = 'draft' AND is_applied = 0`,
    [tenantId],
  );
}

// ── Spin Wheel Prizes ──

export async function listSpinWheelPrizes(tenantId: string) {
  return query<Record<string, unknown>>(
    `SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC, created_at DESC`,
    [tenantId],
  );
}

export async function listSpinWheelPrizesOrdered(tenantId: string) {
  return query<Record<string, unknown>>(
    'SELECT * FROM member_spin_wheel_prizes WHERE tenant_id = ? ORDER BY sort_order ASC',
    [tenantId],
  );
}

export async function deleteSpinWheelPrizes(tenantId: string) {
  await execute('DELETE FROM member_spin_wheel_prizes WHERE tenant_id = ?', [tenantId]);
}

export async function insertSpinWheelPrize(params: {
  id: string;
  tenantId: string;
  name: string;
  prizeType: string;
  hitRate: number;
  sortOrder: number;
}) {
  await execute(
    `INSERT INTO member_spin_wheel_prizes (id, tenant_id, name, prize_type, hit_rate, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, NOW())`,
    [params.id, params.tenantId, params.name, params.prizeType, params.hitRate, params.sortOrder],
  );
}
