/**
 * Knowledge Data Service — 业务编排层
 *
 * 封装 repository 中的知识库 CRUD，供 dataKnowledgeController 调用
 */

export {
  createKnowledgeCategoryRepository as createKnowledgeCategory,
  updateKnowledgeCategoryRepository as updateKnowledgeCategory,
  deleteKnowledgeCategoryRepository as deleteKnowledgeCategory,
  createKnowledgeArticleRepository as createKnowledgeArticle,
  updateKnowledgeArticleRepository as updateKnowledgeArticle,
  deleteKnowledgeArticleRepository as deleteKnowledgeArticle,
  listKnowledgeReadStatusRepository as listKnowledgeReadStatus,
  getKnowledgeUnreadCountRepository as getKnowledgeUnreadCount,
  getKnowledgeUnreadCountsRepository as getKnowledgeUnreadCounts,
  markKnowledgeArticleReadRepository as markKnowledgeArticleRead,
  markAllKnowledgeArticlesReadRepository as markAllKnowledgeArticlesRead,
  seedDefaultKnowledgeCategoriesRepository as seedDefaultKnowledgeCategories,
} from './repository.js';
