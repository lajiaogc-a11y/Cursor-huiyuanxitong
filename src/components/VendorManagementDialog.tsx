/**
 * Unified Vendor (Card Merchant) Management Dialog
 * Tabs: Details | Change Log | Add Withdrawal | Set Initial Balance
 */

import { useState, useEffect, useMemo } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Loader2, Pencil, Trash2, ChevronDown } from 'lucide-react';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions } from '@/components/ui/mobile-data-card';
import { WithdrawalRecord, ArchivedWithdrawals } from '@/stores/merchantSettlementStore';
import { getEmployeeNameById } from '@/hooks/useNameResolver';
import LedgerTransactionContent from '@/components/LedgerTransactionContent';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
interface VendorManagementDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  vendorName: string;
  withdrawals: WithdrawalRecord[];
  archivedWithdrawals?: ArchivedWithdrawals[];
  realTimeBalance: number;
  initialBalance: number;
  canEditBalance: boolean;
  isSaving: boolean;
  defaultTab?: string;
  // Callbacks
  onSaveWithdrawal: (amountUsdt: number, rate: number, remark: string) => Promise<void>;
  onSaveInitialBalance: (amount: number) => Promise<void>;
  onEditWithdrawal: (withdrawal: WithdrawalRecord, updates: { withdrawalAmountUsdt: number; usdtRate: number; remark?: string }) => Promise<void>;
  onDeleteWithdrawal: (withdrawalId: string) => Promise<void>;
}

