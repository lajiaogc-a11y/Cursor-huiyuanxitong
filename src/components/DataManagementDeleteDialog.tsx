import type { Dispatch, ReactNode, SetStateAction } from "react";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Trash2, Loader2, AlertTriangle } from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsLgUp } from "@/hooks/use-mobile";

export type DeleteBulkSelections = {
  orders: boolean;
  recycleActivityDataOnOrderDelete: boolean;
  reports: {
    employee: boolean;
    card: boolean;
    vendor: boolean;
    daily: boolean;
  };
  members: {
    memberManagement: boolean;
    activityLotteryLogs: boolean;
    activityCheckIns: boolean;
    activitySpinOrder: boolean;
    activitySpinShare: boolean;
    activitySpinInvite: boolean;
    activitySpinOther: boolean;
    activityMemberSummary: boolean;
    activityGift: boolean;
    pointsLedger: boolean;
    activityMallRedemptions: boolean;
  };
  shiftData: {
    shiftHandovers: boolean;
    shiftReceivers: boolean;
  };
  merchantSettlement: {
    balanceChangeLogs: boolean;
    initialBalances: boolean;
  };
  referralRelations: boolean;
  auditRecords: boolean;
  operationLogs: boolean;
  loginLogs: boolean;
  knowledgeData: {
    categories: boolean;
    articles: boolean;
  };
  taskData: {
    tasks: boolean;
    taskItems: boolean;
  };
  preserveActivityData: boolean;
};

export const SELECT_ALL_STATE: DeleteBulkSelections = {
  orders: true,
  recycleActivityDataOnOrderDelete: false,
  reports: { employee: true, card: true, vendor: true, daily: true },
  members: {
    memberManagement: false,
    activityLotteryLogs: true,
    activityCheckIns: true,
    activitySpinOrder: true,
    activitySpinShare: true,
    activitySpinInvite: true,
    activitySpinOther: true,
    activityMemberSummary: true,
    activityGift: true,
    pointsLedger: true,
    activityMallRedemptions: true,
  },
  shiftData: { shiftHandovers: true, shiftReceivers: true },
  merchantSettlement: { balanceChangeLogs: true, initialBalances: true },
  referralRelations: false,
  auditRecords: false,
  operationLogs: false,
  loginLogs: false,
  knowledgeData: { categories: false, articles: false },
  taskData: { tasks: true, taskItems: true },
  preserveActivityData: true,
};

export const SELECT_NONE_STATE: DeleteBulkSelections = {
  orders: false,
  recycleActivityDataOnOrderDelete: false,
  reports: { employee: false, card: false, vendor: false, daily: false },
  members: {
    memberManagement: false,
    activityLotteryLogs: false,
    activityCheckIns: false,
    activitySpinOrder: false,
    activitySpinShare: false,
    activitySpinInvite: false,
    activitySpinOther: false,
    activityMemberSummary: false,
    activityGift: false,
    pointsLedger: false,
    activityMallRedemptions: false,
  },
  shiftData: { shiftHandovers: false, shiftReceivers: false },
  merchantSettlement: { balanceChangeLogs: false, initialBalances: false },
  referralRelations: false,
  auditRecords: false,
  operationLogs: false,
  loginLogs: false,
  knowledgeData: { categories: false, articles: false },
  taskData: { tasks: false, taskItems: false },
  preserveActivityData: true,
};

function Panel({
  title,
  className,
  children,
}: {
  title: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "rounded-lg border border-border/60 bg-card/40 p-3 dark:bg-card/20",
        className,
      )}
    >
      <h3 className="mb-2 border-b border-border/50 pb-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </h3>
      <div className="space-y-1.5">{children}</div>
    </section>
  );
}

