/**
 * Admin 路由 - 数据管理/归档
 * 需 JWT + role = admin
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { adminMiddleware } from './adminMiddleware.js';
import {
  verifyPasswordController,
  bulkDeleteController,
  archiveOrdersController,
  archiveMembersController,
  deleteOrderController,
  deleteMemberController,
} from './controller.js';

const router = Router();

router.use(authMiddleware);
router.use(adminMiddleware);

router.post('/verify-password', verifyPasswordController);
router.post('/bulk-delete', bulkDeleteController);
router.post('/archive-orders', archiveOrdersController);
router.post('/archive-members', archiveMembersController);
router.delete('/orders/:id', deleteOrderController);
router.delete('/members/:id', deleteMemberController);

export default router;
