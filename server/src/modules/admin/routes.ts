/**
 * Admin 路由 - 数据管理/归档
 * 需 JWT + role = admin
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { adminMiddleware } from './adminMiddleware.js';
import { validate, z } from '../../middlewares/validate.js';
import {
  verifyPasswordController,
  bulkDeleteController,
  archiveOrdersController,
  archiveMembersController,
  deleteOrderController,
  deleteMemberController,
  cleanupWebhookEventQueueController,
} from './controller.js';
import backupRoutes from '../backup/routes.js';

// ─── Zod schemas ───────────────────────────────────────
const verifyPasswordBody = z.object({
  password: z.string().min(1).max(200),
});

/** 与 DataManagementTab / bulkDeleteController 一致，勿与「按表+id 批量删」混淆 */
const bulkDeleteSelectionsSchema = z.object({
  orders: z.boolean(),
  recycleActivityDataOnOrderDelete: z.boolean().optional(),
  reports: z
    .object({
      employee: z.boolean(),
      card: z.boolean(),
      vendor: z.boolean(),
      daily: z.boolean(),
    })
    .optional(),
  members: z
    .object({
      memberManagement: z.boolean(),
      activityData: z.boolean(),
      activityGift: z.boolean(),
      pointsLedger: z.boolean(),
    })
    .optional(),
  shiftData: z
    .object({
      shiftHandovers: z.boolean(),
      shiftReceivers: z.boolean(),
    })
    .optional(),
  merchantSettlement: z
    .object({
      balanceChangeLogs: z.boolean(),
      initialBalances: z.boolean(),
    })
    .optional(),
  referralRelations: z.boolean().optional(),
  auditRecords: z.boolean().optional(),
  operationLogs: z.boolean().optional(),
  loginLogs: z.boolean().optional(),
  knowledgeData: z
    .object({
      categories: z.boolean(),
      articles: z.boolean(),
    })
    .optional(),
  preserveActivityData: z.boolean().optional(),
});

const bulkDeleteBody = z.object({
  password: z.string().min(1).max(200),
  retainMonths: z.coerce.number().int().min(0).max(2400),
  deleteSelections: bulkDeleteSelectionsSchema,
});

const archiveBody = z.object({
  before_date: z.string().optional(),
  ids: z.array(z.string()).optional(),
}).refine(d => d.before_date || d.ids, { message: 'before_date or ids required' });

const idParam = z.object({
  id: z.string().min(1),
});

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.post('/verify-password', validate({ body: verifyPasswordBody }), verifyPasswordController);
router.post('/bulk-delete', validate({ body: bulkDeleteBody }), bulkDeleteController);
router.post('/archive-orders', validate({ body: archiveBody }), archiveOrdersController);
router.post('/archive-members', validate({ body: archiveBody }), archiveMembersController);
router.delete('/orders/:id', validate({ params: idParam }), deleteOrderController);
router.delete('/members/:id', validate({ params: idParam }), deleteMemberController);
router.post('/webhooks/cleanup-event-queue', cleanupWebhookEventQueueController);
router.use('/backup', backupRoutes);

export default router;
