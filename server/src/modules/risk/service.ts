/**
 * Risk Service — 业务编排层
 *
 * 职责：风险事件记录、评分计算、异常检测
 * 数据访问委托 repository.ts
 */
import { randomUUID } from 'crypto';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';
import * as repo from './repository.js';

const EVENT_WEIGHTS: Record<string, number> = {
  login_anomaly: 15,
  order_anomaly: 25,
  rate_anomaly: 20,
  frequency_anomaly: 20,
  ip_anomaly: 20,
};

const SEVERITY_MULTIPLIERS: Record<string, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.85,
  critical: 1.0,
};

function getRiskLevel(score: number): string {
  if (score >= 80) return 'critical';
  if (score >= 60) return 'high';
  if (score >= 30) return 'medium';
  return 'low';
}

export async function recordRiskEvent(
  employeeId: string,
  eventType: string,
  severity: string,
  score: number,
  details: Record<string, unknown>,
): Promise<string> {
  await repo.ensureRiskTables();
  const id = randomUUID();
  await repo.insertRiskEvent(id, employeeId, eventType, severity, score, JSON.stringify(details));
  return id;
}

export async function recalculateRiskScore(employeeId: string): Promise<number> {
  await repo.ensureRiskTables();
  const since = toMySqlDatetime(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const events = await repo.selectUnresolvedEvents(employeeId, since);

  const factors: Record<string, number> = {};
  let total = 0;
  for (const e of events) {
    factors[e.event_type] = (factors[e.event_type] || 0) + e.score;
    total += e.score;
  }
  const capped = Math.min(100, total);
  const level = getRiskLevel(capped);
  const factorsJson = JSON.stringify(factors);

  const existingId = await repo.selectRiskScoreId(employeeId);
  if (existingId) {
    await repo.updateRiskScore(employeeId, capped, level, factorsJson);
  } else {
    await repo.insertRiskScore(employeeId, capped, level, factorsJson);
  }
  return capped;
}

export async function getAllRiskScores(): Promise<unknown[]> {
  await repo.ensureRiskTables();
  return repo.selectAllRiskScores();
}

export async function getRecentRiskEvents(limit: number): Promise<unknown[]> {
  await repo.ensureRiskTables();
  return repo.selectRecentRiskEvents(limit);
}

export async function resolveRiskEvent(eventId: string, resolvedBy: string): Promise<boolean> {
  await repo.ensureRiskTables();
  const affected = await repo.resolveRiskEventById(eventId, resolvedBy);
  if (affected > 0) {
    const empId = await repo.selectRiskEventEmployeeId(eventId);
    if (empId) await recalculateRiskScore(empId);
  }
  return affected > 0;
}

export async function checkLoginAnomaly(employeeId: string): Promise<void> {
  await repo.ensureRiskTables();
  try {
    const since = toMySqlDatetime(new Date(Date.now() - 60 * 60 * 1000));
    const failCount = await repo.countFailedLoginsRecent(employeeId, since);
    if (failCount >= 5) {
      const severity = failCount >= 10 ? 'critical' : failCount >= 7 ? 'high' : 'medium';
      const weight = EVENT_WEIGHTS['login_anomaly'] || 15;
      const mult = SEVERITY_MULTIPLIERS[severity] || 0.6;
      const score = Math.round(weight * mult);
      await recordRiskEvent(employeeId, 'login_anomaly', severity, score, { failed_attempts_1h: failCount });
      await recalculateRiskScore(employeeId);
    }
  } catch {
    // graceful degradation if table missing
  }
}

export async function checkFrequencyAnomaly(employeeId: string): Promise<void> {
  await repo.ensureRiskTables();
  try {
    const since = toMySqlDatetime(new Date(Date.now() - 10 * 60 * 1000));
    const opCount = await repo.countApiRequestsRecent(since);
    if (opCount >= 100) {
      const severity = opCount >= 500 ? 'critical' : opCount >= 200 ? 'high' : 'medium';
      const weight = EVENT_WEIGHTS['frequency_anomaly'] || 20;
      const mult = SEVERITY_MULTIPLIERS[severity] || 0.6;
      const score = Math.round(weight * mult);
      await recordRiskEvent(employeeId, 'frequency_anomaly', severity, score, { operations_10min: opCount });
      await recalculateRiskScore(employeeId);
    }
  } catch {
    // table may not exist yet
  }
}
