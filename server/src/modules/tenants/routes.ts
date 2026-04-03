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

// ─── Zod schemas (field names match frontend camelCase) ─
const createTenantBody = z.object({
  tenantCode: z.string().min(1).max(200),
  tenantName: z.string().min(1).max(200),
  adminUsername: z.string().min(1).max(100).optional(),
  adminRealName: z.string().max(200).optional(),
  adminPassword: z.string().min(6).max(200).optional(),
});

const updateTenantBody = z.object({
  tenantCode: z.string().min(1).max(200).optional(),
  tenantName: z.string().min(1).max(200).optional(),
  status: z.enum(['active', 'inactive', 'suspended', 'disabled']).optional(),
});

const setSuperAdminBody = z.object({
  employeeId: z.string().min(1),
});

const resetAdminPasswordBody = z.object({
  adminEmployeeId: z.string().nullable().optional(),
  newPassword: z.string().min(6).max(200),
});

const deleteTenantBody = z.object({
  force: z.boolean().optional(),
  password: z.string().min(1),
}).passthrough();

const idParam = z.object({
  id: z.string().min(1),
});

const router = Router();
router.get('/', authMiddleware, listTenantsController);
router.post('/', authMiddleware, validate({ body: createTenantBody }), createTenantController);
router.post('/super-admin', authMiddleware, validate({ body: setSuperAdminBody }), setTenantSuperAdminController);
router.patch('/:id', authMiddleware, validate({ params: idParam, body: updateTenantBody }), updateTenantController);
router.post('/:id/reset-admin-password', authMiddleware, validate({ params: idParam, body: resetAdminPasswordBody }), resetTenantAdminPasswordController);
router.post('/:id/delete', authMiddleware, validate({ params: idParam, body: deleteTenantBody }), deleteTenantController);
export default router;
