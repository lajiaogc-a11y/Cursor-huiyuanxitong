import type { ReactNode } from "react";
import { TabsContent } from "@/components/ui/tabs";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  TableFooter,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { SortableTableHead, SortConfig } from "@/components/ui/sortable-table-head";
import type { EmployeeProfitData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface EmployeeProfitReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  paginatedEmployeeData: EmployeeProfitData[];
  sortedEmployeeDataLength: number;
  employeePage: number;
  employeeTotalPages: number;
  employeePageSize: number;
  setEmployeePage: (p: number) => void;
  setEmployeePageSize: (s: number) => void;
  employeeSortConfig: SortConfig | undefined;
  requestEmployeeSort: (key: string) => void;
  employeeSummary: {
    orderCount: number;
    profitNgn: number;
    profitUsdt: number;
    errorProfitNgn: number;
    errorProfitUsdt: number;
    activityGiftAmount: number;
    manualGiftAmount: number;
  };
  canEditManualRatio: boolean;
  onManualRatioChange: (employeeId: string, value: string) => void;
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function EmployeeProfitReportTab({
  t,
  useCompactLayout,
  paginatedEmployeeData,
  sortedEmployeeDataLength,
  employeePage,
  employeeTotalPages,
  employeePageSize,
  setEmployeePage,
  setEmployeePageSize,
  employeeSortConfig,
  requestEmployeeSort,
  employeeSummary,
  canEditManualRatio,
  onManualRatioChange,
  renderPaginationControls,
}: EmployeeProfitReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="employee" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedEmployeeData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedEmployeeData.map((item) => (
              <MobileCard key={item.employeeId} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{item.employeeName}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.orderCount} {t("单", "orders")}
                  </Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={fmt(item.profitNgn)} highlight />
                <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={fmt(item.profitUsdt)} highlight />
                <MobileCardCollapsible>
                  <MobileCardRow
                    label={t("错单(NGN/GHS)", "Loss NGN/GHS")}
                    value={<span className="text-destructive">{fmt(item.errorProfitNgn)}</span>}
                  />
                  <MobileCardRow
                    label={t("错单(USDT)", "Loss USDT")}
                    value={<span className="text-destructive">{fmt(item.errorProfitUsdt)}</span>}
                  />
                  <MobileCardRow label={t("活动赠送占比", "Gift Ratio")} value={`${(item.activityGiftRatio * 100).toFixed(2)}%`} />
                  <MobileCardRow label={t("活动赠送金额", "Gift Amount")} value={fmt(item.activityGiftAmount)} />
                  <MobileCardRow label={t("手动设置占比", "Manual Ratio")} value={`${item.manualGiftRatio.toFixed(2)}%`} />
                  <MobileCardRow label={t("承担活动金额", "Manual Amount")} value={fmt(item.manualGiftAmount)} />
                </MobileCardCollapsible>
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={employeePage}
            totalPages={employeeTotalPages}
            totalItems={sortedEmployeeDataLength}
            onPageChange={setEmployeePage}
            pageSize={employeePageSize}
            onPageSizeChange={(s) => {
              setEmployeePageSize(s);
              setEmployeePage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <>
          <StickyScrollTableContainer minWidth="1400px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow>
                  <SortableTableHead sortKey="employeeName" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("员工姓名", "Employee")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="orderCount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("订单总数", "Orders")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="profitNgn" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("利润(NGN/GHS)", "Profit NGN/GHS")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="profitUsdt" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("利润(USDT)", "Profit USDT")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="errorProfitNgn" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("错单(NGN/GHS)", "Loss NGN/GHS")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="errorProfitUsdt" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("错单(USDT)", "Loss USDT")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="activityGiftRatio" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("活动赠送占比", "Gift Ratio")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="activityGiftAmount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("活动赠送金额", "Gift Amount")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="manualGiftRatio" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("手动设置占比", "Manual Ratio")}
                  </SortableTableHead>
                  <SortableTableHead sortKey="manualGiftAmount" currentSort={employeeSortConfig} onSort={requestEmployeeSort} className="text-center px-1.5">
                    {t("承担活动金额", "Manual Amount")}
                  </SortableTableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedEmployeeData.map((item) => (
                  <TableRow key={item.employeeId}>
                    <TableCell className="text-center font-medium px-1.5">{item.employeeName}</TableCell>
                    <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                    <TableCell className="text-center px-1.5">{fmt(item.profitNgn)}</TableCell>
                    <TableCell className="text-center px-1.5">{fmt(item.profitUsdt)}</TableCell>
                    <TableCell className="text-center text-destructive px-1.5">{fmt(item.errorProfitNgn)}</TableCell>
                    <TableCell className="text-center text-destructive px-1.5">{fmt(item.errorProfitUsdt)}</TableCell>
                    <TableCell className="text-center text-primary px-1.5">{(item.activityGiftRatio * 100).toFixed(2)}%</TableCell>
                    <TableCell className="text-center px-1.5">{fmt(item.activityGiftAmount)}</TableCell>
                    <TableCell className="text-center px-1.5">
                      {canEditManualRatio ? (
                        <Input
                          type="number"
                          min={0}
                          max={100}
                          step={0.01}
                          value={item.manualGiftRatio}
                          onChange={(e) => onManualRatioChange(item.employeeId, e.target.value)}
                          className="w-20 h-7 text-center text-xs mx-auto"
                          placeholder="0"
                        />
                      ) : (
                        <span>{item.manualGiftRatio.toFixed(2)}%</span>
                      )}
                    </TableCell>
                    <TableCell className="text-center font-medium px-1.5">{fmt(item.manualGiftAmount)}</TableCell>
                  </TableRow>
                ))}
                {sortedEmployeeDataLength === 0 && (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center text-muted-foreground py-8">
                      {t("暂无数据", "No data")}
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
              <TableFooter className="bg-muted/50 font-semibold">
                <TableRow>
                  <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                  <TableCell className="text-center px-1.5">{employeeSummary.orderCount}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(employeeSummary.profitNgn)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(employeeSummary.profitUsdt)}</TableCell>
                  <TableCell className="text-center text-destructive px-1.5">{fmt(employeeSummary.errorProfitNgn)}</TableCell>
                  <TableCell className="text-center text-destructive px-1.5">{fmt(employeeSummary.errorProfitUsdt)}</TableCell>
                  <TableCell className="text-center px-1.5">-</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(employeeSummary.activityGiftAmount)}</TableCell>
                  <TableCell className="text-center px-1.5">-</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(employeeSummary.manualGiftAmount)}</TableCell>
                </TableRow>
              </TableFooter>
            </Table>
          </StickyScrollTableContainer>
          {renderPaginationControls({
            currentPage: employeePage,
            totalPages: employeeTotalPages,
            totalItems: sortedEmployeeDataLength,
            pageSize: employeePageSize,
            onPageChange: setEmployeePage,
            onPageSizeChange: setEmployeePageSize,
          })}
        </>
      )}
    </TabsContent>
  );
}
