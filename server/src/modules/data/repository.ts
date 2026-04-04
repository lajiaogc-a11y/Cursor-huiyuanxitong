/**
 * Data Repository - 操作日志、公司文档等 (MySQL)
 */
import { query, queryOne, execute, getPool, withTransaction } from '../../database/index.js';
import { randomUUID } from 'crypto';
import { applyPointsLedgerDeltaOnConn } from '../points/pointsLedgerAccount.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

export interface OperationLogRow {
  id: string;
  timestamp: string;
  operator_id: string | null;
  operator_account: string;
  operator_role: string;
  module: string;
  operation_type: string;
  object_id: string | null;
  object_description: string | null;
  before_data: unknown;
  after_data: unknown;
  ip_address: string | null;
  is_restored: boolean;
  restored_by: string | null;
  restored_at: string | null;
}

export interface OperationLogsQuery {
  page?: number;
  pageSize?: number;
  module?: string;
  operationType?: string;
  operatorAccount?: string;
  restoreStatus?: string;
  searchTerm?: string;
  dateStart?: string;
  dateEnd?: string;
  tenantId?: string | null;
}

export async function listOperationLogsRepository(
  q: OperationLogsQuery & { export?: boolean }
): Promise<{
  data: OperationLogRow[];
  count: number;
  distinctOperators: string[];
  moduleCounts: Record<string, number>;
}> {
  const page = q.page ?? 1;
  const maxPage = q.export ? 10000 : 100;
  const pageSize = Math.min(q.pageSize ?? 50, maxPage);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const values: unknown[] = [];

  if (q.tenantId) {
    conditions.push(`operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`);
    values.push(q.tenantId);
  }
  if (q.module && q.module !== 'all') {
    conditions.push(`module = ?`);
    values.push(q.module);
  }
  if (q.operationType && q.operationType !== 'all') {
    conditions.push(`operation_type = ?`);
    values.push(q.operationType);
  }
  if (q.operatorAccount && q.operatorAccount !== 'all') {
    conditions.push(`operator_account = ?`);
    values.push(q.operatorAccount);
  }
  if (q.restoreStatus && q.restoreStatus !== 'all') {
    conditions.push(`is_restored = ?`);
    values.push(q.restoreStatus === 'restored');
  }
  if (q.dateStart) {
    conditions.push(`timestamp >= ?`);
    values.push(toMySqlDatetime(q.dateStart));
  }
  if (q.dateEnd) {
    conditions.push(`timestamp <= ?`);
    values.push(toMySqlDatetime(q.dateEnd));
  }
  if (q.searchTerm?.trim()) {
    const term = `%${q.searchTerm.trim()}%`;
    conditions.push(`(operator_account LIKE ? OR object_id LIKE ? OR object_description LIKE ?)`);
    values.push(term, term, term);
  }

  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const [countRows, rows, opRows, modRows] = await Promise.all([
    query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM operation_logs ${whereClause}`,
      values,
    ),
    query<OperationLogRow>(
      `SELECT * FROM operation_logs ${whereClause} ORDER BY timestamp DESC LIMIT ? OFFSET ?`,
      [...values, pageSize, offset],
    ),
    query<{ a: string }>(
      `SELECT DISTINCT operator_account AS a FROM operation_logs ${whereClause} ORDER BY a`,
      values,
    ),
    query<{ m: string; c: number }>(
      `SELECT module AS m, COUNT(*) AS c FROM operation_logs ${whereClause} GROUP BY module`,
      values,
    ),
  ]);

  const distinctOperators = opRows.map((r) => r.a).filter(Boolean);
  const moduleCounts: Record<string, number> = {};
  for (const r of modRows) moduleCounts[r.m] = Number(r.c);

  return {
    data: rows,
    count: Number(countRows[0]?.count ?? 0),
    distinctOperators,
    moduleCounts,
  };
}

/**
 * 将操作日志标为已恢复（绕过 tableProxy 对 operation_logs 的 read_only）。
 * - tenant：仅更新属于该租户员工产生的日志（与列表筛选一致）
 * - platform_all：平台超管未选租户时按 id 更新（与列表「全部」一致）
 */
export async function markOperationLogRestoredRepository(
  logId: string,
  restoredById: string | null,
  scope: { kind: 'tenant'; tenantId: string } | { kind: 'platform_all' },
): Promise<number> {
  const rid = restoredById ?? null;
  if (scope.kind === 'platform_all') {
    const r = await execute(
      `UPDATE operation_logs SET is_restored = 1, restored_by = ?, restored_at = NOW(3) WHERE id = ?`,
      [rid, logId],
    );
    return Number(r.affectedRows ?? 0);
  }
  const r = await execute(
    `UPDATE operation_logs SET is_restored = 1, restored_by = ?, restored_at = NOW(3)
     WHERE id = ?
       AND operator_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
    [rid, logId, scope.tenantId],
  );
  return Number(r.affectedRows ?? 0);
}

export interface InsertOperationLogParams {
  operator_id?: string | null;
  operator_account: string;
  operator_role: string;
  module: string;
  operation_type: string;
  object_id?: string | null;
  object_description?: string | null;
  before_data?: unknown;
  after_data?: unknown;
  ip_address?: string | null;
}

/** JSON 列：已是 JSON 字符串时避免再 stringify 一层（会导致双重编码、界面乱码） */
function serializeJsonColumn(value: unknown): string | null {
  if (value == null) return null;
  if (typeof value === 'string') {
    const t = value.trim();
    if (!t) return null;
    try {
      return JSON.stringify(JSON.parse(t));
    } catch {
      return JSON.stringify(value);
    }
  }
  return JSON.stringify(value);
}

export async function insertOperationLogRepository(params: InsertOperationLogParams): Promise<void> {
  await execute(
    `INSERT INTO operation_logs (
       operator_id, operator_account, operator_role, module, operation_type,
       object_id, object_description, before_data, after_data, ip_address, timestamp
     ) VALUES (?,?,?,?,?,?,?,?,?,?,NOW(3))`,
    [
      params.operator_id ?? null,
      params.operator_account,
      params.operator_role,
      params.module,
      params.operation_type,
      params.object_id ?? null,
      params.object_description ?? null,
      serializeJsonColumn(params.before_data),
      serializeJsonColumn(params.after_data),
      params.ip_address ?? null,
    ]
  );
}

async function hasTableColumn(tableName: string, columnName: string): Promise<boolean> {
  const rows = await query<{ col_exists: number }>(
    `SELECT COUNT(*) AS col_exists
     FROM INFORMATION_SCHEMA.COLUMNS
     WHERE TABLE_SCHEMA = DATABASE()
       AND TABLE_NAME = ?
       AND COLUMN_NAME = ?`,
    [tableName, columnName]
  );
  return (rows[0]?.col_exists ?? 0) > 0;
}

export async function listKnowledgeCategoriesRepository(
  tenantId?: string | null,
  viewerEmployeeId?: string | null,
): Promise<unknown[]> {
  const hasVisibility = await hasTableColumn('knowledge_categories', 'visibility');
  const hasCreatedBy = await hasTableColumn('knowledge_categories', 'created_by');

  // 私有分类只有创建者自己可以看到；公开分类所有人可见
  let visibilitySql = '';
  const visibilityParams: unknown[] = [];
  if (hasVisibility) {
    if (viewerEmployeeId && hasCreatedBy) {
      visibilitySql = ` AND (visibility IS NULL OR visibility IN ('public','all') OR (visibility = 'private' AND created_by = ?))`;
      visibilityParams.push(viewerEmployeeId);
    } else {
      visibilitySql = ` AND (visibility IS NULL OR visibility IN ('public','all'))`;
    }
  }

  if (await hasTableColumn('knowledge_categories', 'tenant_id')) {
    const rows = tenantId
      ? await query(
          `SELECT * FROM knowledge_categories
           WHERE (tenant_id IS NULL OR tenant_id = ?)
             AND (is_active IS NULL OR is_active = true)
             ${visibilitySql}
           ORDER BY sort_order`,
          [tenantId, ...visibilityParams],
        )
      : await query(
          `SELECT * FROM knowledge_categories
           WHERE (is_active IS NULL OR is_active = true)
             ${visibilitySql}
           ORDER BY sort_order`,
          visibilityParams,
        );
    return rows as unknown[];
  }
  const rows = await query(
    `SELECT * FROM knowledge_categories WHERE 1=1${visibilitySql} ORDER BY sort_order`,
    visibilityParams,
  );
  const list = (rows || []) as Array<{ is_active?: boolean | null }>;
  return list.filter((r) => r.is_active !== false) as unknown[];
}

export async function listKnowledgeArticlesRepository(
  categoryId: string,
  tenantId?: string | null,
  viewerEmployeeId?: string | null,
): Promise<unknown[]> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  const hasCatVisibility = await hasTableColumn('knowledge_categories', 'visibility');
  const hasCatCreatedBy = await hasTableColumn('knowledge_categories', 'created_by');
  const hasArtVisibility = await hasTableColumn('knowledge_articles', 'visibility');

  const needJoin = hasCatVisibility;
  const from = needJoin
    ? `FROM knowledge_articles a INNER JOIN knowledge_categories c ON c.id = a.category_id`
    : `FROM knowledge_articles a`;
  const where: string[] = [`a.category_id = ?`, `a.is_published = true`];
  const params: unknown[] = [categoryId];

  if (hasTenantColumn && tenantId) {
    where.push(`(a.tenant_id IS NULL OR a.tenant_id = ?)`);
    params.push(tenantId);
  }

  if (hasCatVisibility && needJoin) {
    if (viewerEmployeeId && hasCatCreatedBy) {
      where.push(`(c.visibility IS NULL OR c.visibility IN ('public','all') OR (c.visibility = 'private' AND c.created_by = ?))`);
      params.push(viewerEmployeeId);
    } else {
      where.push(`(c.visibility IS NULL OR c.visibility IN ('public','all'))`);
    }
  }
  if (hasArtVisibility) {
    if (viewerEmployeeId) {
      where.push(`(a.visibility IS NULL OR a.visibility IN ('public','all') OR a.created_by = ?)`);
      params.push(viewerEmployeeId);
    } else {
      where.push(`(a.visibility IS NULL OR a.visibility IN ('public','all'))`);
    }
  }

  const sql = `SELECT a.* ${from} WHERE ${where.join(' AND ')} ORDER BY a.sort_order`;
  const rows = await query(sql, params);
  return rows as unknown[];
}

