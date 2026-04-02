import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import { postEnqueueWebhookEventController } from './enqueueController.js';

const router = Router();

router.use(authMiddleware);
router.post('/enqueue', postEnqueueWebhookEventController);

export default router;
