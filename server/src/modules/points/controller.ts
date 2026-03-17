/**
 * Points Controller
 */
import type { Request, Response } from 'express';
import {
  getMemberPointsService,
  getMemberPointsBreakdownService,
  getMemberSpinQuotaService,
} from './service.js';

export async function getMemberPointsController(req: Request, res: Response): Promise<void> {
  const memberId = req.params.memberId;
  if (!memberId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'memberId required' } });
    return;
  }
  const result = await getMemberPointsService(memberId);
  res.json({ success: true, data: result });
}

export async function getMemberPointsBreakdownController(req: Request, res: Response): Promise<void> {
  const memberId = req.params.memberId;
  if (!memberId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'memberId required' } });
    return;
  }
  const result = await getMemberPointsBreakdownService(memberId);
  res.json({ success: true, data: result });
}

export async function getMemberSpinQuotaController(req: Request, res: Response): Promise<void> {
  const memberId = req.params.memberId;
  if (!memberId) {
    res.status(400).json({ success: false, error: { code: 'VALIDATION_ERROR', message: 'memberId required' } });
    return;
  }
  const result = await getMemberSpinQuotaService(memberId);
  res.json({ success: true, data: result });
}
