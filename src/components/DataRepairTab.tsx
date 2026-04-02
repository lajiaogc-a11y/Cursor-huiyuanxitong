/**
 * Data Repair Tab - Admin tool for repairing balance change logs
 */

import { useState, useCallback, forwardRef } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
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
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Search, Wrench, Trash2, AlertTriangle, CheckCircle, RefreshCw } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { notify } from "@/lib/notifyHub";
import {
  scanMissingVendorLogs,
  scanMissingProviderLogs,
  scanOrphanedLogs,
  backfillVendorLogs,
  backfillProviderLogs,
  deleteOrphanedLogs,
  type MissingLogSummary,
  type OrphanedLogSummary,
} from '@/services/finance/balanceLogRepairService';
import {
  repairMisattributedProviderOrderExpenseLogs,
  repairMisattributedVendorOrderIncomeLogs,
} from '@/services/finance/balanceLogReconcileService';

const DataRepairTab = forwardRef<HTMLDivElement>(function DataRepairTab(_, ref) {
  const { language } = useLanguage();
  const t = (zh: string, en: string) => (language === 'zh' ? zh : en);

  const [isScanning, setIsScanning] = useState(false);
  const [isRepairing, setIsRepairing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [cleanOrphanedOpen, setCleanOrphanedOpen] = useState(false);
  const [vendorMissing, setVendorMissing] = useState<MissingLogSummary[]>([]);
  const [providerMissing, setProviderMissing] = useState<MissingLogSummary[]>([]);
  const [orphanedLogs, setOrphanedLogs] = useState<OrphanedLogSummary[]>([]);
  const [lastScanTime, setLastScanTime] = useState<Date | null>(null);
  const [repairResults, setRepairResults] = useState<{
    vendor: number;
    provider: number;
    movedVendor: number;
    movedProvider: number;
    deletedInvalid: number;
  } | null>(null);

  const handleScan = useCallback(async () => {
    setIsScanning(true);
    setRepairResults(null);
    try {
      const [vendor, provider, orphaned] = await Promise.all([
        scanMissingVendorLogs(),
        scanMissingProviderLogs(),
        scanOrphanedLogs(),
      ]);
      setVendorMissing(vendor);
      setProviderMissing(provider);
      setOrphanedLogs(orphaned);
      setLastScanTime(new Date());
      notify.success(t('扫描完成', 'Scan completed'));
    } catch (error) {
      console.error('[DataRepair] Scan failed:', error);
      notify.error(t('扫描失败', 'Scan failed'));
    } finally {
      setIsScanning(false);
    }
  }, [language]);

  const handleRepair = useCallback(async () => {
    setIsRepairing(true);
    try {
      // 1) 先修复“归属错误”的订单日志（商家变更导致落错商家）
      const vendorExtraNames = vendorMissing.filter(x => x.missingCount < 0).map(x => x.merchantName);
      const providerExtraNames = providerMissing.filter(x => x.missingCount < 0).map(x => x.merchantName);

      const [vendorFix, providerFix] = await Promise.all([
        repairMisattributedVendorOrderIncomeLogs({ merchantNames: vendorExtraNames }),
        repairMisattributedProviderOrderExpenseLogs({ merchantNames: providerExtraNames }),
      ]);

      // 2) 再补录真正缺失的订单日志
      const [vendorResult, providerResult] = await Promise.all([
        backfillVendorLogs(),
        backfillProviderLogs(),
      ]);

      const deletedInvalid = vendorFix.deletedInvalid + providerFix.deletedInvalid;

      setRepairResults({
        vendor: vendorResult.repaired,
        provider: providerResult.repaired,
        movedVendor: vendorFix.moved,
        movedProvider: providerFix.moved,
        deletedInvalid,
      });

      const totalErrors =
        vendorResult.errors.length +
        providerResult.errors.length +
        vendorFix.errors.length +
        providerFix.errors.length;

      if (totalErrors > 0) {
        notify.warning(
          t(
            `修复完成，但有 ${totalErrors} 个错误（可重新扫描确认差异）`,
            `Repair completed with ${totalErrors} errors (re-scan to verify)`
          )
        );
      } else {
        notify.success(
          t(
            `修复成功：补录 ${vendorResult.repaired + providerResult.repaired} 条，归属修复 ${vendorFix.moved + providerFix.moved} 条`,
            `Success: backfilled ${vendorResult.repaired + providerResult.repaired}, reassigned ${vendorFix.moved + providerFix.moved}`
          )
        );
      }

      // 3) Re-scan to update stats
      const [vendor, provider, orphaned] = await Promise.all([
        scanMissingVendorLogs(),
        scanMissingProviderLogs(),
        scanOrphanedLogs(),
      ]);
      setVendorMissing(vendor);
      setProviderMissing(provider);
      setOrphanedLogs(orphaned);
      setLastScanTime(new Date());
    } catch (error) {
      console.error('[DataRepair] Repair failed:', error);
      notify.error(t('修复失败', 'Repair failed'));
    } finally {
      setIsRepairing(false);
    }
  }, [language, vendorMissing, providerMissing]);

  const executeCleanOrphaned = useCallback(async () => {
    setIsCleaning(true);
    try {
      const result = await deleteOrphanedLogs();
      if (result.success) {
        notify.success(
          t(`成功清理 ${result.repaired} 条孤立记录`, `Successfully cleaned ${result.repaired} orphaned records`)
        );
        // Re-scan to update stats
        const [vendor, provider, orphaned] = await Promise.all([
          scanMissingVendorLogs(),
          scanMissingProviderLogs(),
          scanOrphanedLogs(),
        ]);
        setVendorMissing(vendor);
        setProviderMissing(provider);
        setOrphanedLogs(orphaned);
        setLastScanTime(new Date());
      } else {
        notify.error(t('清理失败', 'Clean failed'));
      }
    } catch (error) {
      console.error('[DataRepair] Clean failed:', error);
      notify.error(t('清理失败', 'Clean failed'));
    } finally {
      setIsCleaning(false);
    }
  }, [language]);

  const totalMissingVendor = vendorMissing.reduce((sum, v) => sum + Math.max(0, v.missingCount), 0);
  const totalMissingProvider = providerMissing.reduce((sum, p) => sum + Math.max(0, p.missingCount), 0);
  const totalExtraVendor = vendorMissing.reduce((sum, v) => sum + Math.abs(Math.min(0, v.missingCount)), 0);
  const totalExtraProvider = providerMissing.reduce((sum, p) => sum + Math.abs(Math.min(0, p.missingCount)), 0);
  const totalOrphaned = orphanedLogs.reduce((sum, o) => sum + o.orphanedCount, 0);

  const canRepair = totalMissingVendor > 0 || totalMissingProvider > 0 || totalExtraVendor > 0 || totalExtraProvider > 0;

  return (
    <div ref={ref} className="space-y-6">
      {/* Header Actions */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Wrench className="h-5 w-5" />
            {t('余额变动日志修复', 'Balance Log Repair')}
          </CardTitle>
          <CardDescription>
            {t(
              '扫描并修复缺失的余额变动日志记录，确保审计追踪完整。注意：差异可能由订单编辑（如卡商/代付商变更）导致，历史日志保留原始商家记录。',
              'Scan and repair missing balance change logs for complete audit trail. Note: Differences may result from order edits (e.g., merchant changes); historical logs preserve original merchant records.'
            )}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap gap-3">
            <Button onClick={handleScan} disabled={isScanning}>
              {isScanning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Search className="mr-2 h-4 w-4" />
              )}
              {t('扫描差异', 'Scan Differences')}
            </Button>

            <Button
              onClick={handleRepair}
              disabled={isRepairing || !canRepair}
              variant="default"
            >
              {isRepairing ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <RefreshCw className="mr-2 h-4 w-4" />
              )}
              {t('一键修复', 'One-click Repair')}
            </Button>

            <Button
              onClick={() => setCleanOrphanedOpen(true)}
              disabled={isCleaning || totalOrphaned === 0}
              variant="outline"
            >
              {isCleaning ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <Trash2 className="mr-2 h-4 w-4" />
              )}
              {t('清理孤立日志', 'Clean Orphaned')}
            </Button>
          </div>

          {lastScanTime && (
            <p className="text-xs text-muted-foreground">
              {t('上次扫描时间', 'Last scan')}: {lastScanTime.toLocaleString()}
            </p>
          )}

          {repairResults && (
            <Alert>
              <CheckCircle className="h-4 w-4" />
              <AlertDescription>
                {t(
                  `本次修复: 补录(卡商 ${repairResults.vendor} / 代付 ${repairResults.provider})，归属修复(卡商 ${repairResults.movedVendor} / 代付 ${repairResults.movedProvider})` +
                    (repairResults.deletedInvalid > 0 ? `，并删除无效日志 ${repairResults.deletedInvalid} 条` : ''),
                  `Repaired: backfill(vendor ${repairResults.vendor} / provider ${repairResults.provider}), reassigned(vendor ${repairResults.movedVendor} / provider ${repairResults.movedProvider})` +
                    (repairResults.deletedInvalid > 0 ? `, deleted invalid ${repairResults.deletedInvalid}` : '')
                )}
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Summary Stats */}
      {lastScanTime && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{totalMissingVendor}</div>
              <p className="text-xs text-muted-foreground">{t('卡商缺失日志', 'Missing Vendor Logs')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{totalMissingProvider}</div>
              <p className="text-xs text-muted-foreground">{t('代付商家缺失日志', 'Missing Provider Logs')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-primary">{totalExtraVendor + totalExtraProvider}</div>
              <p className="text-xs text-muted-foreground">{t('多余日志', 'Extra Logs')}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="text-2xl font-bold text-destructive">{totalOrphaned}</div>
              <p className="text-xs text-muted-foreground">{t('孤立日志', 'Orphaned Logs')}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Vendor Missing Logs */}
      {vendorMissing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('卡商日志差异', 'Vendor Log Differences')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('商家名称', 'Merchant')}</TableHead>
                  <TableHead className="text-center">{t('订单数', 'Orders')}</TableHead>
                  <TableHead className="text-center">{t('日志数', 'Logs')}</TableHead>
                  <TableHead className="text-center">{t('差异', 'Diff')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {vendorMissing.map((item) => (
                  <TableRow key={item.merchantName}>
                    <TableCell className="font-medium">{item.merchantName}</TableCell>
                    <TableCell className="text-center">{item.orderCount}</TableCell>
                    <TableCell className="text-center">{item.logCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.missingCount > 0 ? 'destructive' : 'secondary'}>
                        {item.missingCount > 0 ? `-${item.missingCount}` : `+${Math.abs(item.missingCount)}`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Provider Missing Logs */}
      {providerMissing.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t('代付商家日志差异', 'Provider Log Differences')}</CardTitle>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('商家名称', 'Merchant')}</TableHead>
                  <TableHead className="text-center">{t('订单数', 'Orders')}</TableHead>
                  <TableHead className="text-center">{t('日志数', 'Logs')}</TableHead>
                  <TableHead className="text-center">{t('差异', 'Diff')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {providerMissing.map((item) => (
                  <TableRow key={item.merchantName}>
                    <TableCell className="font-medium">{item.merchantName}</TableCell>
                    <TableCell className="text-center">{item.orderCount}</TableCell>
                    <TableCell className="text-center">{item.logCount}</TableCell>
                    <TableCell className="text-center">
                      <Badge variant={item.missingCount > 0 ? 'destructive' : 'secondary'}>
                        {item.missingCount > 0 ? `-${item.missingCount}` : `+${Math.abs(item.missingCount)}`}
                      </Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Orphaned Logs */}
      {orphanedLogs.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-destructive" />
              {t('孤立日志记录', 'Orphaned Log Records')}
            </CardTitle>
            <CardDescription>
              {t(
                '这些日志的关联订单已被删除或不存在，可选择清理',
                'These logs reference deleted or non-existent orders, can be cleaned'
              )}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('商家名称', 'Merchant')}</TableHead>
                  <TableHead>{t('类型', 'Type')}</TableHead>
                  <TableHead className="text-center">{t('孤立数量', 'Orphaned')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {orphanedLogs.map((item) => (
                  <TableRow key={`${item.merchantName}-${item.merchantType}`}>
                    <TableCell className="font-medium">{item.merchantName}</TableCell>
                    <TableCell>
                      <Badge variant="outline">
                        {item.merchantType === 'card_vendor' ? t('卡商', 'Vendor') : t('代付商家', 'Provider')}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-center">
                      <Badge variant="secondary">{item.orphanedCount}</Badge>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* No Issues Found */}
      {lastScanTime &&
        vendorMissing.length === 0 &&
        providerMissing.length === 0 &&
        orphanedLogs.length === 0 && (
          <Alert>
            <CheckCircle className="h-4 w-4 text-primary" />
            <AlertDescription>
              {t('所有余额变动日志数据完整，无需修复', 'All balance change logs are complete, no repair needed')}
            </AlertDescription>
          </Alert>
        )}

      <AlertDialog open={cleanOrphanedOpen} onOpenChange={setCleanOrphanedOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认清理孤立日志', 'Clean orphaned logs?')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                '将永久删除已扫描到的孤立余额变动日志记录，此操作不可撤销。确定继续？',
                'This permanently deletes orphaned balance log records found by the scan. Continue?',
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCleanOrphanedOpen(false);
                void executeCleanOrphaned();
              }}
            >
              {t('清理', 'Clean')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
});

DataRepairTab.displayName = 'DataRepairTab';

export default DataRepairTab;

