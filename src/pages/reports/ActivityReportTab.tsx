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
import type { ActivityReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface ActivityReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedActivityData: ActivityReportData[];
  sortedActivityDataLength: number;
  activityPage: number;
  activityTotalPages: number;
  activityPageSize: number;
  setActivityPage: (p: number) => void;
  setActivityPageSize: (s: number) => void;
  activitySummary: {
    giftNgn: number;
    giftGhs: number;
    giftUsdt: number;
    giftValueTotal: number;
    effectCount: number;
  };
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function ActivityReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedActivityData,
  sortedActivityDataLength,
  activityPage,
  activityTotalPages,
  activityPageSize,
  setActivityPage,
  setActivityPageSize,
  activitySummary,
  renderPaginationControls,
}: ActivityReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="activity" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedActivityData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedActivityData.map((item, index) => (
              <MobileCard key={index} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{item.date}</span>
                  <Badge variant="outline" className="text-xs">{item.activityTypeLabel}</Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("赠送价值(人)", "Gift Value")} value={fmt(item.giftValueTotal)} highlight />
                <MobileCardRow label={t("赠送效果", "Effect")} value={item.effectCount} />
                <MobileCardCollapsible>
                  <MobileCardRow label={t("赠送奈拉", "Gift NGN")} value={fmt(item.giftNgn)} />
                  <MobileCardRow label={t("赠送赛迪", "Gift GHS")} value={fmt(item.giftGhs)} />
                  <MobileCardRow label={t("赠送USDT", "Gift USDT")} value={fmt(item.giftUsdt)} />
                </MobileCardCollapsible>
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={activityPage}
            totalPages={activityTotalPages}
            totalItems={sortedActivityDataLength}
            onPageChange={setActivityPage}
            pageSize={activityPageSize}
            onPageSizeChange={(s) => {
              setActivityPageSize(s);
              setActivityPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="900px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-center px-1.5">{t("日期", "Date")}</TableHead>
                <TableHead className="text-center px-1.5">{t("活动类型", "Activity Type")}</TableHead>
                <TableHead className="text-center px-1.5">{t("赠送奈拉", "Gift NGN")}</TableHead>
                <TableHead className="text-center px-1.5">{t("赠送赛迪", "Gift GHS")}</TableHead>
                <TableHead className="text-center px-1.5">{t("赠送USDT", "Gift USDT")}</TableHead>
                <TableHead className="text-center px-1.5">{t("赠送价值(人)", "Gift Value")}</TableHead>
                <TableHead className="text-center px-1.5">{t("赠送效果", "Effect Count")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedActivityData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="text-center font-medium px-1.5">{item.date}</TableCell>
                  <TableCell className="text-center px-1.5">{item.activityTypeLabel}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.giftNgn)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.giftGhs)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.giftUsdt)}</TableCell>
                  <TableCell className="text-center font-medium px-1.5">{fmt(item.giftValueTotal)}</TableCell>
                  <TableCell className="text-center font-medium px-1.5">{item.effectCount}</TableCell>
                </TableRow>
              ))}
              {sortedActivityDataLength === 0 && (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-muted-foreground py-8">
                    {t("暂无数据", "No data")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="bg-muted/50 font-semibold">
              <TableRow>
                <TableCell className="text-center px-1.5" colSpan={2}>
                  {t("合计", "Total")}
                </TableCell>
                <TableCell className="text-center px-1.5">{fmt(activitySummary.giftNgn)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(activitySummary.giftGhs)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(activitySummary.giftUsdt)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(activitySummary.giftValueTotal)}</TableCell>
                <TableCell className="text-center px-1.5">{activitySummary.effectCount}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: activityPage,
          totalPages: activityTotalPages,
          totalItems: sortedActivityDataLength,
          pageSize: activityPageSize,
          onPageChange: setActivityPage,
          onPageSizeChange: setActivityPageSize,
        })}
    </TabsContent>
  );
}
