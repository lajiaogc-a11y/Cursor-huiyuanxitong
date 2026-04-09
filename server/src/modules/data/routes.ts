/**
 * Data 路由 - 操作日志、公司文档（绕过 RLS）
 */
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  getOperationLogsController,
  postOperationLogController,
  postOperationLogMarkRestoredController,
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
  saveRolePermissionsController,
  seedKnowledgeCategoriesController,
  repairKnowledgeFieldsController,
  getDataDebugController,
  getSharedDataController,
  postSharedDataController,
  getSharedDataBatchController,
  getActivityDataController,
  getActivityDataRetentionController,
  putActivityDataRetentionController,
  postActivityDataRetentionRunController,
  getCurrenciesController,
  getActivityTypesController,
  getCustomerSourcesController,
  getShiftReceiversController,
  getShiftHandoversController,
  getAuditRecordsController,
  getPendingAuditCountController,
  patchActivityGiftController,
  deleteActivityGiftController,
  postActivityDataRetentionPurgeAllController,
  getSpinCreditsDetailController,
} from './controller.js';

import {
  restoreOrderFromAuditController,
  restoreActivityGiftFromAuditController,
  restoreCardFromAuditController,
  restoreVendorFromAuditController,
  restorePaymentProviderFromAuditController,
  restoreActivityTypeFromAuditController,
  restoreCurrencyFromAuditController,
  restoreCustomerSourceFromAuditController,
  restoreReferralFromAuditController,
} from './restoreFromAuditController.js';

import {
  tableSelectController,
  tableInsertController,
  tableUpdateController,
  tableDeleteController,
  rpcProxyController,
} from './tableProxy.js';

// externalApis 已迁移至 marketRatesService.ts
import { dataRpcPostLimiter, memberGrantSpinShareLimiter, publicInviteSubmitLimiter, lotteryDrawBurstLimiter, lotteryDrawLimiter } from '../../middlewares/rateLimit.js';
import {
  fetchUsdtRatesController,
  fetchBtcPriceController,
  getNotificationsController as getNotificationsCtrl,
} from './marketRatesController.js';

const router = Router();

// 无需认证的 RPC 白名单（仅允许不涉及用户数据的只读/注册操作）
const PUBLIC_RPC_WHITELIST = new Set([
  'get_maintenance_mode_status',
  'validate_invite_and_submit',
  'check_api_rate_limit',
]);

/** 分享凭证申请 — 与分享领奖共用限流（须在通用 /rpc/:fn 之前注册） */
router.post(
  '/rpc/member_request_share_nonce',
  memberGrantSpinShareLimiter,
  dataRpcPostLimiter,
  authMiddleware,
  rpcProxyController,
);

/** P0：分享领次数 — 额外限流（须在通用 /rpc/:fn 之前注册） */
router.post(
  '/rpc/member_grant_spin_for_share',
  memberGrantSpinShareLimiter,
  dataRpcPostLimiter,
  authMiddleware,
  rpcProxyController,
);

/** 抽奖 RPC — 与 HTTP /api/lottery/draw 相同的 burst + 分钟级限流 */
router.post(
  '/rpc/member_spin',
  lotteryDrawBurstLimiter,
  lotteryDrawLimiter,
  dataRpcPostLimiter,
  authMiddleware,
  rpcProxyController,
);

/**
 * 邀请注册 — 公开、无 JWT；须携带 p_register_token（由 POST /api/member/register-init 下发），
 * 不再接受仅凭 p_tenant_id + p_code 完成开户。
 */
router.post(
  '/rpc/validate_invite_and_submit',
  publicInviteSubmitLimiter,
  dataRpcPostLimiter,
  rpcProxyController,
);

router.post(
  '/rpc/:fn',
  dataRpcPostLimiter,
  (req, res, next) => {
    const fn = String(req.params.fn || '').trim().toLowerCase().replace(/-/g, '_');
    if (PUBLIC_RPC_WHITELIST.has(fn)) {
      return next();
    }
    authMiddleware(req as AuthenticatedRequest, res, next);
  },
  rpcProxyController
);

router.use(authMiddleware);

// 通用表代理（需要认证）
router.get('/table/:table', tableSelectController);
router.post('/table/:table', tableInsertController);
router.patch('/table/:table', tableUpdateController);
router.delete('/table/:table', tableDeleteController);

/** 操作日志审计恢复（管理员） */
router.post('/restore/order', restoreOrderFromAuditController);
router.post('/restore/activity-gift', restoreActivityGiftFromAuditController);
router.post('/restore/card', restoreCardFromAuditController);
router.post('/restore/vendor', restoreVendorFromAuditController);
router.post('/restore/payment-provider', restorePaymentProviderFromAuditController);
router.post('/restore/activity-type', restoreActivityTypeFromAuditController);
router.post('/restore/currency', restoreCurrencyFromAuditController);
router.post('/restore/customer-source', restoreCustomerSourceFromAuditController);
router.post('/restore/referral', restoreReferralFromAuditController);

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
router.post('/operation-logs/:id/mark-restored', postOperationLogMarkRestoredController);
router.get('/login-logs', getLoginLogsController);
router.get('/currencies', getCurrenciesController);
router.get('/activity-types', getActivityTypesController);
router.get('/customer-sources', getCustomerSourcesController);
router.get('/shift-receivers', getShiftReceiversController);
router.get('/shift-handovers', getShiftHandoversController);
router.get('/audit-records', getAuditRecordsController);
router.get('/audit-records/pending-count', getPendingAuditCountController);

router.get('/notifications', (req, res) => getNotificationsCtrl(req as AuthenticatedRequest, res));

router.get('/data-debug', getDataDebugController);
router.post('/operation-logs', postOperationLogController);
router.get('/permissions', getRolePermissionsController);
router.post('/permissions', saveRolePermissionsController);
router.post('/seed-knowledge', seedKnowledgeCategoriesController);
/** 公司文档字段修复（与 migrate 中 knowledge UPDATE 相同；不便重启时可手动调用） */
router.post('/repair-knowledge-fields', repairKnowledgeFieldsController);
router.get('/shared-data', getSharedDataController);
router.post('/shared-data', postSharedDataController);
router.get('/shared-data/batch', getSharedDataBatchController);
router.get('/activity-data', getActivityDataController);
router.get('/spin-credits-detail/:memberId', getSpinCreditsDetailController);
router.get('/activity-data-retention', getActivityDataRetentionController);
router.put('/activity-data-retention', putActivityDataRetentionController);
router.post('/activity-data-retention/run', postActivityDataRetentionRunController);
router.post('/activity-data-retention/purge-all', postActivityDataRetentionPurgeAllController);
router.patch('/activity-gifts/:id', patchActivityGiftController);
router.delete('/activity-gifts/:id', deleteActivityGiftController);

router.post('/fetch-usdt-rates', fetchUsdtRatesController);
router.get('/fetch-btc-price', fetchBtcPriceController);

export default router;