export default function VendorManagementDialog({
  open,
  onOpenChange,
  vendorName,
  withdrawals,
  archivedWithdrawals = [],
  realTimeBalance,
  initialBalance,
  canEditBalance,
  isSaving,
  defaultTab = 'add-withdrawal',
  onSaveWithdrawal,
  onSaveInitialBalance,
  onEditWithdrawal,
  onDeleteWithdrawal,
}: VendorManagementDialogProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [activeTab, setActiveTab] = useState(defaultTab);
  
  // Withdrawal form
  const [withdrawalAmountUsdt, setWithdrawalAmountUsdt] = useState('');
  const [withdrawalUsdtRate, setWithdrawalUsdtRate] = useState('');
  const [withdrawalRemark, setWithdrawalRemark] = useState('');
  
  // Initial balance form
  const [initialBalanceAmount, setInitialBalanceAmount] = useState(initialBalance?.toString() || '0');
  
  // Edit states
  const [editingWithdrawal, setEditingWithdrawal] = useState<WithdrawalRecord | null>(null);
  const [deletingWithdrawalId, setDeletingWithdrawalId] = useState<string | null>(null);
  
  const settlementTotal = (parseFloat(withdrawalAmountUsdt) || 0) * (parseFloat(withdrawalUsdtRate) || 0);

  // Reset forms when tab or dialog changes
  const handleTabChange = (tab: string) => {
    setActiveTab(tab);
  };

  // Sync state from props when dialog opens or initialBalance changes
  useEffect(() => {
    if (open) {
      setActiveTab(defaultTab);
      setInitialBalanceAmount(initialBalance?.toString() || '0');
    }
  }, [open, initialBalance, defaultTab]);

  const handleSaveWithdrawal = async () => {
    const amountUsdt = parseFloat(withdrawalAmountUsdt);
    const rate = parseFloat(withdrawalUsdtRate);
    if (isNaN(amountUsdt) || isNaN(rate)) return;
    await onSaveWithdrawal(amountUsdt, rate, withdrawalRemark);
    setWithdrawalAmountUsdt('');
    setWithdrawalUsdtRate('');
    setWithdrawalRemark('');
  };

  const handleSaveInitialBalance = async () => {
    const amount = parseFloat(initialBalanceAmount);
    if (isNaN(amount)) return;
    await onSaveInitialBalance(amount);
  };

  const handleSaveEditWithdrawal = async () => {
    if (!editingWithdrawal) return;
    await onEditWithdrawal(editingWithdrawal, {
      withdrawalAmountUsdt: editingWithdrawal.withdrawalAmountUsdt,
      usdtRate: editingWithdrawal.usdtRate,
      remark: editingWithdrawal.remark,
    });
    setEditingWithdrawal(null);
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className={`${isMobile ? 'max-w-full w-full h-[95vh]' : 'max-w-5xl h-[85vh]'} overflow-hidden flex flex-col`}>
          <DialogHeader>
            <DialogTitle className={isMobile ? 'text-sm' : ''}>{t('卡商管理', 'Vendor Management')} - {vendorName}</DialogTitle>
            <DialogDescription className={isMobile ? 'text-xs' : ''}>{t('管理提款、余额和变动明细', 'Manage withdrawals, balance and change history')}</DialogDescription>
          </DialogHeader>
          
          <Tabs value={activeTab} onValueChange={handleTabChange} className="flex-1 overflow-hidden flex flex-col">
            <TabsList className={`${isMobile ? 'flex w-full overflow-x-auto [&::-webkit-scrollbar]:hidden' : 'grid w-full grid-cols-4'}`}>
              {canEditBalance && <TabsTrigger value="add-withdrawal" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('录入提款', 'Add Withdrawal')}</TabsTrigger>}
              {canEditBalance && <TabsTrigger value="initial-balance" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('初始余额', 'Initial Balance')}</TabsTrigger>}
              <TabsTrigger value="ledger" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('账本明细', 'Ledger')}</TabsTrigger>
              <TabsTrigger value="details" className={isMobile ? 'text-xs whitespace-nowrap' : ''}>{t('提款明细', 'Withdrawal Details')}</TabsTrigger>
            </TabsList>

            {/* Add Withdrawal Tab */}
            {canEditBalance && (
              <TabsContent value="add-withdrawal" className="flex-1 overflow-y-auto">
                <div className="max-w-lg mx-auto p-4 space-y-5">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label>{t('提款金额USDT', 'Withdrawal Amount USDT')}</Label>
                      <Input type="number" placeholder={t('输入USDT金额', 'Enter USDT amount')} value={withdrawalAmountUsdt} onChange={(e) => setWithdrawalAmountUsdt(e.target.value)} />
                    </div>
                    <div className="space-y-2">
                      <Label>{t('USDT汇率', 'USDT Rate')}</Label>
                      <Input type="number" placeholder={t('输入汇率', 'Enter rate')} value={withdrawalUsdtRate} onChange={(e) => setWithdrawalUsdtRate(e.target.value)} />
                    </div>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('结算总额', 'Settlement Total')}</Label>
                    <Input type="number" value={isNaN(settlementTotal) ? '0' : settlementTotal.toFixed(2)} disabled />
                    <p className="text-xs text-muted-foreground">= {t('提款金额USDT × USDT汇率', 'Amount USDT × Rate')}</p>
                  </div>
                  <div className="space-y-2">
                    <Label>{t('备注', 'Remark')}</Label>
                    <Textarea placeholder={t('输入备注（可选）', 'Enter remark (optional)')} value={withdrawalRemark} onChange={(e) => setWithdrawalRemark(e.target.value)} className="min-h-[80px]" />
                  </div>
                  <Button onClick={handleSaveWithdrawal} disabled={isSaving} className="w-full h-10 text-base font-semibold">
                    {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                    {t('确定录入', 'Submit')}
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
                      {t('提示：设置初始余额后，将重置最后重置时间并清空提款记录', 'Note: Setting initial balance will reset the last reset time and clear withdrawal records')}
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
                accountType="card_vendor"
                accountName={vendorName}
                realTimeBalance={realTimeBalance}
                active={activeTab === 'ledger'}
              />
            </TabsContent>
            
            {/* Details Tab */}
            <TabsContent value="details" className="flex-1 overflow-auto">
              {isMobile ? (
                <div className="space-y-2">
                  {withdrawals.length === 0 ? (
                    <div className="text-center text-muted-foreground py-8">{t('暂无提款记录', 'No withdrawal records')}</div>
                  ) : withdrawals.map((w, index) => (
                    <div key={w.id} className="border rounded-lg p-3 bg-card space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs text-muted-foreground">#{index + 1} · {w.createdAt}</span>
                        {canEditBalance && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => setEditingWithdrawal({ ...w })}><Pencil className="h-3 w-3" /></Button>
                            <Button variant="ghost" size="sm" className="h-7 w-7 p-0 text-destructive" onClick={() => setDeletingWithdrawalId(w.id)}><Trash2 className="h-3 w-3" /></Button>
                          </div>
                        )}
                      </div>
                      <div className="grid grid-cols-3 gap-2 text-sm">
                        <div><span className="text-xs text-muted-foreground">{t('USDT', 'USDT')}</span><div className="font-medium">{w.withdrawalAmountUsdt}</div></div>
                        <div><span className="text-xs text-muted-foreground">{t('汇率', 'Rate')}</span><div className="font-medium">{w.usdtRate}</div></div>
                        <div><span className="text-xs text-muted-foreground">{t('总额', 'Total')}</span><div className="font-medium">¥{w.settlementTotal.toFixed(2)}</div></div>
                      </div>
                      {w.remark && <div className="text-xs text-muted-foreground truncate">{t('备注', 'Remark')}: {w.remark}</div>}
                      <div className="text-xs text-muted-foreground">{t('录入人', 'Recorder')}: {w.recorderId ? getEmployeeNameById(w.recorderId) : '-'}</div>
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
                      <th className="text-left p-3 font-medium">{t('提款金额USDT', 'Amount USDT')}</th>
                      <th className="text-left p-3 font-medium">{t('USDT汇率', 'Rate')}</th>
                      <th className="text-left p-3 font-medium">{t('结算总额', 'Total')}</th>
                      <th className="text-left p-3 font-medium">{t('备注', 'Remark')}</th>
                      <th className="text-left p-3 font-medium">{t('录入人', 'Recorder')}</th>
                      {canEditBalance && <th className="text-center p-3 font-medium">{t('操作', 'Actions')}</th>}
                    </tr>
                  </thead>
                  <tbody>
                    {withdrawals.map((w, index) => (
                      <tr key={w.id} className="border-b">
                        <td className="p-3">{index + 1}</td>
                        <td className="p-3">{w.createdAt}</td>
                        <td className="p-3">{w.withdrawalAmountUsdt}</td>
                        <td className="p-3">{w.usdtRate}</td>
                        <td className="p-3">¥{w.settlementTotal.toFixed(2)}</td>
                        <td className="p-3 max-w-[150px] truncate" title={w.remark || ''}>{w.remark || '-'}</td>
                        <td className="p-3">{w.recorderId ? getEmployeeNameById(w.recorderId) : '-'}</td>
                        {canEditBalance && (
                          <td className="p-3 text-center">
                            <div className="flex items-center justify-center gap-2">
                              <Button variant="ghost" size="sm" onClick={() => setEditingWithdrawal({ ...w })}>
                                <Pencil className="h-4 w-4" />
                              </Button>
                              <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={() => setDeletingWithdrawalId(w.id)}>
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </div>
                          </td>
                        )}
                      </tr>
                    ))}
                    {withdrawals.length === 0 && (
                      <tr>
                        <td colSpan={canEditBalance ? 8 : 7} className="p-6 text-center text-muted-foreground">
                          {t('暂无提款记录', 'No withdrawal records')}
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
              )}
              
              {/* Archived Historical Records */}
              {archivedWithdrawals.length > 0 && (
                <div className="mt-4 space-y-2">
                  {archivedWithdrawals.slice().reverse().map((archive, archiveIdx) => (
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
                              {archive.records.map((w, index) => (
                                <div key={w.id} className="border rounded-lg p-3 bg-card/50 space-y-1 opacity-80">
                                  <span className="text-xs text-muted-foreground">#{index + 1} · {w.createdAt}</span>
                                  <div className="grid grid-cols-3 gap-2 text-sm">
                                    <div><span className="text-xs text-muted-foreground">USDT</span><div className="font-medium">{w.withdrawalAmountUsdt}</div></div>
                                    <div><span className="text-xs text-muted-foreground">{t('汇率', 'Rate')}</span><div className="font-medium">{w.usdtRate}</div></div>
                                    <div><span className="text-xs text-muted-foreground">{t('总额', 'Total')}</span><div className="font-medium">¥{w.settlementTotal.toFixed(2)}</div></div>
                                  </div>
                                  {w.remark && <div className="text-xs text-muted-foreground truncate">{t('备注', 'Remark')}: {w.remark}</div>}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="bg-muted/30 border-b">
                                  <th className="text-left p-2 font-medium text-xs">{t('序号', '#')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('录入时间', 'Time')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('提款金额USDT', 'Amount USDT')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('USDT汇率', 'Rate')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('结算总额', 'Total')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('备注', 'Remark')}</th>
                                  <th className="text-left p-2 font-medium text-xs">{t('录入人', 'Recorder')}</th>
                                </tr>
                              </thead>
                              <tbody>
                                {archive.records.map((w, index) => (
                                  <tr key={w.id} className="border-b opacity-80">
                                    <td className="p-2">{index + 1}</td>
                                    <td className="p-2">{w.createdAt}</td>
                                    <td className="p-2">{w.withdrawalAmountUsdt}</td>
                                    <td className="p-2">{w.usdtRate}</td>
                                    <td className="p-2">¥{w.settlementTotal.toFixed(2)}</td>
                                    <td className="p-2 max-w-[150px] truncate" title={w.remark || ''}>{w.remark || '-'}</td>
                                    <td className="p-2">{w.recorderId ? getEmployeeNameById(w.recorderId) : '-'}</td>
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
        </DialogContent>
      </Dialog>

      {/* Edit Withdrawal Dialog */}
      <Dialog open={!!editingWithdrawal} onOpenChange={(open) => !open && setEditingWithdrawal(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('编辑提款记录', 'Edit Withdrawal')}</DialogTitle>
          </DialogHeader>
          {editingWithdrawal && (
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label>{t('提款金额USDT', 'Amount USDT')}</Label>
                <Input type="number" value={editingWithdrawal.withdrawalAmountUsdt} onChange={(e) => setEditingWithdrawal({ ...editingWithdrawal, withdrawalAmountUsdt: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>{t('USDT汇率', 'Rate')}</Label>
                <Input type="number" value={editingWithdrawal.usdtRate} onChange={(e) => setEditingWithdrawal({ ...editingWithdrawal, usdtRate: parseFloat(e.target.value) || 0 })} />
              </div>
              <div className="space-y-2">
                <Label>{t('结算总额', 'Total')}</Label>
                <Input type="number" value={(editingWithdrawal.withdrawalAmountUsdt * editingWithdrawal.usdtRate).toFixed(2)} disabled />
              </div>
              <div className="space-y-2">
                <Label>{t('备注', 'Remark')}</Label>
                <Textarea placeholder={t('输入备注（可选）', 'Enter remark (optional)')} value={editingWithdrawal.remark || ''} onChange={(e) => setEditingWithdrawal({ ...editingWithdrawal, remark: e.target.value })} className="min-h-[60px]" />
              </div>
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingWithdrawal(null)}>{t('取消', 'Cancel')}</Button>
            <Button onClick={handleSaveEditWithdrawal} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('保存', 'Save')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Withdrawal Confirmation */}
      <AlertDialog open={!!deletingWithdrawalId} onOpenChange={(open) => !open && setDeletingWithdrawalId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>{t('确定要删除这条提款记录吗？此操作不可恢复。', 'Are you sure you want to delete this withdrawal record? This action cannot be undone.')}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={async () => { if (deletingWithdrawalId) { await onDeleteWithdrawal(deletingWithdrawalId); setDeletingWithdrawalId(null); } }} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {t('删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