export async function listKnowledgeReadStatusRepository(employeeId: string): Promise<string[]> {
  const rows = await query<{ article_id: string }>(
    `SELECT article_id FROM knowledge_read_status WHERE employee_id = ?`,
    [employeeId]
  );
  return rows.map((row) => row.article_id);
}

/** 未读总数 + 按分类（与侧栏/顶栏/分类 Tab 一致） */
export async function getKnowledgeUnreadCountsRepository(
  employeeId: string,
  tenantId?: string | null,
): Promise<{ unreadCount: number; unreadByCategory: Record<string, number> }> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  const hasCatVisibility = await hasTableColumn('knowledge_categories', 'visibility');
  const hasCatCreatedBy = await hasTableColumn('knowledge_categories', 'created_by');
  const hasArtVisibility = await hasTableColumn('knowledge_articles', 'visibility');

  const needJoin = hasCatVisibility;
  const from = needJoin
    ? `FROM knowledge_articles a INNER JOIN knowledge_categories c ON c.id = a.category_id`
    : `FROM knowledge_articles a`;

  const conds = [`a.is_published = true`, `a.created_by <> ?`];
  const vals: unknown[] = [employeeId];

  if (hasTenantColumn && tenantId) {
    conds.push(`(a.tenant_id IS NULL OR a.tenant_id = ?)`);
    vals.push(tenantId);
  }

  if (hasCatVisibility && needJoin) {
    if (hasCatCreatedBy) {
      conds.push(`(c.visibility IS NULL OR c.visibility IN ('public','all') OR (c.visibility = 'private' AND c.created_by = ?))`);
      vals.push(employeeId);
    } else {
      conds.push(`(c.visibility IS NULL OR c.visibility IN ('public','all'))`);
    }
  }
  if (hasArtVisibility) {
    conds.push(`(a.visibility IS NULL OR a.visibility IN ('public','all') OR a.created_by = ?)`);
    vals.push(employeeId);
  }

  const [articles, readStatus] = await Promise.all([
    query<{ id: string; category_id: string | null }>(
      `SELECT a.id AS id, a.category_id AS category_id ${from} WHERE ${conds.join(' AND ')}`,
      vals,
    ),
    query<{ article_id: string }>(
      `SELECT article_id FROM knowledge_read_status WHERE employee_id = ?`,
      [employeeId],
    ),
  ]);
  const readArticleIds = new Set(readStatus.map((row) => row.article_id));
  const unreadByCategory: Record<string, number> = {};
  let unreadCount = 0;
  for (const row of articles) {
    if (readArticleIds.has(row.id)) continue;
    unreadCount++;
    const cid = row.category_id != null ? String(row.category_id) : '';
    if (cid) {
      unreadByCategory[cid] = (unreadByCategory[cid] || 0) + 1;
    }
  }
  return { unreadCount, unreadByCategory };
}

export async function getKnowledgeUnreadCountRepository(
  employeeId: string,
  tenantId?: string | null,
): Promise<number> {
  const r = await getKnowledgeUnreadCountsRepository(employeeId, tenantId);
  return r.unreadCount;
}

