/**
 * WhatsApp 工作台路由
 *
 * Step 10: 新增 search-members, unbind-member-phone
 */
import { Router } from 'express';
import { authMiddleware } from '../../middlewares/auth.js';
import {
  normalizePhoneController,
  memberByPhoneController,
  conversationContextController,
  getConversationStatusController,
  updateConversationStatusController,
  listConversationStatusesController,
  bindMemberPhoneController,
  unbindMemberPhoneController,
  searchMembersController,
  addNoteController,
  listNotesController,
} from './controller.js';

const router = Router();

router.post('/normalize-phone',       authMiddleware, normalizePhoneController);
router.get('/member-by-phone',         authMiddleware, memberByPhoneController);
router.get('/conversation-context',    authMiddleware, conversationContextController);
router.get('/conversation-status',     authMiddleware, getConversationStatusController);
router.post('/conversation-status',    authMiddleware, updateConversationStatusController);
router.get('/conversation-statuses',   authMiddleware, listConversationStatusesController);
router.post('/bind-member-phone',      authMiddleware, bindMemberPhoneController);
router.post('/unbind-member-phone',    authMiddleware, unbindMemberPhoneController);
router.get('/search-members',          authMiddleware, searchMembersController);
router.post('/notes',                  authMiddleware, addNoteController);
router.get('/notes',                   authMiddleware, listNotesController);

export default router;
