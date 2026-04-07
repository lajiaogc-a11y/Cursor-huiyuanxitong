import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { StickyScrollTableContainer } from "@/components/ui/sticky-scroll-table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Edit, Trash2 } from "lucide-react";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileCardCollapsible, MobileCardActions, MobilePagination, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { getDisplayPhone } from "@/lib/phoneMask";
import { formatDisplayGiftNumber } from "@/lib/giftNumber";
import type { Dispatch, SetStateAction } from "react";
import type { ActivityRecord } from "./activityGiftsData";
import { PAGE_SIZE_OPTIONS } from "./activityGiftsData";
import { formatStaffPointsRedemptionRemarkForUi } from "@/lib/staffActivityGiftRemarkDisplay";

export interface ActivityGiftsTabContentProps {
  useCompactLayout: boolean;
  paginatedRecords: ActivityRecord[];
  filteredRecords: ActivityRecord[];
  currentPage: number;
  totalPages: number;
  pageSize: number;
  setPageSize: (n: number) => void;
  setCurrentPage: Dispatch<SetStateAction<number>>;
  isAdmin: boolean;
  t: (zh: string, en: string) => string;
  resolvePaymentProviderName: (name: string) => string;
  resolveActivityTypeLabel: (code: string) => string;
  onEdit: (record: ActivityRecord) => void;
  onDeleteClick: (record: ActivityRecord) => void;
}