function Row({
  id,
  checked,
  onCheckedChange,
  label,
  labelTitle,
  hint,
}: {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  labelTitle?: string;
  hint?: string;
}) {
  return (
    <div className="flex flex-col gap-0.5">
      <div className="flex items-start gap-2" title={labelTitle || undefined}>
        <Checkbox
          id={id}
          className="mt-0.5"
          checked={checked}
          onCheckedChange={(c) => onCheckedChange(c === true)}
        />
        <Label
          htmlFor={id}
          title={labelTitle || undefined}
          className={cn(
            "cursor-pointer text-xs font-normal leading-snug text-foreground",
            labelTitle &&
              "underline decoration-dotted decoration-muted-foreground/70 underline-offset-2",
          )}
        >
          {label}
        </Label>
      </div>
      {hint ? <p className="pl-6 text-[10px] leading-tight text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

type DeleteCategoryStep = "orders" | "members" | "merchant" | "other" | "tasks";

function DeleteCategoryPanel({
  step,
  deleteSelections,
  setDeleteSelections,
  t,
  mbLong1,
  mbLong2,
}: {
  step: DeleteCategoryStep;
  deleteSelections: DeleteBulkSelections;
  setDeleteSelections: Dispatch<SetStateAction<DeleteBulkSelections>>;
  t: (zh: string, en: string) => string;
  mbLong1: string;
  mbLong2: string;
}) {
  switch (step) {
    case "orders":
      return (
        <Panel title={t("订单 / 报表", "Orders / Reports")}>
          <Row
            id="delete-orders"
            checked={deleteSelections.orders}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                orders: checked,
                recycleActivityDataOnOrderDelete: checked ? prev.recycleActivityDataOnOrderDelete : false,
              }))
            }
            label={t("订单管理", "Order Management")}
            hint={t("赛地/奈拉与 USDT 订单", "GHS/NGN and USDT orders")}
          />
          {deleteSelections.orders ? (
            <div className="ml-1 rounded border border-border bg-muted/40 p-1.5">
              <Row
                id="recycle-activity-data"
                checked={deleteSelections.recycleActivityDataOnOrderDelete}
                onCheckedChange={(checked) =>
                  setDeleteSelections((prev) => ({
                    ...prev,
                    recycleActivityDataOnOrderDelete: checked,
                  }))
                }
                label={t("同时回收会员活动数据", "Also recycle member activity data")}
                labelTitle={t(
                  "回收累积次数、累积利润、累积奈拉/赛地/US 等（与订单删除行为一致）",
                  "Recycle order_count, accumulated_profit, accumulated amounts (same as order deletion)",
                )}
              />
              {deleteSelections.recycleActivityDataOnOrderDelete ? (
                <p
                  className="mt-1 flex items-start gap-1 rounded bg-amber-500/15 px-1.5 py-1 text-[10px] leading-tight text-amber-800 dark:text-amber-200"
                  title={t(
                    "启用后将逐条处理订单并回收对应的会员活动数据，处理时间较长",
                    "This will process each order and recycle corresponding activity data, which takes longer",
                  )}
                >
                  <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
                  {t("逐条回收，耗时较长", "Per-order recycle; slower")}
                </p>
              ) : null}
            </div>
          ) : null}
          <Row
            id="delete-report-employee"
            checked={deleteSelections.reports.employee}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                reports: { ...prev.reports, employee: checked },
              }))
            }
            label={t("员工利润报表", "Employee Report")}
          />
          <Row
            id="delete-report-card"
            checked={deleteSelections.reports.card}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                reports: { ...prev.reports, card: checked },
              }))
            }
            label={t("卡片报表", "Card Report")}
          />
          <Row
            id="delete-report-vendor"
            checked={deleteSelections.reports.vendor}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                reports: { ...prev.reports, vendor: checked },
              }))
            }
            label={t("卡商报表", "Vendor Report")}
          />
          <Row
            id="delete-report-daily"
            checked={deleteSelections.reports.daily}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                reports: { ...prev.reports, daily: checked },
              }))
            }
            label={t("每日报表", "Daily Report")}
          />
        </Panel>
      );
    case "members":
      return (
        <Panel title={t("会员 / 交班", "Members / Shift")}>
          <Row
            id="delete-member-management"
            checked={deleteSelections.members.memberManagement}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, memberManagement: checked },
              }))
            }
            label={t("会员管理", "Member Management")}
          />
          <Row
            id="delete-activity-lottery-logs"
            checked={deleteSelections.members.activityLotteryLogs}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activityLotteryLogs: checked },
              }))
            }
            label={t("抽奖数据", "Lottery data")}
            hint={t("抽奖流水+抽奖类积分流水", "Lottery logs + lottery points ledger")}
          />
          <Row
            id="delete-activity-checkins"
            checked={deleteSelections.members.activityCheckIns}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activityCheckIns: checked },
              }))
            }
            label={t("签到数据", "Check-in data")}
            hint={t("签到流水+签到发放的抽奖次数", "Check-ins + check-in spin credits")}
          />
          <Row
            id="delete-activity-spin-order"
            checked={deleteSelections.members.activitySpinOrder}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activitySpinOrder: checked },
              }))
            }
            label={t("订单抽奖", "Order spin credits")}
            hint={t("完成订单发放的抽奖次数", "Spins from completed orders")}
          />
          <Row
            id="delete-activity-spin-share"
            checked={deleteSelections.members.activitySpinShare}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activitySpinShare: checked },
              }))
            }
            label={t("分享数据", "Share data")}
            hint={t("分享奖励抽奖次数", "Share spin credits")}
          />
          <Row
            id="delete-activity-spin-invite"
            checked={deleteSelections.members.activitySpinInvite}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activitySpinInvite: checked },
              }))
            }
            label={t("邀请数据", "Invite data")}
            hint={t("邀请/注册欢迎抽奖次数", "Invite + welcome spin credits")}
          />
          <Row
            id="delete-activity-spin-other"
            checked={deleteSelections.members.activitySpinOther}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activitySpinOther: checked },
              }))
            }
            label={t("其他抽奖次数", "Other spin credits")}
            hint={t("未归类来源", "Uncategorised sources")}
          />
          <Row
            id="delete-activity-member-summary"
            checked={deleteSelections.members.activityMemberSummary}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activityMemberSummary: checked },
              }))
            }
            label={t("会员活动汇总", "Member activity summary")}
            hint={t("member_activity 等，见下方保留选项", "See preserve option below")}
          />
          <Row
            id="delete-activity-gift"
            checked={deleteSelections.members.activityGift}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activityGift: checked },
              }))
            }
            label={t("活动赠送", "Activity Gift")}
          />
          <Row
            id="delete-points-ledger"
            checked={deleteSelections.members.pointsLedger}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, pointsLedger: checked },
              }))
            }
            label={t("积分明细", "Points Ledger")}
          />
          <Row
            id="delete-mall-redemptions"
            checked={deleteSelections.members.activityMallRedemptions}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                members: { ...prev.members, activityMallRedemptions: checked },
              }))
            }
            label={t("商城订单", "Mall Orders")}
            hint={t("会员积分商城兑换订单", "Member points mall redemption orders")}
          />
          <Row
            id="delete-shift-handovers"
            checked={deleteSelections.shiftData.shiftHandovers}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                shiftData: { ...prev.shiftData, shiftHandovers: checked },
              }))
            }
            label={t("交班记录", "Shift Handovers")}
          />
          <Row
            id="delete-shift-receivers"
            checked={deleteSelections.shiftData.shiftReceivers}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                shiftData: { ...prev.shiftData, shiftReceivers: checked },
              }))
            }
            label={t("接班人列表", "Shift Receivers")}
          />
          {deleteSelections.members.activityMemberSummary ? (
            <div className="mt-1 flex items-start gap-2 rounded border border-amber-500/30 bg-amber-500/10 p-1.5">
              <Checkbox
                id="preserve-activity-data"
                className="mt-0.5"
                checked={deleteSelections.preserveActivityData}
                onCheckedChange={(c) =>
                  setDeleteSelections((prev) => ({
                    ...prev,
                    preserveActivityData: c === true,
                  }))
                }
              />
              <Label htmlFor="preserve-activity-data" className="cursor-pointer text-[11px] leading-snug">
                {t("保留消费奖励/推荐奖励/剩余积分", "Preserve consumption/referral rewards and remaining points")}
              </Label>
            </div>
          ) : null}
        </Panel>
      );
    case "merchant":
      return (
        <Panel title={t("商家结算", "Merchant Settlement")}>
          <Row
            id="delete-balance-change-logs"
            checked={deleteSelections.merchantSettlement.balanceChangeLogs}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                merchantSettlement: { ...prev.merchantSettlement, balanceChangeLogs: checked },
              }))
            }
            label={t("变动明细 + 账本明细", "Change logs + ledger")}
            labelTitle={mbLong1}
          />
          <Row
            id="delete-initial-balances"
            checked={deleteSelections.merchantSettlement.initialBalances}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                merchantSettlement: { ...prev.merchantSettlement, initialBalances: checked },
              }))
            }
            label={t("结算档案（余额/提款充值）", "Settlement records (balances)")}
            labelTitle={mbLong2}
          />
        </Panel>
      );
    case "tasks":
      return (
        <Panel title={t("工作任务", "Work Tasks")}>
          <Row
            id="delete-tasks"
            checked={deleteSelections.taskData.tasks}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                taskData: { ...prev.taskData, tasks: checked },
              }))
            }
            label={t("任务列表", "Task List")}
            hint={t("已发布/已关闭的工作任务", "Published and closed tasks")}
          />
          <Row
            id="delete-task-items"
            checked={deleteSelections.taskData.taskItems}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                taskData: { ...prev.taskData, taskItems: checked },
              }))
            }
            label={t("维护历史", "Maintenance History")}
            hint={t("任务完成明细/进度记录", "Task completion details and progress")}
          />
        </Panel>
      );
    case "other":
      return (
        <Panel title={t("其他 / 知识库", "Other / Knowledge")}>
          <Row
            id="delete-referral-relations"
            checked={deleteSelections.referralRelations}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({ ...prev, referralRelations: checked }))
            }
            label={t("推荐关系", "Referral Relations")}
          />
          <Row
            id="delete-knowledge-articles"
            checked={deleteSelections.knowledgeData.articles}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                knowledgeData: { ...prev.knowledgeData, articles: checked },
              }))
            }
            label={t("知识库文章", "Knowledge Articles")}
          />
          <Row
            id="delete-knowledge-categories"
            checked={deleteSelections.knowledgeData.categories}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({
                ...prev,
                knowledgeData: { ...prev.knowledgeData, categories: checked },
              }))
            }
            label={t("知识库分类", "Knowledge Categories")}
          />
          <div className="mt-2 rounded-md border border-amber-300 bg-amber-50 px-2.5 py-2 dark:border-amber-700 dark:bg-amber-950/30">
            <p className="flex items-center gap-1.5 text-[10px] font-medium text-amber-800 dark:text-amber-300">
              <AlertTriangle className="h-3 w-3 shrink-0" />
              {t(
                "以下为留痕数据，删除后无法恢复且影响审计追溯，「全选」不会默认勾选。",
                "The following are audit trail data. Deletion is irreversible and affects traceability. \"Select All\" does not check these by default.",
              )}
            </p>
          </div>
          <Row
            id="delete-audit-records"
            checked={deleteSelections.auditRecords}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({ ...prev, auditRecords: checked }))
            }
            label={t("⚠ 审核记录", "⚠ Audit Records")}
          />
          <Row
            id="delete-operation-logs"
            checked={deleteSelections.operationLogs}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({ ...prev, operationLogs: checked }))
            }
            label={t("⚠ 操作日志", "⚠ Operation Logs")}
          />
          <Row
            id="delete-login-logs"
            checked={deleteSelections.loginLogs}
            onCheckedChange={(checked) =>
              setDeleteSelections((prev) => ({ ...prev, loginLogs: checked }))
            }
            label={t("⚠ 登录日志", "⚠ Login Logs")}
          />
        </Panel>
      );
    default:
      return null;
  }
}

