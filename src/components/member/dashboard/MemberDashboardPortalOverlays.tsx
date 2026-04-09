import { Link } from "react-router-dom";
import { Megaphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import { LoadingButton } from "@/components/ui/LoadingButton";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Sheet, SheetContent, SheetTitle } from "@/components/ui/sheet";
import { MemberAnnouncementDrawerImage } from "@/components/member/dashboard/MemberAnnouncementDrawerImage";
import { ROUTES } from "@/routes/constants";
import { formatAnnouncementPublishedAt } from "@/lib/memberPortalAnnouncementDate";
import type { AnnouncementItem } from "@/services/members/memberPortalSettingsService";

export interface MemberDashboardPointsBreakdownPanelProps {
  t: (zh: string, en: string) => string;
  fmtPts: (n: number) => string;
  themeColor: string;
  animDashTotal: number;
  animDashAvail: number;
  animDashFrozen: number;
  animReferralCount: number;
  animConsumptionPts: number;
  animBucketReferralPts: number;
  animLotteryPts: number;
  homePointsBalanceFooter: string;
  pointsPopoverMallNote: string;
}

export function MemberDashboardPointsBreakdownPanel({
  t,
  fmtPts,
  themeColor,
  animDashTotal,
  animDashAvail,
  animDashFrozen,
  animReferralCount,
  animConsumptionPts,
  animBucketReferralPts,
  animLotteryPts,
  homePointsBalanceFooter,
  pointsPopoverMallNote,
}: MemberDashboardPointsBreakdownPanelProps) {
  return (
    <div className="text-xs leading-relaxed text-[hsl(var(--pu-m-text)/0.92)]">
      <div>
        {t("总积分（活动数据剩余）", "Total points (activity remaining)")}: <b>{fmtPts(animDashTotal)}</b>
      </div>
      <div>
        {t("可用积分", "Available points")}: <b>{fmtPts(animDashAvail)}</b>
      </div>
      <div>
        {t("冻结积分（待审核兑换）", "Frozen (pending mall)")}: <b>{fmtPts(animDashFrozen)}</b>
      </div>
      <div>
        {t("推荐人数", "Referrals")}: <b>{Math.round(animReferralCount).toLocaleString()}</b>
      </div>
      <div className="mt-2 text-[11px] text-[hsl(var(--pu-m-text-dim))]">
        {t("分类占比（用于展示）", "Bucket mix (display)")}
      </div>
      <div>
        {t("消费", "Consumption")}: <b>{fmtPts(animConsumptionPts)}</b>
      </div>
      <div>
        {t("推荐", "Referral")}: <b>{fmtPts(animBucketReferralPts)}</b>
      </div>
      <div>
        {t("抽奖", "Lottery")}: <b>{fmtPts(animLotteryPts)}</b>
      </div>
      <div className="mt-2 border-t border-[hsl(var(--pu-m-surface-border)/0.22)] pt-2 text-[hsl(var(--pu-m-text-dim)/0.95)] [word-break:break-word] [white-space:pre-wrap]">
        {homePointsBalanceFooter}
      </div>
      <div className="mt-2 border-t border-[hsl(var(--pu-m-surface-border)/0.22)] pt-2 text-[hsl(var(--pu-m-text-dim)/0.95)]">
        {pointsPopoverMallNote}
      </div>
      <div style={{ marginTop: 10 }}>
        <Link
          to={ROUTES.MEMBER.POINTS}
          style={{ display: "inline-block", fontSize: 12, fontWeight: 700, color: themeColor, textDecoration: "none" }}
        >
          {t("进入积分商城", "Open Points Mall")} →
        </Link>
      </div>
    </div>
  );
}

export interface MemberDashboardPortalOverlaysProps {
  t: (zh: string, en: string) => string;
  language: string;
  pointsInfoOpen: boolean;
  onPointsInfoOpenChange: (open: boolean) => void;
  pointsBreakdown: MemberDashboardPointsBreakdownPanelProps;
  popupOpen: boolean;
  onAnnouncementPopupClose: () => void;
  announcementPopupTitle: string;
  announcementPopupContent: string;
  selectedAnn: AnnouncementItem | null;
  onSelectedAnnOpenChange: (open: boolean) => void;
  signOutOpen: boolean;
  onSignOutOpenChange: (open: boolean) => void;
  signOutLoading: boolean;
  onSignOutLoadingChange: (loading: boolean) => void;
  onSignOut: () => void;
}

