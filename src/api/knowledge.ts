/**
 * Knowledge Base API Client — 纯 HTTP 请求层
 */
import { apiGet } from './client';

export interface KnowledgeCategory {
  id: string;
  name: string;
  sort_order?: number;
}

export interface KnowledgeArticle {
  id: string;
  category_id: string;
  title: string;
  content: string;
  sort_order?: number;
}

export const knowledgeApi = {
  getCategories: (params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<KnowledgeCategory[]>(`/api/knowledge/categories${q}`);
  },
  getArticles: (categoryId: string, params?: Record<string, string>) => {
    const q = params ? `?${new URLSearchParams(params).toString()}` : '';
    return apiGet<KnowledgeArticle[]>(`/api/knowledge/articles/${encodeURIComponent(categoryId)}${q}`);
  },
};
