/**
 * Ledger Transaction Content - shows ledger_transactions for an account
 * Replaces BalanceChangeLogContent with event-sourced ledger data
 */

import { useState, useEffect, useMemo, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Download, Loader2, Search, ChevronLeft, ChevronRight, RefreshCw, CheckCircle, AlertTriangle } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from '@/components/ui/mobile-data-card';
import { notify } from "@/lib/notifyHub";
import { ExportConfirmDialog } from '@/components/ExportConfirmDialog';
import { useExportConfirm } from '@/hooks/useExportConfirm';
import { exportToCSV, formatNumberForExport, formatDateTimeForExport } from '@/lib/exportUtils';
import { PageSizeSelect } from '@/components/ui/page-size-select';
import { useLanguage } from '@/contexts/LanguageContext';
import { formatLedgerNote } from '@/lib/fieldLabelMap';
import { formatBeijingTime } from '@/lib/beijingTime';
import {
  getLedgerTransactions,
  reconcileAccount,
  createCorrectionEntry,
  recalculateLedgerRunningBalances,
  LedgerTransaction,
  AccountType,
  SourceType,
  getSourceTypeLabel,
  sourceTypeLabels,
  formatSourceId,
} from '@/services/finance/ledgerTransactionService';

interface LedgerTransactionContentProps {
  accountType: AccountType;
  accountName: string;
  realTimeBalance?: number;
  active?: boolean;
}

