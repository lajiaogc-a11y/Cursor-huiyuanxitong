/**
 * Member Auth Controller - 会员端认证
 */
import type { Request, Response } from 'express';
import {
  verifyMemberPasswordRepository,
  setMemberPasswordRepository,
  getMemberInfoRepository,
  recordMemberLoginRepository,
  bumpMemberLoginSessionRepository,
  getMemberTokenClaimsForSignRepository,
} from './repository.js';
import { signMemberToken, type MemberAuthenticatedRequest } from './middleware.js';

export async function memberSignInController(req: Request, res: Response): Promise<void> {
  const { phone, password } = req.body || {};
  if (!phone || !password) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'phone and password required' });
    return;
  }
  try {
    const result = await verifyMemberPasswordRepository(String(phone).trim(), password);
    if (!result.success) {
      const msg = result.error === 'MEMBER_NOT_FOUND' ? 'Member not found'
        : result.error === 'NO_PASSWORD_SET' ? 'Please contact admin to set your password'
        : result.error === 'WRONG_PASSWORD' ? 'Wrong password'
        : result.error || 'Login failed';
      res.status(401).json({ success: false, code: result.error ?? 'LOGIN_FAILED', message: msg });
      return;
    }
    const member = result.member;
    if (!member) {
      res.status(401).json({ success: false, code: 'INVALID_RESPONSE', message: 'Invalid response' });
      return;
    }
    let sessionSeq = 0;
    try {
      sessionSeq = await bumpMemberLoginSessionRepository(member.id);
    } catch (e) {
      console.error('[MemberAuth] bump session seq error:', e);
      res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Login failed' });
      return;
    }
    try {
      await recordMemberLoginRepository(member.id, member.tenant_id ?? null);
    } catch (e) {
      console.error('[MemberAuth] record login error:', e);
    }
    const token = signMemberToken(member.id, member.phone_number, member.tenant_id, sessionSeq);
    res.json({ success: true, data: { member, token } });
  } catch (e) {
    console.error('[MemberAuth] signIn error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Login failed' });
  }
}

export async function memberSetPasswordController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const memberId = req.member?.id;
  if (!memberId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Please sign in first' });
    return;
  }
  const { old_password, new_password } = req.body || {};
  if (!new_password) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'new_password required' });
    return;
  }
  try {
    const result = await setMemberPasswordRepository(
      memberId,
      old_password ?? null,
      new_password
    );
    if (!result.success) {
      const msg = result.error === 'WRONG_PASSWORD' ? 'Wrong password'
        : result.error === 'PASSWORD_TOO_SHORT' ? 'Password must be at least 6 characters'
        : result.error === 'OLD_PASSWORD_REQUIRED' ? 'Old password required'
        : result.error || 'Failed';
      res.status(400).json({ success: false, code: result.error ?? 'FAILED', message: msg });
      return;
    }
    const claims = await getMemberTokenClaimsForSignRepository(memberId);
    const info = await getMemberInfoRepository(memberId);
    if (!claims || !info.success || !info.member) {
      res.json({ success: true, message: 'Password updated' });
      return;
    }
    const token = signMemberToken(memberId, claims.phone, claims.tenant_id, claims.sessionSeq);
    res.json({
      success: true,
      message: 'Password updated',
      data: { token, member: info.member },
    });
  } catch (e) {
    console.error('[MemberAuth] setPassword error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Failed' });
  }
}

export async function memberGetInfoController(req: MemberAuthenticatedRequest, res: Response): Promise<void> {
  const memberId = req.member?.id;
  if (!memberId) {
    res.status(401).json({ success: false, code: 'UNAUTHORIZED', message: 'Please sign in first' });
    return;
  }
  try {
    const result = await getMemberInfoRepository(memberId);
    if (!result.success || !result.member) {
      res.status(404).json({ success: false, code: 'MEMBER_NOT_FOUND', message: 'Member not found' });
      return;
    }
    res.json({ success: true, data: { member: result.member } });
  } catch (e) {
    console.error('[MemberAuth] getInfo error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Failed' });
  }
}
