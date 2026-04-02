import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { toast } from "sonner";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import {
  listMyPointsMallRedemptionOrders,
  processMyPointsMallRedemptionOrder,
  type PointsMallRedemptionOrder,
} from "@/services/members/memberPointsMallService";

function formatBeijingTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  } catch {
    return iso;
  }
}

export interface OrderMallRedemptionsSectionProps {
  tenantId: string | null;
  searchTerm: string;
  isActive: boolean;
  isMobile: boolean;
  /** 与顶部「刷新」联动，变化时重新拉取列表 */
  refreshNonce?: number;
  t: (zh: string, en: string) => string;
}

export function OrderMallRedemptionsSection({
  tenantId,
  searchTerm,
  isActive,
  isMobile,
  refreshNonce = 0,
  t,
}: OrderMallRedemptionsSectionProps) {
  const [orders, setOrders] = useState<PointsMallRedemptionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmCompleteId, setConfirmCompleteId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!tenantId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listMyPointsMallRedemptionOrders(undefined, 500, tenantId);
      setOrders(list);
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "商城订单加载失败", "Failed to load mall orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    if (isActive && tenantId) void load();
  }, [isActive, tenantId, load, refreshNonce]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    if (!q) return orders;
    return orders.filter((o) => {
      const hay = [
        o.item_title,
        o.member_code,
        o.member_phone,
        o.handler_name,
        o.id,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [orders, searchTerm]);

  const processOne = async (orderId: string, action: "complete" | "reject") => {
    setProcessingId(orderId);
    try {
      await processMyPointsMallRedemptionOrder(orderId, action);
      toast.success(
        action === "complete"
          ? t("订单已标记完成", "Order marked as completed")
          : t("订单已驳回并已退回积分", "Order rejected and points refunded"),
      );
      await load();
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "订单处理失败", "Order processing failed");
    } finally {
      setProcessingId(null);
    }
  };

  if (!tenantId) {
    return (
      <p className="text-sm text-muted-foreground py-6 text-center">
        {t("请选择租户后查看商城订单。", "Select a tenant to view mall orders.")}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <Button type="button" variant="outline" size="sm" className="h-8 gap-1 text-xs" onClick={() => void load()} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
          {t("刷新", "Refresh")}
        </Button>
      </div>

      {loading && orders.length === 0 ? (
        <div className="flex justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          {t("暂无商城兑换订单。", "No mall redemption orders.")}
        </p>
      ) : isMobile ? (
        <div className="flex flex-col gap-3">
          {filtered.map((o) => (
            <div
              key={o.id}
              className="rounded-lg border bg-card p-3 text-sm shadow-sm"
            >
              <div className="flex items-start gap-2">
                {String(o.item_image_url || "").trim() ? (
                  <ResolvableMediaThumb
                    idKey={`mall-ord-m-${o.id}`}
                    url={o.item_image_url}
                    frameClassName="h-10 w-10 shrink-0 rounded-md"
                    imgClassName="border object-cover"
                  />
                ) : (
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-md border bg-muted/40 text-[10px] text-muted-foreground">
                    —
                  </div>
                )}
                <div className="min-w-0 flex-1">
                  <div className="font-medium truncate">{o.item_title}</div>
                  <div className="mt-1 text-xs text-muted-foreground space-y-0.5">
                    <div>
                      {t("电话", "Phone")}: {o.member_phone?.trim() || "—"}
                    </div>
                    <div>
                      {t("会员编号", "Member code")}: {o.member_code?.trim() || "—"}
                    </div>
                    <div>
                      {t("经手人", "Handler")}: {o.handler_name?.trim() || "—"}
                    </div>
                  </div>
                </div>
                <Badge variant={o.status === "pending" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
                  {o.status === "pending"
                    ? t("待处理", "Pending")
                    : o.status === "completed"
                      ? t("已完成", "Completed")
                      : o.status === "rejected"
                        ? t("已驳回", "Rejected")
                        : o.status}
                </Badge>
              </div>
              <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-muted-foreground">
                <span>
                  {t("数量", "Qty")}: {o.quantity}
                </span>
                <span>
                  {t("积分", "Pts")}: {o.points_used}
                </span>
                <span>{formatBeijingTime(o.created_at)}</span>
              </div>
              {o.status === "pending" && (
                <div className="mt-2 flex gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="h-8 flex-1 text-xs"
                    disabled={processingId === o.id}
                    onClick={() => setConfirmRejectId(o.id)}
                  >
                    {t("驳回", "Reject")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    className="h-8 flex-1 text-xs"
                    disabled={processingId === o.id}
                    onClick={() => setConfirmCompleteId(o.id)}
                  >
                    {t("完成", "Complete")}
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="rounded-lg border bg-card overflow-x-auto">
          <Table className="min-w-[980px] text-xs">
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-14">{t("图", "Img")}</TableHead>
                <TableHead>{t("商品", "Item")}</TableHead>
                <TableHead className="whitespace-nowrap min-w-[108px]">{t("电话号码", "Phone")}</TableHead>
                <TableHead className="whitespace-nowrap">{t("会员编号", "Member code")}</TableHead>
                <TableHead className="w-14">{t("数量", "Qty")}</TableHead>
                <TableHead className="w-20">{t("积分", "Pts")}</TableHead>
                <TableHead className="w-24">{t("状态", "Status")}</TableHead>
                <TableHead className="min-w-[132px]">{t("时间", "Time")}</TableHead>
                <TableHead className="min-w-[100px]">{t("经手人", "Handler")}</TableHead>
                <TableHead className="w-[140px] text-right">{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((o) => (
                <TableRow key={o.id}>
                  <TableCell>
                    {String(o.item_image_url || "").trim() ? (
                      <ResolvableMediaThumb
                        idKey={`mall-ord-t-${o.id}`}
                        url={o.item_image_url}
                        frameClassName="h-10 w-10 shrink-0 rounded-md"
                        imgClassName="border object-cover"
                      />
                    ) : (
                      <div className="grid h-10 w-10 place-items-center rounded-md border bg-muted/40 text-[10px] text-muted-foreground">
                        —
                      </div>
                    )}
                  </TableCell>
                  <TableCell className="font-medium max-w-[200px] truncate" title={o.item_title}>
                    {o.item_title}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] whitespace-nowrap">
                    {o.member_phone?.trim() || "—"}
                  </TableCell>
                  <TableCell className="font-mono text-[11px] whitespace-nowrap">
                    {o.member_code?.trim() || "—"}
                  </TableCell>
                  <TableCell>{o.quantity}</TableCell>
                  <TableCell>{o.points_used}</TableCell>
                  <TableCell>
                    <Badge variant={o.status === "pending" ? "secondary" : "outline"} className="text-[10px]">
                      {o.status === "pending"
                        ? t("待处理", "Pending")
                        : o.status === "completed"
                          ? t("已完成", "Completed")
                          : o.status === "rejected"
                            ? t("已驳回", "Rejected")
                            : o.status}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap">
                    {formatBeijingTime(o.created_at)}
                  </TableCell>
                  <TableCell className="text-muted-foreground whitespace-nowrap max-w-[140px] truncate" title={o.handler_name || ""}>
                    {o.handler_name?.trim() || "—"}
                  </TableCell>
                  <TableCell className="text-right">
                    {o.status === "pending" ? (
                      <div className="flex justify-end gap-1 flex-wrap">
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="h-7 text-[10px] px-2"
                          disabled={processingId === o.id}
                          onClick={() => setConfirmRejectId(o.id)}
                        >
                          {t("驳回", "Reject")}
                        </Button>
                        <Button
                          type="button"
                          size="sm"
                          className="h-7 text-[10px] px-2"
                          disabled={processingId === o.id}
                          onClick={() => setConfirmCompleteId(o.id)}
                        >
                          {t("完成", "Complete")}
                        </Button>
                      </div>
                    ) : (
                      <span className="text-muted-foreground">—</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      <AlertDialog open={!!confirmCompleteId} onOpenChange={(open) => !open && setConfirmCompleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("标记该兑换为已完成？", "Mark this redemption as completed?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("完成后订单将结束流程，请确认已向会员履约。", "The order will be closed; confirm fulfillment to the member.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirmCompleteId;
                setConfirmCompleteId(null);
                if (id) void processOne(id, "complete");
              }}
            >
              {t("完成", "Complete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRejectId} onOpenChange={(open) => !open && setConfirmRejectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("驳回该兑换订单？", "Reject this redemption order?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("驳回后会员已扣积分将退回，确定继续？", "Member points will be refunded. Continue?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = confirmRejectId;
                setConfirmRejectId(null);
                if (id) void processOne(id, "reject");
              }}
            >
              {t("驳回", "Reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
