/**
 * 会员 JWT：收件箱列表 / 未读数 / 已读 / 删除
 */
import { Router, type Response } from 'express';
import { memberAuthMiddleware, type MemberAuthenticatedRequest } from '../memberAuth/middleware.js';
import {
  listNotificationsController,
  unreadCountController,
  markReadController,
  markAllReadController,
  deleteNotificationController,
} from './controller.js';

const router = Router();

router.get('/notifications', memberAuthMiddleware, (req: MemberAuthenticatedRequest, res: Response) => listNotificationsController(req, res));
router.get('/unread-count', memberAuthMiddleware, (req: MemberAuthenticatedRequest, res: Response) => unreadCountController(req, res));
router.post('/notifications/:id/read', memberAuthMiddleware, (req: MemberAuthenticatedRequest, res: Response) => markReadController(req, res));
router.post('/notifications/read-all', memberAuthMiddleware, (req: MemberAuthenticatedRequest, res: Response) => markAllReadController(req, res));
router.delete('/notifications/:id', memberAuthMiddleware, (req: MemberAuthenticatedRequest, res: Response) => deleteNotificationController(req, res));

export default router;
