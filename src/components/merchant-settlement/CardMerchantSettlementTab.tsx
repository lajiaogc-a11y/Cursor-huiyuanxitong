import { Button } from "@/components/ui/button";
import { SortableTableHead, type SortConfig } from "@/components/ui/sortable-table-head";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { TablePagination } from "@/components/ui/table-pagination";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { Eye, Undo2 } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import type { VendorSettlementRow } from "./types";

function realtimeBalanceTableClasses(balance: number) {
  return cn(
    "p-3 text-center tabular-nums font-semibold ring-1 ring-inset",
    balance < 0
      ? "bg-rose-500/15 text-rose-800 dark:bg-rose-950/45 dark:text-rose-300 ring-rose-500/35"
      : "bg-emerald-500/15 text-emerald-900 dark:bg-emerald-950/40 dark:text-emerald-300 ring-emerald-500/35",
  );
}

export interface CardMerchantSettlementTabProps {
  paginatedData: VendorSettlementRow[];
  filteredData: VendorSettlementRow[];
  useCompactLayout: boolean;
  resolveVendorName: (name: string) => string;
  canEditBalance: boolean;
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  onOpenManagement: (vendorName: string, tab?: string) => void;
  onOpenUndo: (vendorName: string) => void;
  page: number;
  totalPages: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
}

