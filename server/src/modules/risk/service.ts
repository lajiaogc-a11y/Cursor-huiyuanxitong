import { randomUUID } from 'crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

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

async function ensureRiskTables(): Promise<void> {
  await execute(`
    CREATE TABLE IF NOT EXISTS risk_events (
      id CHAR(36) NOT NULL PRIMARY KEY,
      employee_id CHAR(36) NOT NULL,
      event_type VARCHAR(50) NOT NULL,
      severity VARCHAR(20) NOT NULL DEFAULT 'low',
      score INT NOT NULL DEFAULT 0,
      details JSON NULL,
      resolved TINYINT(1) NOT NULL DEFAULT 0,
      resolved_by CHAR(36) NULL,
      resolved_at DATETIME(3) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      KEY idx_risk_events_employee (employee_id),
      KEY idx_risk_events_created (created_at)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);

  await execute(`
    CREATE TABLE IF NOT EXISTS risk_scores (
      id CHAR(36) NOT NULL PRIMARY KEY,
      employee_id CHAR(36) NOT NULL,
      current_score INT NOT NULL DEFAULT 0,
      risk_level VARCHAR(20) NOT NULL DEFAULT 'low',
      factors JSON NULL,
      last_calculated_at DATETIME(3) NULL,
      auto_action_taken VARCHAR(100) NULL,
      created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
      updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
      UNIQUE KEY uk_risk_scores_employee (employee_id)
    ) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci
  `);
}

let tablesEnsured = false;
async function ensureOnce() {
  if (tablesEnsured) return;
  await ensureRiskTables();
  tablesEnsured = true;
}

export async function recordRiskEvent(
  employeeId: string,
  eventType: string,
  severity: string,
  score: number,
  details: Record<string, unknown>,
): Promise<string> {
  await ensureOnce();
  const id = randomUUID();
  await execute(
    `INSERT INTO risk_events (id, employee_id, event_type, severity, score, details)
     VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [id, employeeId, eventType, severity, score, JSON.stringify(details)],
  );
  return id;
}

export async function recalculateRiskScore(employeeId: string): Promise<number> {
  await ensureOnce();
  const since = toMySqlDatetime(new Date(Date.now() - 24 * 60 * 60 * 1000));
  const events = await query<{ event_type: string; score: number }>(
    `SELECT event_type, score FROM risk_events
     WHERE employee_id = ? AND resolved = 0 AND created_at >= ?`,
    [employeeId, since],
  );

  const factors: Record<string, number> = {};
  let total = 0;
  for (const e of events) {
    factors[e.event_type] = (factors[e.event_type] || 0) + e.score;
    total += e.score;
  }
  const capped = Math.min(100, total);
  const level = getRiskLevel(capped);

  const existing = await queryOne<{ id: string }>(
    `SELECT id FROM risk_scores WHERE employee_id = ? LIMIT 1`,
    [employeeId],
  );

  if (existing) {
    await execute(
      `UPDATE risk_scores SET current_score = ?, risk_level = ?, factors = CAST(? AS JSON),
       last_calculated_at = NOW(3) WHERE employee_id = ?`,
      [capped, level, JSON.stringify(factors), employeeId],
    );
  } else {
    await execute(
      `INSERT INTO risk_scores (id, employee_id, current_score, risk_level, factors, last_calculated_at)
       VALUES (?, ?, ?, ?, CAST(? AS JSON), NOW(3))`,
      [randomUUID(), employeeId, capped, level, JSON.stringify(factors)],
    );
  }

  return capped;
}

export async function getAllRiskScores(): Promise<unknown[]> {
  await ensureOnce();
  return query(
    `SELECT rs.*, e.username, e.real_name
     FROM risk_scores rs
     LEFT JOIN employees e ON e.id = rs.employee_id
     ORDER BY rs.current_score DESC`,
  );
}

export async function getRecentRiskEvents(limit: number): Promise<unknown[]> {
  await ensureOnce();
  return query(
    `SELECT re.*, e.username, e.real_name
     FROM risk_events re
     LEFT JOIN employees e ON e.id = re.employee_id
     ORDER BY re.created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function resolveRiskEvent(eventId: string, resolvedBy: string): Promise<boolean> {
  await ensureOnce();
  const res = await execute(
    `UPDATE risk_events SET resolved = 1, resolved_by = ?, resolved_at = NOW(3)
     WHERE id = ? AND resolved = 0`,
    [resolvedBy, eventId],
  );
  if (res.affectedRows > 0) {
    const event = await queryOne<{ employee_id: string }>('SELECT employee_id FROM risk_events WHERE id = ?', [eventId]);
    if (event) await recalculateRiskScore(event.employee_id);
  }
  return res.affectedRows > 0;
}

export async function checkLoginAnomaly(employeeId: string): Promise<void> {
  await ensureOnce();
  try {
    const since = toMySqlDatetime(new Date(Date.now() - 60 * 60 * 1000));
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM employee_login_logs
       WHERE employee_id = ? AND success = 0 AND created_at >= ?`,
      [employeeId, since],
    );
    const failCount = Number(row?.cnt) || 0;
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
  await ensureOnce();
  try {
    const since = toMySqlDatetime(new Date(Date.now() - 10 * 60 * 1000));
    const row = await queryOne<{ cnt: number }>(
      `SELECT COUNT(*) AS cnt FROM api_request_logs
       WHERE created_at >= ?`,
      [since],
    );
    const opCount = Number(row?.cnt) || 0;
    if (opCount >= 100) {
      const severity = opCount >= 500 ? 'critical' : opCount >= 200 ? 'high' : 'medium';
      const weight = EVENT_WEIGHTS['frequency_anomaly'] || 20;
      const mult = SEVERITY_MULTIPLIERS[severity] || 0.6;
      const score = Math.round(weight * mult);
      await recordRiskEvent(employeeId, 'frequency_anomaly', severity, score, { operations_10min: opCount });
      await recalculateRiskScore(employeeId);
    }
  } catch {
    // table may not exist yet - graceful degradation
  }
}