export default function LedgerTransactionContent({
  accountType,
  accountName,
  realTimeBalance,
  active = true,
}: LedgerTransactionContentProps) {
  const { t, language } = useLanguage();
  const isMobile = useIsMobile();
  const lang = language as 'zh' | 'en';
  const [transactions, setTransactions] = useState<LedgerTransaction[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('all');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(20);
  const [isReconciling, setIsReconciling] = useState(false);
  const [reconcileResult, setReconcileResult] = useState<{
    computedBalance: number;
    storedBalance: number;
    discrepancy: number;
    transactionCount: number;
  } | null>(null);
  const exportConfirm = useExportConfirm();

  const availableSourceTypes: SourceType[] = useMemo(() => {
    if (accountType === 'card_vendor') {
      return ['order', 'order_adjustment', 'withdrawal', 'withdrawal_adjustment', 'initial_balance', 'initial_balance_adjustment', 'reversal', 'op_log_restore', 'reconciliation'];
    }
    return ['order', 'order_adjustment', 'gift', 'gift_adjustment', 'recharge', 'recharge_adjustment', 'initial_balance', 'initial_balance_adjustment', 'reversal', 'op_log_restore', 'reconciliation'];
  }, [accountType]);

  // Track previous active state to detect tab re-activation
  const [prevActive, setPrevActive] = useState(false);

  const loadTransactions = useCallback(async () => {
    if (!accountName) return;
    setIsLoading(true);
    try {
      const data = await getLedgerTransactions(accountType, accountName);
      setTransactions(data);
    } catch (error) {
      console.error('Failed to load ledger transactions:', error);
    } finally {
      setIsLoading(false);
    }
  }, [accountType, accountName]);

  // Force reload every time the tab becomes active (not just on first mount)
  useEffect(() => {
    if (active && accountName) {
      loadTransactions();
    }
    setPrevActive(active);
  }, [active, accountName, loadTransactions]);

  // Listen for ledger-updated events
  useEffect(() => {
    if (!active) return;
    const handler = () => loadTransactions();
    const onDataRefresh = (event: Event) => {
      const detail = (event as CustomEvent<{ table?: string }>).detail;
      if (detail?.table === 'ledger_transactions') {
        handler();
      }
    };
    window.addEventListener('ledger-updated', handler);
    window.addEventListener('data-refresh', onDataRefresh as EventListener);
    return () => {
      window.removeEventListener('ledger-updated', handler);
      window.removeEventListener('data-refresh', onDataRefresh as EventListener);
    };
  }, [active, loadTransactions]);

  // 轮询替代 Realtime 订阅：每 30 秒刷新
  useEffect(() => {
    if (!active || !accountName) return;
    
    const timer = setInterval(() => {
      loadTransactions();
    }, 30000);
    return () => { clearInterval(timer); };
  }, [active, accountType, accountName, loadTransactions]);

  // Recompute running balances from active entries (oldest → newest) so that
  // editing a non-latest entry doesn't leave stale before/after values.
  const balanceMap = useMemo(() => {
    const map = new Map<string, { before: number; after: number }>();
    const activeAsc = transactions
      .filter(tx => tx.is_active)
      .slice()
      .sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    let running = 0;
    for (const tx of activeAsc) {
      map.set(tx.id, { before: running, after: running + tx.amount });
      running += tx.amount;
    }
    return map;
  }, [transactions]);

  const getBalance = (tx: LedgerTransaction) => {
    const computed = balanceMap.get(tx.id);
    if (computed) return computed;
    return { before: tx.before_balance, after: tx.after_balance };
  };

  // Computed current balance (sum of all active amounts)
  const computedCurrentBalance = useMemo(() => {
    return transactions.filter(tx => tx.is_active).reduce((sum, tx) => sum + tx.amount, 0);
  }, [transactions]);

  const filteredTransactions = useMemo(() => {
    let result = transactions;
    if (filterType !== 'all') {
      result = result.filter(tx => tx.source_type === filterType);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      result = result.filter(tx =>
        String(tx.source_id ?? '').toLowerCase().includes(term) ||
        String(tx.note ?? '').toLowerCase().includes(term) ||
        String(tx.operator_name ?? '').toLowerCase().includes(term)
      );
    }
    return result;
  }, [transactions, filterType, searchTerm]);

  const totalPages = Math.ceil(filteredTransactions.length / pageSize);
  const paginatedTransactions = useMemo(() => {
    const start = (page - 1) * pageSize;
    return filteredTransactions.slice(start, start + pageSize);
  }, [filteredTransactions, page, pageSize]);

  useEffect(() => { setPage(1); }, [searchTerm, filterType]);

  const handleReconcile = async () => {
    setIsReconciling(true);
    try {
      await recalculateLedgerRunningBalances({ accountType, accountId: accountName });
      await loadTransactions();
      const result = await reconcileAccount(accountType, accountName);
      setReconcileResult(result);
      if (result && result.discrepancy < 0.01) {
        notify.success(t('对账结果: 余额一致 ✓', 'Reconciliation: Balance matches ✓'));
      } else if (result) {
        notify.error(t(`对账结果: 发现差异 — 差异金额: ¥${result.discrepancy.toFixed(2)}`, `Reconciliation: Discrepancy found — ¥${result.discrepancy.toFixed(2)}`));
      }
    } catch (error) {
      console.error('Reconciliation failed:', error);
      notify.error(t('对账失败', 'Reconciliation failed'));
    } finally {
      setIsReconciling(false);
    }
  };

  const handleFixDiscrepancy = async () => {
    if (!reconcileResult || reconcileResult.discrepancy < 0.01) return;
    const correction = reconcileResult.computedBalance - reconcileResult.storedBalance;
    await createCorrectionEntry({
      accountType,
      accountId: accountName,
      correctionAmount: correction,
    });
    notify.success(t('修正已创建', 'Correction entry created'));
    setReconcileResult(null);
    loadTransactions();
  };

  const handleExport = () => {
    if (filteredTransactions.length === 0) {
      notify.error(t('没有数据可导出', 'No data to export'));
      return;
    }
    const exportData = filteredTransactions.map(tx => {
      const bal = getBalance(tx);
      return { ...tx, _before: bal.before, _after: bal.after };
    });
    const columns = [
      { key: 'created_at', label: '时间', labelEn: 'Time', formatter: (v: string) => formatDateTimeForExport(v) },
      { key: 'source_type', label: '类型', labelEn: 'Type', formatter: (v: SourceType) => getSourceTypeLabel(v, lang) },
      { key: '_before', label: '变动前', labelEn: 'Before', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'amount', label: '变动金额', labelEn: 'Amount', formatter: (v: number) => (v >= 0 ? '+' : '') + formatNumberForExport(v) },
      { key: '_after', label: '变动后', labelEn: 'After', formatter: (v: number) => formatNumberForExport(v) },
      { key: 'is_active', label: '状态', labelEn: 'Status', formatter: (v: boolean) => v ? (lang === 'en' ? 'Active' : '有效') : (lang === 'en' ? 'Reversed' : '已撤销') },
      { key: 'source_id', label: '来源', labelEn: 'Source', formatter: (v: string | null) => formatSourceId(v, lang) },
      { key: 'operator_name', label: '操作人', labelEn: 'Operator', formatter: (v: string | null) => v || '-' },
      { key: 'note', label: '备注', labelEn: 'Note', formatter: (v: string | null) => formatLedgerNote(v, lang) },
    ];
    exportToCSV(exportData, columns, `ledger-${accountName}`, lang === 'en');
    notify.success(t('导出成功', 'Export successful'));
  };

  const formatAmount = (amount: number) => {
    const formatted = Math.abs(amount).toFixed(2);
    if (amount >= 0) return <span className="text-primary">+¥{formatted}</span>;
    return <span className="text-destructive">-¥{formatted}</span>;
  };

  const getSourceTypeBadge = (sourceType: SourceType, isActive: boolean) => {
    if (!isActive) {
      return <Badge variant="outline" className="text-xs opacity-50 line-through">{getSourceTypeLabel(sourceType, lang)}</Badge>;
    }
    const isIncome = ['initial_balance', 'recharge', 'op_log_restore'].includes(sourceType);
    const isNeutral = ['order_adjustment', 'withdrawal_adjustment', 'recharge_adjustment', 'gift_adjustment', 'initial_balance_adjustment', 'reconciliation'].includes(sourceType);
    return (
      <Badge variant={isNeutral ? 'secondary' : isIncome ? 'default' : 'destructive'} className="text-xs">
        {getSourceTypeLabel(sourceType, lang)}
      </Badge>
    );
  };

  return (
    <div className="space-y-3">
      {/* Toolbar */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="relative flex-1 min-w-[200px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder={t("搜索来源ID、备注、操作人...", "Search source ID, note, operator...")}
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>
        <Select value={filterType} onValueChange={setFilterType}>
          <SelectTrigger className="w-[160px]">
            <SelectValue placeholder={t("类型筛选", "Filter Type")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("全部类型", "All Types")}</SelectItem>
            {availableSourceTypes.map(type => (
              <SelectItem key={type} value={type}>
                {getSourceTypeLabel(type, lang)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={handleReconcile} disabled={isReconciling}>
          {isReconciling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          {t("对账", "Reconcile")}
        </Button>
        <Button variant="outline" size="sm" className="gap-1.5" onClick={() => exportConfirm.requestExport(handleExport)}>
          <Download className="h-4 w-4" />
          {t("导出", "Export")}
        </Button>
      </div>

      {/* Reconciliation result */}
      {reconcileResult && (
        <div className={`px-4 py-3 border rounded-lg text-sm flex items-center justify-between ${reconcileResult.discrepancy < 0.01 ? 'bg-primary/5 border-primary/20' : 'bg-destructive/5 border-destructive/20'}`}>
          <div className="flex items-center gap-2">
            {reconcileResult.discrepancy < 0.01 ? (
              <CheckCircle className="h-4 w-4 text-primary" />
            ) : (
              <AlertTriangle className="h-4 w-4 text-destructive" />
            )}
            <span>
              {t("计算余额", "Computed")}: <strong>¥{reconcileResult.computedBalance.toFixed(2)}</strong>
              {' | '}
              {t("存储余额", "Stored")}: <strong>¥{reconcileResult.storedBalance.toFixed(2)}</strong>
              {reconcileResult.discrepancy >= 0.01 && (
                <> {' | '} {t("差异", "Diff")}: <strong className="text-destructive">¥{reconcileResult.discrepancy.toFixed(2)}</strong></>
              )}
            </span>
          </div>
          {reconcileResult.discrepancy >= 0.01 && (
            <Button variant="destructive" size="sm" onClick={handleFixDiscrepancy}>
              {t("创建修正", "Fix")}
            </Button>
          )}
        </div>
      )}

      {/* Balance comparison */}
      {realTimeBalance !== undefined && transactions.length > 0 && (
        <div className="px-4 py-2 bg-muted/30 border rounded-lg flex items-center justify-between text-xs">
          <span>
            {t("最新账本余额", "Latest Ledger Balance")}:
            <strong className="ml-1">¥{computedCurrentBalance.toFixed(2)}</strong>
          </span>
          <span>
            {t("实时计算余额", "Real-time Balance")}:
            <strong className={`ml-1 ${Math.abs(realTimeBalance - computedCurrentBalance) > 0.01 ? 'text-amber-600' : 'text-primary'}`}>
              ¥{realTimeBalance.toFixed(2)}
            </strong>
            {Math.abs(realTimeBalance - computedCurrentBalance) > 0.01 && (
              <Badge variant="destructive" className="ml-2">{t("存在差异", "Discrepancy")}</Badge>
            )}
          </span>
        </div>
      )}

      {/* Table */}
      {isMobile ? (
        <>
          {isLoading ? (
            <div className="flex items-center justify-center h-48">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
            </div>
          ) : (
            <MobileCardList>
              {paginatedTransactions.length === 0 ? (
                <MobileEmptyState message={t("暂无账本记录", "No ledger records")} />
              ) : (
                paginatedTransactions.map((tx) => {
                  const bal = getBalance(tx);
                  return (
                  <MobileCard key={tx.id} accent="default" className={!tx.is_active ? 'opacity-50' : ''}>
                    <MobileCardHeader>
                      {getSourceTypeBadge(tx.source_type as SourceType, tx.is_active)}
                      <span className="text-xs text-muted-foreground">
                        {formatBeijingTime(tx.created_at)}
                      </span>
                    </MobileCardHeader>
                    <MobileCardRow label={t("变动金额", "Amount")} value={formatAmount(tx.amount)} highlight />
                    <MobileCardRow label={t("变动后", "After")} value={`¥${bal.after.toFixed(2)}`} />
                    <MobileCardCollapsible>
                      <MobileCardRow label={t("变动前", "Before")} value={`¥${bal.before.toFixed(2)}`} />
                      <MobileCardRow label={t("状态", "Status")} value={tx.is_active ? t("有效", "Active") : t("已撤销", "Reversed")} />
                    <MobileCardRow label={t("来源", "Source")} value={formatSourceId(tx.source_id, lang)} />
                      <MobileCardRow label={t("操作人", "Operator")} value={tx.operator_name || '-'} />
                      <MobileCardRow label={t("备注", "Note")} value={formatLedgerNote(tx.note, lang)} />
                    </MobileCardCollapsible>
                  </MobileCard>
                  );
                })
              )}
            </MobileCardList>
          )}
          <MobilePagination
            currentPage={page}
            totalPages={totalPages}
            totalItems={filteredTransactions.length}
            onPageChange={setPage}
            pageSize={pageSize}
            onPageSizeChange={(s) => { setPageSize(s); setPage(1); }}
          />
        </>
      ) : (
      <div className="overflow-auto border rounded-lg max-h-[400px]">
        {isLoading ? (
          <div className="flex items-center justify-center h-48">
            <Loader2 className="h-8 w-8 animate-spin text-primary" />
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/50">
                <TableHead className="text-center">{t("时间", "Time")}</TableHead>
                <TableHead className="text-center">{t("类型", "Type")}</TableHead>
                <TableHead className="text-center">{t("变动前", "Before")}</TableHead>
                <TableHead className="text-center">{t("变动金额", "Amount")}</TableHead>
                <TableHead className="text-center">{t("变动后", "After")}</TableHead>
                <TableHead className="text-center">{t("状态", "Status")}</TableHead>
                <TableHead className="text-center">{t("来源", "Source")}</TableHead>
                <TableHead className="text-center">{t("操作人", "Operator")}</TableHead>
                <TableHead className="text-center">{t("备注", "Note")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedTransactions.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="h-32 text-center text-muted-foreground">
                    {t("暂无账本记录", "No ledger records")}
                  </TableCell>
                </TableRow>
              ) : (
                paginatedTransactions.map((tx) => {
                  const bal = getBalance(tx);
                  return (
                  <TableRow key={tx.id} className={!tx.is_active ? 'opacity-50 bg-muted/20' : ''}>
                    <TableCell className="text-center text-xs whitespace-nowrap">
                      {formatBeijingTime(tx.created_at)}
                    </TableCell>
                    <TableCell className="text-center">
                      {getSourceTypeBadge(tx.source_type as SourceType, tx.is_active)}
                    </TableCell>
                    <TableCell className="text-center">¥{bal.before.toFixed(2)}</TableCell>
                    <TableCell className="text-center font-medium">{formatAmount(tx.amount)}</TableCell>
                    <TableCell className="text-center font-medium">¥{bal.after.toFixed(2)}</TableCell>
                    <TableCell className="text-center">
                      {tx.is_active ? (
                        <Badge variant="default" className="text-xs">{t("有效", "Active")}</Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs">{t("已撤销", "Reversed")}</Badge>
                      )}
                    </TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground max-w-[120px] truncate" title={tx.source_id || ''}>
                      {formatSourceId(tx.source_id, lang)}
                    </TableCell>
                    <TableCell className="text-center text-xs">{tx.operator_name || '-'}</TableCell>
                    <TableCell className="text-center text-xs text-muted-foreground max-w-[150px] truncate" title={formatLedgerNote(tx.note, lang)}>
                      {formatLedgerNote(tx.note, lang)}
                    </TableCell>
                  </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        )}
      </div>
      )}

      {/* Pagination */}
      {filteredTransactions.length > 0 && (
        <div className="flex items-center justify-between pt-1">
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <span>{t("共", "Total")} {filteredTransactions.length} {t("条记录", "records")}</span>
            <PageSizeSelect value={pageSize} onChange={(size) => { setPageSize(size); setPage(1); }} />
          </div>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page <= 1}>
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm">{page} / {totalPages || 1}</span>
            <Button variant="outline" size="sm" onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page >= totalPages}>
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

      <ExportConfirmDialog
        open={exportConfirm.open}
        onOpenChange={exportConfirm.handleOpenChange}
        onConfirm={exportConfirm.handleConfirm}
      />
    </div>
  );
}