export function DataManagementDeleteDialog({
  open,
  onOpenChange,
  t,
  deleteRetainMonths,
  setDeleteRetainMonths,
  deleteSelections,
  setDeleteSelections,
  deletePassword,
  setDeletePassword,
  isDeleting,
  deleteProgress,
  onConfirmDelete,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  t: (zh: string, en: string) => string;
  deleteRetainMonths: string;
  setDeleteRetainMonths: (v: string) => void;
  deleteSelections: DeleteBulkSelections;
  setDeleteSelections: Dispatch<SetStateAction<DeleteBulkSelections>>;
  deletePassword: string;
  setDeletePassword: (v: string) => void;
  isDeleting: boolean;
  deleteProgress: { current: number; total: number; currentStep: string };
  onConfirmDelete: () => void;
}) {
  const mbLong1 = t(
    "同时按同一保留规则清理 shared_data 内卡商提款明细、代付充值明细、归档及操作历史（与商家结算页数据源一致）。",
    "Also prunes card-vendor withdrawals, payment-provider recharges, archives, and action history in shared_data under the same retention rules as the settlement page.",
  );
  const mbLong2 = t(
    "商家结算档案：初始余额、实时余额相关数据、提款/充值与重置明细。",
    "Merchant settlement records: initial balances, live balance-related data, withdrawals/recharges, and reset details.",
  );

  const isLgUp = useIsLgUp();
  const [mobileDeleteTab, setMobileDeleteTab] = useState<DeleteCategoryStep>("orders");
  useEffect(() => {
    if (open) setMobileDeleteTab("orders");
  }, [open]);

  const categoryPanelProps = {
    deleteSelections,
    setDeleteSelections,
    t,
    mbLong1,
    mbLong2,
  };

  return (
    <AlertDialog
      open={open}
      onOpenChange={(next) => {
        if (!next && isDeleting) return;
        if (!next) setDeletePassword("");
        onOpenChange(next);
      }}
    >
      <AlertDialogContent
        className={cn(
          "grid !max-h-[min(94dvh,960px)] w-[min(97vw,82rem)] max-w-none grid-rows-[auto_minmax(0,1fr)_auto] gap-3 overflow-hidden p-4 sm:p-5",
          "max-md:!max-h-[min(90dvh,920px)]",
        )}
      >
        <AlertDialogHeader className="shrink-0 space-y-1 text-left">
          <AlertDialogTitle className="flex items-center gap-2 text-base text-destructive">
            <Trash2 className="h-4 w-4 shrink-0" />
            {t("删除数据", "Delete Data")}
          </AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-1 text-xs leading-snug text-muted-foreground">
              <span className="block">
                {t(
                  "请选择要删除的数据类型和保留时间。此操作不可撤销。",
                  "Select data types to delete and retention period. This action cannot be undone.",
                )}
              </span>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <div
          className={cn(
            "min-h-0 overflow-x-hidden",
            !isLgUp && "overflow-hidden",
            isLgUp && "overflow-y-auto pr-1 [-webkit-overflow-scrolling:touch]",
          )}
        >
          <div className="flex min-h-0 flex-col gap-3">
            {/* Toolbar: retention + batch actions */}
            <div className="flex shrink-0 flex-wrap items-end gap-3 border-b border-border pb-2.5">
              <div className="min-w-[180px] flex-1 space-y-0.5">
                <Label className="text-[11px] text-muted-foreground">{t("保留近期数据", "Retain Recent Data")}</Label>
                <Select value={deleteRetainMonths} onValueChange={setDeleteRetainMonths}>
                  <SelectTrigger className="h-8 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="0">{t("全部删除，不保留", "Delete all, no retention")}</SelectItem>
                    <SelectItem value="1">{t("保留近1个月", "Keep last 1 month")}</SelectItem>
                    <SelectItem value="3">{t("保留近3个月", "Keep last 3 months")}</SelectItem>
                    <SelectItem value="6">{t("保留近6个月", "Keep last 6 months")}</SelectItem>
                    <SelectItem value="12">{t("保留近12个月", "Keep last 12 months")}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex gap-1.5">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setDeleteSelections(SELECT_ALL_STATE)}
                >
                  {t("全选", "Select All")}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 px-3 text-xs"
                  onClick={() => setDeleteSelections(SELECT_NONE_STATE)}
                >
                  {t("取消全选", "Deselect All")}
                </Button>
              </div>
            </div>

            {/* Desktop: 5-column grid */}
            {isLgUp ? (
              <div className="grid min-h-0 auto-rows-min grid-cols-5 items-start gap-3">
                <DeleteCategoryPanel step="orders" {...categoryPanelProps} />
                <DeleteCategoryPanel step="members" {...categoryPanelProps} />
                <DeleteCategoryPanel step="merchant" {...categoryPanelProps} />
                <DeleteCategoryPanel step="tasks" {...categoryPanelProps} />
                <DeleteCategoryPanel step="other" {...categoryPanelProps} />
              </div>
            ) : (
              <Tabs
                value={mobileDeleteTab}
                onValueChange={(v) => setMobileDeleteTab(v as DeleteCategoryStep)}
                className="min-h-0"
              >
                <TabsList className="grid h-auto w-full grid-cols-5 gap-0.5 p-1">
                  <TabsTrigger
                    value="orders"
                    className="px-0.5 py-2 text-[9px] leading-tight sm:px-1 sm:text-[11px]"
                  >
                    {t("订单", "Orders")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="members"
                    className="px-0.5 py-2 text-[9px] leading-tight sm:px-1 sm:text-[11px]"
                  >
                    {t("会员", "Members")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="merchant"
                    className="px-0.5 py-2 text-[9px] leading-tight sm:px-1 sm:text-[11px]"
                  >
                    {t("结算", "Settle")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="tasks"
                    className="px-0.5 py-2 text-[9px] leading-tight sm:px-1 sm:text-[11px]"
                  >
                    {t("任务", "Tasks")}
                  </TabsTrigger>
                  <TabsTrigger
                    value="other"
                    className="px-0.5 py-2 text-[9px] leading-tight sm:px-1 sm:text-[11px]"
                  >
                    {t("其他", "Other")}
                  </TabsTrigger>
                </TabsList>
                <TabsContent value="orders" className="mt-2 min-h-0 overflow-y-auto outline-none">
                  <DeleteCategoryPanel step="orders" {...categoryPanelProps} />
                </TabsContent>
                <TabsContent value="members" className="mt-2 min-h-0 overflow-y-auto outline-none">
                  <DeleteCategoryPanel step="members" {...categoryPanelProps} />
                </TabsContent>
                <TabsContent value="merchant" className="mt-2 min-h-0 overflow-y-auto outline-none">
                  <DeleteCategoryPanel step="merchant" {...categoryPanelProps} />
                </TabsContent>
                <TabsContent value="tasks" className="mt-2 min-h-0 overflow-y-auto outline-none">
                  <DeleteCategoryPanel step="tasks" {...categoryPanelProps} />
                </TabsContent>
                <TabsContent value="other" className="mt-2 min-h-0 overflow-y-auto outline-none">
                  <DeleteCategoryPanel step="other" {...categoryPanelProps} />
                </TabsContent>
              </Tabs>
            )}

            {/* Password + progress */}
            <div className="shrink-0 space-y-2 border-t border-border pt-3">
              <div className="flex flex-wrap items-end gap-3">
                <div className="min-w-[240px] flex-1 space-y-1">
                  <Label className="text-[11px]">{t("管理员密码", "Admin Password")}</Label>
                  <p className="text-[10px] leading-tight text-muted-foreground">
                    {t(
                      "请输入当前登录账号的登录密码（非独立管理员口令）。",
                      "Enter your current account login password (not a separate admin PIN).",
                    )}
                  </p>
                  <Input
                    type="password"
                    name="current-password"
                    autoComplete="current-password"
                    className="h-9 text-sm"
                    value={deletePassword}
                    onChange={(e) => setDeletePassword(e.target.value)}
                    placeholder={t("当前账号登录密码", "Your account login password")}
                  />
                </div>
              </div>
              {isDeleting ? (
                <div className="space-y-2 rounded-md border border-destructive/25 bg-destructive/5 p-2.5">
                  <div className="flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-destructive" />
                    <span className="text-xs font-medium text-destructive">
                      {deleteProgress.total > 0
                        ? `${t("删除进度", "Deleting")}: ${deleteProgress.current}/${deleteProgress.total}`
                        : t("准备中...", "Preparing...")}
                    </span>
                  </div>
                  {deleteProgress.total > 0 ? (
                    <>
                      <div className="relative h-3 w-full overflow-hidden rounded-full bg-secondary">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-destructive to-destructive/80 transition-all duration-500 ease-out"
                          style={{
                            width: `${Math.round((deleteProgress.current / deleteProgress.total) * 100)}%`,
                          }}
                        />
                      </div>
                      <div className="flex items-center justify-between gap-2 text-[10px] text-muted-foreground">
                        <span className="min-w-0 truncate">
                          {t("当前步骤", "Current step")}: {deleteProgress.currentStep}
                        </span>
                        <span className="shrink-0 text-destructive/80">{t("请勿关闭页面", "Do not close this page")}</span>
                      </div>
                    </>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>
        </div>

        <AlertDialogFooter className="shrink-0 gap-2 border-t border-border pt-2.5 max-md:[&_button]:min-h-10 sm:justify-end">
          <AlertDialogCancel
            className="mt-0"
            onClick={() => {
              setDeletePassword("");
            }}
            disabled={isDeleting}
          >
            {t("取消", "Cancel")}
          </AlertDialogCancel>
          <Button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              onConfirmDelete();
            }}
            variant="destructive"
            size="sm"
            disabled={isDeleting}
          >
            {isDeleting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {deleteProgress.total > 0
                  ? `${deleteProgress.current}/${deleteProgress.total} ${t("删除中...", "Deleting...")}`
                  : t("准备中...", "Preparing...")}
              </>
            ) : (
              t("确认删除", "Confirm Delete")
            )}
          </Button>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
