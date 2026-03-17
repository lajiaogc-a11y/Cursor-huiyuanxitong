/**
 * Orders 路由
 * /full, /usdt-full 必须在 /:id 之前
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  listOrdersController,
  getOrdersFullController,
  getUsdtOrdersFullController,
  createOrderController,
  updateOrderPointsController,
} from './controller.js';

const router = Router();

router.get('/', authMiddleware, listOrdersController);
router.get('/full', authMiddleware, getOrdersFullController);
router.get('/usdt-full', authMiddleware, getUsdtOrdersFullController);
router.post('/', authMiddleware, createOrderController);
router.patch('/:id/points', authMiddleware, updateOrderPointsController);

export default router;
