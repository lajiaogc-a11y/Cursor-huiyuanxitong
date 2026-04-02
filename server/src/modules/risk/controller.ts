import type { Response } from 'express';
import type { AuthenticatedRequest } from '../../middlewares/auth.js';
import {
  recordRiskEvent,
  recalculateRiskScore,
  getAllRiskScores,
  getRecentRiskEvents,
  resolveRiskEvent,
  checkLoginAnomaly,
  checkFrequencyAnomaly,
} from './service.js';

function requireAdmin(req: AuthenticatedRequest): boolean {
  return req.user?.role === 'admin' || req.user?.is_platform_super_admin === true || req.user?.is_super_admin === true;
}

export async function recordRiskEventController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employee_id, event_type, severity, score, details } = req.body;
    if (!employee_id || !event_type) { res.status(400).json({ error: 'employee_id and event_type required' }); return; }
    const id = await recordRiskEvent(employee_id, event_type, severity || 'medium', score || 0, details || {});
    res.json({ success: true, id });
  } catch (e) {
    console.error('[Risk] recordEvent error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function recalculateRiskScoreController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employee_id } = req.body;
    if (!employee_id) { res.status(400).json({ error: 'employee_id required' }); return; }
    const score = await recalculateRiskScore(employee_id);
    res.json({ success: true, score });
  } catch (e) {
    console.error('[Risk] recalculate error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function getAllRiskScoresController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!requireAdmin(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const scores = await getAllRiskScores();
    res.json(scores);
  } catch (e) {
    console.error('[Risk] getScores error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function getRecentRiskEventsController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!requireAdmin(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const limit = Math.min(200, Math.max(1, Number(req.query.limit) || 50));
    const events = await getRecentRiskEvents(limit);
    res.json(events);
  } catch (e) {
    console.error('[Risk] getEvents error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function resolveRiskEventController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    if (!requireAdmin(req)) { res.status(403).json({ error: 'Forbidden' }); return; }
    const { event_id, resolved_by } = req.body;
    if (!event_id) { res.status(400).json({ error: 'event_id required' }); return; }
    const ok = await resolveRiskEvent(event_id, resolved_by || req.user?.id || '');
    res.json({ success: ok });
  } catch (e) {
    console.error('[Risk] resolve error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function checkLoginAnomalyController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employee_id } = req.body;
    if (!employee_id) { res.status(400).json({ error: 'employee_id required' }); return; }
    await checkLoginAnomaly(employee_id);
    res.json({ success: true });
  } catch (e) {
    console.error('[Risk] checkLoginAnomaly error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}

export async function checkFrequencyAnomalyController(req: AuthenticatedRequest, res: Response): Promise<void> {
  try {
    const { employee_id } = req.body;
    if (!employee_id) { res.status(400).json({ error: 'employee_id required' }); return; }
    await checkFrequencyAnomaly(employee_id);
    res.json({ success: true });
  } catch (e) {
    console.error('[Risk] checkFrequencyAnomaly error:', e);
    res.status(500).json({ error: (e as Error).message });
  }
}
