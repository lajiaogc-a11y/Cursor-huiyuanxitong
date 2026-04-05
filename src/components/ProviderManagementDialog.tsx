/**
 * Unified Provider (Payment Provider) Management Dialog
 * Tabs: Details | Change Log | Add Recharge | Set Initial Balance
 */

import { useState, useEffect } from 'react';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { RechargeRecord, ArchivedRecharges } from '@/services/finance/merchantSettlementService';
import { getEmployeeNameById } from '@/hooks/useNameResolver';
import LedgerTransactionContent from '@/components/LedgerTransactionContent';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';

interface ProviderManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  providerName: string;
  recharges: RechargeRecord[];
  archivedRecharges?: ArchivedRecharges[];
  realTimeBalance: number;
  initialBalance: number;
  canEditBalance: boolean;
  isSaving: boolean;
  defaultTab?: string;
  onSaveRecharge: (amountUsdt: number, rate: number, remark: string) => Promise<void>;
  onSaveInitialBalance: (amount: number) => Promise<void>;
  onEditRecharge: (recharge: RechargeRecord, updates: { rechargeAmountUsdt: number; usdtRate: number; remark?: string }) => Promise<void>;
  onDeleteRecharge: (rechargeId: string) => Promise<void>;
}

export default function ProviderManagementDialog({
  open,
  onOpenChange,
  providerName,
  recharges,
  archivedRecharges = [],
  realTimeBalance,
  initialBalance,
  canEditBalance,
  isSaving,
  defaultTab = 'add-recharge',
  onSaveRecharge,
  onSaveInitialBalance,
  onEditRecharge,
  onDeleteRecharge,
}: ProviderManagementDialogProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  const [rechargeAmountUsdt, setRechargeAmountUsdt] = useState('');
  const [rechargeUsdtRate, setRechargeUsdtRate] = useState('');
  const [rechargeRemark, setRechargeRemark] = useState('');
  const [initialBalanceAmount, setInitialBalanceAmount] = useState(initialBalance?.toString() || '0');
  const [editingRecharge, setEditingRecharge] = useState<RechargeRecord | null>(null);
  const [deletingRechargeId, setDeletingRechargeId] = useState<string | null>(null);
  
  const settlementTotal = (parseFloat(rechargeAmountUsdt) || 0) * (parseFloat(rechargeUsdtRate) || 0);

  // Sync state from props when dialog opens or initialBalance changes
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setInitialBalanceAmount(initialBalance?.toString() || '0');
    }
  }, [open, initialBalance, defaultTab]);

  const handleSaveRecharge = async () => {
    const amountUsdt = parseFloat(rechargeAmountUsdt);
    const rate = parseFloat(rechargeUsdtRate);
    if (isNaN(amountUsdt) || isNaN(rate)) return;
    await onSaveRecharge(amountUsdt, rate, rechargeRemark);
    setRechargeAmountUsdt('');
    setRechargeUsdtRate('');
    setRechargeRemark('');
  };

  const handleSaveInitialBalance = async () => {
    const amount = parseFloat(initialBalanceAmount);
    if (isNaN(amount)) return;
    await onSaveInitialBalance(amount);
  };

  const handleSaveEditRecharge = async () => {
    if (!editingRecharge) return;
    await onEditRecharge(editingRecharge, {
      rechargeAmountUsdt: editingRecharge.rechargeAmountUsdt,
      usdtRate: editingRecharge.usdtRate,
      remark: editingRecharge.remark,
    });
    setEditingRecharge(null);
  };

  return (
    <>
      <DrawerDetail
        open={open}
        onOpenChange={onOpenChange}
        title={
          <span className={isMobile ? 'text-base' : undefined}>
            {t('代付商家管理', 'Provider Management')} — {providerName}
          </span>
        }
        description={t('管理充值、余额和变动明细', 'Manage recharges, balance and change history')}
        sheetMaxWidth="4xl"
      >
        <div className="flex flex-col h-[min(82vh,760px)] min-h-[360px]">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 overflow-hidden flex flex-col min-h-0">
            <TabsList className={`${isMobile ? 'flex w-full overflow-x-auto [&::-webkit-scrollbar]:hidden' : 'grid w-full grid-cols-4'}`}>
              {canEditBalance && <TabsTrigger value="add-recharge" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('录入充值', 'Add Top-up')}</TabsTrigger>}
              {canEditBalance && <TabsTrigger value="initial-balance" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('初始余额', 'Initial Balance')}</TabsTrigger>}
              <TabsTrigger value="ledger" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('账本明细', 'Ledger')}</TabsTrigger>
              <TabsTrigger value="details" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('充值明细', 'Top-up Details')}</TabsTrigger>
            </TabsList>

            {/* Add Recharge Tab */}
            {canEditBalance && (
              <TabsContent value="add-recharge" className="flex-1 overflow-y-auto">
                <div className="max-w-lg mx-auto p-4 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('充值金额USDT', 'Top-up Amount (USDT)')}</Label>
                      <Input type="number" placeholder={t('输入USDT金额（支持负数）', 'Enter USDT amount (negative supported)')} value={rechargeAmountUsdt} onChange={(e) => setRechargeAmountUsdt(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('USDT汇率', 'USDT Rate')}</Label>
                      <Input type="number" placeholder={t('输入汇率', 'Enter rate')} value={rechargeUsdtRate} onChange={(e) => setRechargeUsdtRate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('结算总额', 'Settlement Total')}</Label>
                    <Input type="number" value={isNaN(settlementTotal) ? '0' : settlementTotal.toFixed(2)} disabled />
                    <p className="text-xs text-muted-foreground">= {t('充值金额USDT × USDT汇率', 'Amount USDT × Rate')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('备注', 'Remark')}</Label>
                    <Textarea placeholder={t('输入备注（可选）', 'Enter remark (optional)')} value={rechargeRemark} onChange={(e) => setRechargeRemark(e.target.value)} className="min-h-[80px]" />
                  </div>
                  <Button onClick={handleSaveRecharge} disabled={isSaving} className="w-full h-10 text-base font-semibold">
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('确定录入', 'Save')}
                  </Button>
                </div>
              </TabsContent>
            )}
            
            {/* Initial Balance Tab */}
            {canEditBalance && (
              <TabsContent value="initial-balance" className="flex-1 overflow-y-auto">
                <div className="max-w-lg mx-auto p-4 space-y-5">
                  <div className="p-4 bg-muted/50 rounded-xl border space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-sm text-muted-foreground">{t('当前实时余额', 'Current real-time balance')}</span>
                      <span className="text-xl font-bold text-foreground">¥{realTimeBalance.toFixed(2)}</span>
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('设置初始余额', 'Set Initial Balance')}</Label>
                    <div className="flex gap-2">
                      <Input type="number" placeholder={t('输入金额', 'Enter amount')} value={initialBalanceAmount} onChange={(e) => setInitialBalanceAmount(e.target.value)} className="h-11 text-lg flex-1" />
                      <Button type="button" variant="outline" size="sm" className="shrink-0 whitespace-nowrap" onClick={() => setInitialBalanceAmount(realTimeBalance.toFixed(2))}>
                        {t('一键填入', 'Fill')}
                      </Button>
                    </div>
                    <p className="text-xs text-muted-foreground">
                      {t('提示：设置初始余额后，将重置最后重置时间并清空充值记录', 'Note: Setting initial balance will reset the last reset time and clear recharge records')}
                    </p>
                  </div>
                  <Button onClick={handleSaveInitialBalance} disabled={isSaving} className="w-full h-10 text-base font-semibold">
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('确定设置', 'Confirm')}
                  </Button>
                </div>
              </TabsContent>
            )}

            {/* Ledger Tab */}
            <TabsContent value="ledger" className="flex-1 overflow-auto">
              <LedgerTransactionContent
                accountType="payment_provider"
                accountName={providerName}
                realTimeBalance={realTimeBalance}
                active={activeTab === 'ledger'}
              />
            </TabsContent>
            
            {/* Details Tab */}
            <TabsContent value="details" className="flex-1 overflow-auto">
              {isMobile ? (
                <div className="space-y-2">
                  {recharges.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">{t('暂无充值记录', 'No recharge records')}</div>
                  ) : recharges.map((r, index) => (
                    <div key={r.id} className="border rounded-lg p-3 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">#{index + 1} · {r.createdAt}</span>
                        {canEditBalance && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingRecharge({ ...r })} aria-label="Edit"><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeletingRechargeId(r.id)} aria-label="Delete"><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><span className="text-xs text-muted-foreground">{t('USDT', 'USDT')}</span><div className="font-medium">{r.rechargeAmountUsdt}</div></div>
                        <div><span className="text-xs text-muted-foreground">{t('汇率', 'Rate')}</span><div className="font-medium">{r.usdtRate}</div></div>
                        <div><span className="text-xs text-muted-foreground">{t('总额', 'Total')}</span><div className="font-medium">¥{r.settlementTotal.toFixed(2)}</div></div>
                      </div>
                      {r.remark && <div className="text-xs text-muted-foreground truncate">{t('备注', 'Remark')}: {r.remark}</div>}
                      <div className="text-xs text-muted-foreground">{t('录入人', 'Recorder')}: {r.recorderId ? getEmployeeNameById(r.recorderId) : '-'}</div>
                    </div>
                  ))}
                </div>
              ) : (
              <div className="max-h-[500px] overflow-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="bg-muted/50 border-b sticky top-0">
                      <th className="text-left p-3 font-medium">{t('序号', '#')}</th>
                      <th className="text-left p-3 font-medium">{t('录入时间', 'Time')}</th>
                      <th className="text-left p-3 font-medium">{t('充值金额USDT', 'Amount USDT')}</th>
                      <th className="text-left p-3 font-medium">{t('USDT汇率', 'Rate')}</th>
                      <th className="text-left p-3 font-medium">{t('结算总额', 'Total')}</th>
                      <th className="text-left p-3 font-medium">{t('备注', 'Remark')}</th>
                      <th className="text-left p-3 font-medium">{t('录入人', 'Recorder')}</th>
                      {canEditBalance && <th className="text-center p-3 font-medium">{t('操作', 'Actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {recharges.map((r, index) => (
                      <tr key={r.id} className="border-b">
                        <td className="p-3">{index + 1}</td>
                        <td className="p-3">{r.createdAt}</td>
                        <td className="p-3">{r.rechargeAmountUsdt}</td>
                        <td className="p-3">{r.usdtRate}</td>
                        <td className="p-3">¥{r.settlementTotal.toFixed(2)}</td>
                        <td className="p-3 max-w-[150px] truncate" title={r.remark || ''}>{r.remark || '-'}</td>
                        <td className="p-3">{r.recorderId ? getEmployeeNameById(r.recorderId) : '-'}</td>
                        {canEditBalance && (
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingRecharge({ ...r })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingRechargeId(r.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {recharges.length === 0 && (
                      <tr>
                        <td colSpan={canEditBalance ? 8 : 7} className="p-6 text-center text-muted-foreground">
                          {t('暂无充值记录', 'No recharge records')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}
              
              {/* Archived Historical Records */}
              {archivedRecharges.length > 0 && (
                <div className="mt-4 space-y-2">
                  {archivedRecharges.slice().reverse().map((archive, archiveIdx) => (
                    <Collapsible key={archiveIdx}>
                      <CollapsibleTrigger className="flex items-center gap-2 w-full p-3 bg-muted/30 border rounded-lg hover:bg-muted/50 transition-colors text-sm font-medium">
                        <ChevronDown className="h-4 w-4 transition-transform duration-200 [[data-state=open]>&]:rotate-180" />
                        <span>{t('历史记录', 'Historical Records')} - {t('重置于', 'Reset at')} {archive.resetTime}</span>
                        <span className="ml-auto text-xs text-muted-foreground">{archive.records.length} {t('条', 'records')}</span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="mt-1 border rounded-lg overflow-hidden">
                          {isMobile ? (
                            <div className="space-y-2 p-2">
                              {archive.records.map((r, index) => (
                                <div key={r.id} className="border rounded-lg p-3 bg-card/50 space-y-1 opacity-80">
                                  <span className="text-xs text-muted-foreground">#{index + 1} · {r.createdAt}</span>
                                  <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div><span className="text-xs text-muted-foreground">USDT</span><div className="font-medium">{r.rechargeAmountUsdt}</div></div>
                                    <div><span className="text-xs text-muted-foreground">{t('汇率', 'Rate')}</span><div className="font-medium">{r.usdtRate}</div></div>
                                    <div><span className="text-xs text-muted-foreground">{t('总额', 'Total')}</span><div className="font-medium">¥{r.settlementTotal.toFixed(2)}</div></div>
                                  </div>
                                  {r.remark && <div className="text-xs text-muted-foreground truncate">{t('备注', 'Remark')}: {r.remark}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/30 border-b">
                                  <th className="text-left p-2 font-medium text-xs">{t('序号', '#')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('录入时间', 'Time')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('充值金额USDT', 'Amount USDT')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('USDT汇率', 'Rate')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('结算总额', 'Total')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('备注', 'Remark')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('录入人', 'Recorder')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {archive.records.map((r, index) => (
                                  <tr key={r.id} className="border-b opacity-80">
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">{r.createdAt}</td>
                                    <td className="p-2">{r.rechargeAmountUsdt}</td>
                                    <td className="p-2">{r.usdtRate}</td>
                                    <td className="p-2">¥{r.settlementTotal.toFixed(2)}</td>
                                    <td className="p-2 max-w-[150px] truncate" title={r.remark || ''}>{r.remark || '-'}</td>
                                    <td className="p-2">{r.recorderId ? getEmployeeNameById(r.recorderId) : '-'}</td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </div>
                      </CollapsibleContent>
                    </Collapsible>
                  ))}
                </div>
              )}
            </TabsContent>
            
            
          </Tabs>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={!!editingRecharge}
        onOpenChange={(o) => !o && setEditingRecharge(null)}
        title={t('编辑充值记录', 'Edit Top-up')}
        sheetMaxWidth="xl"
      >
        {editingRecharge && (
          <>
            <div className="space-y-4 pb-4">
              <div className="space-y-2">
                <Label>{t('充值金额USDT', 'Amount USDT')}</Label>
                <Input type="number" value={editingRecharge.rechargeAmountUsdt} onChange={(e) => setEditingRecharge({ ...editingRecharge, rechargeAmountUsdt: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>{t('USDT汇率', 'Rate')}</Label>
                <Input type="number" value={editingRecharge.usdtRate} onChange={(e) => setEditingRecharge({ ...editingRecharge, usdtRate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>{t('结算总额', 'Total')}</Label>
                <Input type="number" value={(editingRecharge.rechargeAmountUsdt * editingRecharge.usdtRate).toFixed(2)} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('备注', 'Remark')}</Label>
                <Textarea placeholder={t('输入备注（可选）', 'Enter remark (optional)')} value={editingRecharge.remark || ''} onChange={(e) => setEditingRecharge({ ...editingRecharge, remark: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
            <div className="flex flex-wrap justify-end gap-2 pt-4 border-t border-border">
              <Button variant="outline" onClick={() => setEditingRecharge(null)}>{t('取消', 'Cancel')}</Button>
              <Button onClick={handleSaveEditRecharge} disabled={isSaving}>
                {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {t('保存', 'Save')}
              </Button>
            </div>
          </>
        )}
      </DrawerDetail>

      {/* Delete Recharge Confirmation */}
      <AlertDialog open={!!deletingRechargeId} onOpenChange={(open) => !open && setDeletingRechargeId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('确定要删除这条充值记录吗？此操作不可恢复。', 'Are you sure you want to delete this recharge record? This action cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deletingRechargeId) { await onDeleteRecharge(deletingRechargeId); setDeletingRechargeId(null); } }} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
