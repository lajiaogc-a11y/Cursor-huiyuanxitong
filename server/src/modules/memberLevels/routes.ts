import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { getMemberLevelsController, putMemberLevelsController } from './controller.js';

const router = Router();

router.get('/', authMiddleware, getMemberLevelsController);
router.put('/', authMiddleware, putMemberLevelsController);

export default router;
