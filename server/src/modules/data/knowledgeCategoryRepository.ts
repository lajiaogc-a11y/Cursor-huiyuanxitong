/**
 * Data repository — knowledge_categories
 */
import { randomUUID } from 'crypto';
import { query, queryOne, execute, withTransaction } from '../../database/index.js';
import { hasTableColumn } from './knowledgeSchemaHelpers.js';

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

  const id = randomUUID();
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
