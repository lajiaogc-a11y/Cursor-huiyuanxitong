import { useEffect, useState } from "react";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { CalendarClock } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/auth/useIsPlatformAdminViewingTenant";
import {
  getActivityDataRetentionApi,
  putActivityDataRetentionApi,
  postActivityDataRetentionRunApi,
  postActivityDataRetentionPurgeAllApi,
  type ActivityDataRetentionLastSummary,
} from "@/services/staff/staffDataService";
import { formatBeijingTime } from "@/lib/beijingTime";

export interface ActivityDataRetentionPanelProps {
  tenantId: string | null;
}

/**
 * 活动数据保留期清理（抽奖流水、签到、抽奖类积分流水）。
 * 与「会员系统 → 活动数据」共用同一套 API；配置入口统一在系统设置「数据删除」。
 */
export function ActivityDataRetentionPanel({ tenantId }: ActivityDataRetentionPanelProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const canConfigureActivityRetention =
    !!(employee?.role === "admin" || employee?.is_super_admin || employee?.is_platform_super_admin) &&
    !isPlatformAdminReadonlyView;

  const [retentionEnabled, setRetentionEnabled] = useState(false);
  const [retentionDaysInput, setRetentionDaysInput] = useState("365");
  const [retentionMeta, setRetentionMeta] = useState<{
    lastRunAt: string | null;
    lastSummary: ActivityDataRetentionLastSummary | null;
  }>({ lastRunAt: null, lastSummary: null });
  const [retentionLoading, setRetentionLoading] = useState(false);
  const [retentionSaving, setRetentionSaving] = useState(false);
  const [retentionRunning, setRetentionRunning] = useState(false);
  const [retentionRunConfirmOpen, setRetentionRunConfirmOpen] = useState(false);
  const [purgeAllRunning, setPurgeAllRunning] = useState(false);
  const [purgeAllConfirmOpen, setPurgeAllConfirmOpen] = useState(false);

  useEffect(() => {
    if (!tenantId) return;
    let cancelled = false;
    setRetentionLoading(true);
    void getActivityDataRetentionApi(tenantId)
      .then((s) => {
        if (cancelled) return;
        setRetentionEnabled(!!s.enabled);
        setRetentionDaysInput(String(s.retentionDays ?? 365));
        setRetentionMeta({ lastRunAt: s.lastRunAt ?? null, lastSummary: s.lastSummary ?? null });
      })
      .catch(() => {
        if (!cancelled) notify.error(t("加载保留策略失败", "Failed to load retention settings"));
      })
      .finally(() => {
        if (!cancelled) setRetentionLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [tenantId, t]);

  const handleSaveActivityDataRetention = async () => {
    if (!tenantId || !canConfigureActivityRetention) return;
    const days = Math.min(3650, Math.max(1, Math.floor(Number(retentionDaysInput) || 0)));
    if (!Number.isFinite(days) || days < 1) {
      notify.error(t("保留天数须为 1～3650", "Retention days must be 1–3650"));
      return;
    }
    setRetentionSaving(true);
    try {
      const s = await putActivityDataRetentionApi(tenantId, {
        enabled: retentionEnabled,
        retentionDays: days,
      });
      setRetentionEnabled(!!s.enabled);
      setRetentionDaysInput(String(s.retentionDays));
      setRetentionMeta({ lastRunAt: s.lastRunAt ?? null, lastSummary: s.lastSummary ?? null });
      notify.success(t("已保存", "Saved"));
    } catch {
      notify.error(t("保存失败", "Save failed"));
    } finally {
      setRetentionSaving(false);
    }
  };

  const handleRunActivityDataRetentionNow = async () => {
    if (!tenantId || !canConfigureActivityRetention) return;
    setRetentionRunning(true);
    try {
      const r = await postActivityDataRetentionRunApi(tenantId);
      setRetentionMeta({
        lastRunAt: r.settings.lastRunAt ?? null,
        lastSummary: r.settings.lastSummary ?? null,
      });
      const s = r.summary;
      notify.success(
        t(
          `已清理：抽奖 ${s.lotteryLogs}，签到 ${s.checkIns}，抽奖积分流水 ${s.lotteryPointsLedger}；次数 订单${s.spinCreditsOrder} 分享${s.spinCreditsShare} 邀请${s.spinCreditsInvite} 其他${s.spinCreditsOther}；商城订单 ${s.mallRedemptions ?? 0}`,
          `Cleaned: lottery ${s.lotteryLogs}, check-ins ${s.checkIns}, ledger ${s.lotteryPointsLedger}; spins order ${s.spinCreditsOrder} share ${s.spinCreditsShare} invite ${s.spinCreditsInvite} other ${s.spinCreditsOther}; mall orders ${s.mallRedemptions ?? 0}`,
        ),
      );
    } catch {
      notify.error(t("清理失败", "Cleanup failed"));
    } finally {
      setRetentionRunning(false);
    }
  };

  const handlePurgeAll = async () => {
    if (!tenantId || !canConfigureActivityRetention) return;
    setPurgeAllRunning(true);
    try {
      const r = await postActivityDataRetentionPurgeAllApi(tenantId);
      const s = r.summary;
      notify.success(
        t(
          `已全部清理：抽奖 ${s.lotteryLogs}，签到 ${s.checkIns}，抽奖积分流水 ${s.lotteryPointsLedger}；次数 订单${s.spinCreditsOrder} 分享${s.spinCreditsShare} 邀请${s.spinCreditsInvite} 其他${s.spinCreditsOther}；商城订单 ${s.mallRedemptions ?? 0}`,
          `Purged all: lottery ${s.lotteryLogs}, check-ins ${s.checkIns}, ledger ${s.lotteryPointsLedger}; spins order ${s.spinCreditsOrder} share ${s.spinCreditsShare} invite ${s.spinCreditsInvite} other ${s.spinCreditsOther}; mall orders ${s.mallRedemptions ?? 0}`,
        ),
      );
    } catch {
      notify.error(t("全部清理失败", "Purge all failed"));
    } finally {
      setPurgeAllRunning(false);
    }
  };

  if (!tenantId) {
    return (
      <Alert>
        <AlertDescription className="text-sm text-muted-foreground">
          {t(
            "活动数据保留按租户生效；请先进入租户视图或作为租户员工登录后再配置。",
            "Retention is per tenant. Open tenant view or sign in as tenant staff to configure.",
          )}
        </AlertDescription>
      </Alert>
    );
  }

  return (
    <div className="space-y-4">
      <div className="space-y-1">
        <h3 className="text-base font-semibold">{t("活动数据保留清理", "Activity data retention cleanup")}</h3>
        <p className="text-sm text-muted-foreground">
          {t(
            "原「会员系统 → 活动数据」顶部保留期设置，已并入此处。下方「活动数据」页仍可查看抽奖/签到流水。",
            "Retention settings moved from Member Portal → Activity data; lottery/check-in tables remain there.",
          )}
        </p>
      </div>
      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <CalendarClock className="h-4 w-4 text-muted-foreground" />
            {t("活动数据保留", "Activity data retention")}
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            {t(
              "仅清理超过保留期的明细：抽奖流水、签到流水、抽奖类积分流水、商城兑换订单；抽奖次数按来源分为订单完成、分享、邀请及其余（含签到发放等）。不含消费/推荐积分、活动赠送、汇率订单。启用后服务端每 24 小时自动执行一次。",
              "Deletes rows older than the retention period: lottery logs, check-ins, lottery-type points ledger, mall redemption orders; spin credits by source (order/share/invite/other including check-in grants). Not consumption/referral points, gifts, or exchange orders. Server runs every 24h when enabled.",
            )}
          </p>
        </CardHeader>
        <CardContent className="pt-0 space-y-4">
          {retentionLoading ? (
            <div className="space-y-4 py-1" role="status" aria-busy="true" aria-label={t("加载中…", "Loading…")}>
              <div className="flex flex-wrap items-center gap-4">
                <Skeleton className="h-6 w-11 rounded-full" />
                <Skeleton className="h-4 w-40 max-w-[min(100%,280px)]" />
                <Skeleton className="h-4 w-20" />
                <Skeleton className="h-9 w-24" />
                <Skeleton className="h-4 w-28" />
              </div>
              <Skeleton className="h-3 w-full max-w-lg" />
              <div className="flex flex-wrap gap-2">
                <Skeleton className="h-9 w-28" />
                <Skeleton className="h-9 w-36" />
              </div>
            </div>
          ) : (
            <>
              <div className="flex flex-col sm:flex-row sm:items-center gap-4">
                <div className="flex items-center gap-2">
                  <Switch
                    id="activity-retention-enabled-global"
                    checked={retentionEnabled}
                    onCheckedChange={(v) => setRetentionEnabled(v === true)}
                    disabled={!canConfigureActivityRetention}
                  />
                  <Label htmlFor="activity-retention-enabled-global" className="text-sm cursor-pointer">
                    {t("启用自动清理", "Enable automatic cleanup")}
                  </Label>
                </div>
                <div className="flex items-center gap-2 flex-wrap">
                  <Label htmlFor="activity-retention-days-global" className="text-sm whitespace-nowrap">
                    {t("保留最近", "Keep last")}
                  </Label>
                  <Input
                    id="activity-retention-days-global"
                    type="number"
                    min={1}
                    max={3650}
                    className="w-24 h-9"
                    value={retentionDaysInput}
                    onChange={(e) => setRetentionDaysInput(e.target.value)}
                    disabled={!canConfigureActivityRetention}
                  />
                  <span className="text-sm text-muted-foreground">{t("天的数据", "days of data")}</span>
                </div>
              </div>
              {retentionMeta.lastRunAt && (
                <p className="text-xs text-muted-foreground">
                  {t("上次执行", "Last run")}: {formatBeijingTime(retentionMeta.lastRunAt)}
                  {retentionMeta.lastSummary && (
                    <>
                      {" "}
                      — {t("抽奖", "Lottery")} {retentionMeta.lastSummary.lotteryLogs}, {t("签到", "Check-in")}{" "}
                      {retentionMeta.lastSummary.checkIns}, {t("抽奖积分流水", "Lottery ledger")}{" "}
                      {retentionMeta.lastSummary.lotteryPointsLedger}; {t("次数", "Spins")}{" "}
                      {t("订单", "Ord")} {retentionMeta.lastSummary.spinCreditsOrder} {t("分享", "Shr")}{" "}
                      {retentionMeta.lastSummary.spinCreditsShare} {t("邀请", "Inv")}{" "}
                      {retentionMeta.lastSummary.spinCreditsInvite} {t("其他", "Oth")}{" "}
                      {retentionMeta.lastSummary.spinCreditsOther}; {t("商城", "Mall")}{" "}
                      {retentionMeta.lastSummary.mallRedemptions ?? 0}
                    </>
                  )}
                </p>
              )}
              {canConfigureActivityRetention && (
                <div className="flex flex-wrap gap-2">
                  <Button type="button" size="sm" variant="default" disabled={retentionSaving} onClick={() => void handleSaveActivityDataRetention()}>
                    {retentionSaving ? t("保存中…", "Saving…") : t("保存设置", "Save settings")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    disabled={retentionRunning}
                    onClick={() => setRetentionRunConfirmOpen(true)}
                  >
                    {retentionRunning ? t("执行中…", "Running…") : t("立即按保留期清理", "Clean up now")}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant="destructive"
                    disabled={purgeAllRunning}
                    onClick={() => setPurgeAllConfirmOpen(true)}
                  >
                    {purgeAllRunning ? t("清理中…", "Purging…") : t("全部清理", "Purge all")}
                  </Button>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={retentionRunConfirmOpen} onOpenChange={setRetentionRunConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("立即按保留期清理？", "Clean up expired activity data now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将永久删除超过保留天数的抽奖流水、签到流水、抽奖类积分流水、商城兑换订单，以及按来源分类的抽奖次数（订单/分享/邀请/其他）。此操作不可撤销。确定继续？",
                "Permanently deletes lottery logs, check-ins, lottery-type points ledger, mall redemption orders, and spin credits by source (order/share/invite/other) older than your retention period. Cannot be undone. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setRetentionRunConfirmOpen(false);
                void handleRunActivityDataRetentionNow();
              }}
            >
              {t("确认清理", "Confirm cleanup")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={purgeAllConfirmOpen} onOpenChange={setPurgeAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("全部清理活动数据？", "Purge ALL activity data?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将永久删除本租户全部抽奖流水、签到流水、抽奖类积分流水、商城兑换订单与全部抽奖次数记录（含订单/分享/邀请/其他来源，无论日期）。此操作不可撤销。确定继续？",
                "Permanently deletes ALL lottery logs, check-ins, lottery-type points ledger, mall redemption orders, and all spin credit rows for this tenant (all sources). Cannot be undone. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPurgeAllConfirmOpen(false);
                void handlePurgeAll();
              }}
            >
              {t("确认全部清理", "Confirm purge all")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
