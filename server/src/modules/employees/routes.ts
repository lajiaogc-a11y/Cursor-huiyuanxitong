/**
 * Employees 路由 - 员工管理（JWT 认证）
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { validate, z } from '../../middlewares/validate.js';
import {
  checkEmployeeUniqueController,
  createEmployeeController,
  deleteEmployeeController,
  forceLogoutEmployeeController,
  getEmployeeController,
  getEmployeeNameHistoryController,
  listActiveVisibleEmployeesController,
  listEmployeesController,
  resetEmployeePasswordController,
  toggleEmployeeStatusController,
  updateEmployeeController,
} from './controller.js';

// ─── Zod schemas ───────────────────────────────────────
const createEmployeeBody = z.object({
  tenant_id: z.string().uuid().nullable().optional(),
  username: z.string().min(1).max(100),
  real_name: z.string().min(1).max(100),
  role: z.enum(['admin', 'manager', 'staff']).optional().default('staff'),
  password: z.string().min(6).max(200),
});

const updateEmployeeBody = z.object({
  username: z.string().min(1).max(100).optional(),
  real_name: z.string().min(1).max(100).optional(),
  role: z.enum(['admin', 'manager', 'staff']).optional(),
  password: z.string().min(6).max(200).optional(),
  status: z.enum(['active', 'disabled', 'pending']).optional(),
  visible: z.boolean().optional(),
  change_reason: z.string().max(500).optional(),
});

const resetPasswordBody = z.object({
  new_password: z.string().min(6).max(200),
});

const idParam = z.object({
  id: z.string().min(1),
});

const router = Router();
router.get('/', authMiddleware, listEmployeesController);
router.get('/check-unique', authMiddleware, checkEmployeeUniqueController);
router.get('/active-visible', authMiddleware, listActiveVisibleEmployeesController);
router.get('/:id/name-history', authMiddleware, getEmployeeNameHistoryController);
router.get('/:id', authMiddleware, getEmployeeController);
router.post('/', authMiddleware, validate({ body: createEmployeeBody }), createEmployeeController);
router.patch('/:id', authMiddleware, validate({ params: idParam, body: updateEmployeeBody }), updateEmployeeController);
router.patch('/:id/status', authMiddleware, validate({ params: idParam }), toggleEmployeeStatusController);
router.post('/:id/reset-password', authMiddleware, validate({ params: idParam, body: resetPasswordBody }), resetEmployeePasswordController);
router.post('/:id/force-logout', authMiddleware, validate({ params: idParam }), forceLogoutEmployeeController);
router.delete('/:id', authMiddleware, validate({ params: idParam }), deleteEmployeeController);
export default router;
