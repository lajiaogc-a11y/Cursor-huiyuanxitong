import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useLanguage } from '@/contexts/LanguageContext';
import { AlertTriangle, Database, Activity, RefreshCw, HardDrive } from 'lucide-react';
import { getResourceUsage, checkThresholdAlerts, COST_THRESHOLDS, type ResourceUsageSummary } from '@/services/resourceMonitorService';

// 数据库表名 → 显示名（中文 / 英文）
const TABLE_LABELS: Record<string, { zh: string; en: string }> = {
  operation_logs: { zh: '操作日志', en: 'Operation Logs' },
  ledger_transactions: { zh: '账本明细', en: 'Ledger Transactions' },
  members: { zh: '会员', en: 'Members' },
  orders: { zh: '订单', en: 'Orders' },
  points_ledger: { zh: '积分明细', en: 'Points Ledger' },
  activity_gifts: { zh: '活动赠送', en: 'Activity Gifts' },
  employee_login_logs: { zh: '员工登录日志', en: 'Login Logs' },
  balance_change_logs: { zh: '余额变动日志', en: 'Balance Logs' },
  notifications: { zh: '通知', en: 'Notifications' },
  audit_records: { zh: '审计记录', en: 'Audit Records' },
  error_reports: { zh: '错误报告', en: 'Error Reports' },
  api_request_logs: { zh: 'API请求日志', en: 'API Logs' },
  archived_orders: { zh: '归档订单', en: 'Archived Orders' },
  archived_operation_logs: { zh: '归档操作日志', en: 'Archived Logs' },
  archived_points_ledger: { zh: '归档积分明细', en: 'Archived Points' },
};

export function ResourceMonitorTab() {
  const { t, language } = useLanguage();
  const [usage, setUsage] = useState<ResourceUsageSummary | null>(null);
  const [alerts, setAlerts] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const data = await getResourceUsage();
      setUsage(data);
      setAlerts(checkThresholdAlerts(data));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const rowUsagePercent = usage ? Math.min(100, (usage.totalRows / COST_THRESHOLDS.MAX_TOTAL_ROWS) * 100) : 0;

  return (
    <div className="space-y-6">
      {/* Alerts */}
      {alerts.length > 0 && (
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-4 w-4" />
              {t('成本预警', 'Cost Alerts')}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-1">
              {alerts.map((alert, i) => (
                <li key={i} className="text-sm text-destructive">{alert}</li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('总行数', 'Total Rows')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{(usage?.totalRows ?? 0).toLocaleString()}</p>
            <Progress value={rowUsagePercent} className="mt-2 h-1.5" />
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <HardDrive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('估算大小', 'Est. Size')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{usage?.totalEstimatedSizeMB ?? 0} MB</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('24h API调用', '24h API Calls')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{(usage?.edgeFunctionStats.total_calls ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Activity className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('API错误率', 'API Error Rate')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{usage?.edgeFunctionStats.error_rate ?? 0}%</p>
          </CardContent>
        </Card>
      </div>

      {/* Table Details */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>{t('各表用量明细', 'Table Usage Details')}</CardTitle>
              <CardDescription>{t('监控的数据库表行数和估算存储大小', 'Row counts and estimated storage for monitored tables')}</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={loadData} disabled={loading}>
              <RefreshCw className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`} />
              {t('刷新', 'Refresh')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {(usage?.tables ?? []).map(table => {
              const isWarning = table.row_count > COST_THRESHOLDS.MAX_TABLE_ROWS;
              const percent = Math.min(100, (table.row_count / COST_THRESHOLDS.MAX_TABLE_ROWS) * 100);
              return (
                <div key={table.table_name} className="flex items-center gap-4 p-2 rounded-lg hover:bg-muted/50">
                  <span className="text-sm w-48 truncate">
                  {(TABLE_LABELS[table.table_name]
                    ? TABLE_LABELS[table.table_name][language === 'zh' ? 'zh' : 'en']
                    : table.table_name)}
                </span>
                  <div className="flex-1">
                    <Progress value={percent} className="h-1.5" />
                  </div>
                  <span className="text-sm w-24 text-right">{table.row_count.toLocaleString()}</span>
                  {isWarning && <Badge variant="destructive" className="text-xs">{t('超限', 'Over')}</Badge>}
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>

      {/* API Endpoint Breakdown */}
      {usage && Object.keys(usage.edgeFunctionStats.calls_by_endpoint).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('API端点调用分布', 'API Endpoint Distribution')}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {Object.entries(usage.edgeFunctionStats.calls_by_endpoint)
                .sort(([, a], [, b]) => b - a)
                .map(([endpoint, count]) => (
                  <div key={endpoint} className="flex items-center justify-between p-2 rounded-lg hover:bg-muted/50">
                    <span className="text-sm font-mono truncate flex-1">{endpoint}</span>
                    <span className="text-sm font-medium">{count.toLocaleString()}</span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
