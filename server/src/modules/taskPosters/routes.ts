/**
 * 海报库路由
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  savePosterController,
  getPostersController,
  updatePosterController,
  deletePosterController,
} from './controller.js';

const router = Router();

router.post('/', authMiddleware, savePosterController);
router.get('/', authMiddleware, getPostersController);
router.put('/:id', authMiddleware, updatePosterController);
router.delete('/:id', authMiddleware, deletePosterController);

export default router;
