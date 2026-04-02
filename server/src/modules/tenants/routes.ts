/**
 * Tenants 路由 - GET /api/tenants
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
import {
  createTenantController,
  deleteTenantController,
  listTenantsController,
  resetTenantAdminPasswordController,
  setTenantSuperAdminController,
  updateTenantController,
} from './controller.js';

// ─── Zod schemas ───────────────────────────────────────
const createTenantBody = z.object({
  name: z.string().min(1).max(200),
  admin_username: z.string().min(1).max(100).optional(),
  admin_password: z.string().min(6).max(200).optional(),
});

const updateTenantBody = z.object({
  name: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'disabled']).optional(),
});

const setSuperAdminBody = z.object({
  tenant_id: z.string().uuid(),
  employee_id: z.string().uuid(),
});

const resetAdminPasswordBody = z.object({
  new_password: z.string().min(6).max(200),
});

const idParam = z.object({
  id: z.string().min(1),
});

const router = Router();
router.get('/', authMiddleware, listTenantsController);
router.post('/', authMiddleware, validate({ body: createTenantBody }), createTenantController);
router.post('/super-admin', authMiddleware, validate({ body: setSuperAdminBody }), setTenantSuperAdminController);
router.patch('/:id', authMiddleware, validate({ params: idParam, body: updateTenantBody }), updateTenantController);
router.post('/:id/reset-admin-password', authMiddleware, validate({ params: idParam, body: resetAdminPasswordBody }), resetTenantAdminPasswordController);
router.post('/:id/delete', authMiddleware, validate({ params: idParam }), deleteTenantController);
export default router;
