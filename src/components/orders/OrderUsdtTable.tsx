// USDT 订单表格 - 从 OrderManagement 提取，不修改业务逻辑
import type { ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { SortableTableHead, type SortConfig } from "@/components/ui/sortable-table-head";
import { MobileCardList, MobileCard, MobileCardGrid, MobileCardGridItem, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { Pencil } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { UsdtOrderRowActions } from "./UsdtOrderRowActions";
import { OrderPagination } from "./OrderPagination";
import type { UsdtOrder } from "@/hooks/useOrders";
import { getDisplayPhone } from "@/lib/phoneMask";

export interface OrderUsdtTableProps {
  orders: UsdtOrder[];
  useCompactLayout: boolean;
  columnVisibility: { isVisible: (key: string) => boolean; visibleColumns: Set<string> };
  sortConfig: SortConfig | null;
  onSort: (key: string) => void;
  onEdit: (order: UsdtOrder) => void;
  onCancel: (dbId: string) => Promise<boolean>;
  onRestore: (dbId: string) => Promise<boolean>;
  onDelete: (dbId: string) => Promise<boolean>;
  canEditCancelButton: boolean;
  canDelete: boolean;
  resolveCardName: (idOrName: string) => string;
  resolveVendorName: (idOrName: string) => string;
  resolveProviderName: (idOrName: string) => string;
  isAdmin: boolean;
  currentPage: number;
  totalPages: number;
  totalCount: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  jumpToPage: string;
  onJumpToPageChange: (v: string) => void;
  onJumpToPage: () => void;
  t: (zh: string, en: string) => string;
}

export function OrderUsdtTable(props: OrderUsdtTableProps) {
  const {
    orders,
    useCompactLayout,
    columnVisibility,
    sortConfig,
    onSort,
    onEdit,
    onCancel,
    onRestore,
    onDelete,
    canEditCancelButton,
    canDelete,
    resolveCardName,
    resolveVendorName,
    resolveProviderName,
    isAdmin,
    currentPage,
    totalPages,
    totalCount,
    pageSize,
    onPageChange,
    jumpToPage,
    onJumpToPageChange,
    onJumpToPage,
    t,
    selectedDbIds,
    onToggleSelectDbId,
    onToggleSelectAllPage,
    batchActionBar,
  } = props;

  if (useCompactLayout) {
    return (
      <MobileCardList>
        {orders.length === 0 ? (
          <MobileEmptyState message={t("暂无USDT订单数据", "No USDT orders")} />
        ) : orders.map((order) => (
          <MobileCard
            key={order.id}
            compact
            accent={order.status === "cancelled" ? "danger" : "success"}
            className={order.status === "cancelled" ? "opacity-60" : ""}
          >
            <div className="flex items-center justify-between gap-1.5">
              <div className="flex items-center gap-1.5 overflow-hidden min-w-0">
                <span className="font-mono text-[11px] text-muted-foreground truncate">{String(order.id || '').slice(0, 8)}</span>
                <span className="text-[10px] text-muted-foreground shrink-0">{String(order.createdAt || '').replace(/^\d{4}\//, '').slice(0, 11)}</span>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                {order.status === "cancelled" ? (
                  <Badge variant="destructive" className="text-[10px] px-1.5 py-0">{t("取消", "Cancelled")}</Badge>
                ) : (
                  <Badge variant="success" className="text-[10px] px-1.5 py-0">{t("完成", "Completed")}</Badge>
                )}
                <TooltipProvider delayDuration={300}>
                  <Tooltip>
                    <TooltipTrigger asChild>
                      <Button size="icon" variant="ghost" className="h-8 w-8 touch-manipulation" onClick={() => onEdit(order)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                    </TooltipTrigger>
                    <TooltipContent side="bottom">{t("编辑", "Edit")}</TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
            </div>
            <MobileCardGrid>
              <MobileCardGridItem label={t("卡类", "Card")} value={resolveCardName(order.cardType)} />
              <MobileCardGridItem label={t("卡值", "Worth")} value={order.cardWorth.toFixed(2)} highlight />
              <MobileCardGridItem label={t("利润", "Profit")} value={order.profit.toFixed(2)} highlight />
              <MobileCardGridItem label={t("利率", "Rate")} value={`${order.profitRate.toFixed(2)}%`} />
            </MobileCardGrid>
            <MobileCardCollapsible>
              <MobileCardRow label={t("面值", "Value")} value={order.cardValue} />
              <MobileCardRow label={t("实付(USDT)", "Paid (USDT)")} value={order.actualPaidUsdt} />
              <MobileCardRow label={t("USDT汇率", "USDT Rate")} value={order.usdtRate} />
              <MobileCardRow label={t("代付值", "Payment")} value={order.paymentValue.toFixed(2)} />
              <MobileCardRow label={t("代付商", "Provider")} value={resolveProviderName(order.paymentProvider)} />
              <MobileCardRow label={t("卡商", "Vendor")} value={resolveVendorName(order.vendor)} />
              <MobileCardRow label={t("电话", "Phone")} value={getDisplayPhone(order.phoneNumber, isAdmin)} />
              <MobileCardRow label={t("会员号", "Code")} value={order.memberCode} />
              <MobileCardRow label={t("币种", "Currency")} value={order.demandCurrency} />
              <MobileCardRow label={t("销售", "Sales")} value={order.salesPerson} />
              {order.remark && <MobileCardRow label={t("备注", "Remark")} value={order.remark} />}
            </MobileCardCollapsible>
          </MobileCard>
        ))}
        <MobilePagination currentPage={currentPage} totalPages={totalPages} totalItems={totalCount} onPageChange={onPageChange} pageSize={pageSize} />
      </MobileCardList>
    );
  }

  const batchEnabled = !!(selectedDbIds && onToggleSelectDbId && onToggleSelectAllPage);
  const pageDbIds = orders.map((o) => o.dbId);
  const selectedOnPageCount = batchEnabled ? pageDbIds.filter((id) => selectedDbIds!.has(id)).length : 0;
  const allPageSelected = batchEnabled && pageDbIds.length > 0 && selectedOnPageCount === pageDbIds.length;
  const somePageSelected = batchEnabled && selectedOnPageCount > 0 && !allPageSelected;
  const emptyColSpan = columnVisibility.visibleColumns.size + (batchEnabled ? 1 : 0);

  return (
    <>
      {batchActionBar}
      <StickyScrollTableContainer minWidth="max-content">
        <Table className="text-xs">
          <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
            <TableRow className="bg-muted/50">
              {batchEnabled && (
                <TableHead className="w-10 px-1 text-center sticky left-0 z-20 bg-muted shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                  <div className="flex justify-center">
                    <Checkbox
                      checked={allPageSelected ? true : somePageSelected ? "indeterminate" : false}
                      onCheckedChange={() => onToggleSelectAllPage!()}
                      aria-label={t("全选本页", "Select page")}
                    />
                  </div>
                </TableHead>
              )}
              {columnVisibility.isVisible('createdAt') && <SortableTableHead sortKey="createdAt" currentSort={sortConfig} onSort={onSort} className="px-2 whitespace-nowrap text-center">{t("创建时间", "Created at")}</SortableTableHead>}
              {columnVisibility.isVisible('id') && <TableHead className="px-2 whitespace-nowrap text-center">{t("订单ID", "Order ID")}</TableHead>}
              {columnVisibility.isVisible('cardType') && <TableHead className="px-2 whitespace-nowrap text-center">{t("卡片类型", "Card Type")}</TableHead>}
              {columnVisibility.isVisible('cardValue') && <SortableTableHead sortKey="cardValue" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("卡面值", "Card Value")}</SortableTableHead>}
              {columnVisibility.isVisible('cardRate') && <SortableTableHead sortKey="cardRate" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("卡汇率", "Card Rate")}</SortableTableHead>}
              {columnVisibility.isVisible('cardWorth') && <SortableTableHead sortKey="cardWorth" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("卡价值", "Card Worth")}</SortableTableHead>}
              {columnVisibility.isVisible('usdtRate') && <SortableTableHead sortKey="usdtRate" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("USDT汇率", "USDT Rate")}</SortableTableHead>}
              {columnVisibility.isVisible('totalValueUsdt') && <SortableTableHead sortKey="totalValueUsdt" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("总价值U", "Total U")}</SortableTableHead>}
              {columnVisibility.isVisible('actualPaidUsdt') && <SortableTableHead sortKey="actualPaidUsdt" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("实付U", "Paid U")}</SortableTableHead>}
              {columnVisibility.isVisible('feeUsdt') && <SortableTableHead sortKey="feeUsdt" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("手续费U", "Fee U")}</SortableTableHead>}
              {columnVisibility.isVisible('paymentValue') && <SortableTableHead sortKey="paymentValue" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("代付价值", "Payment Value")}</SortableTableHead>}
              {columnVisibility.isVisible('profit') && <SortableTableHead sortKey="profit" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("利润", "Profit")}</SortableTableHead>}
              {columnVisibility.isVisible('profitRate') && <SortableTableHead sortKey="profitRate" currentSort={sortConfig} onSort={onSort} className="px-2 text-center whitespace-nowrap">{t("利率", "Rate")}</SortableTableHead>}
              {columnVisibility.isVisible('vendor') && <TableHead className="px-2 whitespace-nowrap text-center">{t("卡商", "Vendor")}</TableHead>}
              {columnVisibility.isVisible('paymentProvider') && <TableHead className="px-2 whitespace-nowrap text-center">{t("代付商家", "Payment Provider")}</TableHead>}
              {columnVisibility.isVisible('phoneNumber') && <TableHead className="px-2 whitespace-nowrap text-center">{t("电话", "Phone")}</TableHead>}
              {columnVisibility.isVisible('memberCode') && <TableHead className="px-2 whitespace-nowrap text-center">{t("会员编号", "Member Code")}</TableHead>}
              {columnVisibility.isVisible('demandCurrency') && <TableHead className="px-2 whitespace-nowrap text-center">{t("币种", "Currency")}</TableHead>}
              {columnVisibility.isVisible('salesPerson') && <TableHead className="px-2 whitespace-nowrap text-center">{t("销售员", "Salesperson")}</TableHead>}
              {columnVisibility.isVisible('remark') && <TableHead className="px-2 whitespace-nowrap text-center max-w-[80px]">{t("备注", "Remark")}</TableHead>}
              {columnVisibility.isVisible('status') && <TableHead className="px-2 whitespace-nowrap text-center">{t("状态", "Status")}</TableHead>}
              {columnVisibility.isVisible('actions') && (
                <TableHead className="px-2 text-center w-[100px] whitespace-nowrap sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                  {t("操作", "Actions")}
                </TableHead>
              )}
            </TableRow>
          </TableHeader>
          <TableBody>
            {orders.length === 0 ? (
              <TableRow>
                <TableCell colSpan={emptyColSpan} className="text-center py-12 text-muted-foreground">
                  {t("暂无USDT订单数据", "No USDT orders")}
                </TableCell>
              </TableRow>
            ) : (
              orders.map((order) => (
                <TableRow key={order.id} className={order.status === "cancelled" ? "bg-muted/30" : ""}>
                  {batchEnabled && (
                    <TableCell className="w-10 px-1 text-center sticky left-0 z-10 bg-background shadow-[4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                      <div className="flex justify-center">
                        <Checkbox
                          checked={selectedDbIds!.has(order.dbId)}
                          onCheckedChange={() => onToggleSelectDbId!(order.dbId)}
                          aria-label={t("选择该行", "Select row")}
                        />
                      </div>
                    </TableCell>
                  )}
                  {columnVisibility.isVisible('createdAt') && <TableCell className="px-2 whitespace-nowrap text-center">{order.createdAt}</TableCell>}
                  {columnVisibility.isVisible('id') && <TableCell className="px-2 font-mono whitespace-nowrap text-center">{order.id}</TableCell>}
                  {columnVisibility.isVisible('cardType') && <TableCell className="px-2 whitespace-nowrap text-center">{resolveCardName(order.cardType)}</TableCell>}
                  {columnVisibility.isVisible('cardValue') && <TableCell className="px-2 text-center whitespace-nowrap">{order.cardValue}</TableCell>}
                  {columnVisibility.isVisible('cardRate') && <TableCell className="px-2 text-center whitespace-nowrap">{order.cardRate}</TableCell>}
                  {columnVisibility.isVisible('cardWorth') && <TableCell className="px-2 text-center font-medium whitespace-nowrap">{order.cardWorth.toFixed(2)}</TableCell>}
                  {columnVisibility.isVisible('usdtRate') && <TableCell className="px-2 text-center whitespace-nowrap">{order.usdtRate.toFixed(4)}</TableCell>}
                  {columnVisibility.isVisible('totalValueUsdt') && <TableCell className="px-2 text-center font-medium whitespace-nowrap">{order.totalValueUsdt.toFixed(2)}</TableCell>}
                  {columnVisibility.isVisible('actualPaidUsdt') && <TableCell className="px-2 text-center whitespace-nowrap">{order.actualPaidUsdt}</TableCell>}
                  {columnVisibility.isVisible('feeUsdt') && <TableCell className="px-2 text-center whitespace-nowrap">{order.feeUsdt}</TableCell>}
                  {columnVisibility.isVisible('paymentValue') && <TableCell className="px-2 text-center whitespace-nowrap">{order.paymentValue.toFixed(2)}</TableCell>}
                  {columnVisibility.isVisible('profit') && <TableCell className="px-2 text-center text-primary font-medium whitespace-nowrap">{order.profit.toFixed(2)}</TableCell>}
                  {columnVisibility.isVisible('profitRate') && (
                    <TableCell className="px-2 text-center whitespace-nowrap">
                      <span className={order.profitRate > 50 ? "text-amber-600 font-bold" : "text-primary"}>
                        {order.profitRate.toFixed(2)}%
                      </span>
                      {order.profitRate > 50 && (
                        <Badge variant="outline" className="ml-1 bg-amber-100 text-amber-700 border-amber-300 text-[8px] px-0.5" title={t("利润率异常过高，请检查数据", "Abnormally high profit rate, please check data")}>
                          ⚠️
                        </Badge>
                      )}
                    </TableCell>
                  )}
                  {columnVisibility.isVisible('vendor') && <TableCell className="px-2 whitespace-nowrap text-center">{resolveVendorName(order.vendor)}</TableCell>}
                  {columnVisibility.isVisible('paymentProvider') && <TableCell className="px-2 whitespace-nowrap text-center">{resolveProviderName(order.paymentProvider)}</TableCell>}
                  {columnVisibility.isVisible('phoneNumber') && <TableCell className="px-2 whitespace-nowrap text-center">{getDisplayPhone(order.phoneNumber, isAdmin)}</TableCell>}
                  {columnVisibility.isVisible('memberCode') && <TableCell className="px-2 whitespace-nowrap text-center"><Badge variant="outline" className="text-[10px] px-1">{order.memberCode}</Badge></TableCell>}
                  {columnVisibility.isVisible('demandCurrency') && <TableCell className="px-2 whitespace-nowrap text-center"><Badge variant="secondary" className="text-[10px] px-1">{order.demandCurrency}</Badge></TableCell>}
                  {columnVisibility.isVisible('salesPerson') && <TableCell className="px-2 whitespace-nowrap text-center">{order.salesPerson}</TableCell>}
                  {columnVisibility.isVisible('remark') && <TableCell className="px-2 max-w-[80px] truncate whitespace-nowrap text-center">{order.remark}</TableCell>}
                  {columnVisibility.isVisible('status') && (
                    <TableCell className="px-2 whitespace-nowrap text-center">
                      {order.status === "cancelled" ? <Badge variant="destructive" className="text-[10px] px-1">{t("已取消", "Cancelled")}</Badge> : <Badge variant="success" className="text-[10px] px-1">{t("已完成", "Completed")}</Badge>}
                    </TableCell>
                  )}
                  {columnVisibility.isVisible('actions') && (
                    <TableCell className="px-2 whitespace-nowrap sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                      <UsdtOrderRowActions
                        order={order}
                        onEdit={onEdit}
                        onCancel={onCancel}
                        onRestore={async (dbId) => { await onRestore(dbId); notify.success(t("USDT订单已恢复", "USDT order restored")); return true; }}
                        onDelete={onDelete}
                        canEditCancelButton={canEditCancelButton}
                        canDelete={canDelete}
                        t={t}
                      />
                    </TableCell>
                  )}
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </StickyScrollTableContainer>
      <OrderPagination
        currentPage={currentPage}
        totalPages={totalPages}
        totalCount={totalCount}
        pageSize={pageSize}
        onPageChange={onPageChange}
        jumpToPage={jumpToPage}
        onJumpToPageChange={onJumpToPageChange}
        onJumpToPage={onJumpToPage}
        t={t}
      />
    </>
  );
}