export async function markKnowledgeArticleReadRepository(employeeId: string, articleId: string): Promise<void> {
  await execute(
    `INSERT INTO knowledge_read_status (employee_id, article_id, read_at)
     VALUES (?, ?, NOW())
     ON DUPLICATE KEY UPDATE read_at = NOW()`,
    [employeeId, articleId]
  );
}

export async function markAllKnowledgeArticlesReadRepository(employeeId: string, tenantId?: string | null): Promise<number> {
  const articleConditions = [
    `is_published = true`,
    `(visibility IS NULL OR visibility IN ('public','all'))`,
    `created_by <> ?`,
  ];
  const articleValues: unknown[] = [employeeId];
  if (await hasTableColumn('knowledge_articles', 'tenant_id') && tenantId) {
    articleConditions.push(`(tenant_id IS NULL OR tenant_id = ?)`);
    articleValues.push(tenantId);
  }
  const articles = await query<{ id: string }>(
    `SELECT id FROM knowledge_articles WHERE ${articleConditions.join(' AND ')}`,
    articleValues
  );
  if (!articles.length) return 0;
  for (const article of articles) {
    await execute(
      `INSERT INTO knowledge_read_status (employee_id, article_id, read_at)
       VALUES (?, ?, NOW())
       ON DUPLICATE KEY UPDATE read_at = NOW()`,
      [employeeId, article.id]
    );
  }
  return articles.length;
}

export interface KnowledgeCategoryRow {
  id: string;
  tenant_id?: string | null;
  name: string;
  content_type: 'text' | 'phrase' | 'image';
  sort_order: number;
  is_active?: boolean;
  created_by?: string | null;
  created_at?: string;
  visibility: 'public' | 'private';
}

export interface KnowledgeArticleRow {
  id: string;
  tenant_id?: string | null;
  category_id: string;
  title_zh: string;
  title_en?: string | null;
  content?: string | null;
  description?: string | null;
  image_url?: string | null;
  sort_order: number;
  is_published: boolean;
  created_by?: string | null;
  created_at?: string;
  updated_at?: string;
  visibility: 'public' | 'private';
}

