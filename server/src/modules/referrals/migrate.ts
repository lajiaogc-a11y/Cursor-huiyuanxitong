/**
 * 推荐 / 邀请 阶段 1：members 推广字段 + referrals + referral_events（MySQL）
 */
import { execute, query } from '../../database/index.js';

async function columnExists(table: string, column: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, column],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

async function indexExists(table: string, indexName: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ cnt: number }>(
    `SELECT COUNT(*) as cnt FROM information_schema.TABLES
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ?`,
    [table],
  );
  return (rows[0]?.cnt ?? 0) > 0;
}

export async function migrateReferralPhase1(): Promise<void> {
  if (!(await columnExists('members', 'referral_code'))) {
    await execute(
      `ALTER TABLE members ADD COLUMN referral_code VARCHAR(64) NULL COMMENT '租户内推广码，与 invite_token 对齐'`,
    );
    console.log('[referrals] members.referral_code added');
  }
  if (!(await columnExists('members', 'referrer_bound_at'))) {
    await execute(
      `ALTER TABLE members ADD COLUMN referrer_bound_at DATETIME(3) NULL COMMENT '推荐关系绑定时间'`,
    );
    console.log('[referrals] members.referrer_bound_at added');
  }
  if (!(await columnExists('members', 'referral_source'))) {
    await execute(
      `ALTER TABLE members ADD COLUMN referral_source VARCHAR(32) NULL COMMENT 'link | manual'`,
    );
    console.log('[referrals] members.referral_source added');
  }

  if (!(await tableExists('referrals'))) {
    await execute(`
      CREATE TABLE referrals (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        referrer_id CHAR(36) NOT NULL,
        referee_id CHAR(36) NOT NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_referrals_pair (referrer_id, referee_id),
        KEY idx_referrals_tenant (tenant_id),
        KEY idx_referrals_referee (referee_id),
        CONSTRAINT fk_referrals_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_referrals_referrer FOREIGN KEY (referrer_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_referrals_referee FOREIGN KEY (referee_id) REFERENCES members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[referrals] table referrals created');
  }

  if (!(await tableExists('referral_events'))) {
    await execute(`
      CREATE TABLE referral_events (
        id CHAR(36) NOT NULL PRIMARY KEY,
        tenant_id CHAR(36) NOT NULL,
        referrer_id CHAR(36) NOT NULL,
        referee_id CHAR(36) NOT NULL,
        event_type VARCHAR(64) NOT NULL,
        event_value DECIMAL(18,4) NULL,
        created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_ref_event (tenant_id, referrer_id, referee_id, event_type),
        KEY idx_ref_events_tenant (tenant_id),
        KEY idx_ref_events_referrer (referrer_id),
        CONSTRAINT fk_ref_events_tenant FOREIGN KEY (tenant_id) REFERENCES tenants(id) ON DELETE CASCADE,
        CONSTRAINT fk_ref_events_referrer FOREIGN KEY (referrer_id) REFERENCES members(id) ON DELETE CASCADE,
        CONSTRAINT fk_ref_events_referee FOREIGN KEY (referee_id) REFERENCES members(id) ON DELETE CASCADE
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    console.log('[referrals] table referral_events created');
  }

  await execute(
    `UPDATE members SET referral_code = invite_token
     WHERE tenant_id IS NOT NULL AND invite_token IS NOT NULL AND invite_token <> ''
       AND (referral_code IS NULL OR referral_code = '')`,
  );

  if (!(await indexExists('members', 'uk_members_tenant_referral'))) {
    try {
      await execute(
        `CREATE UNIQUE INDEX uk_members_tenant_referral ON members (tenant_id, referral_code)`,
      );
      console.log('[referrals] unique index uk_members_tenant_referral created');
    } catch (e) {
      console.warn('[referrals] uk_members_tenant_referral skipped:', (e as Error).message);
    }
  }
}

/**
 * Backfill referral_relations rows where phone/code fields are NULL but IDs exist.
 * Safe to run repeatedly — only updates rows that still have NULLs.
 */
export async function backfillReferralRelationsPhoneCodes(): Promise<void> {
  if (!(await tableExists('referral_relations'))) return;

  const result = await execute(
    `UPDATE referral_relations rr
     JOIN members ref_m ON ref_m.id = rr.referrer_id
     JOIN members ree_m ON ree_m.id = rr.referee_id
     SET rr.referrer_phone       = ref_m.phone_number,
         rr.referrer_member_code = ref_m.member_code,
         rr.referee_phone        = ree_m.phone_number,
         rr.referee_member_code  = ree_m.member_code
     WHERE (rr.referrer_phone IS NULL OR rr.referee_phone IS NULL)
       AND rr.referrer_id IS NOT NULL
       AND rr.referee_id IS NOT NULL`,
  );
  const affected = result?.affectedRows ?? 0;
  if (affected > 0) {
    console.log(`[referrals] backfilled phone/code for ${affected} referral_relations rows`);
  }
}
