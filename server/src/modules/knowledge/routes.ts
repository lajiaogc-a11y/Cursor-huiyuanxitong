/**
 * 公司文档 API - GET /api/knowledge/categories, /api/knowledge/articles/:categoryId
 * 要求认证，按 tenant_id 过滤数据
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getKnowledgeCategoriesController,
  getKnowledgeArticlesController,
} from '../data/controller.js';

const router = Router();
router.use(authMiddleware);

router.get('/categories', (req, res, next) => {
  return getKnowledgeCategoriesController(req as any, res).catch(next);
});

router.get('/articles/:categoryId', (req, res, next) => {
  return getKnowledgeArticlesController(req as any, res).catch(next);
});

export default router;
