/**
 * Data Repository - 操作日志、公司文档等（绕过 RLS，供前端 API 调用）
 */
import { supabaseAdmin } from '../../database/index.js';
import { getPgPool, queryPg } from '../../database/pg.js';

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
  /** 租户 ID，为空时不过滤（平台总管）；有值时仅返回该租户员工的操作日志 */
  tenantId?: string | null;
}

export async function listOperationLogsRepository(
  query: OperationLogsQuery
): Promise<{ data: OperationLogRow[]; count: number }> {
  const page = query.page ?? 1;
  const pageSize = Math.min(query.pageSize ?? 50, 100);
  const from = (page - 1) * pageSize;
  const offset = from;

  if (getPgPool()) {
    const conditions: string[] = [];
    const values: Array<string | number | boolean> = [];
    let paramIdx = 1;

    if (query.tenantId) {
      conditions.push(`operator_id IN (SELECT id FROM employees WHERE tenant_id = $${paramIdx++})`);
      values.push(query.tenantId);
    }
    if (query.module && query.module !== 'all') {
      conditions.push(`module = $${paramIdx++}`);
      values.push(query.module);
    }
    if (query.operationType && query.operationType !== 'all') {
      conditions.push(`operation_type = $${paramIdx++}`);
      values.push(query.operationType);
    }
    if (query.operatorAccount && query.operatorAccount !== 'all') {
      conditions.push(`operator_account = $${paramIdx++}`);
      values.push(query.operatorAccount);
    }
    if (query.restoreStatus && query.restoreStatus !== 'all') {
      conditions.push(`is_restored = $${paramIdx++}`);
      values.push(query.restoreStatus === 'restored');
    }
    if (query.dateStart) {
      conditions.push(`timestamp >= $${paramIdx++}`);
      values.push(query.dateStart);
    }
    if (query.dateEnd) {
      conditions.push(`timestamp <= $${paramIdx++}`);
      values.push(query.dateEnd);
    }
    if (query.searchTerm?.trim()) {
      conditions.push(`(operator_account ILIKE $${paramIdx} OR object_id ILIKE $${paramIdx} OR object_description ILIKE $${paramIdx})`);
      values.push(`%${query.searchTerm.trim()}%`);
      paramIdx += 1;
    }

    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await queryPg<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM operation_logs ${whereClause}`,
      values
    );
    const rows = await queryPg<OperationLogRow>(
      `SELECT * FROM operation_logs ${whereClause} ORDER BY timestamp DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, pageSize, offset]
    );
    return { data: rows, count: parseInt(countRows[0]?.count ?? '0', 10) };
  }

  let q = supabaseAdmin
    .from('operation_logs')
    .select('*', { count: 'exact' })
    .order('timestamp', { ascending: false });

  if (query.tenantId) {
    const { data: employeeIdsData } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('tenant_id', query.tenantId);
    const employeeIds = (employeeIdsData ?? []).map((row: { id: string }) => row.id);
    if (employeeIds.length === 0) return { data: [], count: 0 };
    q = q.in('operator_id', employeeIds);
  }

  if (query.module && query.module !== 'all') {
    q = q.eq('module', query.module);
  }
  if (query.operationType && query.operationType !== 'all') {
    q = q.eq('operation_type', query.operationType);
  }
  if (query.operatorAccount && query.operatorAccount !== 'all') {
    q = q.eq('operator_account', query.operatorAccount);
  }
  if (query.restoreStatus && query.restoreStatus !== 'all') {
    q = q.eq('is_restored', query.restoreStatus === 'restored');
  }
  if (query.dateStart) {
    q = q.gte('timestamp', query.dateStart);
  }
  if (query.dateEnd) {
    q = q.lte('timestamp', query.dateEnd);
  }
  if (query.searchTerm?.trim()) {
    const term = `%${query.searchTerm.trim()}%`;
    q = q.or(`operator_account.ilike.${term},object_id.ilike.${term},object_description.ilike.${term}`);
  }

  const { data, error, count } = await q.range(from, from + pageSize - 1);
  console.log('[DEBUG logs] listOperationLogs tenant_id=', query.tenantId, 'result count=', data?.length ?? 0, 'total=', count, 'Supabase error=', error?.message);
  if (error) throw error;
  return { data: (data || []) as OperationLogRow[], count: count ?? 0 };
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

export async function insertOperationLogRepository(params: InsertOperationLogParams): Promise<void> {
  if (getPgPool()) {
    await queryPg(
      `INSERT INTO operation_logs (
         operator_id, operator_account, operator_role, module, operation_type,
         object_id, object_description, before_data, after_data, ip_address, timestamp
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,now())`,
      [
        params.operator_id ?? null,
        params.operator_account,
        params.operator_role,
        params.module,
        params.operation_type,
        params.object_id ?? null,
        params.object_description ?? null,
        params.before_data ?? null,
        params.after_data ?? null,
        params.ip_address ?? null,
      ]
    );
    return;
  }
  const { error } = await supabaseAdmin.from('operation_logs').insert({
    operator_id: params.operator_id ?? null,
    operator_account: params.operator_account,
    operator_role: params.operator_role,
    module: params.module,
    operation_type: params.operation_type,
    object_id: params.object_id ?? null,
    object_description: params.object_description ?? null,
    before_data: params.before_data ?? null,
    after_data: params.after_data ?? null,
    ip_address: params.ip_address ?? null,
  });
  if (error) throw error;
}

export async function listKnowledgeCategoriesRepository(
  tenantId?: string | null,
  _employeeId?: string | null,
  _isSuperAdmin?: boolean
): Promise<unknown[]> {
  if (getPgPool()) {
    if (await hasTableColumn('knowledge_categories', 'tenant_id')) {
      const rows = tenantId
        ? await queryPg(
            `SELECT *
             FROM knowledge_categories
             WHERE (tenant_id IS NULL OR tenant_id = $1::uuid)
               AND (is_active IS NULL OR is_active = true)
             ORDER BY sort_order`,
            [tenantId]
          )
        : await queryPg(
            `SELECT *
             FROM knowledge_categories
             WHERE (is_active IS NULL OR is_active = true)
             ORDER BY sort_order`
          );
      return rows as unknown[];
    }
  }
  const { data, error } = await supabaseAdmin
    .from('knowledge_categories')
    .select('*')
    .order('sort_order');
  console.log('[DEBUG knowledge] all categories (no tenant filter):', { count: data?.length ?? 0, error: error?.message });
  if (error) throw error;
  const list = (data || []) as Array<{ is_active?: boolean | null }>;
  return list.filter((r) => r.is_active !== false) as unknown[];
}

