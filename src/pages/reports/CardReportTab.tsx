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
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import type { CardReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface CardReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedCardData: CardReportData[];
  sortedCardDataLength: number;
  cardPage: number;
  cardTotalPages: number;
  cardPageSize: number;
  setCardPage: (p: number) => void;
  setCardPageSize: (s: number) => void;
  cardSummary: {
    orderCount: number;
    cardValueSum: number;
    profitNgn: number;
    profitUsdt: number;
  };
  resolveCardName: (id: string) => string;
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function CardReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedCardData,
  sortedCardDataLength,
  cardPage,
  cardTotalPages,
  cardPageSize,
  setCardPage,
  setCardPageSize,
  cardSummary,
  resolveCardName,
  renderPaginationControls,
}: CardReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="card" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedCardData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedCardData.map((item, index) => (
              <MobileCard key={index} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{resolveCardName(item.cardType)}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.orderCount} {t("单", "orders")}
                  </Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("卡价值总额", "Card Value")} value={fmt(item.cardValueSum)} highlight />
                <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={fmt(item.profitNgn)} />
                <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={fmt(item.profitUsdt)} />
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={cardPage}
            totalPages={cardTotalPages}
            totalItems={sortedCardDataLength}
            onPageChange={setCardPage}
            pageSize={cardPageSize}
            onPageSizeChange={(s) => {
              setCardPageSize(s);
              setCardPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="800px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-center px-1.5">{t("卡片类型", "Card Type")}</TableHead>
                <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                <TableHead className="text-center px-1.5">{t("卡价值总额", "Card Value")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(NGN/GHS)", "Profit NGN/GHS")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedCardData.map((item, index) => (
                <TableRow key={index}>
                  <TableCell className="text-center font-medium px-1.5">{resolveCardName(item.cardType)}</TableCell>
                  <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.cardValueSum)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitNgn)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitUsdt)}</TableCell>
                </TableRow>
              ))}
              {sortedCardDataLength === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("暂无数据", "No data")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="bg-muted/50 font-semibold">
              <TableRow>
                <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                <TableCell className="text-center px-1.5">{cardSummary.orderCount}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(cardSummary.cardValueSum)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(cardSummary.profitNgn)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(cardSummary.profitUsdt)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: cardPage,
          totalPages: cardTotalPages,
          totalItems: sortedCardDataLength,
          pageSize: cardPageSize,
          onPageChange: setCardPage,
          onPageSizeChange: setCardPageSize,
        })}
    </TabsContent>
  );
}
