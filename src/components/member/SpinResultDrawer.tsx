import { Trophy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import type { DrawResult } from "@/services/memberPortal/memberLotteryPageService";

export type SpinResultPrize = NonNullable<DrawResult["prize"]>;

export type SpinResultDrawerProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  result: SpinResultPrize | null;
  lastDrawRewardPoints: number | undefined;
  lastDrawRewardStatus: string | undefined;
  lastDrawMeta: { budget_warning?: string; risk_downgraded?: boolean } | null;
  remaining: number;
  onClose: () => void;
  onSpinAgain: () => void;
  t: (zh: string, en: string) => string;
};

function SpinResultBody({
  result,
  lastDrawRewardPoints,
  lastDrawRewardStatus,
  lastDrawMeta,
  t,
}: Pick<
  SpinResultDrawerProps,
  "result" | "lastDrawRewardPoints" | "lastDrawRewardStatus" | "lastDrawMeta" | "t"
>) {
  if (!result) return null;
  if (result.type === "points") {
    const displayPoints = lastDrawRewardPoints ?? result.value;
    const rewardFailed = lastDrawRewardStatus === "failed";
    return (
      <div className="px-1 py-3 text-center">
        <div className="mb-2 text-5xl" role="img" aria-hidden>
          {rewardFailed ? "⚠️" : "🎉"}
        </div>
        <p className="m-0 mb-1 text-xl font-extrabold text-pu-gold-soft">
          {rewardFailed
            ? t("积分发放异常，请稍后查看账户", "Points delivery issue. Please check your account later.")
            : t(`恭喜获得 ${displayPoints} 积分！`, `Congrats! You won ${displayPoints} points!`)}
        </p>
        <p className="m-0 text-[13px] text-[hsl(var(--pu-m-text-dim)/0.85)]">
          {rewardFailed
            ? t("系统将自动补发，无需重复操作", "System will auto-retry. No action needed.")
            : t("积分已发放到账户", "Points credited to your account")}
        </p>
      </div>
    );
  }
  if (result.type === "custom") {
    return (
      <div className="px-1 py-3 text-center">
        <div className="mb-2 text-5xl" role="img" aria-hidden>
          🎁
        </div>
        <p className="m-0 mb-1 text-xl font-extrabold text-pu-emerald-soft">
          {t(`中奖：${result.name}`, `You won: ${result.name}`)}
        </p>
        {result.description ? (
          <p className="mx-auto mb-3 max-w-sm text-[13px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.85)]">
            {result.description}
          </p>
        ) : null}
        <div className="inline-block rounded-xl border border-pu-emerald/30 bg-pu-emerald/12 px-3.5 py-2 text-xs font-semibold text-pu-emerald-soft">
          {t("奖品将由客服为您处理", "Prize will be processed by customer service")}
        </div>
      </div>
    );
  }
  return (
    <div className="px-1 py-3 text-center">
      <div className="mb-2 text-5xl" role="img" aria-hidden>
        😊
      </div>
      <p className="m-0 mb-1 text-lg font-bold text-[hsl(var(--pu-m-text))]">
        {t("感谢参与！", "Thanks for playing!")}
      </p>
      <p className="m-0 text-[13px] text-[hsl(var(--pu-m-text-dim)/0.8)]">
        {lastDrawMeta?.risk_downgraded
          ? t("操作频率较高，请稍后再试可获得更好奖品。", "High activity detected. Try again later for better rewards.")
          : lastDrawMeta?.budget_warning === "BUDGET_EXCEEDED" || lastDrawMeta?.budget_warning === "RTP_LIMIT_REACHED"
            ? t("今日奖池接近上限，明天会有更多惊喜！", "Today's prizes are running low. More surprises tomorrow!")
            : t("下次好运！", "Better luck next time!")}
      </p>
    </div>
  );
}

export function SpinResultDrawer({
  open,
  onOpenChange,
  result,
  lastDrawRewardPoints,
  lastDrawRewardStatus,
  lastDrawMeta,
  remaining,
  onClose,
  onSpinAgain,
  t,
}: SpinResultDrawerProps) {
  return (
    <DrawerDetail
      open={open}
      onOpenChange={onOpenChange}
      variant="member"
      title={
        <span className="inline-flex items-center gap-2">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-pu-gold/30 bg-gradient-to-br from-pu-gold/20 to-pu-gold/[0.05]">
            <Trophy className="text-pu-gold-soft" size={16} strokeWidth={2.2} aria-hidden />
          </span>
          {t("抽奖结果", "Spin result")}
        </span>
      }
      description={
        result?.type === "points"
          ? t("积分已计入您的账户", "Points were credited to your account")
          : result?.type === "custom"
            ? t("您获得的奖品", "Your prize")
            : t("谢谢参与", "Thanks for playing")
      }
      sheetMaxWidth="xl"
    >
      <div className="space-y-4">
        <SpinResultBody
          result={result}
          lastDrawRewardPoints={lastDrawRewardPoints}
          lastDrawRewardStatus={lastDrawRewardStatus}
          lastDrawMeta={lastDrawMeta}
          t={t}
        />
        <div className="flex flex-col gap-2.5 border-t border-pu-gold/10 pt-4">
          {remaining > 0 && (
            <Button
              type="button"
              className="btn-glow h-11 w-full rounded-xl border-0 text-[15px] font-bold text-[hsl(var(--pu-primary-foreground))] shadow-[0_4px_14px_hsl(var(--pu-gold)/0.25)] hover:opacity-95"
              onClick={onSpinAgain}
            >
              {t("再抽一次", "Spin again")}
            </Button>
          )}
          <Button
            type="button"
            variant="outline"
            className="h-10 w-full rounded-xl border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.5)] text-sm text-[hsl(var(--pu-m-text)/0.9)] hover:bg-[hsl(var(--pu-m-surface)/0.7)]"
            onClick={onClose}
          >
            {t("关闭", "Close")}
          </Button>
        </div>
      </div>
    </DrawerDetail>
  );
}
