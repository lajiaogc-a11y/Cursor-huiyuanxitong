import { useCallback, useEffect, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Skeleton } from "@/components/ui/skeleton";
import { Loader2, RefreshCw, Info } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/auth/useIsPlatformAdminViewingTenant";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import {
  getMemberPortalDataCleanupSettings,
  putMemberPortalDataCleanupSettings,
  previewMemberPortalDataCleanup,
  runMemberPortalDataCleanup,
} from "@/services/members/memberPortalAnalyticsService";

export interface MemberPortalInviteMemberCleanupPanelProps {
  tenantId: string | null;
}

/**
 * 邀请注册会员闲置清理（规则 + 预览 + 立即执行）。
 * 统一放在系统设置「数据管理 → 数据删除」中，与全站批量删除并列。
 */
export function MemberPortalInviteMemberCleanupPanel({ tenantId }: MemberPortalInviteMemberCleanupPanelProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const canPublish = employee?.role === "admin" || !!employee?.is_super_admin;

  const blockReadonly = useCallback(
    (actionZh: string, actionEn?: string) => {
      if (!isPlatformAdminReadonlyView) return false;
      notify.error(
        t(`平台总管理查看租户时为只读，无法${actionZh}`, `Read-only in platform admin tenant view: cannot ${actionEn || actionZh}`),
      );
      return true;
    },
    [isPlatformAdminReadonlyView, t],
  );

  const [cleanupEnabled, setCleanupEnabled] = useState(false);
  const [cleanupNoTradeM, setCleanupNoTradeM] = useState("");
  const [cleanupNoLoginM, setCleanupNoLoginM] = useState("");
  const [cleanupMaxPts, setCleanupMaxPts] = useState("");
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupPreviewCount, setCleanupPreviewCount] = useState<number | null>(null);
  const [cleanupRunning, setCleanupRunning] = useState(false);
  const [cleanupConfirmOpen, setCleanupConfirmOpen] = useState(false);
  const [cleanupRulesLoadFailed, setCleanupRulesLoadFailed] = useState(false);
  const cleanupLoadGen = useRef(0);

  const loadDataCleanupForm = useCallback(async () => {
    if (!tenantId) return;
    const gen = ++cleanupLoadGen.current;
    setCleanupLoading(true);
    setCleanupRulesLoadFailed(false);
    const MAX_RETRIES = 3;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const d = await getMemberPortalDataCleanupSettings(tenantId);
        if (gen !== cleanupLoadGen.current) return;
        setCleanupEnabled(!!d.enabled);
        setCleanupNoTradeM(d.no_trade_months != null ? String(d.no_trade_months) : "");
        setCleanupNoLoginM(d.no_login_months != null ? String(d.no_login_months) : "");
        setCleanupMaxPts(d.max_points_below != null ? String(d.max_points_below) : "");
        setCleanupPreviewCount(null);
        setCleanupRulesLoadFailed(false);
        if (gen === cleanupLoadGen.current) setCleanupLoading(false);
        return;
      } catch (e: unknown) {
        if (gen !== cleanupLoadGen.current) return;
        if (attempt < MAX_RETRIES) {
          await new Promise((r) => setTimeout(r, 1000 * (attempt + 1)));
          continue;
        }
        setCleanupRulesLoadFailed(true);
        showServiceErrorToast(e, t, "数据管理规则加载失败", "Failed to load cleanup rules");
      }
    }
    if (gen === cleanupLoadGen.current) setCleanupLoading(false);
  }, [tenantId, t]);

  useEffect(() => {
    setCleanupRulesLoadFailed(false);
  }, [tenantId]);

  useEffect(() => {
    if (!tenantId) return;
    void loadDataCleanupForm();
  }, [tenantId, loadDataCleanupForm]);

  const runCleanupConfirmed = useCallback(async () => {
    if (!tenantId) return;
    setCleanupRunning(true);
    try {
      const r = await runMemberPortalDataCleanup(tenantId);
      notify.success(`${t("已清理人数", "Purged")}: ${r.purged} · ${t("符合条件人数", "Eligible")}: ${r.matched}`);
      setCleanupPreviewCount(null);
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "执行失败", "Run failed");
    } finally {
      setCleanupRunning(false);
    }
  }, [tenantId, t]);

  if (!tenantId) {
    return (
      <Alert>
        <AlertDescription className="text-sm text-muted-foreground">
          {t("请先进入租户视图或确保已登录租户，以配置邀请会员清理规则。", "Select a tenant or sign in as tenant staff to configure invite-member cleanup.")}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("邀请会员闲置清理", "Invite-member idle purge")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "原「会员系统 → 数据管理」功能，已并入此处统一维护。",
            "Formerly under Member Portal → Data cleanup; centralized here.",
          )}
        </p>
      </div>
      <Alert className="border-sky-500/30 bg-sky-500/[0.06] text-foreground">
        <Info className="h-4 w-4 text-sky-600 dark:text-sky-400" />
        <AlertDescription className="text-xs text-muted-foreground">
          {t(
            "仅针对邀请链接注册会员。需同时满足：连续 N 个月无有效订单、连续 M 个月无登录、积分余额低于设定值。启用后系统约每 24 小时自动执行；也可手动预览与立即执行。执行后账号将标记为已自动清理，无法登录。",
            "Invite-link members only. All must hold: no valid orders for N months, no login for M months, points balance below threshold. When enabled, runs ~every 24h. Manual preview/run available. After cleanup, accounts are marked auto-purged and cannot sign in.",
          )}
        </AlertDescription>
      </Alert>
      <Card>
        <CardContent className="pt-5 space-y-4">
          {cleanupLoading && (
            <div className="space-y-4" role="status" aria-busy="true" aria-label={t("加载规则…", "Loading rules…")}>
              <div className="flex items-center gap-3">
                <Skeleton className="h-6 w-10 rounded-md" />
                <Skeleton className="h-4 w-40" />
              </div>
              <div className="grid gap-4 sm:grid-cols-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <div key={i} className="space-y-2">
                    <Skeleton className="h-3 w-28" />
                    <Skeleton className="h-10 w-full" />
                  </div>
                ))}
              </div>
              <Skeleton className="h-10 w-full max-w-md" />
            </div>
          )}
          {cleanupRulesLoadFailed && !cleanupLoading && (
            <Alert variant="destructive">
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {t(
                    "规则加载失败，可重试；若刚切换租户，请确认已进入租户视图。",
                    "Failed to load rules. Retry, or ensure tenant view is selected after switching.",
                  )}
                </span>
                <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => void loadDataCleanupForm()}>
                  <RefreshCw className="h-3.5 w-3.5 mr-1" />
                  {t("重试", "Retry")}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Switch checked={cleanupEnabled} onCheckedChange={setCleanupEnabled} disabled={!canPublish || isPlatformAdminReadonlyView} />
              <span className="text-sm font-medium">{t("启用自动清理", "Enable auto cleanup")}</span>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-1">
              <Label>{t("无交易月数（≥1）", "Months without trade")}</Label>
              <Input
                type="number"
                min={1}
                value={cleanupNoTradeM}
                onChange={(e) => setCleanupNoTradeM(e.target.value)}
                disabled={!canPublish || isPlatformAdminReadonlyView}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("无登录月数（≥1）", "Months without login")}</Label>
              <Input
                type="number"
                min={1}
                value={cleanupNoLoginM}
                onChange={(e) => setCleanupNoLoginM(e.target.value)}
                disabled={!canPublish || isPlatformAdminReadonlyView}
              />
            </div>
            <div className="space-y-1">
              <Label>{t("积分低于（严格小于）", "Points below (strict)")}</Label>
              <Input
                type="number"
                step="0.01"
                value={cleanupMaxPts}
                onChange={(e) => setCleanupMaxPts(e.target.value)}
                disabled={!canPublish || isPlatformAdminReadonlyView}
              />
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={!canPublish || isPlatformAdminReadonlyView || !tenantId}
              onClick={async () => {
                if (blockReadonly("保存数据管理规则", "save cleanup rules")) return;
                try {
                  await putMemberPortalDataCleanupSettings(tenantId, {
                    enabled: cleanupEnabled,
                    no_trade_months: cleanupNoTradeM === "" ? null : Number(cleanupNoTradeM),
                    no_login_months: cleanupNoLoginM === "" ? null : Number(cleanupNoLoginM),
                    max_points_below: cleanupMaxPts === "" ? null : Number(cleanupMaxPts),
                  });
                  notify.success(t("已保存", "Saved"));
                  await loadDataCleanupForm();
                } catch (e: unknown) {
                  showServiceErrorToast(e, t, "保存失败", "Save failed");
                }
              }}
            >
              {t("保存规则", "Save rules")}
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={!tenantId}
              onClick={async () => {
                try {
                  const p = await previewMemberPortalDataCleanup(tenantId);
                  setCleanupPreviewCount(p.count);
                  notify.info(`${t("当前符合条件人数", "Eligible")}: ${p.count}`);
                } catch (e: unknown) {
                  showServiceErrorToast(e, t, "预览失败", "Preview failed");
                }
              }}
            >
              {t("预览符合条件人数", "Preview eligible count")}
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              disabled={!canPublish || isPlatformAdminReadonlyView || !tenantId || cleanupRunning}
              onClick={() => {
                if (blockReadonly("执行清理", "run cleanup")) return;
                setCleanupConfirmOpen(true);
              }}
            >
              {cleanupRunning ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
              {t("立即执行清理", "Run cleanup now")}
            </Button>
          </div>
          {cleanupPreviewCount != null && (
            <p className="text-sm text-muted-foreground">
              {t("上次预览符合条件人数：", "Last eligible preview: ")}
              <strong className="text-foreground">{cleanupPreviewCount}</strong>
            </p>
          )}
          {!canPublish && (
            <p className="text-xs text-amber-700 dark:text-amber-300">{t("保存与执行清理需要管理员权限。", "Saving and running cleanup requires admin.")}</p>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={cleanupConfirmOpen} onOpenChange={setCleanupConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("立即执行清理？", "Run cleanup now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将清理当前规则下匹配到的邀请会员账号，清理后无法恢复登录，确定继续？",
                "Matched invite-link members will be purged and cannot sign in again. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setCleanupConfirmOpen(false);
                void runCleanupConfirmed();
              }}
            >
              {t("执行清理", "Run cleanup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