export async function createKnowledgeCategoryRepository(
  input: Omit<KnowledgeCategoryRow, 'id'>
): Promise<KnowledgeCategoryRow> {
  const [hasTenantColumn, hasContentType, hasVisibility, hasCreatedBy, hasIsActive, hasSortOrder] =
    await Promise.all([
      hasTableColumn('knowledge_categories', 'tenant_id'),
      hasTableColumn('knowledge_categories', 'content_type'),
      hasTableColumn('knowledge_categories', 'visibility'),
      hasTableColumn('knowledge_categories', 'created_by'),
      hasTableColumn('knowledge_categories', 'is_active'),
      hasTableColumn('knowledge_categories', 'sort_order'),
    ]);

  if (hasTenantColumn) {
    const tid = String(input.tenant_id ?? '').trim();
    if (!tid) {
      throw new Error('tenant_id is required for knowledge_categories insert');
    }
  }

  const id = crypto.randomUUID();
  const columns: string[] = ['id', 'name'];
  const values: unknown[] = [id, input.name];

  if (hasTenantColumn) {
    columns.push('tenant_id');
    values.push(String(input.tenant_id).trim());
  }
  if (hasSortOrder) {
    columns.push('sort_order');
    values.push(input.sort_order ?? 0);
  }
  if (hasContentType) {
    columns.push('content_type');
    values.push(input.content_type);
  }
  if (hasVisibility) {
    columns.push('visibility');
    values.push(input.visibility);
  }
  if (hasCreatedBy) {
    columns.push('created_by');
    values.push(input.created_by ?? null);
  }
  if (hasIsActive) {
    columns.push('is_active');
    values.push(input.is_active !== false ? 1 : 0);
  }

  await execute(
    `INSERT INTO knowledge_categories (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  const row = await queryOne<KnowledgeCategoryRow>(`SELECT * FROM knowledge_categories WHERE id = ?`, [id]);
  return row!;
}

export async function updateKnowledgeCategoryRepository(
  id: string,
  updates: Partial<KnowledgeCategoryRow>,
  tenantId?: string | null
): Promise<KnowledgeCategoryRow | null> {
  const hasTenantColumn = await hasTableColumn('knowledge_categories', 'tenant_id');
  const existing = await queryOne<KnowledgeCategoryRow>(`SELECT * FROM knowledge_categories WHERE id = ?`, [id]);
  if (!existing) return null;

  const scopeTenant = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : null;
  if (hasTenantColumn && scopeTenant) {
    const rowTid = existing.tenant_id != null && String(existing.tenant_id).trim() !== '' ? String(existing.tenant_id).trim() : null;
    if (rowTid && rowTid !== scopeTenant) {
      return null;
    }
  }

  const setClauses: string[] = [];
  const values: unknown[] = [];
  const assign = (column: string, value: any) => {
    if (value === undefined) return;
    setClauses.push(`${column} = ?`);
    values.push(value);
  };
  assign('name', updates.name);
  assign('content_type', updates.content_type);
  assign('sort_order', updates.sort_order);
  assign('visibility', updates.visibility);
  assign('is_active', updates.is_active);

  // 为 tenant_id 为空的旧数据补上当前租户
  if (hasTenantColumn && scopeTenant) {
    const rowTid = existing.tenant_id != null && String(existing.tenant_id).trim() !== '' ? String(existing.tenant_id).trim() : null;
    if (!rowTid) {
      setClauses.push('tenant_id = ?');
      values.push(scopeTenant);
    }
  }

  if (!setClauses.length) return existing;

  const conditions = ['id = ?'];
  values.push(id);
  if (hasTenantColumn && scopeTenant) {
    const rowTid = existing.tenant_id != null && String(existing.tenant_id).trim() !== '' ? String(existing.tenant_id).trim() : null;
    if (rowTid) {
      conditions.push('tenant_id = ?');
      values.push(scopeTenant);
    } else {
      conditions.push('(tenant_id IS NULL OR tenant_id = ?)');
      values.push(scopeTenant);
    }
  }
  await execute(
    `UPDATE knowledge_categories SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`,
    values
  );
  return await queryOne<KnowledgeCategoryRow>(`SELECT * FROM knowledge_categories WHERE id = ?`, [id]);
}

export async function deleteKnowledgeCategoryRepository(id: string, tenantId?: string | null): Promise<boolean> {
  const hasTenantCat = await hasTableColumn('knowledge_categories', 'tenant_id');
  const hasTenantArt = await hasTableColumn('knowledge_articles', 'tenant_id');
  const hasReadStatus = await hasTableColumn('knowledge_read_status', 'article_id');

  const catConditions = ['id = ?'];
  const catValues: unknown[] = [id];
  if (hasTenantCat && tenantId) {
    catConditions.push('(tenant_id IS NULL OR tenant_id = ?)');
    catValues.push(tenantId);
  }

  const artValues: unknown[] = [id];
  const artWherePlainParts = ['category_id = ?'];
  const artWhereAliasedParts = ['a.category_id = ?'];
  if (hasTenantArt && tenantId) {
    artWherePlainParts.push('(tenant_id IS NULL OR tenant_id = ?)');
    artWhereAliasedParts.push('(a.tenant_id IS NULL OR a.tenant_id = ?)');
    artValues.push(tenantId);
  }
  const artWherePlain = artWherePlainParts.join(' AND ');
  const artWhereAliased = artWhereAliasedParts.join(' AND ');

  return withTransaction(async (conn) => {
    if (hasReadStatus) {
      await conn.query(
        `DELETE rs FROM knowledge_read_status rs
         INNER JOIN knowledge_articles a ON a.id = rs.article_id
         WHERE ${artWhereAliased}`,
        artValues
      );
    }

    await conn.query(`DELETE FROM knowledge_articles WHERE ${artWherePlain}`, artValues);

    const [delCat] = await conn.query(`DELETE FROM knowledge_categories WHERE ${catConditions.join(' AND ')}`, catValues);
    const header = delCat as { affectedRows?: number };
    return (header.affectedRows ?? 0) > 0;
  });
}

export async function createKnowledgeArticleRepository(
  input: Omit<KnowledgeArticleRow, 'id'>
): Promise<KnowledgeArticleRow> {
  const [
    hasTenantColumn,
    hasTitle,
    hasTitleZh,
    hasTitleEn,
    hasContent,
    hasDescription,
    hasImageUrl,
    hasSortOrder,
    hasIsPublished,
    hasVisibility,
    hasCreatedBy,
    hasAuthorId,
  ] = await Promise.all([
    hasTableColumn('knowledge_articles', 'tenant_id'),
    hasTableColumn('knowledge_articles', 'title'),
    hasTableColumn('knowledge_articles', 'title_zh'),
    hasTableColumn('knowledge_articles', 'title_en'),
    hasTableColumn('knowledge_articles', 'content'),
    hasTableColumn('knowledge_articles', 'description'),
    hasTableColumn('knowledge_articles', 'image_url'),
    hasTableColumn('knowledge_articles', 'sort_order'),
    hasTableColumn('knowledge_articles', 'is_published'),
    hasTableColumn('knowledge_articles', 'visibility'),
    hasTableColumn('knowledge_articles', 'created_by'),
    hasTableColumn('knowledge_articles', 'author_id'),
  ]);

  if (hasTenantColumn) {
    const tid = String(input.tenant_id ?? '').trim();
    if (!tid) {
      throw new Error('tenant_id is required for knowledge_articles insert');
    }
  }

  if (!hasTitle && !hasTitleZh) {
    throw new Error('knowledge_articles 表缺少 title 与 title_zh 列，无法插入');
  }
  if (!hasContent) {
    throw new Error('knowledge_articles 表缺少 content 列，无法插入');
  }

  const id = crypto.randomUUID();
  /** 旧版 schema 中 title 为 NOT NULL，与 title_zh 同步 */
  const legacyTitle = input.title_zh.slice(0, 255);
  const safeContent = input.content ?? '';

  const columns: string[] = ['id', 'category_id'];
  const values: unknown[] = [id, input.category_id];

  if (hasTenantColumn) {
    columns.push('tenant_id');
    values.push(String(input.tenant_id).trim());
  }
  if (hasTitle) {
    columns.push('title');
    values.push(legacyTitle);
  }
  if (hasTitleZh) {
    columns.push('title_zh');
    values.push(input.title_zh);
  }
  if (hasTitleEn) {
    columns.push('title_en');
    values.push(input.title_en ?? null);
  }
  columns.push('content');
  values.push(safeContent);
  if (hasDescription) {
    columns.push('description');
    values.push(input.description ?? null);
  }
  if (hasImageUrl) {
    columns.push('image_url');
    values.push(input.image_url ?? null);
  }
  if (hasSortOrder) {
    columns.push('sort_order');
    values.push(input.sort_order ?? 0);
  }
  if (hasIsPublished) {
    columns.push('is_published');
    values.push(input.is_published ? 1 : 0);
  }
  if (hasVisibility) {
    columns.push('visibility');
    values.push(input.visibility);
  }
  if (hasCreatedBy) {
    columns.push('created_by');
    values.push(input.created_by ?? null);
  } else if (hasAuthorId) {
    columns.push('author_id');
    values.push(input.created_by ?? null);
  }

  await execute(
    `INSERT INTO knowledge_articles (${columns.join(', ')}) VALUES (${columns.map(() => '?').join(', ')})`,
    values
  );
  const row = await queryOne<KnowledgeArticleRow>(`SELECT * FROM knowledge_articles WHERE id = ?`, [id]);
  return row!;
}

export async function updateKnowledgeArticleRepository(
  id: string,
  updates: Partial<KnowledgeArticleRow>,
  tenantId?: string | null
): Promise<KnowledgeArticleRow | null> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  const hasLegacyTitle = await hasTableColumn('knowledge_articles', 'title');
  const setClauses: string[] = ['updated_at = NOW()'];
  const values: unknown[] = [];
  const assign = (column: string, value: any) => {
    if (value === undefined) return;
    setClauses.push(`${column} = ?`);
    values.push(value);
  };
  assign('title_zh', updates.title_zh);
  if (updates.title_zh !== undefined && hasLegacyTitle) {
    assign('title', updates.title_zh.slice(0, 255));
  }
  assign('title_en', updates.title_en ?? null);
  if (updates.content !== undefined) {
    assign('content', updates.content ?? '');
  }
  assign('description', updates.description ?? null);
  assign('image_url', updates.image_url ?? null);
  assign('sort_order', updates.sort_order);
  assign('is_published', updates.is_published);
  assign('visibility', updates.visibility);
  if (setClauses.length <= 1) return null; // only updated_at

  const conditions = ['id = ?'];
  values.push(id);
  if (hasTenantColumn && tenantId) {
    conditions.push('(tenant_id IS NULL OR tenant_id = ?)');
    values.push(tenantId);
  }
  await execute(
    `UPDATE knowledge_articles SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`,
    values
  );
  return await queryOne<KnowledgeArticleRow>(`SELECT * FROM knowledge_articles WHERE id = ?`, [id]);
}

export async function deleteKnowledgeArticleRepository(id: string, tenantId?: string | null): Promise<boolean> {
  const hasReadStatus = await hasTableColumn('knowledge_read_status', 'article_id');
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  const conditions = ['id = ?'];
  const values: unknown[] = [id];
  if (hasTenantColumn && tenantId) {
    conditions.push('(tenant_id IS NULL OR tenant_id = ?)');
    values.push(tenantId);
  }
  const whereArt = conditions.join(' AND ');
  return withTransaction(async (conn) => {
    if (hasReadStatus) {
      if (hasTenantColumn && tenantId) {
        await conn.query(
          `DELETE rs FROM knowledge_read_status rs
           INNER JOIN knowledge_articles a ON a.id = rs.article_id
           WHERE a.id = ? AND (a.tenant_id IS NULL OR a.tenant_id = ?)`,
          [id, tenantId],
        );
      } else {
        await conn.query(`DELETE FROM knowledge_read_status WHERE article_id = ?`, [id]);
      }
    }
    const [delArt] = await conn.query(`DELETE FROM knowledge_articles WHERE ${whereArt}`, values);
    const header = delArt as { affectedRows?: number };
    return (header.affectedRows ?? 0) > 0;
  });
}

export interface LoginLogRow {
  id: string;
  employee_id: string | null;
  username?: string | null;
  employee_name?: string;
  login_time: string;
  ip_address: string | null;
  ip_location?: string | null;
  success: boolean | null;
  failure_reason: string | null;
  user_agent: string | null;
}

export interface CurrencyRow {
  id: string;
  code: string;
  name_zh: string;
  name_en?: string | null;
  symbol?: string | null;
  badge_color?: string | null;
  sort_order: number;
  is_active: boolean;
}

export interface ActivityTypeRow {
  id: string;
  value: string;
  label: string;
  is_active: boolean;
  sort_order: number;
}

export interface CustomerSourceRow {
  id: string;
  name: string;
  sort_order: number;
  is_active: boolean;
  created_at: string;
  updated_at: string;
}

export interface ShiftReceiverRow {
  id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface ShiftHandoverRow {
  id: string;
  handover_employee_id: string | null;
  handover_employee_name: string;
  receiver_name: string;
  handover_time: string;
  card_merchant_data: unknown;
  payment_provider_data: unknown;
  remark: string | null;
  created_at: string;
}

export interface AuditRecordRow {
  id: string;
  target_table: string;
  target_id: string;
  action_type: string;
  old_data: unknown;
  new_data: unknown;
  submitter_id: string | null;
  reviewer_id: string | null;
  review_time: string | null;
  review_comment: string | null;
  status: string;
  created_at: string;
  submitter_name?: string;
  reviewer_name?: string;
}

export interface ActivityGiftMutationRow {
  id: string;
  gift_number?: string | null;
  currency: string;
  amount: number | string;
  rate: number | string;
  phone_number: string;
  payment_agent: string | null;
  gift_type: string | null;
  fee: number | string | null;
  gift_value: number | string | null;
  remark: string | null;
  creator_id: string | null;
  member_id?: string | null;
  created_at: string;
}

export interface RolePermissionRow {
  id: string;
  role: string;
  module_name: string;
  field_name: string;
  can_view: boolean;
  can_edit: boolean;
  can_delete: boolean;
}

function deriveIpLocation(ip: string | null | undefined): string | null {
  if (!ip) return null;
  const trimmed = ip.trim();
  const normalized = trimmed.startsWith('::ffff:') ? trimmed.slice(7) : trimmed;
  if (normalized === '127.0.0.1' || normalized === '::1' || normalized === 'localhost') {
    return '本机';
  }
  if (/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(normalized)) {
    return '内网';
  }
  return null;
}

function buildActivityGiftTenantCondition(): string {
  return `(
    EXISTS (SELECT 1 FROM employees e WHERE e.id = activity_gifts.creator_id AND e.tenant_id = ?)
    OR EXISTS (SELECT 1 FROM members m WHERE m.id = activity_gifts.member_id AND m.tenant_id = ?)
  )`;
}

export async function updateActivityGiftRepository(
  giftId: string,
  updates: Partial<ActivityGiftMutationRow>,
  tenantId?: string | null
): Promise<ActivityGiftMutationRow | null> {
  const setClauses: string[] = [];
  const values: unknown[] = [];
  const assign = (column: string, value: any) => {
    if (value === undefined) return;
    setClauses.push(`${column} = ?`);
    values.push(value);
  };
  assign('currency', updates.currency);
  assign('amount', updates.amount);
  assign('rate', updates.rate);
  assign('phone_number', updates.phone_number);
  assign('payment_agent', updates.payment_agent ?? null);
  assign('gift_type', updates.gift_type ?? null);
  assign('fee', updates.fee);
  assign('gift_value', updates.gift_value);
  assign('remark', updates.remark ?? null);
  assign('creator_id', updates.creator_id ?? null);

  if (setClauses.length === 0) {
    const conditions = ['id = ?'];
    const qValues: unknown[] = [giftId];
    if (tenantId) {
      conditions.push(buildActivityGiftTenantCondition());
      qValues.push(tenantId, tenantId);
    }
    return await queryOne<ActivityGiftMutationRow>(
      `SELECT * FROM activity_gifts WHERE ${conditions.join(' AND ')} LIMIT 1`,
      qValues
    );
  }

  const conditions = ['id = ?'];
  values.push(giftId);
  if (tenantId) {
    conditions.push(buildActivityGiftTenantCondition());
    values.push(tenantId, tenantId);
  }
  await execute(
    `UPDATE activity_gifts SET ${setClauses.join(', ')} WHERE ${conditions.join(' AND ')}`,
    values
  );
  return await queryOne<ActivityGiftMutationRow>(`SELECT * FROM activity_gifts WHERE id = ?`, [giftId]);
}

export async function deleteActivityGiftRepository(
  giftId: string,
  tenantId?: string | null
): Promise<{ gift: ActivityGiftMutationRow | null; restored_points: number }> {
  const conditions = ['id = ?'];
  const qValues: unknown[] = [giftId];
  if (tenantId) {
    conditions.push(buildActivityGiftTenantCondition());
    qValues.push(tenantId, tenantId);
  }
  const gift = await queryOne<ActivityGiftMutationRow>(
    `SELECT * FROM activity_gifts WHERE ${conditions.join(' AND ')} LIMIT 1`,
    qValues
  );

  if (!gift) {
    return { gift: null, restored_points: 0 };
  }

  const deleteResult = await execute(`DELETE FROM activity_gifts WHERE id = ?`, [giftId]);
  if (deleteResult.affectedRows === 0) {
    return { gift: null, restored_points: 0 };
  }

  let restoredPoints = 0;
  const amount = Number(gift.amount) || 0;

  if (amount > 0 && gift.phone_number) {
    const currency = gift.currency || 'NGN';
    let giftField = 'total_gift_ngn';
    if (currency === 'GHS' || currency === '赛地') giftField = 'total_gift_ghs';
    else if (currency === 'USDT') giftField = 'total_gift_usdt';

    const act = gift.member_id
      ? await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE member_id = ? LIMIT 1`, [gift.member_id])
      : await queryOne<{ id: string }>(`SELECT id FROM member_activity WHERE phone_number = ? LIMIT 1`, [gift.phone_number]);

    if (act) {
      await execute(
        `UPDATE member_activity SET ${giftField} = GREATEST(0, COALESCE(${giftField}, 0) - ?), updated_at = NOW() WHERE id = ?`,
        [amount, act.id]
      );
    }
  }

  // 查找该赠送关联的积分兑换流水，回退实际积分（而非赠送金额）
  const giftType = gift.gift_type || '';
  const isRedemptionGift =
    giftType === 'activity_1' || giftType === 'activity_2' || giftType === 'points_redeem';

  if (isRedemptionGift && gift.member_id) {
    const ledgerTypes = ['redeem_activity_1', 'redeem_activity_2', 'redemption'];
    const typePlaceholders = ledgerTypes.map(() => '?').join(',');

    // 按 member_id + 兑换类型 + 创建时间±5秒 匹配对应的积分流水
    const ledgerEntry = await queryOne<{
      id: string;
      member_id: string;
      amount: number;
      type: string;
      member_code: string | null;
      phone_number: string | null;
      creator_id: string | null;
      tenant_id: string | null;
    }>(
      `SELECT id, member_id, amount, type, member_code, phone_number, creator_id, tenant_id
       FROM points_ledger
       WHERE member_id = ?
         AND type IN (${typePlaceholders})
         AND amount < 0
         AND ABS(TIMESTAMPDIFF(SECOND, created_at, ?)) <= 5
       ORDER BY ABS(TIMESTAMPDIFF(MICROSECOND, created_at, ?)) ASC
       LIMIT 1`,
      [gift.member_id, ...ledgerTypes, gift.created_at, gift.created_at]
    );

    if (ledgerEntry) {
      const pointsToRestore = Math.abs(Number(ledgerEntry.amount));
      const restoreTxnType = ledgerEntry.type || 'redemption';
      if (pointsToRestore > 0) {
        try {
          await withTransaction(async (conn) => {
            await applyPointsLedgerDeltaOnConn(conn, {
              ledgerId: randomUUID(),
              memberId: ledgerEntry.member_id,
              // 与原始兑换流水同一 transaction_type，便于积分汇总按类型正负抵消
              type: restoreTxnType,
              delta: pointsToRestore,
              description: `删除活动赠送回退积分 (${gift.gift_number || giftId})`,
              referenceType: 'gift_delete',
              referenceId: giftId,
              createdBy: gift.creator_id ?? null,
              extras: {
                member_code: ledgerEntry.member_code ?? null,
                phone_number: ledgerEntry.phone_number ?? gift.phone_number ?? null,
                transaction_type: restoreTxnType,
                points_earned: pointsToRestore,
                status: 'issued',
                creator_id: gift.creator_id ?? null,
                tenant_id: ledgerEntry.tenant_id ?? null,
              },
            });
          });
          restoredPoints = pointsToRestore;
        } catch (e) {
          console.error('[deleteActivityGift] Failed to restore points via ledger:', e);
        }
      }
    }
  }

  return { gift, restored_points: restoredPoints };
}

