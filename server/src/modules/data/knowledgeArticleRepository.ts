/**
 * Data repository — knowledge_articles, knowledge_read_status
 */
import { randomUUID } from 'crypto';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { hasTableColumn } from './knowledgeSchemaHelpers.js';

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
    throw new Error('knowledge_articles table is missing title and title_zh columns; cannot insert');
  }
  if (!hasContent) {
    throw new Error('knowledge_articles table is missing content column; cannot insert');
  }

  const id = randomUUID();
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
