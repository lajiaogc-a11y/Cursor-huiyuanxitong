/**
 * Data 路由 - 操作日志、公司文档（绕过 RLS）
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  postOperationLogController,
  getKnowledgeCategoriesController,
  getKnowledgeArticlesController,
  postKnowledgeCategoryController,
  patchKnowledgeCategoryController,
  deleteKnowledgeCategoryController,
  postKnowledgeArticleController,
  patchKnowledgeArticleController,
  deleteKnowledgeArticleController,
  getKnowledgeReadStatusController,
  getKnowledgeUnreadCountController,
  postKnowledgeMarkReadController,
  postKnowledgeMarkAllReadController,
  getLoginLogsController,
  getRolePermissionsController,
  getIpAccessControlController,
  seedKnowledgeCategoriesController,
  getDataDebugController,
  getNavigationConfigController,
  postNavigationConfigController,
  getSharedDataController,
  postSharedDataController,
  getSharedDataBatchController,
  getActivityDataController,
  getCurrenciesController,
  getActivityTypesController,
  getCustomerSourcesController,
  getShiftReceiversController,
  getShiftHandoversController,
  getAuditRecordsController,
  getPendingAuditCountController,
  patchActivityGiftController,
  deleteActivityGiftController,
} from './controller.js';

const router = Router();

// IP 访问控制配置：登录前需读取，不要求认证
router.get('/settings/ip-access-control', getIpAccessControlController);

router.use(authMiddleware);

// 以下接口要求认证，按 tenant_id 过滤数据
router.get('/knowledge/categories', getKnowledgeCategoriesController);
router.get('/knowledge/articles/:categoryId', getKnowledgeArticlesController);
router.post('/knowledge/categories', postKnowledgeCategoryController);
router.patch('/knowledge/categories/:id', patchKnowledgeCategoryController);
router.delete('/knowledge/categories/:id', deleteKnowledgeCategoryController);
router.post('/knowledge/articles', postKnowledgeArticleController);
router.patch('/knowledge/articles/:id', patchKnowledgeArticleController);
router.delete('/knowledge/articles/:id', deleteKnowledgeArticleController);
router.get('/knowledge/read-status', getKnowledgeReadStatusController);
router.get('/knowledge/unread-count', getKnowledgeUnreadCountController);
router.post('/knowledge/read-status', postKnowledgeMarkReadController);
router.post('/knowledge/read-status/mark-all', postKnowledgeMarkAllReadController);
router.get('/operation-logs', getOperationLogsController);
router.get('/login-logs', getLoginLogsController);
router.get('/currencies', getCurrenciesController);
router.get('/activity-types', getActivityTypesController);
router.get('/customer-sources', getCustomerSourcesController);
router.get('/shift-receivers', getShiftReceiversController);
router.get('/shift-handovers', getShiftHandoversController);
router.get('/audit-records', getAuditRecordsController);
router.get('/audit-records/pending-count', getPendingAuditCountController);

router.get('/data-debug', getDataDebugController);
router.post('/operation-logs', postOperationLogController);
router.get('/permissions', getRolePermissionsController);
router.post('/seed-knowledge', seedKnowledgeCategoriesController);
router.get('/navigation-config', getNavigationConfigController);
router.post('/navigation-config', postNavigationConfigController);
router.get('/shared-data', getSharedDataController);
router.post('/shared-data', postSharedDataController);
router.get('/shared-data/batch', getSharedDataBatchController);
router.get('/activity-data', getActivityDataController);
router.patch('/activity-gifts/:id', patchActivityGiftController);
router.delete('/activity-gifts/:id', deleteActivityGiftController);

export default router;
