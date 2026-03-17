/**
 * Auth 路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { loginController, registerController, logoutController, meController } from './controller.js';

const router = Router();

router.post('/login', loginController);
router.post('/register', registerController);
router.post('/logout', logoutController);
router.get('/me', authMiddleware, meController);

export default router;