export default function ActivityGiftsTabContent({
  useCompactLayout,
  paginatedRecords,
  filteredRecords,
  currentPage,
  totalPages,
  pageSize,
  setPageSize,
  setCurrentPage,
  isAdmin,
  t,
  resolvePaymentProviderName,
  resolveActivityTypeLabel,
  onEdit,
  onDeleteClick,
}: ActivityGiftsTabContentProps) {
  return (
    <Card className="flex-1 min-h-0 flex flex-col">
      <CardContent className="pt-4 flex-1 min-h-0 flex flex-col">
        {useCompactLayout ? (
          <>
            <MobileCardList>
              {paginatedRecords.length === 0 ? (
                <MobileEmptyState message={t("暂无活动赠送数据", "No activity gift data")} />
              ) : (
                paginatedRecords.map((record) => (
                  <MobileCard key={record.id} accent="default">
                    <MobileCardHeader>
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary">{record.currency}</Badge>
                        <span className="font-semibold">{record.amount}</span>
                      </div>
                      <span className="text-xs text-muted-foreground">{record.time}</span>
                    </MobileCardHeader>
                    <MobileCardRow label={t("赠送编号", "Gift ID")} value={formatDisplayGiftNumber(record.giftNumber, record.id)} />
                    <MobileCardRow label={t("电话号码", "Phone")} value={getDisplayPhone(record.phone, isAdmin)} />
                    <MobileCardRow label={t("代付商家", "Agent")} value={resolvePaymentProviderName(record.paymentAgent)} />
                    <MobileCardRow label={t("赠送价值", "Gift Value")} value={record.giftValue.toFixed(2)} highlight />
                    <MobileCardCollapsible>
                      <MobileCardRow label={t("汇率", "Rate")} value={record.rate} />
                      <MobileCardRow label={t("手续费", "Fee")} value={record.fee} />
                      <MobileCardRow
                        label={t("类型", "Type")}
                        value={
                          record.giftType
                            ? record.giftType === "activity_1"
                              ? "活动1兑换"
                              : record.giftType === "activity_2"
                                ? "活动2兑换"
                                : resolveActivityTypeLabel(record.giftType)
                            : "-"
                        }
                      />
                      <MobileCardRow
                        label={t("备注", "Remark")}
                        value={formatStaffPointsRedemptionRemarkForUi(record.remark, t) || "-"}
                      />
                      <MobileCardRow label={t("录入人", "Recorder")} value={record.recorder} />
                    </MobileCardCollapsible>
                    <MobileCardActions>
                      <Button variant="ghost" size="sm" className="h-9 flex-1 touch-manipulation" onClick={() => onEdit(record)}>
                        <Edit className="h-4 w-4 mr-1" />
                        {t("编辑", "Edit")}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-9 flex-1 touch-manipulation text-destructive hover:text-destructive"
                        onClick={() => onDeleteClick(record)}
                      >
                        <Trash2 className="h-4 w-4 mr-1" />
                        {t("删除", "Delete")}
                      </Button>
                    </MobileCardActions>
                  </MobileCard>
                ))
              )}
              <MobilePagination
                currentPage={currentPage}
                totalPages={totalPages}
                totalItems={filteredRecords.length}
                onPageChange={setCurrentPage}
                pageSize={pageSize}
                onPageSizeChange={setPageSize}
              />
            </MobileCardList>
          </>
        ) : (
          <StickyScrollTableContainer minWidth="1400px">
            <Table className="text-xs">
              <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[60px] text-center px-1.5">{t("排序", "Order")}</TableHead>
                  <TableHead className="w-[110px] text-center px-1.5 font-mono">{t("赠送编号", "Gift ID")}</TableHead>
                  <TableHead className="w-[160px] text-center px-1.5">{t("录入时间", "Time")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("赠送币种", "Currency")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("赠送金额", "Amount")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("汇率", "Rate")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("电话号码", "Phone")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("代付商家", "Agent")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("类型", "Type")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("手续费", "Fee")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("赠送价值", "Gift Value")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("备注", "Remark")}</TableHead>
                  <TableHead className="text-center px-1.5">{t("录入人", "Recorder")}</TableHead>
                  <TableHead className="w-[100px] text-center px-1.5">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {paginatedRecords.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={14} className="text-center py-12 text-muted-foreground">
                      {t("暂无活动赠送数据", "No activity gift data")}
                    </TableCell>
                  </TableRow>
                ) : (
                  paginatedRecords.map((record) => (
                    <TableRow key={record.id}>
                      <TableCell className="text-center px-1.5">{record.order}</TableCell>
                      <TableCell className="text-center px-1.5 font-mono text-muted-foreground text-xs">
                        {formatDisplayGiftNumber(record.giftNumber, record.id)}
                      </TableCell>
                      <TableCell className="text-center px-1.5">{record.time}</TableCell>
                      <TableCell className="text-center px-1.5">
                        <Badge variant="secondary">{record.currency}</Badge>
                      </TableCell>
                      <TableCell className="text-center px-1.5">{record.amount}</TableCell>
                      <TableCell className="text-center px-1.5">{record.rate}</TableCell>
                      <TableCell className="text-center px-1.5">{getDisplayPhone(record.phone, isAdmin)}</TableCell>
                      <TableCell className="text-center px-1.5">{resolvePaymentProviderName(record.paymentAgent)}</TableCell>
                      <TableCell className="text-center px-1.5">
                        {record.giftType && (
                          <Badge variant="outline">
                            {record.giftType === "activity_1"
                              ? "活动1兑换"
                              : record.giftType === "activity_2"
                                ? "活动2兑换"
                                : resolveActivityTypeLabel(record.giftType)}
                          </Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-center px-1.5">{record.fee}</TableCell>
                      <TableCell className="text-center px-1.5">{record.giftValue.toFixed(2)}</TableCell>
                      <TableCell className="text-muted-foreground max-w-[150px] truncate text-center px-1.5">
                        {formatStaffPointsRedemptionRemarkForUi(record.remark, t) || "—"}
                      </TableCell>
                      <TableCell className="text-center px-1.5">{record.recorder}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-9 w-9 touch-manipulation" onClick={() => onEdit(record)} aria-label="Edit">
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-9 w-9 touch-manipulation text-destructive hover:text-destructive"
                            onClick={() => onDeleteClick(record)}
                            aria-label="Delete"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </StickyScrollTableContainer>
        )}

        {!useCompactLayout && filteredRecords.length > 0 && (
          <div className="flex items-center justify-between mt-4">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>{t("每页显示", "Per page")}</span>
              <Select value={pageSize.toString()} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={size.toString()}>
                      {size}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <span>{t("条", "items")}</span>
              <span className="ml-4">
                {t("共", "Total")} {filteredRecords.length} {t("条记录", "records")}
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.max(1, p - 1))} disabled={currentPage === 1}>
                {t("上一页", "Previous")}
              </Button>
              <span className="text-sm text-muted-foreground px-2">
                {currentPage} / {totalPages || 1}
              </span>
              <Button variant="outline" size="sm" onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))} disabled={currentPage >= totalPages}>
                {t("下一页", "Next")}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
