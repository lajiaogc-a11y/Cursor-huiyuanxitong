import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Loader2,
  Save,
  FileDown,
  RotateCcw,
  ChevronRight,
  RefreshCw,
  History,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import { cn } from "@/lib/utils";
import type { MemberPortalVersionItem } from "@/services/members/memberPortalSettingsService";
import { SectionTitle, PortalSettingsEmptyState } from "./shared";

export interface PublishTabProps {
  localBuildTime: string;
  onlineBuildTime: string;
  checkingVersion: boolean;
  refreshOnlineVersion: (userInitiated?: boolean) => void | Promise<void>;
  onNotifyForceRefreshClick: () => void;
  canPublish: boolean;
  canEdit: boolean;
  hasDraft: boolean;
  publishNote: string;
  setPublishNote: (v: string) => void;
  reviewNote: string;
  setReviewNote: (v: string) => void;
  saveDraft: () => void;
  savingDraft: boolean;
  saving: boolean;
  onPublishClick: () => void;
  onSubmitForReviewClick: () => void;
  onDiscardDraftClick: () => void;
  loadDraftFromServer: () => void;
  onResetToDefaultClick: () => void;
  versions: MemberPortalVersionItem[];
  loadingVersions: boolean;
  refreshVersions: () => void;
  setConfirmVersionRejectId: (id: string | null) => void;
  setConfirmVersionApproveId: (id: string | null) => void;
  requestRollback: (versionId: string) => void;
}