export async function listLoginLogsRepository(
  limit = 100,
  tenantId?: string | null,
  offset = 0,
  role = 'admin',
  employeeId?: string | null,
): Promise<{ rows: LoginLogRow[]; total: number }> {
  const conditions: string[] = [];
  const values: unknown[] = [];
  if (tenantId) {
    // 含 employee_id 为 NULL 的失败记录：只要当时尝试的用户名属于本租户员工即归属本租户（与仅按 employee_id 过滤相比，避免「记录消失」）
    conditions.push(
      `(
        employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)
        OR (
          employee_id IS NULL
          AND username IN (SELECT username FROM employees WHERE tenant_id = ?)
        )
      )`,
    );
    values.push(tenantId, tenantId);
  }

  // 角色级别过滤：admin 看全部（租户内），manager 看下属+自己，staff 只看自己
  if (role === 'staff' && employeeId) {
    conditions.push(`employee_id = ?`);
    values.push(employeeId);
  } else if (role === 'manager' && employeeId) {
    // manager 看自己 + 自己管理的员工（supervisor_id = 自己）
    conditions.push(
      `(
        employee_id = ?
        OR employee_id IN (SELECT id FROM employees WHERE supervisor_id = ?)
      )`,
    );
    values.push(employeeId, employeeId);
  }
  // admin: 不加额外过滤，看租户内全部
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

  const countResult = await query<{ total: number }>(
    `SELECT COUNT(*) AS total FROM employee_login_logs ${whereClause}`,
    values
  );
  const total = Number(countResult[0]?.total ?? 0);

  const pageValues = [...values, limit, offset];
  const logsData = await query<LoginLogRow>(
    `SELECT id, employee_id, username,
            COALESCE(login_time, created_at) AS login_time,
            ip_address, ip_location, success, failure_reason, user_agent
     FROM employee_login_logs
     ${whereClause}
     ORDER BY COALESCE(login_time, created_at) DESC
     LIMIT ? OFFSET ?`,
    pageValues
  );

  const empIds = [...new Set(logsData.map((l) => l.employee_id).filter((id): id is string => !!id))];
  const employeeMap = new Map<string, string>();
  if (empIds.length > 0) {
    const placeholders = empIds.map(() => '?').join(',');
    const employeesData = await query<{ id: string; real_name: string }>(
      `SELECT id, real_name FROM employees WHERE id IN (${placeholders})`,
      empIds
    );
    employeesData.forEach((emp) => employeeMap.set(emp.id, emp.real_name));
  }

  const rows = logsData.map((log) => ({
    ...log,
    employee_name: log.employee_id
      ? employeeMap.get(log.employee_id) || '-'
      : (log.username?.trim() ? log.username : '-'),
    ip_location: log.ip_location || deriveIpLocation(log.ip_address),
  }));
  return { rows, total };
}

