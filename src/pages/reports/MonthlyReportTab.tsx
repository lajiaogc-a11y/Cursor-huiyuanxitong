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
import { Badge } from "@/components/ui/badge";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import type { MonthlyReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface MonthlyReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedMonthlyData: MonthlyReportData[];
  sortedMonthlyDataLength: number;
  monthlyPage: number;
  monthlyTotalPages: number;
  monthlyPageSize: number;
  setMonthlyPage: (p: number) => void;
  setMonthlyPageSize: (s: number) => void;
  monthlySummary: {
    orderCount: number;
    cardValueSum: number;
    paymentValueNgnGhs: number;
    paymentValueUsdt: number;
    activityAmount: number;
    profitNgn: number;
    profitUsdt: number;
    totalProfit: number;
  };
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function MonthlyReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedMonthlyData,
  sortedMonthlyDataLength,
  monthlyPage,
  monthlyTotalPages,
  monthlyPageSize,
  setMonthlyPage,
  setMonthlyPageSize,
  monthlySummary,
  renderPaginationControls,
}: MonthlyReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="monthly" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedMonthlyData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedMonthlyData.map((item, index) => (
              <MobileCard key={index} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{item.month}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.orderCount} {t("单", "orders")}
                  </Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("卡价值总额", "Card Value")} value={fmt(item.cardValueSum)} />
                <MobileCardRow label={t("总利润(人)", "Total Profit")} value={fmt(item.totalProfit)} highlight />
                <MobileCardCollapsible>
                  <MobileCardRow label={t("代付(奈赛)", "Pay NGN/GHS")} value={fmt(item.paymentValueNgnGhs)} />
                  <MobileCardRow label={t("代付(USDT)", "Pay USDT")} value={fmt(item.paymentValueUsdt)} />
                  <MobileCardRow label={t("活动发放", "Activity")} value={fmt(item.activityAmount)} />
                  <MobileCardRow label={t("利润(人)", "Profit NGN")} value={fmt(item.profitNgn)} />
                  <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={fmt(item.profitUsdt)} />
                </MobileCardCollapsible>
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={monthlyPage}
            totalPages={monthlyTotalPages}
            totalItems={sortedMonthlyDataLength}
            onPageChange={setMonthlyPage}
            pageSize={monthlyPageSize}
            onPageSizeChange={(s) => {
              setMonthlyPageSize(s);
              setMonthlyPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="1200px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-center px-1.5">{t("月份", "Month")}</TableHead>
                <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                <TableHead className="text-center px-1.5">{t("卡价值总额", "Card Value")}</TableHead>
                <TableHead className="text-center px-1.5">{t("代付价值（奈赛）总和", "Payment NGN/GHS")}</TableHead>
                <TableHead className="text-center px-1.5">{t("代付价值USDT总和", "Payment USDT")}</TableHead>
                <TableHead className="text-center px-1.5">{t("活动发放", "Activity")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(人)", "Profit NGN/GHS")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
                <TableHead className="text-center px-1.5">{t("总利润(人)", "Total Profit")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedMonthlyData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="text-center font-medium px-1.5">{item.month}</TableCell>
                  <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.cardValueSum)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.paymentValueNgnGhs)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.paymentValueUsdt)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.activityAmount)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitNgn)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitUsdt)}</TableCell>
                  <TableCell className="text-center font-medium px-1.5">{fmt(item.totalProfit)}</TableCell>
                </TableRow>
              ))}
              {sortedMonthlyDataLength === 0 && (
                <TableRow>
                  <TableCell colSpan={9} className="text-center text-muted-foreground py-8">
                    {t("暂无数据", "No data")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="bg-muted/50 font-semibold">
              <TableRow>
                <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                <TableCell className="text-center px-1.5">{monthlySummary.orderCount}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.cardValueSum)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.paymentValueNgnGhs)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.paymentValueUsdt)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.activityAmount)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.profitNgn)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.profitUsdt)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(monthlySummary.totalProfit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: monthlyPage,
          totalPages: monthlyTotalPages,
          totalItems: sortedMonthlyDataLength,
          pageSize: monthlyPageSize,
          onPageChange: setMonthlyPage,
          onPageSizeChange: setMonthlyPageSize,
        })}
    </TabsContent>
  );
}
