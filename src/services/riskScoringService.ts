// ============= 综合风险评分服务 =============
// 多维度风险信号合成，计算实时风险分数

import { supabase } from '@/integrations/supabase/client';

export type RiskEventType = 'login_anomaly' | 'order_anomaly' | 'rate_anomaly' | 'frequency_anomaly' | 'ip_anomaly';
export type RiskSeverity = 'low' | 'medium' | 'high' | 'critical';

// 各事件类型的权重
const EVENT_WEIGHTS: Record<RiskEventType, number> = {
  login_anomaly: 15,
  order_anomaly: 25,
  rate_anomaly: 20,
  frequency_anomaly: 20,
  ip_anomaly: 20,
};

// 严重程度乘数
const SEVERITY_MULTIPLIERS: Record<RiskSeverity, number> = {
  low: 0.3,
  medium: 0.6,
  high: 0.85,
  critical: 1.0,
};

export interface RiskEvent {
  id: string;
  employee_id: string;
  event_type: RiskEventType;
  severity: RiskSeverity;
  score: number;
  details: Record<string, unknown>;
  resolved: boolean;
  created_at: string;
}

export interface RiskScore {
  id: string;
  employee_id: string;
  current_score: number;
  risk_level: string;
  factors: Record<string, number>;
  last_calculated_at: string;
  auto_action_taken: string | null;
}

/**
 * 记录风险事件
 */
export async function recordRiskEvent(
  employeeId: string,
  eventType: RiskEventType,
  severity: RiskSeverity,
  details: Record<string, unknown>
): Promise<void> {
  const score = Math.round(EVENT_WEIGHTS[eventType] * SEVERITY_MULTIPLIERS[severity]);

  await supabase.from('risk_events').insert([{
    employee_id: employeeId,
    event_type: eventType,
    severity,
    score,
    details: details as any,
  }]);

  // 重新计算该员工的综合分数
  await recalculateRiskScore(employeeId);
}

/**
 * 重新计算员工的综合风险分数
 * 基于最近 24 小时未解决的风险事件
 */
export async function recalculateRiskScore(employeeId: string): Promise<number> {
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

  const { data: events } = await supabase
    .from('risk_events')
    .select('event_type, score')
    .eq('employee_id', employeeId)
    .eq('resolved', false)
    .gte('created_at', since);

  if (!events || events.length === 0) {
    await upsertRiskScore(employeeId, 0, 'low', {});
    return 0;
  }

  // 按事件类型聚合
  const factors: Record<string, number> = {};
  for (const evt of events) {
    const type = evt.event_type;
    factors[type] = Math.min(100, (factors[type] || 0) + evt.score);
  }

  // 综合得分 = 各维度加权平均 (capped at 100)
  const totalScore = Math.min(100, Object.values(factors).reduce((a, b) => a + b, 0));
  const riskLevel = totalScore >= 80 ? 'critical' : totalScore >= 50 ? 'high' : totalScore >= 25 ? 'medium' : 'low';

  // 自动响应
  let autoAction = 'none';
  if (totalScore >= 80) {
    autoAction = 'suspend';
  } else if (totalScore >= 50) {
    autoAction = 'restrict';
  } else if (totalScore >= 25) {
    autoAction = 'alert';
  }

  await upsertRiskScore(employeeId, totalScore, riskLevel, factors, autoAction);

  return totalScore;
}

async function upsertRiskScore(
  employeeId: string,
  score: number,
  level: string,
  factors: Record<string, number>,
  autoAction: string = 'none'
) {
  const { data: existing } = await supabase
    .from('risk_scores')
    .select('id')
    .eq('employee_id', employeeId)
    .single();

  if (existing) {
    await supabase
      .from('risk_scores')
      .update({
        current_score: score,
        risk_level: level,
        factors: factors as any,
        auto_action_taken: autoAction,
        last_calculated_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      })
      .eq('employee_id', employeeId);
  } else {
    await supabase.from('risk_scores').insert([{
      employee_id: employeeId,
      current_score: score,
      risk_level: level,
      factors: factors as any,
      auto_action_taken: autoAction,
    }]);
  }
}

/**
 * 获取所有员工的风险评分
 */
export async function getAllRiskScores(): Promise<RiskScore[]> {
  const { data } = await supabase
    .from('risk_scores')
    .select('*')
    .order('current_score', { ascending: false });

  return (data || []) as unknown as RiskScore[];
}

/**
 * 获取最近的风险事件
 */
export async function getRecentRiskEvents(limit: number = 50): Promise<RiskEvent[]> {
  const { data } = await supabase
    .from('risk_events')
    .select('*')
    .order('created_at', { ascending: false })
    .limit(limit);

  return (data || []) as unknown as RiskEvent[];
}

/**
 * 解决风险事件
 */
export async function resolveRiskEvent(eventId: string, resolvedById: string): Promise<void> {
  const { data: event } = await supabase
    .from('risk_events')
    .update({
      resolved: true,
      resolved_by: resolvedById,
      resolved_at: new Date().toISOString(),
    })
    .eq('id', eventId)
    .select('employee_id')
    .single();

  if (event?.employee_id) {
    await recalculateRiskScore(event.employee_id);
  }
}

/**
 * 检测登录异常（连续失败）
 */
export async function checkLoginAnomaly(employeeId: string): Promise<void> {
  const since = new Date(Date.now() - 60 * 60 * 1000).toISOString(); // 1 hour
  const { count } = await supabase
    .from('employee_login_logs')
    .select('id', { count: 'exact', head: true })
    .eq('employee_id', employeeId)
    .eq('success', false)
    .gte('login_time', since);

  if ((count || 0) >= 5) {
    await recordRiskEvent(employeeId, 'login_anomaly', 'high', {
      failed_attempts: count,
      window: '1h',
    });
  } else if ((count || 0) >= 3) {
    await recordRiskEvent(employeeId, 'login_anomaly', 'medium', {
      failed_attempts: count,
      window: '1h',
    });
  }
}

/**
 * 检测操作频率异常
 */
export async function checkFrequencyAnomaly(employeeId: string, operatorAccount: string): Promise<void> {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString(); // 5 min
  const { count } = await supabase
    .from('operation_logs')
    .select('id', { count: 'exact', head: true })
    .eq('operator_id', employeeId)
    .gte('timestamp', since);

  if ((count || 0) >= 100) {
    await recordRiskEvent(employeeId, 'frequency_anomaly', 'critical', {
      operations_count: count,
      window: '5m',
      operator: operatorAccount,
    });
  } else if ((count || 0) >= 50) {
    await recordRiskEvent(employeeId, 'frequency_anomaly', 'high', {
      operations_count: count,
      window: '5m',
    });
  }
}
