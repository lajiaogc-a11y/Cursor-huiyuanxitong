import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Badge } from "@/components/ui/badge";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import type { SpinCreditDetailRow } from "@/services/staff/dataApi/activityData";

export interface ActivitySpinDetailDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rows: SpinCreditDetailRow[];
  remaining: number;
  loading: boolean;
  memberLabel: string;
}

export function ActivitySpinDetailDrawer({
  open,
  onOpenChange,
  rows,
  remaining,
  loading,
  memberLabel,
}: ActivitySpinDetailDrawerProps) {
  const { t } = useLanguage();

  return (
    <DrawerDetail
      open={open}
      onOpenChange={onOpenChange}
      title={`${t("抽奖次数明细", "Spin Credits Detail")} — ${memberLabel}`}
      sheetMaxWidth="3xl"
    >
      <div className="space-y-4">
        <div className="flex items-center gap-4 text-sm">
          <span className="text-muted-foreground">{t("当前剩余次数", "Current remaining")}:</span>
          <span className="font-bold text-violet-600 dark:text-violet-400 text-lg tabular-nums">
            {remaining}
          </span>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm gap-2">
            <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"
              />
            </svg>
            {t("加载中…", "Loading…")}
          </div>
        ) : rows.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground text-sm">
            {t("暂无抽奖次数记录", "No spin credit records")}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <Table className="text-sm">
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="text-center whitespace-nowrap">{t("时间", "Time")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("变动次数", "Change")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("来源", "Source")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("变动前次数", "Before")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("变动后次数", "After")}</TableHead>
                  <TableHead className="text-center whitespace-nowrap">{t("剩余次数", "Remaining")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((row, idx) => {
                  const isConsumption = row.amount < 0;
                  const sourceLabel = (() => {
                    const s = row.source;
                    if (!s) return "—";
                    if (s === "lottery_draw") return t("抽奖消耗", "Lottery draw");
                    if (s === "daily_free_draw") return t("每日免费抽奖", "Daily free draw");
                    if (s === "share") return t("分享奖励", "Share reward");
                    if (s.startsWith("order_completed:")) return t("完成订单", "Order completed");
                    if (s === "referral") return t("邀请奖励", "Referral reward");
                    if (s === "invite_welcome") return t("注册欢迎", "Welcome bonus");
                    if (s === "check_in") return t("签到奖励", "Check-in reward");
                    if (s === "daily_free") return t("每日免费", "Daily free");
                    if (s === "admin_grant") return t("管理员发放", "Admin granted");
                    return s;
                  })();
                  return (
                    <TableRow key={idx}>
                      <TableCell className="text-center text-xs whitespace-nowrap">
                        {formatBeijingTime(row.created_at)}
                      </TableCell>
                      <TableCell
                        className={`text-center font-medium tabular-nums ${isConsumption ? "text-red-500" : "text-green-600"}`}
                      >
                        {isConsumption ? String(row.amount) : `+${row.amount}`}
                      </TableCell>
                      <TableCell className="text-center">
                        <Badge variant={isConsumption ? "destructive" : "outline"} className="text-[10px]">
                          {sourceLabel}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-center text-muted-foreground tabular-nums">
                        {row.balance_before}
                      </TableCell>
                      <TableCell className="text-center font-medium tabular-nums">{row.balance_after}</TableCell>
                      <TableCell className="text-center font-bold text-violet-600 dark:text-violet-400 tabular-nums">
                        {remaining}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        )}
        <div className="border-t border-border pt-4 mt-4">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            {t("关闭", "Close")}
          </Button>
        </div>
      </div>
    </DrawerDetail>
  );
}