export function MemberDashboardPortalOverlays({
  t,
  language,
  pointsInfoOpen,
  onPointsInfoOpenChange,
  pointsBreakdown,
  popupOpen,
  onAnnouncementPopupClose,
  announcementPopupTitle,
  announcementPopupContent,
  selectedAnn,
  onSelectedAnnOpenChange,
  signOutOpen,
  onSignOutOpenChange,
  signOutLoading,
  onSignOutLoadingChange,
  onSignOut,
}: MemberDashboardPortalOverlaysProps) {
  return (
    <>
      <DrawerDetail
        open={pointsInfoOpen}
        onOpenChange={onPointsInfoOpenChange}
        variant="member"
        title={t("积分构成", "Points breakdown")}
        sheetMaxWidth="xl"
      >
        <MemberDashboardPointsBreakdownPanel {...pointsBreakdown} />
      </DrawerDetail>

      <Sheet
        open={popupOpen}
        onOpenChange={(open) => {
          if (!open) onAnnouncementPopupClose();
        }}
      >
        <SheetContent
          side="center"
          showClose={false}
          overlayClassName="z-[1100] member-announcement-overlay"
          className="member-announcement-sheet !z-[1110] focus:outline-none"
          aria-labelledby="member-announcement-title"
          aria-describedby="member-announcement-body"
          onPointerDownOutside={(e) => e.preventDefault()}
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <div className="member-announcement-modal">
            <header className="member-announcement-modal__header">
              <div className="member-announcement-modal__badge">
                <Megaphone size={10} strokeWidth={2.5} aria-hidden />
                <span>{t("公告", "Announcement")}</span>
              </div>
              <div className="member-announcement-modal__icon-box" aria-hidden>
                <Megaphone size={22} strokeWidth={2} />
              </div>
              <SheetTitle asChild>
                <h2 id="member-announcement-title" className="member-announcement-modal__title">
                  {announcementPopupTitle || t("系统公告", "System Announcement")}
                </h2>
              </SheetTitle>
              <p className="member-announcement-modal__subtitle">
                {t("来自团队的重要提示", "Important notice from the team")}
              </p>
              <div className="member-announcement-modal__divider" aria-hidden />
            </header>

            <div
              className="member-announcement-modal__body"
              id="member-announcement-body"
              role="region"
              aria-label={t("公告正文", "Announcement content")}
            >
              <div className="member-announcement-modal__content-card">
                <div className="member-announcement-modal__text">{announcementPopupContent || ""}</div>
              </div>
            </div>

            <footer className="member-announcement-modal__footer">
              <Button type="button" className="member-announcement-modal__btn" onClick={onAnnouncementPopupClose}>
                {t("知道了", "Understood")}
              </Button>
              <p className="member-announcement-modal__hint">
                {t("请仔细阅读后继续", "Please read carefully before continuing")}
              </p>
            </footer>
          </div>
        </SheetContent>
      </Sheet>

      <DrawerDetail
        open={!!selectedAnn}
        onOpenChange={onSelectedAnnOpenChange}
        variant="member"
        title={(selectedAnn?.title && selectedAnn.title.trim()) || t("公告", "Announcement")}
        description={
          formatAnnouncementPublishedAt(selectedAnn?.published_at, language as "zh" | "en") ||
          t("来自团队", "From your team")
        }
        sheetMaxWidth="2xl"
      >
        <div className="space-y-4">
          <div style={{ maxHeight: "min(60vh, 420px)", overflowY: "auto" }}>
            {selectedAnn?.image_url && String(selectedAnn.image_url).trim() ? (
              <MemberAnnouncementDrawerImage
                stableKey={`ann-${selectedAnn.sort_order}-${String(selectedAnn.image_url).trim()}`}
                rawUrl={selectedAnn.image_url}
              />
            ) : null}
            <div className="whitespace-pre-wrap text-sm leading-[1.65] text-[hsl(var(--pu-m-text-dim))]">
              {selectedAnn?.content || ""}
            </div>
          </div>
          <Button
            type="button"
            className="h-11 w-full rounded-xl border-0 text-sm font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
            style={{
              background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
            }}
            onClick={() => onSelectedAnnOpenChange(false)}
          >
            {t("关闭", "Close")}
          </Button>
        </div>
      </DrawerDetail>

      <DrawerDetail
        open={signOutOpen}
        onOpenChange={onSignOutOpenChange}
        variant="member"
        headerAlign="center"
        title={t("退出登录", "Sign out")}
        description={t("确定要退出当前账号吗？", "Are you sure you want to sign out?")}
        sheetMaxWidth="xl"
      >
        <div className="flex w-full flex-wrap items-center justify-center gap-2 border-t border-[hsl(var(--pu-m-surface-border)/0.35)] pt-4">
          <Button
            type="button"
            variant="outline"
            className="h-11 rounded-xl border-[hsl(var(--pu-m-surface-border)/0.4)] bg-[hsl(var(--pu-m-surface)/0.35)] text-[hsl(var(--pu-m-text))] hover:bg-[hsl(var(--pu-m-surface)/0.55)] hover:text-[hsl(var(--pu-m-text))]"
            onClick={() => onSignOutOpenChange(false)}
          >
            {t("取消", "Cancel")}
          </Button>
          <LoadingButton
            type="button"
            loading={signOutLoading}
            className="h-11 rounded-xl border-0 bg-red-600 px-6 font-semibold text-white hover:bg-red-700"
            onClick={() => {
              if (signOutLoading) return;
              onSignOutLoadingChange(true);
              onSignOut();
              onSignOutOpenChange(false);
              onSignOutLoadingChange(false);
            }}
          >
            {t("退出登录", "Sign out")}
          </LoadingButton>
        </div>
      </DrawerDetail>
    </>
  );
}
