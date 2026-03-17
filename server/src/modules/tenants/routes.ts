/**
 * Tenants 路由 - GET /api/tenants
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  createTenantController,
  deleteTenantController,
  listTenantsController,
  resetTenantAdminPasswordController,
  setTenantSuperAdminController,
  updateTenantController,
} from './controller.js';

const router = Router();
router.get('/', authMiddleware, listTenantsController);
router.post('/', authMiddleware, createTenantController);
router.post('/super-admin', authMiddleware, setTenantSuperAdminController);
router.patch('/:id', authMiddleware, updateTenantController);
router.post('/:id/reset-admin-password', authMiddleware, resetTenantAdminPasswordController);
router.post('/:id/delete', authMiddleware, deleteTenantController);
export default router;
