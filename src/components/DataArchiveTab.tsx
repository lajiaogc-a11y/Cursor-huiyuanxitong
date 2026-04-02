import { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from "@/lib/notifyHub";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Archive, Play, Clock, Database } from 'lucide-react';
import { runArchive, getArchiveHistory, getArchiveStats, type ArchiveRun, type ArchiveStats } from '@/services/dataArchiveService';
import { formatBeijingTime } from '@/lib/beijingTime';

export function DataArchiveTab() {
  const { t } = useLanguage();
  const [retentionDays, setRetentionDays] = useState(90);
  const [running, setRunning] = useState(false);
  const [archiveConfirmOpen, setArchiveConfirmOpen] = useState(false);
  const [history, setHistory] = useState<ArchiveRun[]>([]);
  const [stats, setStats] = useState<ArchiveStats | null>(null);

  const loadData = useCallback(async () => {
    const [h, s] = await Promise.all([getArchiveHistory(), getArchiveStats()]);
    setHistory(h);
    setStats(s);
  }, []);

  useEffect(() => { loadData(); }, [loadData]);

  const handleRun = async () => {
    setRunning(true);
    const result = await runArchive(retentionDays);
    setRunning(false);
    if (result.success) {
      notify.success(t('归档完成', 'Archive completed'), {
        description: JSON.stringify(result.result),
      });
      loadData();
    } else {
      notify.error(t('归档失败', 'Archive failed'), { description: result.error });
    }
  };

  const totalArchived = stats
    ? stats.archived_orders + stats.archived_operation_logs + stats.archived_points_ledger
    : 0;

  return (
    <div className="space-y-6">
      {/* Stats */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Archive className="h-4 w-4 text-muted-foreground" />
              <span className="text-sm text-muted-foreground">{t('总归档记录', 'Total Archived')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{totalArchived.toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-blue-500" />
              <span className="text-sm text-muted-foreground">{t('订单归档', 'Orders')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{(stats?.archived_orders ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-amber-500" />
              <span className="text-sm text-muted-foreground">{t('日志归档', 'Logs')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{(stats?.archived_operation_logs ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center gap-2">
              <Database className="h-4 w-4 text-green-500" />
              <span className="text-sm text-muted-foreground">{t('积分流水归档', 'Points')}</span>
            </div>
            <p className="text-2xl font-bold mt-1">{(stats?.archived_points_ledger ?? 0).toLocaleString()}</p>
          </CardContent>
        </Card>
      </div>

      {/* Run Controls */}
      <Card>
        <CardHeader>
          <CardTitle>{t('执行归档', 'Run Archive')}</CardTitle>
          <CardDescription>{t('将超过保留期的已完成订单、操作日志、积分流水移入归档表', 'Move completed orders, operation logs, and points ledger older than retention period to archive tables')}</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-end gap-4">
            <div>
              <Label>{t('保留天数', 'Retention Days')}</Label>
              <Input
                type="number"
                value={retentionDays}
                onChange={e => setRetentionDays(Number(e.target.value))}
                min={30}
                max={365}
                className="w-32"
              />
            </div>
            <Button onClick={() => setArchiveConfirmOpen(true)} disabled={running}>
              <Play className="h-4 w-4 mr-1" />
              {running ? t('执行中...', 'Running...') : t('立即归档', 'Archive Now')}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            {t('归档历史', 'Archive History')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          {history.length === 0 ? (
            <p className="text-sm text-muted-foreground">{t('暂无归档记录', 'No archive runs yet')}</p>
          ) : (
            <div className="space-y-2">
              {history.map(run => (
                <div key={run.id} className="flex items-center justify-between p-3 rounded-lg border">
                  <div>
                    <p className="text-sm font-medium">
                      {formatBeijingTime(run.run_at)}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {run.tables_processed.join(', ')}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {run.duration_ms && (
                      <span className="text-xs text-muted-foreground">{run.duration_ms}ms</span>
                    )}
                    <Badge variant={run.status === 'completed' ? 'default' : 'destructive'}>
                      {run.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={archiveConfirmOpen} onOpenChange={setArchiveConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认执行归档', 'Run archive now?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将把超过 ${retentionDays} 天的已完成订单、操作日志、积分流水移入归档表，请确认保留天数无误后再继续。`,
                `Data older than ${retentionDays} days (completed orders, logs, points ledger) will be moved to archive tables. Confirm retention days and continue.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setArchiveConfirmOpen(false);
                void executeArchive();
              }}
            >
              {t('立即归档', 'Archive Now')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
