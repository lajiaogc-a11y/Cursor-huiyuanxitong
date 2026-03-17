/**
 * 工作任务路由 - 维护历史、我的任务、发动态（JWT 认证）
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { getTaskProgressController, getMyTaskItemsController, createPosterTaskController, createCustomerMaintenanceTaskController } from './controller.js';

const router = Router();
router.get('/progress', authMiddleware, getTaskProgressController);
router.get('/my-items', authMiddleware, getMyTaskItemsController);
router.post('/poster', authMiddleware, createPosterTaskController);
router.post('/maintenance', authMiddleware, createCustomerMaintenanceTaskController);
export default router;
