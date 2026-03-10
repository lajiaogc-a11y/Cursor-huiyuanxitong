import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';
import { ShieldAlert, ShieldCheck, CheckCircle, AlertTriangle } from 'lucide-react';
import { getAllRiskScores, getRecentRiskEvents, resolveRiskEvent, type RiskScore, type RiskEvent } from '@/services/riskScoringService';

const LEVEL_CONFIG = {
  low: { color: 'default' as const, icon: ShieldCheck, label_zh: '低风险', label_en: 'Low' },
  medium: { color: 'secondary' as const, icon: AlertTriangle, label_zh: '中风险', label_en: 'Medium' },
  high: { color: 'destructive' as const, icon: ShieldAlert, label_zh: '高风险', label_en: 'High' },
  critical: { color: 'destructive' as const, icon: ShieldAlert, label_zh: '极高风险', label_en: 'Critical' },
};

export function RiskDashboardTab() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const [scores, setScores] = useState<RiskScore[]>([]);
  const [events, setEvents] = useState<RiskEvent[]>([]);

  const loadData = useCallback(async () => {
    const [s, e] = await Promise.all([getAllRiskScores(), getRecentRiskEvents()]);
    setScores(s);
    setEvents(e);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleResolve = async (eventId: string) => {
    if (!employee?.id) return;
    await resolveRiskEvent(eventId, employee.id);
    toast.success(t('已标记为已解决', 'Marked as resolved'));
    loadData();
  };

  const highRiskCount = scores.filter(s => s.risk_level === 'high' || s.risk_level === 'critical').length;
  const unresolvedCount = events.filter(e => !e.resolved).length;

  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ShieldAlert className="h-4 w-4 text-destructive" />
              <span className="text-sm text-muted-foreground">{t('高风险账户', 'High Risk Accounts')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{highRiskCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-warning" />
              <span className="text-sm text-muted-foreground">{t('未处理事件', 'Unresolved Events')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{unresolvedCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-primary" />
              <span className="text-sm text-muted-foreground">{t('已评估账户', 'Scored Accounts')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{scores.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Risk Scores */}
      <Card>
        <CardHeader>
          <CardTitle>{t('员工风险评分', 'Employee Risk Scores')}</CardTitle>
          <CardDescription>{t('基于登录异常、订单异常、频率异常、IP异常等多维度综合评分', 'Multi-factor scoring based on login, order, frequency, and IP anomalies')}</CardDescription>
        </CardHeader>
        <CardContent>
          {scores.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('暂无风险数据', 'No risk data yet')}</p>
          ) : (
            <div className="space-y-2">
              {scores.map(score => {
                const config = LEVEL_CONFIG[score.risk_level as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.low;
                const Icon = config.icon;
                return (
                  <div key={score.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div className="flex items-center gap-3">
                      <Icon className="h-4 w-4" />
                      <div>
                        <p className="text-sm font-medium">{score.employee_id.slice(0, 8)}...</p>
                        <p className="text-xs text-muted-foreground">
                          {t('上次计算', 'Last calculated')}: {new Date(score.last_calculated_at).toLocaleString()}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-lg font-bold">{score.current_score}</span>
                      <Badge variant={config.color}>{t(config.label_zh, config.label_en)}</Badge>
                      {score.auto_action_taken && score.auto_action_taken !== 'none' && (
                        <Badge variant="outline">{score.auto_action_taken}</Badge>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Recent Events */}
      <Card>
        <CardHeader>
          <CardTitle>{t('最近风险事件', 'Recent Risk Events')}</CardTitle>
        </CardHeader>
        <CardContent>
          {events.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('暂无风险事件', 'No risk events')}</p>
          ) : (
            <div className="space-y-2">
              {events.slice(0, 20).map(event => {
                const config = LEVEL_CONFIG[event.severity as keyof typeof LEVEL_CONFIG] || LEVEL_CONFIG.low;
                return (
                  <div key={event.id} className="flex items-center justify-between p-3 rounded-lg border">
                    <div>
                      <div className="flex items-center gap-2">
                        <Badge variant={config.color}>{event.event_type}</Badge>
                        <Badge variant="outline">{t(config.label_zh, config.label_en)}</Badge>
                        {event.resolved && <Badge variant="secondary"><CheckCircle className="h-3 w-3 mr-1" />{t('已解决', 'Resolved')}</Badge>}
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {new Date(event.created_at).toLocaleString()} · {t('分值', 'Score')}: {event.score}
                      </p>
                    </div>
                    {!event.resolved && (
                      <Button size="sm" variant="outline" onClick={() => handleResolve(event.id)}>
                        {t('标记解决', 'Resolve')}
                      </Button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
