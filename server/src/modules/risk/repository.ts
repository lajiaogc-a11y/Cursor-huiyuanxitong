/**
 * Risk Repository — 纯数据访问层
 */
import { randomUUID } from 'crypto';
import { execute, query, queryOne } from '../../database/index.js';
import { toMySqlDatetime } from '../../lib/shanghaiTime.js';

let _tablesEnsured = false;

export async function ensureRiskTables(): Promise<void> {
  if (_tablesEnsured) return;
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
  _tablesEnsured = true;
}

export async function insertRiskEvent(
  id: string, employeeId: string, eventType: string, severity: string, score: number, details: string,
): Promise<void> {
  await execute(
    `INSERT INTO risk_events (id, employee_id, event_type, severity, score, details) VALUES (?, ?, ?, ?, ?, CAST(? AS JSON))`,
    [id, employeeId, eventType, severity, score, details],
  );
}

export async function selectUnresolvedEvents(employeeId: string, since: string): Promise<Array<{ event_type: string; score: number }>> {
  return query<{ event_type: string; score: number }>(
    `SELECT event_type, score FROM risk_events WHERE employee_id = ? AND resolved = 0 AND created_at >= ?`,
    [employeeId, since],
  );
}

export async function selectRiskScoreId(employeeId: string): Promise<string | null> {
  const row = await queryOne<{ id: string }>(`SELECT id FROM risk_scores WHERE employee_id = ? LIMIT 1`, [employeeId]);
  return row?.id ?? null;
}

export async function updateRiskScore(employeeId: string, score: number, level: string, factorsJson: string): Promise<void> {
  await execute(
    `UPDATE risk_scores SET current_score = ?, risk_level = ?, factors = CAST(? AS JSON), last_calculated_at = NOW(3) WHERE employee_id = ?`,
    [score, level, factorsJson, employeeId],
  );
}

export async function insertRiskScore(employeeId: string, score: number, level: string, factorsJson: string): Promise<void> {
  await execute(
    `INSERT INTO risk_scores (id, employee_id, current_score, risk_level, factors, last_calculated_at) VALUES (?, ?, ?, ?, CAST(? AS JSON), NOW(3))`,
    [randomUUID(), employeeId, score, level, factorsJson],
  );
}

export async function selectAllRiskScores(): Promise<unknown[]> {
  return query(
    `SELECT rs.*, e.username, e.real_name FROM risk_scores rs LEFT JOIN employees e ON e.id = rs.employee_id ORDER BY rs.current_score DESC`,
  );
}

export async function selectRecentRiskEvents(limit: number): Promise<unknown[]> {
  return query(
    `SELECT re.*, e.username, e.real_name FROM risk_events re LEFT JOIN employees e ON e.id = re.employee_id ORDER BY re.created_at DESC LIMIT ?`,
    [limit],
  );
}

export async function resolveRiskEventById(eventId: string, resolvedBy: string): Promise<number> {
  const res = await execute(
    `UPDATE risk_events SET resolved = 1, resolved_by = ?, resolved_at = NOW(3) WHERE id = ? AND resolved = 0`,
    [resolvedBy, eventId],
  );
  return res.affectedRows;
}

export async function selectRiskEventEmployeeId(eventId: string): Promise<string | null> {
  const row = await queryOne<{ employee_id: string }>('SELECT employee_id FROM risk_events WHERE id = ?', [eventId]);
  return row?.employee_id ?? null;
}

export async function countFailedLoginsRecent(employeeId: string, since: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(
    `SELECT COUNT(*) AS cnt FROM employee_login_logs WHERE employee_id = ? AND success = 0 AND created_at >= ?`,
    [employeeId, since],
  );
  return Number(row?.cnt ?? 0);
}

export async function countApiRequestsRecent(since: string): Promise<number> {
  const row = await queryOne<{ cnt: number }>(`SELECT COUNT(*) AS cnt FROM api_request_logs WHERE created_at >= ?`, [since]);
  return Number(row?.cnt ?? 0);
}
