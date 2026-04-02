/**
 * 公司文档 knowledge_* 字段规范化：与 migrateSchemaPatches 中 UPDATE 一致，
 * 供启动迁移与管理员 HTTP 接口复用。
 */
import { execute, query } from '../../database/index.js';

async function colExists(table: string, col: string): Promise<boolean> {
  const rows = await query<{ c: number }>(
    `SELECT 1 AS c FROM information_schema.columns
     WHERE table_schema = DATABASE() AND table_name = ? AND column_name = ? LIMIT 1`,
    [table, col],
  );
  return rows.length > 0;
}

async function tableExists(table: string): Promise<boolean> {
  const rows = await query<{ c: number }>(
    `SELECT 1 AS c FROM information_schema.tables
     WHERE table_schema = DATABASE() AND table_name = ? LIMIT 1`,
    [table],
  );
  return rows.length > 0;
}

export interface KnowledgeFieldRepairResult {
  categoriesVisibilityRows: number;
  categoriesContentTypeRows: number;
  articlesVisibilityRows: number;
}

export async function repairKnowledgeFields(): Promise<KnowledgeFieldRepairResult> {
  const out: KnowledgeFieldRepairResult = {
    categoriesVisibilityRows: 0,
    categoriesContentTypeRows: 0,
    articlesVisibilityRows: 0,
  };

  if (await tableExists('knowledge_categories')) {
    try {
      const r = await execute(
        `UPDATE knowledge_categories SET visibility = 'public'
         WHERE visibility IS NULL OR TRIM(COALESCE(visibility,'')) = '' OR LOWER(TRIM(visibility)) = 'all'`,
      );
      out.categoriesVisibilityRows = Number(r.affectedRows ?? 0);
    } catch {
      /* 列可能不存在于极旧库 */
    }
    try {
      if (await colExists('knowledge_categories', 'content_type')) {
        const r = await execute(
          `UPDATE knowledge_categories SET content_type = 'text'
           WHERE content_type IS NULL OR TRIM(COALESCE(content_type,'')) = ''
              OR LOWER(TRIM(content_type)) NOT IN ('text','phrase','image')`,
        );
        out.categoriesContentTypeRows = Number(r.affectedRows ?? 0);
      }
    } catch {
      /* ignore */
    }
  }

  if (await tableExists('knowledge_articles')) {
    try {
      const r = await execute(
        `UPDATE knowledge_articles SET visibility = 'public'
         WHERE visibility IS NULL OR TRIM(COALESCE(visibility,'')) = '' OR LOWER(TRIM(visibility)) = 'all'`,
      );
      out.articlesVisibilityRows = Number(r.affectedRows ?? 0);
    } catch {
      /* ignore */
    }
  }

  return out;
}
