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
import type { DailyReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface DailyReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedDailyData: DailyReportData[];
  sortedDailyDataLength: number;
  dailyPage: number;
  dailyTotalPages: number;
  dailyPageSize: number;
  setDailyPage: (p: number) => void;
  setDailyPageSize: (s: number) => void;
  dailySummary: {
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

export function DailyReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedDailyData,
  sortedDailyDataLength,
  dailyPage,
  dailyTotalPages,
  dailyPageSize,
  setDailyPage,
  setDailyPageSize,
  dailySummary,
  renderPaginationControls,
}: DailyReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="daily" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedDailyData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedDailyData.map((item, index) => (
              <MobileCard key={index} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{item.date}</span>
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
            currentPage={dailyPage}
            totalPages={dailyTotalPages}
            totalItems={sortedDailyDataLength}
            onPageChange={setDailyPage}
            pageSize={dailyPageSize}
            onPageSizeChange={(s) => {
              setDailyPageSize(s);
              setDailyPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="1200px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-center px-1.5">{t("日期", "Date")}</TableHead>
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
              {paginatedDailyData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="text-center font-medium px-1.5">{item.date}</TableCell>
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
              {sortedDailyDataLength === 0 && (
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
                <TableCell className="text-center px-1.5">{dailySummary.orderCount}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.cardValueSum)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.paymentValueNgnGhs)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.paymentValueUsdt)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.activityAmount)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.profitNgn)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.profitUsdt)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(dailySummary.totalProfit)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: dailyPage,
          totalPages: dailyTotalPages,
          totalItems: sortedDailyDataLength,
          pageSize: dailyPageSize,
          onPageChange: setDailyPage,
          onPageSizeChange: setDailyPageSize,
        })}
    </TabsContent>
  );
}