export async function listCurrenciesRepository(): Promise<CurrencyRow[]> {
  return await query<CurrencyRow>(
    `SELECT id, code, name_zh, name_en, symbol, badge_color, sort_order, is_active
     FROM currencies ORDER BY sort_order ASC, code ASC`
  );
}

export async function listActivityTypesRepository(): Promise<ActivityTypeRow[]> {
  // SELECT *：兼容历史表同时存在 name/code 与 label/value，由前端 API 层统一挑选展示名
  return await query<ActivityTypeRow>(
    `SELECT * FROM activity_types ORDER BY sort_order ASC, id ASC`
  );
}

export async function listCustomerSourcesRepository(): Promise<CustomerSourceRow[]> {
  return await query<CustomerSourceRow>(
    `SELECT id, name, sort_order, is_active, created_at, updated_at
     FROM customer_sources ORDER BY sort_order ASC, name ASC`
  );
}

export async function listShiftReceiversRepository(): Promise<ShiftReceiverRow[]> {
  return await query<ShiftReceiverRow>(
    `SELECT id, name, sort_order, created_at, updated_at
     FROM shift_receivers ORDER BY sort_order ASC, name ASC`
  );
}

export async function listShiftHandoversRepository(tenantId?: string | null): Promise<ShiftHandoverRow[]> {
  if (tenantId) {
    return await query<ShiftHandoverRow>(
      `SELECT sh.id, sh.handover_employee_id, sh.handover_employee_name, sh.receiver_name,
              sh.handover_time, sh.card_merchant_data, sh.payment_provider_data, sh.remark, sh.created_at
       FROM shift_handovers sh
       WHERE sh.handover_employee_id IN (SELECT id FROM employees WHERE tenant_id = ?)
       ORDER BY sh.handover_time DESC`,
      [tenantId]
    );
  }
  return await query<ShiftHandoverRow>(
    `SELECT id, handover_employee_id, handover_employee_name, receiver_name,
            handover_time, card_merchant_data, payment_provider_data, remark, created_at
     FROM shift_handovers ORDER BY handover_time DESC`
  );
}