export async function listKnowledgeArticlesRepository(
  categoryId: string,
  tenantId?: string | null,
  _employeeId?: string | null,
  _isSuperAdmin?: boolean
): Promise<unknown[]> {
  if (getPgPool()) {
    if (await hasTableColumn('knowledge_articles', 'tenant_id')) {
      const rows = tenantId
        ? await queryPg(
            `SELECT *
             FROM knowledge_articles
             WHERE category_id = $1::uuid
               AND is_published = true
               AND (tenant_id IS NULL OR tenant_id = $2::uuid)
             ORDER BY sort_order`,
            [categoryId, tenantId]
          )
        : await queryPg(
            `SELECT *
             FROM knowledge_articles
             WHERE category_id = $1::uuid
               AND is_published = true
             ORDER BY sort_order`,
            [categoryId]
          );
      return rows as unknown[];
    }
  }
  const { data, error } = await supabaseAdmin
    .from('knowledge_articles')
    .select('*')
    .eq('category_id', categoryId)
    .eq('is_published', true)
    .order('sort_order');
  console.log('[DEBUG knowledge] articles (no tenant filter):', { count: data?.length ?? 0, error: error?.message });
  if (error) throw error;
  return (data || []) as unknown[];
}

export async function listKnowledgeReadStatusRepository(employeeId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from('knowledge_read_status')
    .select('article_id')
    .eq('employee_id', employeeId);
  if (error) throw error;
  return (data || []).map((row: { article_id: string }) => row.article_id);
}

export async function getKnowledgeUnreadCountRepository(employeeId: string, tenantId?: string | null): Promise<number> {
  if (getPgPool()) {
    if (await hasTableColumn('knowledge_articles', 'tenant_id')) {
      const values: Array<string> = [employeeId];
      const tenantClause = tenantId ? 'AND (tenant_id IS NULL OR tenant_id = $2::uuid)' : '';
      if (tenantId) values.push(tenantId);
      const [articles, readStatus] = await Promise.all([
        queryPg<{ id: string }>(
          `SELECT id
           FROM knowledge_articles
           WHERE is_published = true
             AND visibility = 'public'
             AND created_by <> $1
             ${tenantClause}`,
          values
        ),
        queryPg<{ article_id: string }>(
          `SELECT article_id
           FROM knowledge_read_status
           WHERE employee_id = $1::uuid`,
          [employeeId]
        ),
      ]);
      const readArticleIds = new Set(readStatus.map((row) => row.article_id));
      return articles.filter((row) => !readArticleIds.has(row.id)).length;
    }
  }
  const [{ data: articles, error: articlesError }, { data: readStatus, error: readError }] = await Promise.all([
    supabaseAdmin
      .from('knowledge_articles')
      .select('id')
      .eq('is_published', true)
      .eq('visibility', 'public')
      .neq('created_by', employeeId),
    supabaseAdmin
      .from('knowledge_read_status')
      .select('article_id')
      .eq('employee_id', employeeId),
  ]);
  if (articlesError) throw articlesError;
  if (readError) throw readError;
  const readArticleIds = new Set((readStatus || []).map((row: { article_id: string }) => row.article_id));
  return (articles || []).filter((row: { id: string }) => !readArticleIds.has(row.id)).length;
}

export async function markKnowledgeArticleReadRepository(employeeId: string, articleId: string): Promise<void> {
  const { error } = await supabaseAdmin
    .from('knowledge_read_status')
    .upsert(
      {
        employee_id: employeeId,
        article_id: articleId,
        read_at: new Date().toISOString(),
      },
      { onConflict: 'employee_id,article_id' }
    );
  if (error) throw error;
}

export async function markAllKnowledgeArticlesReadRepository(employeeId: string, tenantId?: string | null): Promise<number> {
  if (getPgPool()) {
    if (await hasTableColumn('knowledge_articles', 'tenant_id')) {
      const values: Array<string> = [employeeId];
      const tenantClause = tenantId ? 'AND (tenant_id IS NULL OR tenant_id = $2::uuid)' : '';
      if (tenantId) values.push(tenantId);
      const articles = await queryPg<{ id: string }>(
        `SELECT id
         FROM knowledge_articles
         WHERE is_published = true
           AND visibility = 'public'
           AND created_by <> $1
           ${tenantClause}`,
        values
      );
      if (!articles.length) return 0;
      const rows = articles.map((row) => ({
        employee_id: employeeId,
        article_id: row.id,
        read_at: new Date().toISOString(),
      }));
      const { error } = await supabaseAdmin
        .from('knowledge_read_status')
        .upsert(rows, { onConflict: 'employee_id,article_id' });
      if (error) throw error;
      return rows.length;
    }
  }
  const { data: articles, error: articlesError } = await supabaseAdmin
    .from('knowledge_articles')
    .select('id')
    .eq('is_published', true)
    .eq('visibility', 'public')
    .neq('created_by', employeeId);
  if (articlesError) throw articlesError;
  if (!articles?.length) return 0;
  const rows = articles.map((row: { id: string }) => ({
    employee_id: employeeId,
    article_id: row.id,
    read_at: new Date().toISOString(),
  }));
  const { error } = await supabaseAdmin
    .from('knowledge_read_status')
    .upsert(rows, { onConflict: 'employee_id,article_id' });
  if (error) throw error;
  return rows.length;
}

