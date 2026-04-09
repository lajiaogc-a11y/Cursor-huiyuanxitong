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
import { SortableTableHead, SortConfig } from "@/components/ui/sortable-table-head";
import type { PaymentProviderReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface PaymentProviderReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedProviderData: PaymentProviderReportData[];
  sortedProviderDataLength: number;
  providerPage: number;
  providerTotalPages: number;
  providerPageSize: number;
  setProviderPage: (p: number) => void;
  setProviderPageSize: (s: number) => void;
  providerSortConfig: SortConfig | undefined;
  requestProviderSort: (key: string) => void;
  providerSummary: {
    orderCount: number;
    paymentValueNgnGhs: number;
    paymentValueUsdt: number;
  };
  resolveVendorOrProviderName: (id: string) => string;
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function PaymentProviderReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedProviderData,
  sortedProviderDataLength,
  providerPage,
  providerTotalPages,
  providerPageSize,
  setProviderPage,
  setProviderPageSize,
  providerSortConfig,
  requestProviderSort,
  providerSummary,
  resolveVendorOrProviderName,
  renderPaginationControls,
}: PaymentProviderReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="provider" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedProviderData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedProviderData.map((item) => (
              <MobileCard key={item.providerId} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{resolveVendorOrProviderName(item.providerName)}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.orderCount} {t("单", "orders")}
                  </Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("代付总额(人)", "Payment NGN/GHS")} value={fmt(item.paymentValueNgnGhs)} highlight />
                <MobileCardRow label={t("代付总额(USDT)", "Payment USDT")} value={fmt(item.paymentValueUsdt)} />
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={providerPage}
            totalPages={providerTotalPages}
            totalItems={sortedProviderDataLength}
            onPageChange={setProviderPage}
            pageSize={providerPageSize}
            onPageSizeChange={(s) => {
              setProviderPageSize(s);
              setProviderPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="700px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <SortableTableHead sortKey="providerName" currentSort={providerSortConfig ?? null} onSort={requestProviderSort} className="text-center px-1.5">
                  {t("商家名称", "Provider")}
                </SortableTableHead>
                <SortableTableHead sortKey="orderCount" currentSort={providerSortConfig ?? null} onSort={requestProviderSort} className="text-center px-1.5">
                  {t("订单数量", "Orders")}
                </SortableTableHead>
                <SortableTableHead sortKey="paymentValueNgnGhs" currentSort={providerSortConfig ?? null} onSort={requestProviderSort} className="text-center px-1.5">
                  {t("代付总额(人)", "Payment NGN/GHS")}
                </SortableTableHead>
                <SortableTableHead sortKey="paymentValueUsdt" currentSort={providerSortConfig ?? null} onSort={requestProviderSort} className="text-center px-1.5">
                  {t("代付总额(USDT)", "Payment USDT")}
                </SortableTableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedProviderData.map((item) => (
                <TableRow key={item.providerId}>
                  <TableCell className="text-center font-medium px-1.5">{resolveVendorOrProviderName(item.providerName)}</TableCell>
                  <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.paymentValueNgnGhs)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.paymentValueUsdt)}</TableCell>
                </TableRow>
              ))}
              {sortedProviderDataLength === 0 && (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                    {t("暂无数据", "No data")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
            <TableFooter className="bg-muted/50 font-semibold">
              <TableRow>
                <TableCell className="text-center px-1.5">{t("合计", "Total")}</TableCell>
                <TableCell className="text-center px-1.5">{providerSummary.orderCount}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(providerSummary.paymentValueNgnGhs)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(providerSummary.paymentValueUsdt)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: providerPage,
          totalPages: providerTotalPages,
          totalItems: sortedProviderDataLength,
          pageSize: providerPageSize,
          onPageChange: setProviderPage,
          onPageSizeChange: setProviderPageSize,
        })}
    </TabsContent>
  );
}
