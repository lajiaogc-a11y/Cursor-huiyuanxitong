import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Loader2, RotateCcw, Building2, Eye, EyeOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
  MobileCardList,
  MobileCard,
  MobileCardGrid,
  MobileCardGridItem,
  MobileCardRow,
  MobileCardCollapsible,
  MobilePagination,
} from "@/components/ui/mobile-data-card";
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
import { notify } from "@/lib/notifyHub";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { notifyDataMutation } from "@/services/system/dataRefreshManager";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import {
  listMyPointsMallRedemptionOrders,
  processMyPointsMallRedemptionOrder,
  type PointsMallRedemptionOrder,
} from "@/services/members/memberPointsMallService";
import { verifyCurrentUserPasswordApi } from "@/services/auth/authApiService";
import { OrderPagination } from "./OrderPagination";
import { cn } from "@/lib/utils";

const PAGE_SIZE = 50;

export type MallOrderStatusFilter = "all" | "pending" | "completed" | "rejected" | "cancelled";

function formatBeijingTime(iso: string): string {
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return iso;
    return d.toLocaleString("zh-CN", { timeZone: "Asia/Shanghai", hour12: false });
  } catch {
    return iso;
  }
}

/** 接口可能返回 number（如 BIGINT 手机号）；禁止直接 .trim() */
function displayStr(v: unknown, empty: string): string {
  if (v == null) return empty;
  const s = String(v).trim();
  return s.length > 0 ? s : empty;
}

function normalizeDigits(s: string): string {
  return s.replace(/\D/g, "");
}

/** 支持多关键词（空格分隔）、手机号仅数字匹配 */
function matchesMallSearch(o: PointsMallRedemptionOrder, qRaw: string): boolean {
  const q = qRaw.trim().toLowerCase();
  if (!q) return true;
  const tokens = q.split(/\s+/).filter(Boolean);
  const parts = [o.item_title, o.member_code, o.member_phone, o.handler_name, o.id].map((x) =>
    x == null ? "" : String(x),
  );
  const hay = parts.join(" ").toLowerCase();
  const hayDigits = normalizeDigits(parts.join(""));
  return tokens.every((tok) => {
    const tl = tok.toLowerCase();
    if (hay.includes(tl)) return true;
    const dTok = normalizeDigits(tok);
    if (dTok.length >= 3 && hayDigits.includes(dTok)) return true;
    return false;
  });
}

export interface OrderMallRedemptionsSectionProps {
  tenantId: string | null;
  searchTerm: string;
  /** 与顶部状态筛选一致，会传给列表接口 */
  statusFilter: MallOrderStatusFilter;
  isActive: boolean;
  isMobile: boolean;
  /** 与顶部「刷新」联动，变化时重新拉取列表 */
  refreshNonce?: number;
  /** 外部跳转高亮某条兑换（如右下角通知「前往订单」） */
  highlightRedemptionId?: string | null;
  /** 是否允许当前员工完成/驳回订单（角色校验） */
  canProcessOrders?: boolean;
  t: (zh: string, en: string) => string;
}

