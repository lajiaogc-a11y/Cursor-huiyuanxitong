/**
 * 会员 JWT：GET /api/invite/ranking
 */
import { Router, type Response } from 'express';
import { memberAuthMiddleware, type MemberAuthenticatedRequest } from '../memberAuth/middleware.js';
import { getInviteRankingTop5 } from './service.js';

const router = Router();

router.get('/ranking', memberAuthMiddleware, async (req: MemberAuthenticatedRequest, res: Response): Promise<void> => {
  const tid = req.member?.tenant_id != null ? String(req.member.tenant_id).trim() : '';
  if (!tid) {
    res.status(400).json({ success: false, error: { code: 'NO_TENANT', message: 'Member has no tenant' } });
    return;
  }
  try {
    const top5 = await getInviteRankingTop5(tid);
    res.json({ success: true, top5 });
  } catch (e) {
    res.status(500).json({
      success: false,
      error: { code: 'INTERNAL', message: (e as Error).message || 'Failed to load ranking' },
    });
  }
});

export default router;
