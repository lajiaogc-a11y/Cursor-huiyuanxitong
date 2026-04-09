/**
 * 通用表代理 — SELECT
 * 自 tableProxy 拆分；行为与原实现一致
 */
import type { Response } from 'express';
import { query } from '../../database/index.js';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  getTableTier, rejectTableAccess, isAdminUser,
  blockMemberTableProxy, blockPlatformSuperStaffInvitationCodes,
  mergeEmployeeAccessScope,
  mapColumnName, getReverseAliasMap,
  parseFilters, parseOrder, SAFE_COLUMN_RE,
} from './tableConfig.js';

export async function tableSelectController(req: AuthenticatedRequest, res: Response): Promise<void> {
  const table = req.params.table;
  const tier = getTableTier(table);
  if (!tier) { rejectTableAccess(res, table, `Table '${table}' not allowed`); return; }
  if (tier === 'admin_only' && !isAdminUser(req)) { rejectTableAccess(res, table, `Table '${table}' requires admin access`); return; }
  if (blockMemberTableProxy(req, res)) return;
  if (blockPlatformSuperStaffInvitationCodes(req, res, table)) return;

  const params = req.query as Record<string, string>;
  let { where, values } = parseFilters(params, table);
  ({ where, values } = mergeEmployeeAccessScope(req, table, where, values));
  const order = parseOrder(params.order, table);
  /** 防止恶意或误配超大 limit 拖垮 DB；不改变常规分页（≤20000）的语义 */
  const rawLim = params.limit ? parseInt(params.limit, 10) : NaN;
  const cappedLim = Number.isFinite(rawLim) && rawLim > 0 ? Math.min(rawLim, 20000) : NaN;
  const rawOff = params.offset ? parseInt(params.offset, 10) : NaN;
  const hasLimit = Number.isFinite(cappedLim);
  const hasOffset = Number.isFinite(rawOff) && rawOff > 0;
  const limit = hasLimit ? 'LIMIT ?' : '';
  const offset = hasOffset ? 'OFFSET ?' : '';
  const paginationVals: number[] = [];
  if (hasLimit) paginationVals.push(cappedLim);
  if (hasOffset) paginationVals.push(rawOff);
  const selectCols = params.select || '*';
  const reverseAlias = getReverseAliasMap(table);

  // 对于 select 中的关联查询语法（如 "*, tenant:tenants(tenant_code)"），简化为 *
  const safeCols = selectCols.includes('(') ? '*' : selectCols.split(',').map(c => {
    const col = c.trim();
    if (col === '*') return '*';
    // 处理别名：col_name:alias → col_name AS alias
    if (col.includes(':')) {
      const [alias, real] = col.split(':');
      const aliasName = alias.trim();
      const realName = real.trim();
      // 验证列名合法性，防止注入
      if (!SAFE_COLUMN_RE.test(aliasName) || !SAFE_COLUMN_RE.test(realName)) return null;
      return `\`${realName}\` AS \`${aliasName}\``;
    }
    // 验证列名合法性，防止注入
    if (!SAFE_COLUMN_RE.test(col)) return null;
    // 应用列名映射：前端列名 → 数据库实际列名，用 AS 保留前端期望的名称
    const dbCol = mapColumnName(table, col);
    if (!SAFE_COLUMN_RE.test(dbCol)) return null;
    if (dbCol !== col) {
      return `\`${dbCol}\` AS \`${col}\``;
    }
    return `\`${col}\``;
  }).filter(Boolean).join(', ') || '*';

  try {
    // 如果需要 count
    if (params.count === 'exact') {
      const countRows = await query<{ total: number }>(`SELECT COUNT(*) as total FROM \`${table}\` ${where}`, values);
      const total = countRows[0]?.total ?? 0;

      if (params.single === 'true' || !limit) {
        const rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);
        if (params.single === 'true') {
          res.json({ data: rows[0] ?? null, error: null, count: total });
        } else {
          res.json({ data: rows, error: null, count: total });
        }
      } else {
        const rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);
        res.json({ data: rows, error: null, count: total });
      }
      return;
    }

    let rows = await query(`SELECT ${safeCols} FROM \`${table}\` ${where} ${order} ${limit} ${offset}`, [...values, ...paginationVals]);

    // SELECT * 时，将数据库列名映射回前端期望的列名
    if (selectCols === '*' && reverseAlias) {
      rows = rows.map((row: Record<string, unknown>) => {
        const mapped: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(row)) {
          const frontendCol = reverseAlias[key] ?? key;
          mapped[frontendCol] = value;
          if (frontendCol !== key) mapped[key] = value; // 同时保留原始列名
        }
        return mapped;
      });
    }

    if (params.single === 'true') {
      res.json({ data: rows[0] ?? null, error: null, count: null });
    } else {
      res.json({ data: rows, error: null, count: null });
    }
  } catch (e) {
    console.error(`[TableProxy] SELECT ${table} error:`, e);
    const safeMsg = process.env.NODE_ENV === 'production' ? 'Internal query error' : (e as Error).message;
    res.status(500).json({ data: null, error: { message: safeMsg }, count: null });
  }
}
