/**
 * Orders 路由
 * /full, /usdt-full 必须在 /:id 之前
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
import {
  listOrdersController,
  getOrdersFullController,
  getUsdtOrdersFullController,
  createOrderController,
  updateOrderPointsController,
} from './controller.js';

const createOrderSchema = z.object({
  order_number: z.string().max(100).optional().nullable(),
  tenant_id: z.string().uuid('invalid tenant_id').optional().nullable(),
  phone_number: z.string().max(30).optional().nullable(),
  actual_payment: z.number().min(0).optional().nullable(),
  currency: z.string().max(10).optional().nullable(),
}).passthrough();

const listQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).optional(),
  limit: z.coerce.number().int().min(1).max(100000).optional(),
  tenant_id: z.string().uuid().optional(),
}).passthrough();

const router = Router();

router.get('/', authMiddleware, validate({ query: listQuery }), listOrdersController);
router.get('/full', authMiddleware, getOrdersFullController);
router.get('/usdt-full', authMiddleware, getUsdtOrdersFullController);
router.post('/', authMiddleware, validate({ body: createOrderSchema }), createOrderController);
router.patch('/:id/points', authMiddleware, updateOrderPointsController);

export default router;
