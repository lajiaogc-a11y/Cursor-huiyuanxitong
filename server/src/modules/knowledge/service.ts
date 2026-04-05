/**
 * Knowledge base read API — delegates to data repository with tenant/viewer context.
 */
import {
  listKnowledgeArticlesRepository,
  listKnowledgeCategoriesRepository,
} from '../data/repository.js';

export async function listKnowledgeCategories(
  tenantId: string | null | undefined,
  viewerEmployeeId: string | null,
): Promise<unknown[]> {
  return listKnowledgeCategoriesRepository(tenantId, viewerEmployeeId);
}

export async function listKnowledgeArticles(
  categoryId: string,
  tenantId: string | null | undefined,
  viewerEmployeeId: string | null,
): Promise<unknown[]> {
  return listKnowledgeArticlesRepository(categoryId, tenantId, viewerEmployeeId);
}
