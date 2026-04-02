/**
 * 客户维护任务路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  generateCustomerListController,
  createMaintenanceTaskController,
  createPosterTaskController,
  getOpenTasksController,
  getTaskProgressListController,
  closeTaskController,
  getMyTaskItemsController,
  patchTaskItemRemarkController,
  postTaskItemDoneController,
  postTaskItemLogCopyController,
} from './controller.js';

const router = Router();

router.get('/progress-list', authMiddleware, getTaskProgressListController);
router.get('/my-items', authMiddleware, getMyTaskItemsController);
router.patch('/items/:itemId/remark', authMiddleware, patchTaskItemRemarkController);
router.post('/items/:itemId/done', authMiddleware, postTaskItemDoneController);
router.post('/items/:itemId/log-copy', authMiddleware, postTaskItemLogCopyController);

router.post('/generate-customer-list', authMiddleware, generateCustomerListController);
router.post('/create', authMiddleware, createMaintenanceTaskController);
router.post('/create-poster', authMiddleware, createPosterTaskController);
router.get('/open', authMiddleware, getOpenTasksController);
router.post('/:id/close', authMiddleware, closeTaskController);

export default router;