export async function listAuditRecordsRepository(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
  searchTerm?: string;
}): Promise<{ data: AuditRecordRow[]; count: number }> {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;

  const conditions: string[] = [];
  const values: unknown[] = [];
  if (params.status) {
    conditions.push(`ar.status = ?`);
    values.push(params.status);
  }
  if (params.dateFrom) {
    conditions.push(`ar.created_at >= ?`);
    values.push(toMySqlDatetime(params.dateFrom));
  }
  if (params.dateTo) {
    conditions.push(`ar.created_at <= ?`);
    values.push(toMySqlDatetime(params.dateTo));
  }
  if (params.tenantId) {
    conditions.push(`ar.submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)`);
    values.push(params.tenantId);
  }
  if (params.searchTerm?.trim()) {
    const term = `%${params.searchTerm.trim()}%`;
    conditions.push(`(se.real_name LIKE ? OR ar.target_table LIKE ? OR ar.target_id LIKE ? OR CAST(ar.old_data AS CHAR) LIKE ? OR CAST(ar.new_data AS CHAR) LIKE ?)`);
    values.push(term, term, term, term, term);
  }
  const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const countRows = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM audit_records ar ${whereClause}`,
    values
  );
  const rows = await query<AuditRecordRow>(
    `SELECT
       ar.id, ar.target_table, ar.target_id, ar.action_type, ar.old_data, ar.new_data,
       ar.submitter_id, ar.reviewer_id, ar.review_time, ar.review_comment, ar.status, ar.created_at,
       COALESCE(se.real_name, '-') AS submitter_name,
       COALESCE(re.real_name, '-') AS reviewer_name
     FROM audit_records ar
     LEFT JOIN employees se ON se.id = ar.submitter_id
     LEFT JOIN employees re ON re.id = ar.reviewer_id
     ${whereClause}
     ORDER BY ar.created_at DESC
     LIMIT ? OFFSET ?`,
    [...values, pageSize, offset]
  );
  return { data: rows, count: Number(countRows[0]?.count ?? 0) };
}

export async function countPendingAuditRecordsRepository(tenantId?: string | null): Promise<number> {
  const tid = tenantId != null && String(tenantId).trim() !== '' ? String(tenantId).trim() : '';
  if (tid) {
    const rows = await query<{ count: number }>(
      `SELECT COUNT(*) AS count FROM audit_records WHERE status = 'pending' AND submitter_id IN (SELECT id FROM employees WHERE tenant_id = ?)`,
      [tid],
    );
    return Number(rows[0]?.count ?? 0);
  }
  const rowsAll = await query<{ count: number }>(
    `SELECT COUNT(*) AS count FROM audit_records WHERE status = 'pending'`,
  );
  return Number(rowsAll[0]?.count ?? 0);
}

let _rpTableFixed = false;

async function ensureRolePermissionsTable(): Promise<void> {
  if (_rpTableFixed) return;
  try {
    const cols = await query<{ Field: string }>('SHOW COLUMNS FROM role_permissions');
    const colNames = new Set(cols.map(c => c.Field));

    if (!colNames.has('module_name')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN module_name VARCHAR(100) NULL`);
    }
    if (!colNames.has('field_name')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN field_name VARCHAR(100) NULL`);
    }
    if (!colNames.has('can_view')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_view TINYINT(1) NOT NULL DEFAULT 1`);
    }
    if (!colNames.has('can_edit')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_edit TINYINT(1) NOT NULL DEFAULT 0`);
    }
    if (!colNames.has('can_delete')) {
      await execute(`ALTER TABLE role_permissions ADD COLUMN can_delete TINYINT(1) NOT NULL DEFAULT 0`);
    }

    if (colNames.has('permission')) {
      try {
        await execute(`ALTER TABLE role_permissions MODIFY COLUMN permission VARCHAR(255) NULL DEFAULT ''`);
      } catch { /* column may already have correct type */ }
    }

    try {
      await execute(
        `ALTER TABLE role_permissions ADD UNIQUE INDEX uk_role_module_field (role, module_name, field_name)`
      );
    } catch { /* index may already exist */ }

    _rpTableFixed = true;
  } catch (e) {
    await execute(`
      CREATE TABLE IF NOT EXISTS role_permissions (
        id CHAR(36) NOT NULL PRIMARY KEY,
        role VARCHAR(50) NOT NULL,
        permission VARCHAR(255) NULL DEFAULT '',
        module_name VARCHAR(100) NULL,
        field_name VARCHAR(100) NULL,
        can_view TINYINT(1) NOT NULL DEFAULT 1,
        can_edit TINYINT(1) NOT NULL DEFAULT 0,
        can_delete TINYINT(1) NOT NULL DEFAULT 0,
        created_at DATETIME(3) DEFAULT CURRENT_TIMESTAMP(3),
        UNIQUE KEY uk_role_module_field (role, module_name, field_name)
      ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
    `);
    _rpTableFixed = true;
  }
}

export async function listRolePermissionsRepository(): Promise<RolePermissionRow[]> {
  await ensureRolePermissionsTable();
  return await query<RolePermissionRow>(
    `SELECT id, role, module_name, field_name, can_view, can_edit, can_delete FROM role_permissions`
  );
}

export async function saveRolePermissionsBatch(
  role: string,
  items: { module_name: string; field_name: string; can_view: boolean; can_edit: boolean; can_delete: boolean }[]
): Promise<number> {
  await ensureRolePermissionsTable();
  let saved = 0;
  for (const item of items) {
    const existing = await queryOne<{ id: string }>(
      `SELECT id FROM role_permissions WHERE role = ? AND module_name = ? AND field_name = ?`,
      [role, item.module_name, item.field_name]
    );
    if (existing) {
      await execute(
        `UPDATE role_permissions SET can_view = ?, can_edit = ?, can_delete = ? WHERE id = ?`,
        [item.can_view ? 1 : 0, item.can_edit ? 1 : 0, item.can_delete ? 1 : 0, existing.id]
      );
    } else {
      const id = (await import('crypto')).randomUUID();
      const permKey = `${item.module_name}.${item.field_name}`.slice(0, 255);
      await execute(
        `INSERT INTO role_permissions (id, role, permission, module_name, field_name, can_view, can_edit, can_delete)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, role, permKey, item.module_name, item.field_name,
         item.can_view ? 1 : 0, item.can_edit ? 1 : 0, item.can_delete ? 1 : 0]
      );
    }
    saved++;
  }
  return saved;
}

