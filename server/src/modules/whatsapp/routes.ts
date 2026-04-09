/**
 * WhatsApp 工作台路由
 */
import { Router } from 'express';
import { authMiddleware, type AuthenticatedRequest } from '../../middlewares/auth.js';
import * as ctrl from './controller.js';

const router = Router();

router.post('/normalize-phone', authMiddleware, (req, res, next) =>
  ctrl.normalizePhoneController(req as AuthenticatedRequest, res).catch(next));

router.get('/member-by-phone', authMiddleware, (req, res, next) =>
  ctrl.memberByPhoneController(req as AuthenticatedRequest, res).catch(next));

router.get('/conversation-context', authMiddleware, (req, res, next) =>
  ctrl.conversationContextController(req as AuthenticatedRequest, res).catch(next));

router.get('/conversation-status', authMiddleware, (req, res, next) =>
  ctrl.getConversationStatusController(req as AuthenticatedRequest, res).catch(next));

router.post('/conversation-status', authMiddleware, (req, res, next) =>
  ctrl.updateConversationStatusController(req as AuthenticatedRequest, res).catch(next));

router.get('/conversation-statuses', authMiddleware, (req, res, next) =>
  ctrl.listConversationStatusesController(req as AuthenticatedRequest, res).catch(next));

router.post('/bind-member-phone', authMiddleware, (req, res, next) =>
  ctrl.bindMemberPhoneController(req as AuthenticatedRequest, res).catch(next));

router.post('/notes', authMiddleware, (req, res, next) =>
  ctrl.addNoteController(req as AuthenticatedRequest, res).catch(next));

router.get('/notes', authMiddleware, (req, res, next) =>
  ctrl.listNotesController(req as AuthenticatedRequest, res).catch(next));

export default router;
