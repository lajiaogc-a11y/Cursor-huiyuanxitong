// ============= 交班数据历史Tab组件 =============
// 在商家结算页面显示交班记录历史

import { useState, useEffect, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, Loader2, ChevronLeft, ChevronRight } from 'lucide-react';
import { useIsMobile } from '@/hooks/use-mobile';
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardActions, MobilePagination } from '@/components/ui/mobile-data-card';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { safeToFixed } from '@/lib/safeCalc';
import { exportToCSV, formatDateTimeForExport } from '@/lib/exportUtils';
import {
  getShiftHandovers,
  ShiftHandover,
} from '@/stores/shiftHandoverStore';

const PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

interface ShiftHandoverHistoryTabProps {
  searchTerm: string;
  onExportReady?: (exportFn: () => void) => void;
  onRefreshReady?: (refreshFn: () => void) => void;
}

export default function ShiftHandoverHistoryTab({
  searchTerm,
  onExportReady,
  onRefreshReady,
}: ShiftHandoverHistoryTabProps) {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  
  const [loading, setLoading] = useState(true);
  const [handovers, setHandovers] = useState<ShiftHandover[]>([]);
  const [selectedHandover, setSelectedHandover] = useState<ShiftHandover | null>(null);
  const [isDetailDialogOpen, setIsDetailDialogOpen] = useState(false);
  
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(() => {
    const saved = localStorage.getItem('shiftHandoverPageSize');
    return saved ? parseInt(saved) : 20;
  });
  
  useEffect(() => {
    loadData();
  }, []);
  
  const loadData = async () => {
    setLoading(true);
    try {
      const data = await getShiftHandovers();
      setHandovers(data);
    } catch (error) {
      console.error('Failed to load shift handovers:', error);
      toast.error(t('shiftHandover.loadFailed'));
    } finally {
      setLoading(false);
    }
  };
  
  // 导出函数
  const handleExport = () => {
    if (filteredHandovers.length === 0) {
      toast.error(t('shiftHandover.noDataToExport'));
      return;
    }
    
    const columns = [
      { key: 'handoverTime', label: '交班时间', labelEn: 'Handover Time' },
      { key: 'handoverPerson', label: '交班人', labelEn: 'Handover Person' },
      { key: 'receiver', label: '接班人', labelEn: 'Receiver' },
      { key: 'vendorCount', label: '卡商数', labelEn: 'Vendors' },
      { key: 'providerCount', label: '代付商家数', labelEn: 'Providers' },
      { key: 'remark', label: '备注', labelEn: 'Remark' },
    ];
    
    const exportData = filteredHandovers.map(h => ({
      handoverTime: formatDateTimeForExport(h.handover_time),
      handoverPerson: h.handover_employee_name,
      receiver: h.receiver_name,
      vendorCount: h.card_merchant_data.length,
      providerCount: h.payment_provider_data.length,
      remark: h.remark || '',
    }));
    
    exportToCSV(exportData, columns, `shift-handovers`);
    toast.success(t('shiftHandover.exportSuccess'));
  };
  
  // 注册导出和刷新函数到父组件
  useEffect(() => {
    onExportReady?.(handleExport);
    onRefreshReady?.(loadData);
  }, [onExportReady, onRefreshReady, handleExport, loadData]);
  
  // 过滤数据 - 支持交班人和接班人搜索（使用外部 searchTerm）
  const filteredHandovers = useMemo(() => {
    if (!searchTerm.trim()) return handovers;
    const term = searchTerm.toLowerCase().trim();
    return handovers.filter(h => 
      h.handover_employee_name.toLowerCase().includes(term) ||
      h.receiver_name.toLowerCase().includes(term)
    );
  }, [handovers, searchTerm]);
  
  // 分页数据
  const totalPages = Math.ceil(filteredHandovers.length / pageSize);
  const paginatedHandovers = useMemo(() => {
    const start = (currentPage - 1) * pageSize;
    return filteredHandovers.slice(start, start + pageSize);
  }, [filteredHandovers, currentPage, pageSize]);
  
  // 重置分页
  useEffect(() => {
    setCurrentPage(1);
  }, [searchTerm, pageSize]);
  
  // 保存每页条数到localStorage
  const handlePageSizeChange = (size: number) => {
    localStorage.setItem('shiftHandoverPageSize', size.toString());
    setPageSize(size);
  };
  
  const handleViewDetail = (handover: ShiftHandover) => {
    setSelectedHandover(handover);
    setIsDetailDialogOpen(true);
  };
  
  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    );
  }
  
  return (
    <div className="space-y-4">
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center justify-between">
            <span>{t('shiftHandover.historyTitle')}</span>
            <span className="text-sm font-normal text-muted-foreground">
              {t('shiftHandover.total')} {filteredHandovers.length} {t('shiftHandover.records')}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {filteredHandovers.length === 0 ? (
            <div className="text-center text-muted-foreground py-8">
              {searchTerm ? t('shiftHandover.noMatchingRecords') : t('shiftHandover.noRecords')}
            </div>
          ) : (
            <div>
              {isMobile ? (
                <>
                  <MobileCardList>
                    {paginatedHandovers.map(h => (
                      <MobileCard key={h.id}>
                        <MobileCardHeader>
                          <span className="font-medium">{h.handover_employee_name} → {h.receiver_name}</span>
                          <span className="text-xs text-muted-foreground">
                            {format(new Date(h.handover_time), 'yyyy-MM-dd HH:mm')}
                          </span>
                        </MobileCardHeader>
                        <MobileCardRow label={t('shiftHandover.vendorCount')} value={h.card_merchant_data.length} />
                        <MobileCardRow label={t('shiftHandover.providerCount')} value={h.payment_provider_data.length} />
                        {h.remark && <MobileCardRow label={t('common.remark')} value={h.remark} />}
                        <MobileCardActions>
                          <Button variant="ghost" size="sm" className="h-8 flex-1" onClick={() => handleViewDetail(h)}>
                            <Eye className="h-4 w-4 mr-1" />{t('common.actions')}
                          </Button>
                        </MobileCardActions>
                      </MobileCard>
                    ))}
                  </MobileCardList>
                  <MobilePagination
                    currentPage={currentPage}
                    totalPages={totalPages}
                    totalItems={filteredHandovers.length}
                    onPageChange={setCurrentPage}
                    pageSize={pageSize}
                    onPageSizeChange={handlePageSizeChange}
                  />
                </>
              ) : (
              <>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t('shiftHandover.handoverTime')}</TableHead>
                    <TableHead>{t('shiftHandover.handoverPerson')}</TableHead>
                    <TableHead>{t('shiftHandover.receiver')}</TableHead>
                    <TableHead>{t('shiftHandover.vendorCount')}</TableHead>
                    <TableHead>{t('shiftHandover.providerCount')}</TableHead>
                    <TableHead>{t('common.remark')}</TableHead>
                    <TableHead className="text-right">{t('common.actions')}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {paginatedHandovers.map(h => (
                    <TableRow key={h.id}>
                      <TableCell className="whitespace-nowrap">
                        {format(new Date(h.handover_time), 'yyyy-MM-dd HH:mm')}
                      </TableCell>
                      <TableCell>{h.handover_employee_name}</TableCell>
                      <TableCell>{h.receiver_name}</TableCell>
                      <TableCell>{h.card_merchant_data.length}</TableCell>
                      <TableCell>{h.payment_provider_data.length}</TableCell>
                      <TableCell className="max-w-[150px] truncate">
                        {h.remark || '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleViewDetail(h)}
                        >
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
              
              <div className="flex items-center justify-between mt-4 pt-4 border-t">
                <div className="flex items-center gap-2 text-sm text-muted-foreground">
                  <span>{t('shiftHandover.total')} {filteredHandovers.length} {t('shiftHandover.entries')}</span>
                  <span>|</span>
                  <span>{t('shiftHandover.perPage')}</span>
                  <Select value={pageSize.toString()} onValueChange={(v) => handlePageSizeChange(parseInt(v))}>
                    <SelectTrigger className="h-8 w-20">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {PAGE_SIZE_OPTIONS.map((size) => (
                        <SelectItem key={size} value={size.toString()}>{size}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(1)}
                    disabled={currentPage === 1}
                  >
                    {t('shiftHandover.firstPage')}
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                    disabled={currentPage === 1}
                  >
                    <ChevronLeft className="h-4 w-4" />
                    {t('shiftHandover.prevPage')}
                  </Button>
                  <span className="text-sm text-muted-foreground px-2">
                    {t(`第 ${currentPage} 页 / 共 ${totalPages} 页`, `Page ${currentPage} of ${totalPages}`)}
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                    disabled={currentPage === totalPages}
                  >
                    {t('shiftHandover.nextPage')}
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => setCurrentPage(totalPages)}
                    disabled={currentPage === totalPages}
                  >
                    {t('shiftHandover.lastPage')}
                  </Button>
                </div>
              </div>
              </>
              )}
            </div>
          )}
        </CardContent>
      </Card>
      
      <Dialog open={isDetailDialogOpen} onOpenChange={setIsDetailDialogOpen}>
        <DialogContent className="sm:max-w-[700px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{t('shiftHandover.detailsTitle')}</DialogTitle>
          </DialogHeader>
          
          {selectedHandover && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground">{t('shiftHandover.handoverTime')}:</span>
                  <span className="ml-2 font-medium">
                    {format(new Date(selectedHandover.handover_time), 'yyyy-MM-dd HH:mm:ss')}
                  </span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('shiftHandover.handoverPerson')}:</span>
                  <span className="ml-2 font-medium">{selectedHandover.handover_employee_name}</span>
                </div>
                <div>
                  <span className="text-muted-foreground">{t('shiftHandover.receiver')}:</span>
                  <span className="ml-2 font-medium">{selectedHandover.receiver_name}</span>
                </div>
                {selectedHandover.remark && (
                  <div className="col-span-2">
                    <span className="text-muted-foreground">{t('common.remark')}:</span>
                    <span className="ml-2">{selectedHandover.remark}</span>
                  </div>
                )}
              </div>
              
              <div>
                <h4 className="font-medium mb-2">{t('shiftHandover.cardMerchantSettlement')}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('shiftHandover.vendorNameCol')}</TableHead>
                      <TableHead className="text-right">{t('shiftHandover.balanceCol')}</TableHead>
                      <TableHead className="text-right">{t('shiftHandover.inputValueCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedHandover.card_merchant_data.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.vendorName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {safeToFixed(item.balance, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.inputValue !== 0 ? safeToFixed(item.inputValue, 2) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
              
              <div>
                <h4 className="font-medium mb-2">{t('shiftHandover.paymentProviderSettlement')}</h4>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>{t('shiftHandover.providerNameCol')}</TableHead>
                      <TableHead className="text-right">{t('shiftHandover.balanceCol')}</TableHead>
                      <TableHead className="text-right">{t('shiftHandover.inputValueCol')}</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {selectedHandover.payment_provider_data.map((item, index) => (
                      <TableRow key={index}>
                        <TableCell>{item.providerName}</TableCell>
                        <TableCell className="text-right font-mono">
                          {safeToFixed(item.balance, 2)}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {item.inputValue !== 0 ? safeToFixed(item.inputValue, 2) : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