export async function createKnowledgeCategoryRepository(
  input: Omit<KnowledgeCategoryRow, 'id'>
): Promise<KnowledgeCategoryRow> {
  const hasTenantColumn = await hasTableColumn('knowledge_categories', 'tenant_id');
  if (getPgPool()) {
    const columns = ['name', 'content_type', 'sort_order', 'visibility', 'created_by'];
    const values: Array<string | number | null> = [
      input.name,
      input.content_type,
      input.sort_order,
      input.visibility,
      input.created_by ?? null,
    ];
    if (hasTenantColumn) {
      columns.unshift('tenant_id');
      values.unshift(input.tenant_id ?? null);
    }
    const rows = await queryPg<KnowledgeCategoryRow>(
      `INSERT INTO knowledge_categories (${columns.join(', ')})
       VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    return rows[0];
  }
  const payload: Record<string, unknown> = {
    name: input.name,
    content_type: input.content_type,
    sort_order: input.sort_order,
    visibility: input.visibility,
    created_by: input.created_by ?? null,
  };
  if (hasTenantColumn) payload.tenant_id = input.tenant_id ?? null;
  const { data, error } = await supabaseAdmin.from('knowledge_categories').insert(payload).select('*').single();
  if (error) throw error;
  return data as KnowledgeCategoryRow;
}

export async function updateKnowledgeCategoryRepository(
  id: string,
  updates: Partial<KnowledgeCategoryRow>,
  tenantId?: string | null
): Promise<KnowledgeCategoryRow | null> {
  const hasTenantColumn = await hasTableColumn('knowledge_categories', 'tenant_id');
  if (getPgPool()) {
    const setClauses: string[] = [];
    const values: Array<string | number | boolean | null> = [id];
    let index = 2;
    const assign = (column: string, value: string | number | boolean | null | undefined) => {
      if (value === undefined) return;
      setClauses.push(`${column} = $${index++}`);
      values.push(value);
    };
    assign('name', updates.name);
    assign('content_type', updates.content_type);
    assign('sort_order', updates.sort_order);
    assign('visibility', updates.visibility);
    assign('is_active', updates.is_active);
    if (!setClauses.length) return null;
    const tenantClause = hasTenantColumn && tenantId ? ` AND tenant_id = $${index++}::uuid` : '';
    if (hasTenantColumn && tenantId) values.push(tenantId);
    const rows = await queryPg<KnowledgeCategoryRow>(
      `UPDATE knowledge_categories
       SET ${setClauses.join(', ')}
       WHERE id = $1::uuid${tenantClause}
       RETURNING *`,
      values
    );
    return rows[0] ?? null;
  }
  let query = supabaseAdmin.from('knowledge_categories').update(updates).eq('id', id).select('*').single();
  if (hasTenantColumn && tenantId) {
    query = supabaseAdmin.from('knowledge_categories').update(updates).eq('id', id).eq('tenant_id', tenantId).select('*').single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as KnowledgeCategoryRow | null) ?? null;
}

export async function deleteKnowledgeCategoryRepository(id: string, tenantId?: string | null): Promise<boolean> {
  const hasTenantColumn = await hasTableColumn('knowledge_categories', 'tenant_id');
  if (getPgPool()) {
    const rows = await queryPg<{ id: string }>(
      `DELETE FROM knowledge_categories
       WHERE id = $1::uuid${hasTenantColumn && tenantId ? ' AND tenant_id = $2::uuid' : ''}
       RETURNING id`,
      hasTenantColumn && tenantId ? [id, tenantId] : [id]
    );
    return rows.length > 0;
  }
  let query = supabaseAdmin.from('knowledge_categories').delete().eq('id', id).select('id').single();
  if (hasTenantColumn && tenantId) {
    query = supabaseAdmin.from('knowledge_categories').delete().eq('id', id).eq('tenant_id', tenantId).select('id').single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return !!data;
}

export async function createKnowledgeArticleRepository(
  input: Omit<KnowledgeArticleRow, 'id'>
): Promise<KnowledgeArticleRow> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  if (getPgPool()) {
    const columns = [
      'category_id', 'title_zh', 'title_en', 'content', 'description', 'image_url',
      'sort_order', 'is_published', 'created_by', 'visibility',
    ];
    const values: Array<string | number | boolean | null> = [
      input.category_id,
      input.title_zh,
      input.title_en ?? null,
      input.content ?? null,
      input.description ?? null,
      input.image_url ?? null,
      input.sort_order,
      input.is_published,
      input.created_by ?? null,
      input.visibility,
    ];
    if (hasTenantColumn) {
      columns.unshift('tenant_id');
      values.unshift(input.tenant_id ?? null);
    }
    const rows = await queryPg<KnowledgeArticleRow>(
      `INSERT INTO knowledge_articles (${columns.join(', ')})
       VALUES (${values.map((_, index) => `$${index + 1}`).join(', ')})
       RETURNING *`,
      values
    );
    return rows[0];
  }
  const payload: Record<string, unknown> = {
    category_id: input.category_id,
    title_zh: input.title_zh,
    title_en: input.title_en ?? null,
    content: input.content ?? null,
    description: input.description ?? null,
    image_url: input.image_url ?? null,
    sort_order: input.sort_order,
    is_published: input.is_published,
    created_by: input.created_by ?? null,
    visibility: input.visibility,
  };
  if (hasTenantColumn) payload.tenant_id = input.tenant_id ?? null;
  const { data, error } = await supabaseAdmin.from('knowledge_articles').insert(payload).select('*').single();
  if (error) throw error;
  return data as KnowledgeArticleRow;
}

export async function updateKnowledgeArticleRepository(
  id: string,
  updates: Partial<KnowledgeArticleRow>,
  tenantId?: string | null
): Promise<KnowledgeArticleRow | null> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  if (getPgPool()) {
    const setClauses: string[] = [];
    const values: Array<string | number | boolean | null> = [id];
    let index = 2;
    const assign = (column: string, value: string | number | boolean | null | undefined) => {
      if (value === undefined) return;
      setClauses.push(`${column} = $${index++}`);
      values.push(value);
    };
    assign('title_zh', updates.title_zh);
    assign('title_en', updates.title_en ?? null);
    assign('content', updates.content ?? null);
    assign('description', updates.description ?? null);
    assign('image_url', updates.image_url ?? null);
    assign('sort_order', updates.sort_order);
    assign('is_published', updates.is_published);
    assign('visibility', updates.visibility);
    if (!setClauses.length) return null;
    setClauses.push('updated_at = now()');
    const tenantClause = hasTenantColumn && tenantId ? ` AND tenant_id = $${index++}::uuid` : '';
    if (hasTenantColumn && tenantId) values.push(tenantId);
    const rows = await queryPg<KnowledgeArticleRow>(
      `UPDATE knowledge_articles
       SET ${setClauses.join(', ')}
       WHERE id = $1::uuid${tenantClause}
       RETURNING *`,
      values
    );
    return rows[0] ?? null;
  }
  const payload = { ...updates, updated_at: new Date().toISOString() };
  let query = supabaseAdmin.from('knowledge_articles').update(payload).eq('id', id).select('*').single();
  if (hasTenantColumn && tenantId) {
    query = supabaseAdmin.from('knowledge_articles').update(payload).eq('id', id).eq('tenant_id', tenantId).select('*').single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return (data as KnowledgeArticleRow | null) ?? null;
}

export async function deleteKnowledgeArticleRepository(id: string, tenantId?: string | null): Promise<boolean> {
  const hasTenantColumn = await hasTableColumn('knowledge_articles', 'tenant_id');
  if (getPgPool()) {
    const rows = await queryPg<{ id: string }>(
      `DELETE FROM knowledge_articles
       WHERE id = $1::uuid${hasTenantColumn && tenantId ? ' AND tenant_id = $2::uuid' : ''}
       RETURNING id`,
      hasTenantColumn && tenantId ? [id, tenantId] : [id]
    );
    return rows.length > 0;
  }
  let query = supabaseAdmin.from('knowledge_articles').delete().eq('id', id).select('id').single();
  if (hasTenantColumn && tenantId) {
    query = supabaseAdmin.from('knowledge_articles').delete().eq('id', id).eq('tenant_id', tenantId).select('id').single();
  }
  const { data, error } = await query;
  if (error) throw error;
  return !!data;
}

export interface LoginLogRow {
  id: string;
  employee_id: string;
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

async function hasTableColumn(tableName: string, columnName: string): Promise<boolean> {
  if (getPgPool()) {
    const rows = await queryPg<{ exists: boolean }>(
      `SELECT EXISTS (
         SELECT 1
         FROM information_schema.columns
         WHERE table_schema = 'public'
           AND table_name = $1
           AND column_name = $2
       ) AS exists`,
      [tableName, columnName]
    );
    return !!rows[0]?.exists;
  }
  return true;
}

function buildActivityGiftTenantCondition(paramIndex = 2): string {
  return `(
    EXISTS (SELECT 1 FROM employees e WHERE e.id = activity_gifts.creator_id AND e.tenant_id = $${paramIndex}::uuid)
    OR EXISTS (SELECT 1 FROM members m WHERE m.id = activity_gifts.member_id AND m.tenant_id = $${paramIndex}::uuid)
  )`;
}

export async function updateActivityGiftRepository(
  giftId: string,
  updates: Partial<ActivityGiftMutationRow>,
  tenantId?: string | null
): Promise<ActivityGiftMutationRow | null> {
  if (getPgPool()) {
    const setClauses: string[] = [];
    const values: Array<string | number | null> = [giftId];
    let index = 2;
    const assign = (column: string, value: string | number | null | undefined) => {
      if (value === undefined) return;
      setClauses.push(`${column} = $${index++}`);
      values.push(value);
    };
    assign('currency', updates.currency);
    assign('amount', updates.amount as string | number | undefined);
    assign('rate', updates.rate as string | number | undefined);
    assign('phone_number', updates.phone_number);
    assign('payment_agent', updates.payment_agent ?? null);
    assign('gift_type', updates.gift_type ?? null);
    assign('fee', updates.fee as string | number | null | undefined);
    assign('gift_value', updates.gift_value as string | number | null | undefined);
    assign('remark', updates.remark ?? null);
    assign('creator_id', updates.creator_id ?? null);
    if (setClauses.length === 0) {
      const rows = await queryPg<ActivityGiftMutationRow>(
        `SELECT *
         FROM activity_gifts
         WHERE id = $1::uuid
         ${tenantId ? `AND ${buildActivityGiftTenantCondition(2)}` : ''}
         LIMIT 1`,
        tenantId ? [giftId, tenantId] : [giftId]
      );
      return rows[0] ?? null;
    }
    const tenantClause = tenantId ? ` AND ${buildActivityGiftTenantCondition(index)}` : '';
    if (tenantId) values.push(tenantId);
    const rows = await queryPg<ActivityGiftMutationRow>(
      `UPDATE activity_gifts
       SET ${setClauses.join(', ')}
       WHERE id = $1::uuid${tenantClause}
       RETURNING *`,
      values
    );
    return rows[0] ?? null;
  }

  let query = supabaseAdmin
    .from('activity_gifts')
    .update({
      currency: updates.currency,
      amount: updates.amount,
      rate: updates.rate,
      phone_number: updates.phone_number,
      payment_agent: updates.payment_agent ?? null,
      gift_type: updates.gift_type ?? null,
      fee: updates.fee,
      gift_value: updates.gift_value,
      remark: updates.remark ?? null,
      creator_id: updates.creator_id ?? null,
    })
    .eq('id', giftId)
    .select('*')
    .single();

  if (tenantId) {
    const { data: employeeIds } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId);
    const ids = (employeeIds ?? []).map((row: { id: string }) => row.id);
    if (!ids.length) return null;
    query = supabaseAdmin
      .from('activity_gifts')
      .update({
        currency: updates.currency,
        amount: updates.amount,
        rate: updates.rate,
        phone_number: updates.phone_number,
        payment_agent: updates.payment_agent ?? null,
        gift_type: updates.gift_type ?? null,
        fee: updates.fee,
        gift_value: updates.gift_value,
        remark: updates.remark ?? null,
        creator_id: updates.creator_id ?? null,
      })
      .eq('id', giftId)
      .in('creator_id', ids)
      .select('*')
      .single();
  }

  const { data, error } = await query;
  if (error) throw error;
  return (data as ActivityGiftMutationRow | null) ?? null;
}

export async function deleteActivityGiftRepository(
  giftId: string,
  tenantId?: string | null
): Promise<{ gift: ActivityGiftMutationRow | null; restored_points: number }> {
  let gift: ActivityGiftMutationRow | null = null;
  if (getPgPool()) {
    const rows = await queryPg<ActivityGiftMutationRow>(
      `SELECT *
       FROM activity_gifts
       WHERE id = $1::uuid
       ${tenantId ? `AND ${buildActivityGiftTenantCondition(2)}` : ''}
       LIMIT 1`,
      tenantId ? [giftId, tenantId] : [giftId]
    );
    gift = rows[0] ?? null;
  } else {
    let q = supabaseAdmin.from('activity_gifts').select('*').eq('id', giftId).maybeSingle();
    if (tenantId) {
      const { data: employeeIds } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId);
      const ids = (employeeIds ?? []).map((row: { id: string }) => row.id);
      if (!ids.length) return { gift: null, restored_points: 0 };
      q = supabaseAdmin.from('activity_gifts').select('*').eq('id', giftId).in('creator_id', ids).maybeSingle();
    }
    const { data, error } = await q;
    if (error) throw error;
    gift = (data as ActivityGiftMutationRow | null) ?? null;
  }

  if (!gift) {
    return { gift: null, restored_points: 0 };
  }

  const { data, error } = await supabaseAdmin.rpc('delete_activity_gift_and_restore', {
    p_gift_id: giftId,
  });
  if (error) throw error;
  const result = data as { success?: boolean; error?: string; restored_points?: number } | null;
  if (result && result.success === false) {
    throw new Error(result.error || 'delete_activity_gift_and_restore failed');
  }
  return {
    gift,
    restored_points: Number(result?.restored_points ?? 0) || 0,
  };
}

export async function listLoginLogsRepository(
  limit = 500,
  tenantId?: string | null
): Promise<LoginLogRow[]> {
  if (getPgPool()) {
    const values: Array<string | number> = [];
    let whereClause = '';
    if (tenantId) {
      values.push(tenantId);
      whereClause = `WHERE employee_id IN (SELECT id FROM employees WHERE tenant_id = $1)`;
    }
    values.push(limit);
    const logsData = await queryPg<LoginLogRow>(
      `SELECT id, employee_id, login_time, ip_address, success, failure_reason, user_agent
       FROM employee_login_logs
       ${whereClause}
       ORDER BY login_time DESC
       LIMIT $${values.length}`,
      values
    );
    const empIdsForNames = logsData.map((l) => l.employee_id);
    let employeesData: Array<{ id: string; real_name: string }> = [];
    if (empIdsForNames.length > 0) {
      employeesData = await queryPg<{ id: string; real_name: string }>(
        `SELECT id, real_name FROM employees WHERE id = ANY($1::uuid[])`,
        [[...new Set(empIdsForNames)]]
      );
    }
    const employeeMap = new Map<string, string>();
    employeesData.forEach((emp) => employeeMap.set(emp.id, emp.real_name));
    return logsData.map((log) => ({
      ...log,
      employee_name: employeeMap.get(log.employee_id) || '-',
      ip_location: deriveIpLocation(log.ip_address),
    })) as LoginLogRow[];
  }

  let q = supabaseAdmin
    .from('employee_login_logs')
    .select('id, employee_id, login_time, ip_address, success, failure_reason, user_agent')
    .order('login_time', { ascending: false })
    .limit(limit);

  if (tenantId) {
    const { data: employeeIdsData } = await supabaseAdmin
      .from('employees')
      .select('id')
      .eq('tenant_id', tenantId);
    const employeeIds = (employeeIdsData ?? []).map((row: { id: string }) => row.id);
    if (employeeIds.length === 0) return [];
    q = q.in('employee_id', employeeIds);
  }

  const { data: logsData, error: logsError } = await q;
  console.log('[DEBUG logs] listLoginLogs tenant_id=', tenantId, 'result count=', logsData?.length ?? 0, 'Supabase error=', logsError?.message);
  if (logsError) throw logsError;

  const empIdsForNames = (logsData || []).map((l: { employee_id: string }) => l.employee_id);
  const { data: employeesData } = await supabaseAdmin
    .from('employees')
    .select('id, real_name')
    .in('id', empIdsForNames.length > 0 ? [...new Set(empIdsForNames)] : ['00000000-0000-0000-0000-000000000000']);

  const employeeMap = new Map<string, string>();
  (employeesData || []).forEach((emp: { id: string; real_name: string }) => {
    employeeMap.set(emp.id, emp.real_name);
  });

  return (logsData || []).map((log: LoginLogRow) => ({
    id: log.id,
    employee_id: log.employee_id,
    employee_name: employeeMap.get(log.employee_id) || '-',
    login_time: log.login_time,
    ip_address: log.ip_address,
    ip_location: deriveIpLocation(log.ip_address),
    success: log.success,
    failure_reason: log.failure_reason,
    user_agent: log.user_agent,
  }));
}

export async function listCurrenciesRepository(): Promise<CurrencyRow[]> {
  if (getPgPool()) {
    return await queryPg<CurrencyRow>(
      `SELECT id, code, name_zh, name_en, symbol, badge_color, sort_order, is_active
       FROM currencies
       ORDER BY sort_order ASC, code ASC`
    );
  }
  const { data, error } = await supabaseAdmin
    .from('currencies')
    .select('id, code, name_zh, name_en, symbol, badge_color, sort_order, is_active')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CurrencyRow[];
}

export async function listActivityTypesRepository(): Promise<ActivityTypeRow[]> {
  if (getPgPool()) {
    return await queryPg<ActivityTypeRow>(
      `SELECT id, value, label, is_active, sort_order
       FROM activity_types
       ORDER BY sort_order ASC, label ASC`
    );
  }
  const { data, error } = await supabaseAdmin
    .from('activity_types')
    .select('id, value, label, is_active, sort_order')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ActivityTypeRow[];
}

export async function listCustomerSourcesRepository(): Promise<CustomerSourceRow[]> {
  if (getPgPool()) {
    return await queryPg<CustomerSourceRow>(
      `SELECT id, name, sort_order, is_active, created_at, updated_at
       FROM customer_sources
       ORDER BY sort_order ASC, name ASC`
    );
  }
  const { data, error } = await supabaseAdmin
    .from('customer_sources')
    .select('id, name, sort_order, is_active, created_at, updated_at')
    .order('sort_order', { ascending: true });
  if (error) throw error;
  return (data ?? []) as CustomerSourceRow[];
}

export async function listShiftReceiversRepository(): Promise<ShiftReceiverRow[]> {
  if (getPgPool()) {
    return await queryPg<ShiftReceiverRow>(
      `SELECT id, name, sort_order, created_at, updated_at
       FROM shift_receivers
       ORDER BY sort_order ASC, name ASC`
    );
  }
  const { data, error } = await supabaseAdmin
    .from('shift_receivers')
    .select('id, name, sort_order, created_at, updated_at')
    .order('sort_order', { ascending: true })
    .order('name', { ascending: true });
  if (error) throw error;
  return (data ?? []) as ShiftReceiverRow[];
}

export async function listShiftHandoversRepository(tenantId?: string | null): Promise<ShiftHandoverRow[]> {
  if (getPgPool()) {
    if (tenantId) {
      return await queryPg<ShiftHandoverRow>(
        `SELECT sh.id, sh.handover_employee_id, sh.handover_employee_name, sh.receiver_name,
                sh.handover_time, sh.card_merchant_data, sh.payment_provider_data, sh.remark, sh.created_at
         FROM shift_handovers sh
         WHERE sh.handover_employee_id IN (SELECT id FROM employees WHERE tenant_id = $1)
         ORDER BY sh.handover_time DESC`,
        [tenantId]
      );
    }
    return await queryPg<ShiftHandoverRow>(
      `SELECT id, handover_employee_id, handover_employee_name, receiver_name,
              handover_time, card_merchant_data, payment_provider_data, remark, created_at
       FROM shift_handovers
       ORDER BY handover_time DESC`
    );
  }
  let q = supabaseAdmin
    .from('shift_handovers')
    .select('id, handover_employee_id, handover_employee_name, receiver_name, handover_time, card_merchant_data, payment_provider_data, remark, created_at')
    .order('handover_time', { ascending: false });
  if (tenantId) {
    const { data: employeesData } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId);
    const ids = (employeesData ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return [];
    q = q.in('handover_employee_id', ids);
  }
  const { data, error } = await q;
  if (error) throw error;
  return (data ?? []) as ShiftHandoverRow[];
}

export async function listAuditRecordsRepository(params: {
  page?: number;
  pageSize?: number;
  status?: string;
  dateFrom?: string;
  dateTo?: string;
  tenantId?: string | null;
}): Promise<{ data: AuditRecordRow[]; count: number }> {
  const page = params.page ?? 1;
  const pageSize = Math.min(params.pageSize ?? 50, 100);
  const offset = (page - 1) * pageSize;

  if (getPgPool()) {
    const conditions: string[] = [];
    const values: Array<string | number> = [];
    let idx = 1;
    if (params.status) {
      conditions.push(`ar.status = $${idx++}`);
      values.push(params.status);
    }
    if (params.dateFrom) {
      conditions.push(`ar.created_at >= $${idx++}`);
      values.push(params.dateFrom);
    }
    if (params.dateTo) {
      conditions.push(`ar.created_at <= $${idx++}`);
      values.push(params.dateTo);
    }
    if (params.tenantId) {
      conditions.push(`ar.submitter_id IN (SELECT id FROM employees WHERE tenant_id = $${idx++})`);
      values.push(params.tenantId);
    }
    const whereClause = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRows = await queryPg<{ count: string }>(
      `SELECT COUNT(*)::int AS count FROM audit_records ar ${whereClause}`,
      values
    );
    const rows = await queryPg<AuditRecordRow>(
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
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, pageSize, offset]
    );
    return { data: rows, count: parseInt(countRows[0]?.count ?? '0', 10) };
  }

  let q = supabaseAdmin
    .from('audit_records')
    .select('*', { count: 'exact' })
    .order('created_at', { ascending: false });
  if (params.status) q = q.eq('status', params.status);
  if (params.dateFrom) q = q.gte('created_at', params.dateFrom);
  if (params.dateTo) q = q.lte('created_at', params.dateTo);
  if (params.tenantId) {
    const { data: employeesData } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', params.tenantId);
    const ids = (employeesData ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return { data: [], count: 0 };
    q = q.in('submitter_id', ids);
  }
  const { data, error, count } = await q.range(offset, offset + pageSize - 1);
  if (error) throw error;
  const ids = [...new Set((data ?? []).flatMap((row: any) => [row.submitter_id, row.reviewer_id]).filter(Boolean))];
  let employeeMap = new Map<string, string>();
  if (ids.length > 0) {
    const { data: employeesData } = await supabaseAdmin.from('employees').select('id, real_name').in('id', ids);
    employeeMap = new Map((employeesData ?? []).map((row: any) => [row.id, row.real_name]));
  }
  return {
    data: (data ?? []).map((row: any) => ({
      ...row,
      submitter_name: row.submitter_id ? (employeeMap.get(row.submitter_id) ?? '-') : '-',
      reviewer_name: row.reviewer_id ? (employeeMap.get(row.reviewer_id) ?? '-') : '-',
    })) as AuditRecordRow[],
    count: count ?? 0,
  };
}

export async function countPendingAuditRecordsRepository(tenantId?: string | null): Promise<number> {
  if (getPgPool()) {
    const rows = await queryPg<{ count: string }>(
      tenantId
        ? `SELECT COUNT(*)::int AS count FROM audit_records WHERE status = 'pending' AND submitter_id IN (SELECT id FROM employees WHERE tenant_id = $1)`
        : `SELECT COUNT(*)::int AS count FROM audit_records WHERE status = 'pending'`,
      tenantId ? [tenantId] : []
    );
    return parseInt(rows[0]?.count ?? '0', 10);
  }
  let q = supabaseAdmin
    .from('audit_records')
    .select('*', { count: 'exact', head: true })
    .eq('status', 'pending');
  if (tenantId) {
    const { data: employeesData } = await supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId);
    const ids = (employeesData ?? []).map((row: { id: string }) => row.id);
    if (ids.length === 0) return 0;
    q = q.in('submitter_id', ids);
  }
  const { count, error } = await q;
  if (error) throw error;
  return count ?? 0;
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

export async function listRolePermissionsRepository(): Promise<RolePermissionRow[]> {
  if (getPgPool()) {
    return await queryPg<RolePermissionRow>(
      `SELECT id, role, module_name, field_name, can_view, can_edit, can_delete
       FROM role_permissions`
    );
  }
  const { data, error } = await supabaseAdmin.from('role_permissions').select('*');
  if (error) throw error;
  return (data || []) as RolePermissionRow[];
}

export async function getIpAccessControlSettingRepository(): Promise<{ enabled?: boolean } | null> {
  const { data, error } = await supabaseAdmin
    .from('data_settings')
    .select('setting_value')
    .eq('setting_key', 'ip_access_control')
    .maybeSingle();
  if (error) throw error;
  return (data?.setting_value as { enabled?: boolean }) ?? null;
}

export async function getNavigationConfigRepository(): Promise<Array<{ nav_key: string; display_text_zh: string; display_text_en: string; is_visible: boolean; sort_order: number }>> {
  if (getPgPool()) {
    return await queryPg(
      `SELECT nav_key, display_text_zh, display_text_en, is_visible, sort_order
       FROM navigation_config
       ORDER BY sort_order ASC`
    );
  }
  const { data, error } = await supabaseAdmin
    .from('navigation_config')
    .select('nav_key, display_text_zh, display_text_en, is_visible, sort_order')
    .order('sort_order');
  if (error) throw error;
  return (data || []) as any[];
}

export async function upsertNavigationConfigRepository(rows: Array<{
  nav_key: string;
  display_text_zh: string;
  display_text_en: string;
  is_visible: boolean;
  sort_order: number;
}>): Promise<void> {
  if (!rows.length) return;
  if (getPgPool()) {
    for (const row of rows) {
      await queryPg(
        `INSERT INTO navigation_config (nav_key, display_text_zh, display_text_en, is_visible, sort_order, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6)
         ON CONFLICT (nav_key)
         DO UPDATE SET
           display_text_zh = EXCLUDED.display_text_zh,
           display_text_en = EXCLUDED.display_text_en,
           is_visible = EXCLUDED.is_visible,
           sort_order = EXCLUDED.sort_order,
           updated_at = EXCLUDED.updated_at`,
        [
          row.nav_key,
          row.display_text_zh,
          row.display_text_en,
          row.is_visible,
          row.sort_order,
          new Date().toISOString(),
        ]
      );
    }
    return;
  }
  const { error } = await supabaseAdmin
    .from('navigation_config')
    .upsert(
      rows.map((row) => ({
        ...row,
        updated_at: new Date().toISOString(),
      })),
      { onConflict: 'nav_key' }
    );
  if (error) throw error;
}

export async function getSharedDataRepository(tenantId: string | null, dataKey: string): Promise<unknown> {
  if (!tenantId) return null;
  if (getPgPool()) {
    const rows = await queryPg<{ data_value: unknown }>(
      `SELECT data_value
       FROM shared_data_store
       WHERE tenant_id = $1 AND data_key = $2
       LIMIT 1`,
      [tenantId, dataKey]
    );
    return rows[0]?.data_value ?? null;
  }
  const { data, error } = await supabaseAdmin
    .from('shared_data_store')
    .select('data_value')
    .eq('tenant_id', tenantId)
    .eq('data_key', dataKey)
    .maybeSingle();
  if (error) throw error;
  return data?.data_value ?? null;
}

export async function upsertSharedDataRepository(tenantId: string | null, dataKey: string, dataValue: unknown): Promise<boolean> {
  if (!tenantId) return false;
  if (getPgPool()) {
    await queryPg(
      `INSERT INTO shared_data_store (tenant_id, data_key, data_value, updated_at)
       VALUES ($1, $2, $3::jsonb, $4)
       ON CONFLICT (tenant_id, data_key)
       DO UPDATE SET
         data_value = EXCLUDED.data_value,
         updated_at = EXCLUDED.updated_at`,
      [tenantId, dataKey, JSON.stringify(dataValue ?? null), new Date().toISOString()]
    );
    return true;
  }
  const { error } = await supabaseAdmin
    .from('shared_data_store')
    .upsert(
      { tenant_id: tenantId, data_key: dataKey, data_value: dataValue, updated_at: new Date().toISOString() },
      { onConflict: 'tenant_id,data_key' }
    );
  return !error;
}

export async function getMultipleSharedDataRepository(tenantId: string | null, dataKeys: string[]): Promise<Record<string, unknown>> {
  if (!tenantId || dataKeys.length === 0) return {};
  if (getPgPool()) {
    const rows = await queryPg<{ data_key: string; data_value: unknown }>(
      `SELECT data_key, data_value
       FROM shared_data_store
       WHERE tenant_id = $1 AND data_key = ANY($2::text[])`,
      [tenantId, dataKeys]
    );
    const result: Record<string, unknown> = {};
    rows.forEach((r) => {
      result[r.data_key] = r.data_value;
    });
    return result;
  }
  const { data, error } = await supabaseAdmin
    .from('shared_data_store')
    .select('data_key, data_value')
    .eq('tenant_id', tenantId)
    .in('data_key', dataKeys);
  if (error) throw error;
  const result: Record<string, unknown> = {};
  (data || []).forEach((r: { data_key: string; data_value: unknown }) => {
    result[r.data_key] = r.data_value;
  });
  return result;
}

/** 活动数据：activity_gifts, referral_relations, member_activity, points_ledger, points_accounts，按租户过滤 */
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
  const { getPgPool, queryPg } = await import('../../database/pg.js');
  const pickPgRows = <T>(label: string, result: PromiseSettledResult<T[]>): T[] => {
    if (result.status === 'fulfilled') {
      return result.value ?? [];
    }
    console.error(`[Data] listActivityData ${label} failed:`, result.reason);
    return [];
  };
  const pickSupabaseRows = <T>(
    label: string,
    result: PromiseSettledResult<{ data: T[] | null; error?: { message?: string } | null }>
  ): T[] => {
    if (result.status !== 'fulfilled') {
      console.error(`[Data] listActivityData ${label} failed:`, result.reason);
      return [];
    }
    if (result.value?.error) {
      console.error(`[Data] listActivityData ${label} failed:`, result.value.error.message);
      return [];
    }
    return result.value?.data ?? [];
  };
  if (getPgPool()) {
    const [giftsRes, referralsRes, memberActivitiesRes, pointsLedgerRes, pointsAccountsRes] = await Promise.allSettled([
      queryPg(
        `SELECT ag.* FROM activity_gifts ag
         INNER JOIN employees e ON e.id = ag.creator_id AND e.tenant_id = $1
         ORDER BY ag.created_at DESC`,
        [tenantId]
      ),
      queryPg(
        `SELECT rr.* FROM referral_relations rr
         INNER JOIN members m ON m.phone_number = rr.referrer_phone AND m.tenant_id = $1
         ORDER BY rr.created_at DESC`,
        [tenantId]
      ),
      queryPg(
        `SELECT ma.* FROM member_activity ma
         INNER JOIN members m ON m.id = ma.member_id AND m.tenant_id = $1
         ORDER BY ma.created_at DESC`,
        [tenantId]
      ),
      queryPg(
        `SELECT pl.* FROM points_ledger pl
         WHERE pl.member_id IN (SELECT id FROM members WHERE tenant_id = $1)
            OR pl.creator_id IN (SELECT id FROM employees WHERE tenant_id = $1)
            OR pl.order_id IN (SELECT id FROM orders WHERE tenant_id = $1)
         ORDER BY pl.created_at DESC`,
        [tenantId]
      ),
      queryPg(
        `SELECT pa.* FROM points_accounts pa
         INNER JOIN members m ON m.member_code = pa.member_code AND m.tenant_id = $1
         ORDER BY pa.last_updated DESC`,
        [tenantId]
      ),
    ]);
    return {
      gifts: pickPgRows('activity_gifts', giftsRes),
      referrals: pickPgRows('referral_relations', referralsRes),
      memberActivities: pickPgRows('member_activity', memberActivitiesRes),
      pointsLedgerData: pickPgRows('points_ledger', pointsLedgerRes),
      pointsAccountsData: pickPgRows('points_accounts', pointsAccountsRes),
    };
  }
  const [empRes, memberRes, codesRes, orderIdsRes] = await Promise.all([
    supabaseAdmin.from('employees').select('id').eq('tenant_id', tenantId),
    supabaseAdmin.from('members').select('id, member_code').eq('tenant_id', tenantId),
    supabaseAdmin.from('members').select('member_code').eq('tenant_id', tenantId),
    supabaseAdmin.from('orders').select('id').eq('tenant_id', tenantId),
  ]);
  const creatorIds = (empRes.data ?? []).map((r: { id: string }) => r.id);
  const memberIdList = (memberRes.data ?? []).map((r: { id: string }) => r.id);
  const codes = (codesRes.data ?? []).map((r: { member_code: string }) => r.member_code);
  const orderIds = (orderIdsRes.data ?? []).map((r: { id: string }) => r.id);

  let giftsQ = supabaseAdmin.from('activity_gifts').select('*').order('created_at', { ascending: false });
  if (creatorIds.length > 0) giftsQ = giftsQ.in('creator_id', creatorIds);
  else giftsQ = giftsQ.eq('creator_id', '00000000-0000-0000-0000-000000000000');

  let referralsQ = supabaseAdmin.from('referral_relations').select('*').order('created_at', { ascending: false });
  if (codes.length > 0) referralsQ = referralsQ.in('referrer_code', codes);
  else referralsQ = referralsQ.eq('referrer_code', '__none__');

  let maQ = supabaseAdmin.from('member_activity').select('*').order('created_at', { ascending: false });
  if (memberIdList.length > 0) maQ = maQ.in('member_id', memberIdList);
  else maQ = maQ.eq('member_id', '00000000-0000-0000-0000-000000000000');

  let plQ = supabaseAdmin.from('points_ledger').select('*').order('created_at', { ascending: false });
  const plConditions: string[] = [];
  if (creatorIds.length > 0) plConditions.push(`creator_id.in.(${creatorIds.join(',')})`);
  if (memberIdList.length > 0) plConditions.push(`member_id.in.(${memberIdList.join(',')})`);
  if (orderIds.length > 0) plConditions.push(`order_id.in.(${orderIds.join(',')})`);
  if (plConditions.length > 0) plQ = plQ.or(plConditions.join(','));
  else plQ = plQ.eq('id', '00000000-0000-0000-0000-000000000000');

  let paQ = supabaseAdmin.from('points_accounts').select('*').order('updated_at', { ascending: false });
  if (codes.length > 0) paQ = paQ.in('member_code', codes);
  else paQ = paQ.eq('member_code', '__none__');

  const [giftsRes, referralsRes, maRes, plRes, paRes] = await Promise.allSettled([
    giftsQ,
    referralsQ,
    maQ,
    plQ,
    paQ,
  ]);

  return {
    gifts: pickSupabaseRows('activity_gifts', giftsRes),
    referrals: pickSupabaseRows('referral_relations', referralsRes),
    memberActivities: pickSupabaseRows('member_activity', maRes),
    pointsLedgerData: pickSupabaseRows('points_ledger', plRes),
    pointsAccountsData: pickSupabaseRows('points_accounts', paRes),
  };
}
