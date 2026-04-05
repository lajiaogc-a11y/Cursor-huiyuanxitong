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
import type { VendorReportData, ReportPaginationControlsProps } from "./reportTypes";
import { formatReportNumber } from "./formatReportNumber";

export interface VendorReportTabProps {
  t: (zh: string, en: string) => string;
  useCompactLayout: boolean;
  isMobile: boolean;
  paginatedVendorData: VendorReportData[];
  sortedVendorDataLength: number;
  vendorPage: number;
  vendorTotalPages: number;
  vendorPageSize: number;
  setVendorPage: (p: number) => void;
  setVendorPageSize: (s: number) => void;
  vendorSummary: {
    orderCount: number;
    cardValueSum: number;
    profitNgn: number;
    profitUsdt: number;
  };
  resolveVendorOrProviderName: (id: string) => string;
  renderPaginationControls: (props: ReportPaginationControlsProps) => ReactNode;
}

export function VendorReportTab({
  t,
  useCompactLayout,
  isMobile,
  paginatedVendorData,
  sortedVendorDataLength,
  vendorPage,
  vendorTotalPages,
  vendorPageSize,
  setVendorPage,
  setVendorPageSize,
  vendorSummary,
  resolveVendorOrProviderName,
  renderPaginationControls,
}: VendorReportTabProps) {
  const fmt = formatReportNumber;

  return (
    <TabsContent value="vendor" className="mt-0 flex flex-col">
      {useCompactLayout ? (
        <MobileCardList>
          {paginatedVendorData.length === 0 ? (
            <MobileEmptyState message={t("暂无数据", "No data")} />
          ) : (
            paginatedVendorData.map((item) => (
              <MobileCard key={item.vendorId} accent="default">
                <MobileCardHeader>
                  <span className="font-medium text-sm">{resolveVendorOrProviderName(item.vendorName)}</span>
                  <Badge variant="outline" className="text-xs">
                    {item.orderCount} {t("单", "orders")}
                  </Badge>
                </MobileCardHeader>
                <MobileCardRow label={t("核销面值总额", "Verified Value")} value={fmt(item.cardValueSum)} highlight />
                <MobileCardRow label={t("利润(NGN/GHS)", "Profit NGN/GHS")} value={fmt(item.profitNgn)} />
                <MobileCardRow label={t("利润(USDT)", "Profit USDT")} value={fmt(item.profitUsdt)} />
              </MobileCard>
            ))
          )}
          <MobilePagination
            currentPage={vendorPage}
            totalPages={vendorTotalPages}
            totalItems={sortedVendorDataLength}
            onPageChange={setVendorPage}
            pageSize={vendorPageSize}
            onPageSizeChange={(s) => {
              setVendorPageSize(s);
              setVendorPage(1);
            }}
          />
        </MobileCardList>
      ) : (
        <StickyScrollTableContainer minWidth="800px">
          <Table className="text-xs">
            <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
              <TableRow>
                <TableHead className="text-center px-1.5">{t("卡商名称", "Vendor")}</TableHead>
                <TableHead className="text-center px-1.5">{t("订单数量", "Orders")}</TableHead>
                <TableHead className="text-center px-1.5">{t("核销面值总额", "Verified Value")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(NGN/GHS)", "Profit NGN/GHS")}</TableHead>
                <TableHead className="text-center px-1.5">{t("利润(USDT)", "Profit USDT")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {paginatedVendorData.map((item) => (
                <TableRow key={item.vendorId}>
                  <TableCell className="text-center font-medium px-1.5">{resolveVendorOrProviderName(item.vendorName)}</TableCell>
                  <TableCell className="text-center px-1.5">{item.orderCount}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.cardValueSum)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitNgn)}</TableCell>
                  <TableCell className="text-center px-1.5">{fmt(item.profitUsdt)}</TableCell>
                </TableRow>
              ))}
              {sortedVendorDataLength === 0 && (
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
                <TableCell className="text-center px-1.5">{vendorSummary.orderCount}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(vendorSummary.cardValueSum)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(vendorSummary.profitNgn)}</TableCell>
                <TableCell className="text-center px-1.5">{fmt(vendorSummary.profitUsdt)}</TableCell>
              </TableRow>
            </TableFooter>
          </Table>
        </StickyScrollTableContainer>
      )}
      {!isMobile &&
        renderPaginationControls({
          currentPage: vendorPage,
          totalPages: vendorTotalPages,
          totalItems: sortedVendorDataLength,
          pageSize: vendorPageSize,
          onPageChange: setVendorPage,
          onPageSizeChange: setVendorPageSize,
        })}
    </TabsContent>
  );
}
