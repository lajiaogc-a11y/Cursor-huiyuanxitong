import { Router, type Request, type Response } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  getPresignController,
  uploadImageController,
  getImageController,
} from './controller.js';

const router = Router();

router.get('/image/:id/presign', authMiddleware, (req: Request, res: Response) => getPresignController(req, res));
router.post('/image', authMiddleware, (req: Request, res: Response) => uploadImageController(req, res));
router.get('/image/:id', (req: Request, res: Response) => getImageController(req, res));

export default router;
