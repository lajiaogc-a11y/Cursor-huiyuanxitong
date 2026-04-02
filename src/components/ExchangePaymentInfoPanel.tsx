import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
import { CreditCard, Copy, Trash2 } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { toast } from "sonner";
import {
  readRows,
  subscribeExchangePaymentInfoLedger,
  markExchangePaymentInfoCopied,
  removeExchangePaymentInfoEntry,
  normalizePaymentCopyPayload,
  type ExchangePaymentInfoEntry,
} from "@/lib/exchangePaymentInfoLedger";

async function copyToClipboard(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.left = "-9999px";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
}

export function ExchangePaymentInfoPanel() {
  const { viewingTenantId } = useTenantView() || {};
  const { employee } = useAuth();
  const { t } = useLanguage();
  const tenantId = viewingTenantId || employee?.tenant_id;
  const effectiveTenantId = tenantId ?? "";

  const [rows, setRows] = useState<ExchangePaymentInfoEntry[]>(() =>
    effectiveTenantId ? readRows(effectiveTenantId) : [],
  );
  const [pendingCopy, setPendingCopy] = useState<{ id: string; text: string } | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (!effectiveTenantId) return;
    setRows(readRows(effectiveTenantId));
    return subscribeExchangePaymentInfoLedger(() => {
      setRows(readRows(effectiveTenantId));
    });
  }, [effectiveTenantId]);

  const openCopyConfirm = useCallback((row: ExchangePaymentInfoEntry) => {
    if (row.hasBankCard === false) {
      toast.error(t("用户没有银行卡信息", "User has no bank card on file"));
      return;
    }
    setPendingCopy({ id: row.id, text: normalizePaymentCopyPayload(row.copyPayload) });
  }, [t]);

  const handleConfirmCopy = useCallback(async () => {
    if (!pendingCopy || !effectiveTenantId) {
      setPendingCopy(null);
      return;
    }
    const { id, text } = pendingCopy;
    setPendingCopy(null);
    const normalized = normalizePaymentCopyPayload(text);
    if (!normalized) {
      toast.error(t("无可复制内容", "Nothing to copy"));
      return;
    }
    const ok = await copyToClipboard(normalized);
    if (ok) {
      markExchangePaymentInfoCopied(effectiveTenantId, id);
      toast.success(t("已复制到剪贴板", "Copied to clipboard"));
    } else {
      toast.error(t("复制失败", "Copy failed"));
    }
  }, [pendingCopy, effectiveTenantId, t]);

  const handleConfirmDelete = useCallback(() => {
    if (!pendingDeleteId || !effectiveTenantId) {
      setPendingDeleteId(null);
      return;
    }
    removeExchangePaymentInfoEntry(effectiveTenantId, pendingDeleteId);
    setPendingDeleteId(null);
    toast.success(t("已删除该条付款信息", "Payment info row removed"));
  }, [pendingDeleteId, effectiveTenantId, t]);

  if (!effectiveTenantId) return null;

  return (
    <>
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <CreditCard className="h-4 w-4" />
            {t("付款信息", "Payment info")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-2">
          {rows.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              {t("提交订单后将在此显示，便于复制银行卡与支付金额。", "Rows appear after you submit an order.")}
            </p>
          ) : (
            <div className="max-h-[280px] overflow-auto rounded-md border">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b bg-muted/50 text-left text-xs text-muted-foreground">
                    <th className="px-2 py-2 font-medium">{t("电话", "Phone")}</th>
                    <th className="px-2 py-2 font-medium w-[72px]">{t("复制", "Copy")}</th>
                    <th className="px-2 py-2 font-medium min-w-[4.5rem]">{t("状态", "Status")}</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.id} className="border-b border-border/60 last:border-0">
                      <td className="px-2 py-1.5 align-middle break-all max-w-[140px]">{row.phone}</td>
                      <td className="px-2 py-1.5 align-middle">
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-7 px-2 gap-1"
                          onClick={() => openCopyConfirm(row)}
                        >
                          <Copy className="h-3.5 w-3.5" />
                          {t("复制", "Copy")}
                        </Button>
                      </td>
                      <td className="px-2 py-1.5 align-middle">
                        {row.copied ? (
                          <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            className="h-7 px-2 gap-1 text-destructive border-destructive/30 hover:bg-destructive/10"
                            onClick={() => setPendingDeleteId(row.id)}
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            {t("删除", "Delete")}
                          </Button>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={!!pendingCopy} onOpenChange={(open) => !open && setPendingCopy(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认复制", "Confirm copy")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将以下内容复制到剪贴板？", "Copy the following to clipboard?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          {pendingCopy?.text ? (
            <pre className="text-xs bg-muted/60 rounded-md p-2 max-h-32 overflow-auto whitespace-pre-wrap break-all">
              {pendingCopy.text}
            </pre>
          ) : null}
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void handleConfirmCopy()}>
              {t("确认复制", "Confirm copy")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!pendingDeleteId} onOpenChange={(open) => !open && setPendingDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除付款信息？", "Delete this payment info?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将从列表中移除该条记录，不会撤销已提交的订单。",
                "This removes the row from the list only. It does not undo the submitted order.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={handleConfirmDelete}
            >
              {t("确认删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