export function CardMerchantSettlementTab({
  paginatedData,
  filteredData,
  useCompactLayout,
  resolveVendorName,
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
}: CardMerchantSettlementTabProps) {
  const { t } = useLanguage();

  if (useCompactLayout) {
    return (
      <MobileCardList>
        {paginatedData.length === 0 ? (
          <MobileEmptyState message={t("暂无卡商数据", "No vendor data")} />
        ) : (
          paginatedData.map((item) => (
            <MobileCard key={item.vendorName} accent="default">
              <MobileCardHeader>
                <span className="font-medium text-sm">{resolveVendorName(item.vendorName)}</span>
              </MobileCardHeader>
              <MobileCardRow label={t("初始余额", "Initial")} value={`¥${item.initialBalance.toFixed(2)}`} />
              <MobileCardRow
                label={t("实时余额", "Balance")}
                value={`¥${item.realTimeBalance.toFixed(2)}`}
                className={cn(
                  "rounded-md px-2 py-1.5 -mx-0.5 border",
                  item.realTimeBalance < 0 ? "border-rose-500/30 bg-rose-500/10" : "border-emerald-500/35 bg-emerald-500/10",
                )}
                valueClassName={cn(
                  "font-semibold tabular-nums",
                  item.realTimeBalance < 0 ? "text-rose-700 dark:text-rose-400" : "text-emerald-800 dark:text-emerald-300",
                )}
              />
              <MobileCardRow label={t("订单总额", "Orders")} value={`¥${item.orderTotal.toFixed(2)}`} />
              <MobileCardCollapsible>
                <MobileCardRow label={t("提款总额", "Withdrawal")} value={`¥${item.withdrawalTotal.toFixed(2)}`} />
                {item.postResetAdjustment !== 0 && (
                  <MobileCardRow label={t("重置后调整", "Adjustment")} value={`¥${item.postResetAdjustment.toFixed(2)}`} />
                )}
                <MobileCardRow label={t("最后重置", "Last Reset")} value={item.lastResetTime || "-"} />
              </MobileCardCollapsible>
              <MobileCardActions>
                <Button size="sm" variant="outline" className="flex-1 h-8" onClick={() => onOpenManagement(item.vendorName, 'add-withdrawal')}>
                  <Eye className="h-3 w-3 mr-1" />{t("管理", "Manage")}
                </Button>
                {canEditBalance && (
                  <Button size="sm" variant="outline" className="flex-1 h-8 text-destructive" onClick={() => onOpenUndo(item.vendorName)}>
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
      <StickyScrollTableContainer minWidth="1200px">
        <table className="w-full text-sm">
          <thead className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <tr className="bg-muted/50 border-b">
              <SortableTableHead sortKey="vendorName" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("卡商名称", "Vendor Name")}</SortableTableHead>
              <SortableTableHead sortKey="initialBalance" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("初始余额", "Initial Balance")}</SortableTableHead>
              <SortableTableHead
                sortKey="realTimeBalance"
                currentSort={sortConfig}
                onSort={onSort}
                className="whitespace-nowrap bg-emerald-500/15 dark:bg-emerald-400/10 ring-1 ring-inset ring-emerald-500/25"
              >
                {t("实时余额", "Real-time Balance")}
              </SortableTableHead>
              <SortableTableHead sortKey="orderTotal" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("订单总金额", "Order Total")}</SortableTableHead>
              <SortableTableHead sortKey="withdrawalTotal" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("提款总金额", "Withdrawal Total")}</SortableTableHead>
              <SortableTableHead sortKey="postResetAdjustment" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("重置后调整", "Adjustment")}</SortableTableHead>
              <SortableTableHead sortKey="lastResetTime" currentSort={sortConfig} onSort={onSort} className="whitespace-nowrap">{t("最后重置时间", "Last Reset")}</SortableTableHead>
              <th className="text-center p-3 font-medium whitespace-nowrap sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">{t("操作", "Actions")}</th>
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((item) => (
              <tr key={item.vendorName} className="border-b hover:bg-muted/30">
                <td className="p-3 text-center">{resolveVendorName(item.vendorName)}</td>
                <td className="p-3 text-center">¥{item.initialBalance.toFixed(2)}</td>
                <td className={realtimeBalanceTableClasses(item.realTimeBalance)}>¥{item.realTimeBalance.toFixed(2)}</td>
                <td className="p-3 text-center">¥{item.orderTotal.toFixed(2)}</td>
                <td className="p-3 text-center">¥{item.withdrawalTotal.toFixed(2)}</td>
                <td className={`p-3 text-center ${item.postResetAdjustment !== 0 ? 'text-blue-600 dark:text-blue-400 font-medium' : ''}`}>
                  {item.postResetAdjustment !== 0 ? `¥${item.postResetAdjustment.toFixed(2)}` : '-'}
                </td>
                <td className="p-3 text-center">{item.lastResetTime || "-"}</td>
                <td className="p-3 text-center whitespace-nowrap sticky right-0 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.08)]">
                  <div className="flex items-center justify-center gap-1">
                    <Button variant="ghost" size="sm" className="h-7 px-2" onClick={() => onOpenManagement(item.vendorName, 'add-withdrawal')}>
                      <Eye className="h-4 w-4 mr-1" />
                      {t("管理", "Manage")}
                    </Button>
                    {canEditBalance && (
                      <Button variant="ghost" size="sm" className="h-7 px-2 text-destructive hover:text-destructive" onClick={() => onOpenUndo(item.vendorName)}>
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
                <td colSpan={8} className="p-6 text-center text-muted-foreground">
                  {t("暂无卡商数据，请先在商家管理中添加卡商", "No vendor data. Please add vendors in Merchant Management.")}
                </td>
              </tr>
            )}
          </tbody>
          {filteredData.length > 0 && (
            <tfoot className="bg-muted/80 border-t-2 border-primary/20">
              <tr className="font-semibold">
                <td className="p-3 text-center">{t("合计", "Total")}（{filteredData.length}{t("家", " vendors")}）</td>
                <td className="p-3 text-center">
                  ¥{filteredData.reduce((sum, v) => sum + v.initialBalance, 0).toFixed(2)}
                </td>
                <td
                  className={realtimeBalanceTableClasses(
                    filteredData.reduce((sum, v) => sum + v.realTimeBalance, 0),
                  )}
                >
                  ¥{filteredData.reduce((sum, v) => sum + v.realTimeBalance, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center">
                  ¥{filteredData.reduce((sum, v) => sum + v.orderTotal, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center">
                  ¥{filteredData.reduce((sum, v) => sum + v.withdrawalTotal, 0).toFixed(2)}
                </td>
                <td className="p-3 text-center text-blue-600 dark:text-blue-400">
                  {(() => { const total = filteredData.reduce((sum, v) => sum + v.postResetAdjustment, 0); return total !== 0 ? `¥${total.toFixed(2)}` : '-'; })()}
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