export function OrderMallRedemptionsSection({
  tenantId,
  searchTerm,
  statusFilter,
  isActive,
  isMobile,
  refreshNonce = 0,
  highlightRedemptionId = null,
  canProcessOrders = false,
  t,
}: OrderMallRedemptionsSectionProps) {
  const [orders, setOrders] = useState<PointsMallRedemptionOrder[]>([]);
  const [loading, setLoading] = useState(false);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [confirmCompleteId, setConfirmCompleteId] = useState<string | null>(null);
  const [confirmRejectId, setConfirmRejectId] = useState<string | null>(null);
  const [confirmCancelId, setConfirmCancelId] = useState<string | null>(null);
  const [cancelPassword, setCancelPassword] = useState("");
  const [cancelPasswordVisible, setCancelPasswordVisible] = useState(false);
  const [cancelVerifying, setCancelVerifying] = useState(false);
  const [cancelAuthError, setCancelAuthError] = useState("");
  const cancelPasswordRef = useRef<HTMLInputElement>(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [jumpToPage, setJumpToPage] = useState("");

  const load = useCallback(async () => {
    if (!tenantId) {
      setOrders([]);
      return;
    }
    setLoading(true);
    try {
      const list = await listMyPointsMallRedemptionOrders(
        statusFilter === "all" ? undefined : statusFilter,
        500,
        tenantId,
      );
      setOrders(list);
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "商城订单加载失败", "Failed to load mall orders");
      setOrders([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, t, statusFilter]);

  useEffect(() => {
    if (isActive && tenantId) void load();
  }, [isActive, tenantId, load, refreshNonce]);

  const filtered = useMemo(() => {
    return orders.filter((o) => matchesMallSearch(o, searchTerm));
  }, [orders, searchTerm]);

  const totalCount = filtered.length;
  const totalPages = useMemo(() => Math.max(1, Math.ceil(totalCount / PAGE_SIZE)), [totalCount]);

  useEffect(() => {
    setCurrentPage(1);
    setJumpToPage("");
  }, [searchTerm, statusFilter]);

  useEffect(() => {
    if (currentPage > totalPages) setCurrentPage(totalPages);
  }, [currentPage, totalPages]);

  const safePage = Math.min(currentPage, totalPages);
  const pageRows = useMemo(
    () => filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE),
    [filtered, safePage],
  );

  useEffect(() => {
    const id = highlightRedemptionId?.trim();
    if (!id || !isActive) return;
    const idx = filtered.findIndex((o) => o.id === id);
    if (idx >= 0) {
      const targetPage = Math.floor(idx / PAGE_SIZE) + 1;
      setCurrentPage(targetPage);
    }
  }, [highlightRedemptionId, isActive, filtered]);

  useEffect(() => {
    const id = highlightRedemptionId?.trim();
    if (!id || !isActive) return;
    const tmr = window.setTimeout(() => {
      const el = document.getElementById(`mall-rdm-row-${id}`);
      el?.scrollIntoView({ behavior: "smooth", block: "center" });
    }, 400);
    return () => window.clearTimeout(tmr);
  }, [highlightRedemptionId, isActive, pageRows]);

  const handleJumpToPage = () => {
    const page = parseInt(jumpToPage, 10);
    if (!isNaN(page) && page >= 1 && page <= totalPages) {
      setCurrentPage(page);
      setJumpToPage("");
    }
  };

  const processOne = async (orderId: string, action: "complete" | "reject" | "cancel") => {
    setProcessingId(orderId);
    try {
      await processMyPointsMallRedemptionOrder(orderId, action);
      notify.success(
        action === "complete"
          ? t("订单已标记完成", "Order marked as completed")
          : action === "cancel"
            ? t("订单已取消，积分与库存已回流", "Order cancelled, points and stock restored")
            : t("订单已驳回并已退回积分", "Order rejected and points refunded"),
      );
      await load();
      notifyDataMutation({ table: 'points_ledger', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'points_accounts', operation: 'UPDATE', source: 'manual' }).catch(console.error);
      notifyDataMutation({ table: 'redemptions', operation: 'UPDATE', source: 'manual' }).catch(console.error);
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "订单处理失败", "Order processing failed");
    } finally {
      setProcessingId(null);
    }
  };

  const handleCancelConfirm = async () => {
    const orderId = confirmCancelId;
    if (!orderId || !cancelPassword.trim()) return;
    setCancelVerifying(true);
    setCancelAuthError("");
    try {
      const valid = await verifyCurrentUserPasswordApi(cancelPassword);
      if (!valid) {
        setCancelAuthError(t("密码验证失败，请重新输入", "Password verification failed, please try again"));
        setCancelVerifying(false);
        return;
      }
    } catch {
      setCancelAuthError(t("密码验证失败", "Password verification failed"));
      setCancelVerifying(false);
      return;
    }
    setConfirmCancelId(null);
    setCancelPassword("");
    setCancelPasswordVisible(false);
    setCancelVerifying(false);
    setCancelAuthError("");
    await processOne(orderId, "cancel");
  };

  const openCancelDialog = (orderId: string) => {
    setCancelPassword("");
    setCancelPasswordVisible(false);
    setCancelAuthError("");
    setConfirmCancelId(orderId);
    setTimeout(() => cancelPasswordRef.current?.focus(), 100);
  };

  const statusBadge = (o: PointsMallRedemptionOrder) => (
    <Badge variant={o.status === "pending" ? "secondary" : "outline"} className="shrink-0 text-[10px]">
      {o.status === "pending"
        ? t("待处理", "Pending")
        : o.status === "completed"
          ? t("已完成", "Completed")
          : o.status === "rejected"
            ? t("已驳回", "Rejected")
            : o.status === "cancelled"
              ? t("已取消", "Cancelled")
              : o.status}
    </Badge>
  );

  if (!tenantId) {
    return (
      <div className="flex flex-col items-center justify-center gap-3 py-16 text-center">
        <div className="rounded-full bg-muted p-3">
          <Building2 className="h-8 w-8 text-muted-foreground/60" />
        </div>
        <div className="space-y-1">
          <p className="text-sm font-medium text-foreground">
            {t("未选择租户", "No tenant selected")}
          </p>
          <p className="text-xs text-muted-foreground max-w-[280px]">
            {t(
              "请在页面顶部的租户切换器中选择一个租户，即可查看该租户的商城兑换订单。",
              "Select a tenant from the tenant switcher at the top of the page to view their mall redemption orders.",
            )}
          </p>
        </div>
      </div>
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
      ) : orders.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          {t("暂无商城兑换订单。", "No mall redemption orders.")}
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          {t("无匹配的商城订单，请调整搜索或状态筛选。", "No mall orders match. Adjust search or status.")}
        </p>
      ) : isMobile ? (
        <>
          <MobileCardList>
            {pageRows.map((o) => (
              <MobileCard
                key={o.id}
                id={`mall-rdm-row-${o.id}`}
                className={cn(
                  highlightRedemptionId === o.id && "ring-2 ring-primary ring-offset-2 ring-offset-background",
                )}
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
                    <div className="font-medium text-sm truncate">{o.item_title}</div>
                    <div className="mt-1 flex flex-wrap items-center gap-2">{statusBadge(o)}</div>
                  </div>
                </div>
                <MobileCardGrid cols={2}>
                  <MobileCardGridItem label={t("电话", "Phone")} value={displayStr(o.member_phone, "—")} />
                  <MobileCardGridItem label={t("会员编号", "Member code")} value={displayStr(o.member_code, "—")} />
                  <MobileCardGridItem label={t("数量", "Qty")} value={String(o.quantity)} />
                  <MobileCardGridItem label={t("积分", "Pts")} value={String(o.points_used)} highlight />
                </MobileCardGrid>
                <MobileCardCollapsible>
                  <MobileCardRow label={t("时间", "Time")} value={formatBeijingTime(o.created_at)} />
                  <MobileCardRow label={t("经手人", "Handler")} value={displayStr(o.handler_name, "—")} />
                </MobileCardCollapsible>
                {o.status === "pending" && canProcessOrders && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 text-xs touch-manipulation"
                      disabled={processingId === o.id}
                      onClick={() => setConfirmRejectId(o.id)}
                    >
                      {t("驳回", "Reject")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      className="h-9 flex-1 text-xs touch-manipulation"
                      disabled={processingId === o.id}
                      onClick={() => setConfirmCompleteId(o.id)}
                    >
                      {t("完成", "Complete")}
                    </Button>
                  </div>
                )}
                {o.status === "completed" && canProcessOrders && (
                  <div className="flex gap-2 pt-1">
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-9 flex-1 text-xs touch-manipulation text-destructive border-destructive/40"
                      disabled={processingId === o.id}
                      onClick={() => openCancelDialog(o.id)}
                    >
                      {t("取消订单", "Cancel order")}
                    </Button>
                  </div>
                )}
              </MobileCard>
            ))}
            <MobilePagination
              currentPage={safePage}
              totalPages={totalPages}
              totalItems={totalCount}
              onPageChange={setCurrentPage}
              pageSize={PAGE_SIZE}
            />
          </MobileCardList>
        </>
      ) : (
        <>
          <div className="rounded-lg border bg-card overflow-hidden">
            <StickyScrollTableContainer minWidth="980px">
              <Table className="text-xs table-auto w-full">
                <TableHeader className="sticky top-0 z-10 bg-muted/80 backdrop-blur-sm">
                  <TableRow className="bg-muted/50 hover:bg-transparent">
                    <TableHead className="w-14 px-2 text-center">{t("图", "Img")}</TableHead>
                    <TableHead className="px-2 text-center">{t("商品", "Item")}</TableHead>
                    <TableHead className="whitespace-nowrap px-2 text-center">{t("电话号码", "Phone")}</TableHead>
                    <TableHead className="whitespace-nowrap px-2 text-center">{t("会员编号", "Code")}</TableHead>
                    <TableHead className="px-2 text-right">{t("数量", "Qty")}</TableHead>
                    <TableHead className="px-2 text-right">{t("积分", "Pts")}</TableHead>
                    <TableHead className="whitespace-nowrap px-2 text-center">{t("时间", "Time")}</TableHead>
                    <TableHead className="px-2 text-center">{t("经手人", "Handler")}</TableHead>
                    <TableHead className="px-2 text-center">{t("状态", "Status")}</TableHead>
                    <TableHead className="w-[180px] text-center px-2 sticky right-0 z-20 bg-muted shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                      {t("操作", "Actions")}
                    </TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pageRows.map((o) => (
                    <TableRow
                      key={o.id}
                      id={`mall-rdm-row-${o.id}`}
                      className={cn(
                        highlightRedemptionId === o.id && "bg-primary/5 ring-2 ring-inset ring-primary/60",
                      )}
                    >
                      <TableCell className="px-2 text-center">
                        <div className="flex justify-center">
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
                        </div>
                      </TableCell>
                      <TableCell className="font-medium text-center max-w-[200px] truncate px-2" title={o.item_title}>
                        {o.item_title}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-center whitespace-nowrap px-2">
                        {displayStr(o.member_phone, "—")}
                      </TableCell>
                      <TableCell className="font-mono text-[11px] text-center whitespace-nowrap px-2">
                        {displayStr(o.member_code, "—")}
                      </TableCell>
                      <TableCell className="text-right tabular-nums px-2">{o.quantity}</TableCell>
                      <TableCell className="text-right tabular-nums px-2">{o.points_used}</TableCell>
                      <TableCell className="text-center text-muted-foreground whitespace-nowrap px-2">
                        {formatBeijingTime(o.created_at)}
                      </TableCell>
                      <TableCell
                        className="text-center text-muted-foreground whitespace-nowrap max-w-[140px] truncate px-2"
                        title={o.handler_name || ""}
                      >
                        {displayStr(o.handler_name, "—")}
                      </TableCell>
                      <TableCell className="text-center px-2">{statusBadge(o)}</TableCell>
                      <TableCell className="text-center px-2 sticky right-0 z-10 bg-background shadow-[-4px_0_8px_-4px_rgba(0,0,0,0.15)]">
                        {o.status === "pending" && canProcessOrders ? (
                          <div className="flex justify-center gap-1 flex-wrap">
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
                        ) : o.status === "completed" && canProcessOrders ? (
                          <div className="flex justify-center">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-[10px] px-2 text-destructive border-destructive/40 hover:bg-destructive/10"
                              disabled={processingId === o.id}
                              onClick={() => openCancelDialog(o.id)}
                            >
                              {t("取消", "Cancel")}
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
            </StickyScrollTableContainer>
          </div>
          <OrderPagination
            currentPage={safePage}
            totalPages={totalPages}
            totalCount={totalCount}
            pageSize={PAGE_SIZE}
            onPageChange={setCurrentPage}
            jumpToPage={jumpToPage}
            onJumpToPageChange={setJumpToPage}
            onJumpToPage={handleJumpToPage}
            t={t}
          />
        </>
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

      <AlertDialog
        open={!!confirmCancelId}
        onOpenChange={(open) => {
          if (!open) {
            setConfirmCancelId(null);
            setCancelPassword("");
            setCancelPasswordVisible(false);
            setCancelAuthError("");
          }
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("取消已完成的兑换订单？", "Cancel this completed redemption?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "取消后已扣积分将退回会员，商品库存将恢复。此操作不可撤销，请输入您的登录密码确认。",
                "Points will be refunded and stock restored. This cannot be undone. Enter your login password to confirm.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-2 px-1">
            <Label htmlFor="cancel-mall-pw">{t("登录密码", "Login password")}</Label>
            <div className="relative">
              <Input
                ref={cancelPasswordRef}
                id="cancel-mall-pw"
                type={cancelPasswordVisible ? "text" : "password"}
                placeholder={t("请输入密码", "Enter password")}
                value={cancelPassword}
                onChange={(e) => {
                  setCancelPassword(e.target.value);
                  setCancelAuthError("");
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && cancelPassword.trim()) void handleCancelConfirm();
                }}
                disabled={cancelVerifying}
                autoComplete="current-password"
              />
              <button
                type="button"
                tabIndex={0}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                onClick={() => setCancelPasswordVisible(!cancelPasswordVisible)}
                aria-label={cancelPasswordVisible ? "Hide password" : "Show password"}
              >
                {cancelPasswordVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </button>
            </div>
            {cancelAuthError && <p className="text-xs text-destructive">{cancelAuthError}</p>}
          </div>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={cancelVerifying}>{t("返回", "Back")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!cancelPassword.trim() || cancelVerifying}
              onClick={(e) => {
                e.preventDefault();
                void handleCancelConfirm();
              }}
            >
              {cancelVerifying ? <Loader2 className="mr-1 h-3.5 w-3.5 animate-spin" /> : null}
              {t("确认取消", "Confirm cancel")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
