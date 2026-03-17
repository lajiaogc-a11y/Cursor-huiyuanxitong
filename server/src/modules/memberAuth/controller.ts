/**
 * Member Auth Controller - 会员端认证
 */
import type { Request, Response } from 'express';
import {
  verifyMemberPasswordRepository,
  setMemberPasswordRepository,
  getMemberInfoRepository,
} from './repository.js';

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
    res.json({ success: true, data: { member } });
  } catch (e) {
    console.error('[MemberAuth] signIn error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Login failed' });
  }
}

export async function memberSetPasswordController(req: Request, res: Response): Promise<void> {
  const { member_id, old_password, new_password } = req.body || {};
  if (!member_id || !new_password) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'member_id and new_password required' });
    return;
  }
  try {
    const result = await setMemberPasswordRepository(
      member_id,
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
    res.json({ success: true, message: 'Password updated' });
  } catch (e) {
    console.error('[MemberAuth] setPassword error:', e);
    res.status(500).json({ success: false, code: 'INTERNAL_ERROR', message: 'Failed' });
  }
}

export async function memberGetInfoController(req: Request, res: Response): Promise<void> {
  const memberId = req.query.member_id as string || req.body?.member_id;
  if (!memberId) {
    res.status(400).json({ success: false, code: 'VALIDATION_ERROR', message: 'member_id required' });
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