export function PublishTab({
  localBuildTime,
  onlineBuildTime,
  checkingVersion,
  refreshOnlineVersion,
  onNotifyForceRefreshClick,
  canPublish,
  canEdit,
  hasDraft,
  publishNote,
  setPublishNote,
  reviewNote,
  setReviewNote,
  saveDraft,
  savingDraft,
  saving,
  onPublishClick,
  onSubmitForReviewClick,
  onDiscardDraftClick,
  loadDraftFromServer,
  onResetToDefaultClick,
  versions,
  loadingVersions,
  refreshVersions,
  setConfirmVersionRejectId,
  setConfirmVersionApproveId,
  requestRollback,
}: PublishTabProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("在线版本控制", "Online Version Control")}</SectionTitle>
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{t("本地版本号", "Local Version")}</p>
              <p className="text-sm font-mono mt-1 break-all">{localBuildTime}</p>
            </div>
            <div className="rounded-xl border bg-muted/20 p-3">
              <p className="text-xs text-muted-foreground">{t("在线版本号", "Online Version")}</p>
              <p className="text-sm font-mono mt-1 break-all">{onlineBuildTime || t("读取中/未知", "Loading/Unknown")}</p>
            </div>
          </div>
          <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
            {t("状态", "Status")}：
            {onlineBuildTime
              ? onlineBuildTime === localBuildTime
                ? t("已同步（线上版本与本地一致）", "Synced (online matches local)")
                : t("未同步（本地与线上版本不同）", "Out of sync (local differs from online)")
              : t("在线版本暂不可用", "Online version unavailable")}
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            <Button
              type="button"
              variant="outline"
              className="gap-2"
              onClick={() => void refreshOnlineVersion(true)}
              disabled={checkingVersion}
            >
              {checkingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
              {t("刷新在线版本", "Refresh Online Version")}
            </Button>
            <Button type="button" className="gap-2" onClick={onNotifyForceRefreshClick} disabled={!canPublish}>
              <RefreshCw className="h-4 w-4" />
              {t("一键强制全员刷新提示", "Force Refresh All Users")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("发布流程", "Publish Workflow")}</SectionTitle>
          <div className="rounded-xl border bg-muted/20 p-4 space-y-3">
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">1</span>
              <div>
                <p className="text-sm font-medium">{t("编辑设置", "Edit Settings")}</p>
                <p className="text-xs text-muted-foreground">{t("在各 Tab 中修改配置项", "Modify settings in each tab")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">2</span>
              <div>
                <p className="text-sm font-medium">{t("保存草稿", "Save Draft")}</p>
                <p className="text-xs text-muted-foreground">{t("点击「保存」将变更存为草稿，此时会员端不会看到任何变化", "Click \"Save\" to store changes as draft — members won't see anything yet")}</p>
              </div>
            </div>
            <div className="flex items-start gap-3">
              <span className="flex h-6 w-6 items-center justify-center rounded-full bg-primary/10 text-primary text-xs font-bold shrink-0">3</span>
              <div>
                <p className="text-sm font-medium">{t("发布上线", "Publish")}</p>
                <p className="text-xs text-muted-foreground">{t("确认无误后点击「发布上线」，变更将立即对所有会员生效", "Once confirmed, click \"Publish\" to make changes live for all members")}</p>
              </div>
            </div>
          </div>

          {hasDraft && (
            <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-700 dark:bg-amber-950/40 p-3 flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
              <Save className="h-4 w-4 shrink-0" />
              {t("当前有未发布的草稿", "You have an unpublished draft")}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("发布操作", "Publish Actions")}</SectionTitle>
          <div className="space-y-2">
            <Label>{t("发布备注", "Publish Note")}</Label>
            <Input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder={t("例如：五一活动主题上线", "e.g. May Day campaign launch")} />
          </div>

          {canPublish && (
            <div className="space-y-2">
              <Label>
                {t("审核意见", "Review Comments")}{" "}
                <span className="text-muted-foreground font-normal text-xs">{t("（审核时填写）", "(fill in when reviewing)")}</span>
              </Label>
              <Input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder={t("例如：请补充活动文案后再提审", "e.g. Please add campaign copy before resubmitting")} />
            </div>
          )}

          <div className="grid gap-2 sm:grid-cols-2">
            <Button type="button" variant="outline" onClick={saveDraft} disabled={savingDraft || saving || !canEdit} className="gap-2">
              {savingDraft ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              {t("保存草稿", "Save Draft")}
            </Button>
            {canPublish ? (
              <Button onClick={onPublishClick} disabled={saving || savingDraft || !canEdit} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {t("发布上线", "Publish Now")}
              </Button>
            ) : (
              <Button onClick={onSubmitForReviewClick} disabled={saving || savingDraft || !canEdit} className="gap-2">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                {t("提交审核", "Submit for Review")}
              </Button>
            )}
          </div>

          {hasDraft && (
            <Button type="button" variant="ghost" size="sm" className="w-full text-xs text-muted-foreground" onClick={onDiscardDraftClick} disabled={savingDraft}>
              {t("丢弃草稿，恢复为当前已发布版本", "Discard draft, restore to current published version")}
            </Button>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-3">
          <SectionTitle>{t("高级工具", "Advanced Tools")}</SectionTitle>
          <div className="grid grid-cols-2 gap-2">
            <Button type="button" variant="outline" size="sm" onClick={loadDraftFromServer} className="gap-2">
              <FileDown className="h-3.5 w-3.5" />
              {t("载入服务器草稿", "Load Server Draft")}
            </Button>
            <Button type="button" variant="outline" size="sm" onClick={onResetToDefaultClick} className="gap-2 text-muted-foreground">
              <RotateCcw className="h-3.5 w-3.5" />
              {t("恢复默认模板", "Reset to Default")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">{t("本地草稿保存在浏览器中，作为备份恢复使用。", "Local drafts are saved in the browser as a backup.")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>{t("版本历史", "Version History")}</SectionTitle>
            <Button type="button" variant="ghost" size="sm" onClick={refreshVersions} className="h-7 text-xs gap-1">
              {loadingVersions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
              {t("刷新", "Refresh")}
            </Button>
          </div>

          {loadingVersions ? (
            <div className="py-6 flex justify-center">
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : versions.length === 0 ? (
            <PortalSettingsEmptyState
              icon={History}
              title={t("暂无版本历史", "No version history")}
              hint={t(
                "保存草稿、提交审核或发布后，可在此查看各版本状态。",
                "Draft saves, submissions, and publishes are listed here with status.",
              )}
            />
          ) : (
            <div className="space-y-2">
              {versions.map((v) => {
                const applied =
                  v.is_applied === true ||
                  (v as { is_applied?: boolean | number | string }).is_applied === 1 ||
                  String((v as { is_applied?: boolean | number | string }).is_applied) === "1";
                const statusLabel =
                  v.approval_status === "draft"
                    ? { text: t("草稿（未发布）", "Draft (not published)"), cls: "bg-muted text-muted-foreground border-border" }
                    : v.approval_status === "pending"
                      ? { text: t("待审核", "Pending Review"), cls: "bg-amber-50 text-amber-700 border-amber-200" }
                      : v.approval_status === "rejected"
                        ? { text: t("已驳回", "Rejected"), cls: "bg-rose-50 text-rose-700 border-rose-200" }
                        : applied
                          ? { text: t("当前线上（已生效）", "Live (active)"), cls: "bg-emerald-50 text-emerald-700 border-emerald-200" }
                          : { text: t("历史版本（已被替换）", "Superseded"), cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
                return (
                  <div key={v.id} className="rounded-xl border bg-card p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-bold">V{v.version_no}</span>
                          <span className={cn("text-[11px] font-medium border rounded-full px-2 py-0.5", statusLabel.cls)}>{statusLabel.text}</span>
                        </div>
                        <p className="text-xs text-muted-foreground">
                          {t("备注", "Note")}：{v.note || t("无", "None")} · {formatBeijingTime(v.created_at)}
                        </p>
                        {v.effective_at && (
                          <p className="text-xs text-muted-foreground">
                            {t("定时生效", "Scheduled")}：{formatBeijingTime(v.effective_at)}
                          </p>
                        )}
                        {v.review_note && (
                          <p className="text-xs text-amber-700 mt-1 bg-amber-50 rounded px-2 py-1">
                            {t("审核意见", "Review Comments")}：{v.review_note}
                          </p>
                        )}
                      </div>
                      <div className="flex flex-col gap-1.5 shrink-0">
                        {canPublish && v.approval_status === "pending" && (
                          <>
                            <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmVersionRejectId(v.id)} disabled={saving}>
                              {t("驳回", "Reject")}
                            </Button>
                            <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setConfirmVersionApproveId(v.id)} disabled={saving}>
                              {t("通过", "Approve")}
                            </Button>
                          </>
                        )}
                        {canPublish && (
                          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => requestRollback(v.id)} disabled={saving}>
                            {t("回滚", "Rollback")}
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
