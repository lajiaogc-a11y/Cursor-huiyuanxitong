/**
 * WhatsApp 路由 - 预留
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { listChatsController } from './controller.js';

const router = Router();

router.get('/', authMiddleware, listChatsController);

export default router;
