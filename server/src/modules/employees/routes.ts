/**
 * Employees 路由 - 员工管理（JWT 认证）
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
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

const router = Router();
router.get('/', authMiddleware, listEmployeesController);
router.get('/check-unique', authMiddleware, checkEmployeeUniqueController);
router.get('/active-visible', authMiddleware, listActiveVisibleEmployeesController);
router.get('/:id/name-history', authMiddleware, getEmployeeNameHistoryController);
router.get('/:id', authMiddleware, getEmployeeController);
router.post('/', authMiddleware, createEmployeeController);
router.patch('/:id', authMiddleware, updateEmployeeController);
router.patch('/:id/status', authMiddleware, toggleEmployeeStatusController);
router.post('/:id/reset-password', authMiddleware, resetEmployeePasswordController);
router.post('/:id/force-logout', authMiddleware, forceLogoutEmployeeController);
router.delete('/:id', authMiddleware, deleteEmployeeController);
export default router;