/** 解析 JSON 列：非法字符串不抛错，避免拖垮整条 API 链 */
export function safeParseJsonColumn(value: unknown, context?: string): unknown | null {
  if (value == null) return null;
  if (typeof value === 'object') return value;
  if (typeof value !== 'string') return value;
  const s = value.trim();
  if (!s) return null;
  try {
    return JSON.parse(s) as unknown;
  } catch (e) {
    console.error(`[Data] JSON parse failed${context ? ` (${context})` : ''}:`, e);
    return null;
  }
}

export async function getIpAccessControlSettingRepository(): Promise<unknown | null> {
  const row = await queryOne<{ setting_value: unknown }>(
    `SELECT setting_value FROM data_settings WHERE setting_key = 'ip_access_control' LIMIT 1`
  );
  if (!row?.setting_value) return null;
  return safeParseJsonColumn(row.setting_value, 'ip_access_control');
}

export async function getSharedDataRepository(tenantId: string | null, dataKey: string): Promise<unknown> {
  // 平台超管 tenantId 可能为 null，用 IS NULL 匹配或用平台租户
  const row = tenantId
    ? await queryOne<{ store_value: unknown }>(
        `SELECT store_value FROM shared_data_store WHERE tenant_id = ? AND store_key = ? LIMIT 1`,
        [tenantId, dataKey]
      )
    : await queryOne<{ store_value: unknown }>(
        `SELECT store_value FROM shared_data_store WHERE store_key = ? LIMIT 1`,
        [dataKey]
      );
  if (!row) return null;
  return safeParseJsonColumn(row.store_value, `shared_data_store:${dataKey}`);
}

export async function upsertSharedDataRepository(tenantId: string | null, dataKey: string, dataValue: unknown): Promise<boolean> {
  try {
    let jsonVal: string;
    try {
      jsonVal = JSON.stringify(dataValue ?? null);
    } catch (e) {
      console.error('[SharedData] JSON.stringify failed (circular/BigInt?):', e);
      return false;
    }
    const existing = tenantId
      ? await queryOne('SELECT id FROM shared_data_store WHERE tenant_id = ? AND store_key = ? LIMIT 1', [tenantId, dataKey])
      : await queryOne('SELECT id FROM shared_data_store WHERE store_key = ? LIMIT 1', [dataKey]);
    if (existing) {
      if (tenantId) {
        await execute('UPDATE shared_data_store SET store_value = ?, updated_at = NOW() WHERE tenant_id = ? AND store_key = ?', [jsonVal, tenantId, dataKey]);
      } else {
        await execute('UPDATE shared_data_store SET store_value = ?, updated_at = NOW() WHERE store_key = ?', [jsonVal, dataKey]);
      }
    } else {
      await execute(
        'INSERT INTO shared_data_store (id, tenant_id, store_key, store_value, updated_at) VALUES (UUID(), ?, ?, ?, NOW())',
        [tenantId, dataKey, jsonVal]
      );
    }
    return true;
  } catch (e) {
    console.error('[SharedData] upsert error:', e);
    return false;
  }
}

export async function getMultipleSharedDataRepository(tenantId: string | null, dataKeys: string[]): Promise<Record<string, unknown>> {
  if (dataKeys.length === 0) return {};
  const placeholders = dataKeys.map(() => '?').join(',');
  const rows = tenantId
    ? await query<{ store_key: string; store_value: unknown }>(
        `SELECT store_key, store_value FROM shared_data_store WHERE tenant_id = ? AND store_key IN (${placeholders})`,
        [tenantId, ...dataKeys]
      )
    : await query<{ store_key: string; store_value: unknown }>(
        `SELECT store_key, store_value FROM shared_data_store WHERE store_key IN (${placeholders})`,
        dataKeys
      );
  const result: Record<string, unknown> = {};
  rows.forEach((r) => {
    result[r.store_key] = safeParseJsonColumn(r.store_value, `shared_data_store batch:${r.store_key}`);
  });
  return result;
}

/** 活动数据 */
export async function listActivityDataRepository(tenantId: string | null): Promise<{
  gifts: unknown[];
  referrals: unknown[];
  memberActivities: unknown[];
  pointsLedgerData: unknown[];
  pointsAccountsData: unknown[];
}> {
  if (!tenantId) {
    return { gifts: [], referrals: [], memberActivities: [], pointsLedgerData: [], pointsAccountsData: [] };
  }

  const pick = <T>(label: string, result: PromiseSettledResult<T[]>): T[] => {
    if (result.status === 'fulfilled') return result.value ?? [];
    console.error(`[Data] listActivityData ${label} failed:`, result.reason);
    return [];
  };

  const [giftsRes, referralsRes, memberActivitiesRes, pointsLedgerRes, pointsAccountsRes] = await Promise.allSettled([
    query(
      `SELECT ag.* FROM activity_gifts ag
       INNER JOIN employees e ON e.id = ag.creator_id AND e.tenant_id = ?
       ORDER BY ag.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT rr.* FROM referral_relations rr
       INNER JOIN members m ON m.phone_number = rr.referrer_phone AND m.tenant_id = ?
       ORDER BY rr.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT ma.* FROM member_activity ma
       INNER JOIN members m ON m.id = ma.member_id AND m.tenant_id = ?
       ORDER BY ma.created_at DESC`,
      [tenantId]
    ),
    query(
      `SELECT pl.* FROM points_ledger pl
       WHERE pl.member_id IN (SELECT id FROM members WHERE tenant_id = ?)
          OR pl.creator_id IN (SELECT id FROM employees WHERE tenant_id = ?)
          OR pl.order_id IN (SELECT id FROM orders WHERE tenant_id = ?)
       ORDER BY pl.created_at DESC`,
      [tenantId, tenantId, tenantId]
    ),
    query(
      `SELECT pa.* FROM points_accounts pa
       INNER JOIN members m ON m.id = pa.member_id AND m.tenant_id = ?
       ORDER BY COALESCE(pa.updated_at, pa.last_updated) DESC`,
      [tenantId]
    ),
  ]);

  return {
    gifts: pick('activity_gifts', giftsRes),
    referrals: pick('referral_relations', referralsRes),
    memberActivities: pick('member_activity', memberActivitiesRes),
    pointsLedgerData: pick('points_ledger', pointsLedgerRes),
    pointsAccountsData: pick('points_accounts', pointsAccountsRes),
  };
}
