import { Button } from "@/components/ui/button";
import { SortableTableHead, type SortConfig } from "@/components/ui/sortable-table-head";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination } from "@/components/ui/mobile-data-card";
import { Eye, Undo2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { ProviderSettlementRow } from "./types";

export interface PaymentProviderSettlementTabProps {
  paginatedData: ProviderSettlementRow[];
  filteredData: ProviderSettlementRow[];
  useCompactLayout: boolean;
  resolveProviderName: (name: string) => string;
  canEditBalance: boolean;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  onOpenManagement: (providerName: string, tab?: string) => void;
  onOpenUndo: (providerName: string) => void;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function PaymentProviderSettlementTab({
  paginatedData,
  filteredData,
  useCompactLayout,
  resolveProviderName,
  canEditBalance,
  sortConfig,
  onSort,
  onOpenManagement,
  onOpenUndo,
  page,
  totalPages,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: PaymentProviderSettlementTabProps) {
  const { t } = useLanguage();

  if (useCompactLayout) {
    return (
      <MobileCardList>
        {paginatedData.length === 0 ? (
          <p className="text-center py-8 text-muted-foreground text-sm">{t("暂无代付商数据", "No provider data")}</p>
        ) : (
          paginatedData.map((item) => (
            <MobileCard key={item.providerName}>
              <MobileCardHeader>
                <span className="font-medium text-sm">{resolveProviderName(item.providerName)}</span>
              </MobileCardHeader>
              <MobileCardRow label={t("初始余额", "Initial")} value={`¥${item.initialBalance.toFixed(2)}`} />
              <MobileCardRow label={t("实时余额", "Balance")} value={`¥${item.realTimeBalance.toFixed(2)}`} highlight />
              <MobileCardRow label={t("订单总额", "Orders")} value={`¥${item.orderTotal.toFixed(2)}`} />
              <MobileCardCollapsible>
                <MobileCardRow label={t("赠送总额", "Gifts")} value={`¥${item.giftTotal.toFixed(2)}`} />
                <MobileCardRow label={t("充值总额", "Recharge")} value={`¥${item.rechargeTotal.toFixed(2)}`} />
                {item.postResetAdjustment !== 0 && (
                  <MobileCardRow label={t("重置后调整", "Adjustment")} value={`¥${item.postResetAdjustment.toFixed(2)}`} />
                )}
                <MobileCardRow label={t("最后重置", "Last Reset")} value={item.lastResetTime || "-"} />
              </MobileCardCollapsible>
              <MobileCardActions>
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => onOpenManagement(item.providerName, 'details')}>
                  <Eye className="h-3 w-3 mr-1" />{t("管理", "Manage")}
                </Button>
                {canEditBalance && (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-destructive" onClick={() => onOpenUndo(item.providerName)}>
                    <Undo2 className="h-3 w-3 mr-1" />{t("撤回", "Undo")}
                  </Button>
                )}
              </MobileCardActions>
            </MobileCard>
          ))
        )}
        <MobilePagination currentPage={page} totalPages={totalPages} totalItems={filteredData.length} onPageChange={onPageChange} pageSize={pageSize} onPageSizeChange={onPageSizeChange} />
      </MobileCardList>
    );
  }

  return (
    <>
      <StickyScrollTableContainer minWidth="1400px">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr className="bg-muted/50 border-b">
              <SortableTableHead sortKey="providerName" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("代付商家", "Provider")}</SortableTableHead>
              <SortableTableHead sortKey="initialBalance" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("初始余额", "Initial Balance")}</SortableTableHead>
              <SortableTableHead sortKey="realTimeBalance" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("实时余额", "Real-time Balance")}</SortableTableHead>
              <SortableTableHead sortKey="orderTotal" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("订单总金额", "Order Total")}</SortableTableHead>
              <SortableTableHead sortKey="giftTotal" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("赠送总金额", "Gift Total")}</SortableTableHead>
              <SortableTableHead sortKey="rechargeTotal" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("充值总额", "Recharge Total")}</SortableTableHead>
              <SortableTableHead sortKey="postResetAdjustment" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("重置后调整", "Adjustment")}</SortableTableHead>
              <SortableTableHead sortKey="lastResetTime" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("最后重置时间", "Last Reset")}</SortableTableHead>
              <th className="text-center p-3 font-medium whitespace-nowrap sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item) => (
              <tr key={item.providerName} className="border-b hover:bg-muted/30">
                <td className="p-3 text-center">{resolveProviderName(item.providerName)}</td>
                <td className="p-3 text-center">¥{item.initialBalance.toFixed(2)}</td>
                <td className="p-3 text-center text-destructive">¥{item.realTimeBalance.toFixed(2)}</td>
                <td className="p-3 text-center">¥{item.orderTotal.toFixed(2)}</td>
                <td className="p-3 text-center text-warning">¥{item.giftTotal.toFixed(2)}</td>
                <td className="p-3 text-center text-primary">¥{item.rechargeTotal.toFixed(2)}</td>
                <td className={`p-3 text-center ${item.postResetAdjustment !== 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}>
                  {item.postResetAdjustment !== 0 ? `¥${item.postResetAdjustment.toFixed(2)}` : '-'}
                </td>
                <td className="p-3 text-center">{item.lastResetTime || "-"}</td>
                <td className="p-3 text-center whitespace-nowrap sticky right-0 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpenManagement(item.providerName, 'details')}>
                      <Eye className="h-4 w-4 mr-1" />
                      {t("管理", "Manage")}
                    </Button>
                    {canEditBalance && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => onOpenUndo(item.providerName)}>
                        <Undo2 className="h-4 w-4 mr-1" />
                        {t("撤回", "Undo")}
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {paginatedData.length === 0 && (
              <tr>
                <td colSpan={9} className="p-6 text-center text-muted-foreground">
                  {t("暂无代付商家数据", "No provider data.")}
                </td>
              </tr>
            )}
          </tbody>
          {filteredData.length > 0 && (
            <tfoot className="bg-muted/80 border-t-2 border-primary/20">
              <tr className="font-semibold">
                <td className="p-3 text-center">{t("合计", "Total")}（{filteredData.length}{t("家", " providers")}）</td>
                <td className="p-3 text-center">
                  ¥{filteredData.reduce((sum, p) => sum + p.initialBalance, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-destructive">
                  ¥{filteredData.reduce((sum, p) => sum + p.realTimeBalance, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center">
                  ¥{filteredData.reduce((sum, p) => sum + p.orderTotal, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-warning">
                  ¥{filteredData.reduce((sum, p) => sum + p.giftTotal, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-primary">
                  ¥{filteredData.reduce((sum, p) => sum + p.rechargeTotal, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-blue-600 dark:text-blue-400">
                  {(() => { const total = filteredData.reduce((sum, p) => sum + p.postResetAdjustment, 0); return total !== 0 ? `¥${total.toFixed(2)}` : '-'; })()}
                </td>
                <td className="p-3 text-center">-</td>
                <td className="p-3 text-center sticky right-0 bg-muted/80">-</td>
              </tr>
            </tfoot>
          )}
        </table>
      </StickyScrollTableContainer>

      <TablePagination
        currentPage={page}
        totalPages={totalPages}
        totalItems={filteredData.length}
        pageSize={pageSize}
        onPageChange={onPageChange}
        onPageSizeChange={onPageSizeChange}
        pageSizeOptions={[10, 20, 50, 100]}
      />
    </>
  );
}
