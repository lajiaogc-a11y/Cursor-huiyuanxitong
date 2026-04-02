import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { AnnouncementPopupFrequency, MemberPortalSettings } from "@/services/members/memberPortalSettingsService";

// ─── 分区标题组件 ──────────────────────────────────────────────────────────────
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

interface FrontendSettingsTabProps {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
}

export function FrontendSettingsTab({ settings, onSettingsChange }: FrontendSettingsTabProps) {
  const { t } = useLanguage();

  const popupFreq: AnnouncementPopupFrequency =
    settings.announcement_popup_frequency === "every_login" ||
    settings.announcement_popup_frequency === "daily_first"
      ? settings.announcement_popup_frequency
      : settings.show_announcement_popup
        ? "every_login"
        : "off";

  const setPopupFreq = (v: AnnouncementPopupFrequency) => {
    onSettingsChange({
      announcement_popup_frequency: v,
      show_announcement_popup: v !== "off",
    });
  };

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "配置会员首页公告弹窗等；快捷入口已不再包含兑换/客服入口。保存草稿并发布后会员端与缓存会同步更新。多设备请用「保存草稿」写入服务器。",
          "Announcement popup and home behavior; quick access no longer includes redeem/support tiles. Publish draft to sync. Use Save Draft across devices.",
        )}
      </p>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("首页 Total Points 说明", "Home — Total Points popover")}</SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "仅作用于会员首页数据卡「Total Points」旁 Info 打开的弹窗（与积分商城页顶部的说明分开）。中英文填其一即可，优先英文。保存草稿并发布后会员端同步。",
              "Shown in the popover next to \u201CTotal Points\u201D on the member home dashboard only (separate from the Points Mall hint). Use either language; English wins if both set. Publish draft to sync.",
            )}
          </p>
          <div className="space-y-2">
            <Label>{t("说明（英文）", "Hint (English)")}</Label>
            <Textarea
              value={settings.home_points_balance_hint_en}
              onChange={(e) => onSettingsChange({ home_points_balance_hint_en: e.target.value })}
              rows={3}
              placeholder="Matches account balance (redemptions split across buckets)."
            />
          </div>
          <div className="space-y-2">
            <Label>{t("说明（中文）", "Hint (Chinese)")}</Label>
            <Textarea
              value={settings.home_points_balance_hint_zh}
              onChange={(e) => onSettingsChange({ home_points_balance_hint_zh: e.target.value })}
              rows={3}
              placeholder={t("与英文二选一或同时填写；会员端优先展示英文。", "Optional; member app prefers English when both are set.")}
            />
          </div>
        </CardContent>
      </Card>

      {/* 公告弹窗 */}
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("公告弹窗", "Announcement Popup")}</SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "选择展示频率；须填写下方弹窗内容后会员端才会出现。保存草稿并发布后生效。",
              "Pick how often to show the modal; members only see it when content below is set. Save draft and publish to apply.",
            )}
          </p>
          <div className="space-y-2">
            <Label className="text-sm">{t("展示频率", "When to show")}</Label>
            <RadioGroup
              value={popupFreq}
              onValueChange={(val) => setPopupFreq(val as AnnouncementPopupFrequency)}
              className="grid gap-2"
            >
              <label
                htmlFor="ann-popup-off"
                className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <RadioGroupItem id="ann-popup-off" value="off" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium leading-snug">{t("关闭", "Off")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t("不在首页弹出公告", "Do not show the announcement modal")}
                  </p>
                </div>
              </label>
              <label
                htmlFor="ann-popup-daily"
                className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <RadioGroupItem id="ann-popup-daily" value="daily_first" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium leading-snug">{t("每天首次进入首页", "First visit each day")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "每个自然日会员第一次打开首页时弹出一次（按设备本地日期；关闭后当天不再弹出）",
                      "Once per calendar day on first home visit (device local date; dismissed stays hidden until the next day)",
                    )}
                  </p>
                </div>
              </label>
              <label
                htmlFor="ann-popup-session"
                className="flex cursor-pointer items-start gap-3 rounded-xl border bg-card px-4 py-3"
              >
                <RadioGroupItem id="ann-popup-session" value="every_login" className="mt-0.5" />
                <div>
                  <p className="text-sm font-medium leading-snug">{t("每次登录后（每会话一次）", "After each sign-in (once per session)")}</p>
                  <p className="text-xs text-muted-foreground mt-0.5">
                    {t(
                      "浏览器会话内首次进入首页时弹出；关闭标签或退出后再登录可再次看到（同一会话内刷新不重复）",
                      "First home visit in each browser session; new session after closing the tab signs in again (refresh in same session does not repeat)",
                    )}
                  </p>
                </div>
              </label>
            </RadioGroup>
          </div>
          <div className="space-y-2">
            <Label>{t("弹窗标题", "Popup Title")}</Label>
            <Input
              value={settings.announcement_popup_title}
              onChange={(e) => onSettingsChange({ announcement_popup_title: e.target.value })}
              placeholder={t("系统公告", "System Announcement")}
            />
          </div>
          <div className="space-y-2">
            <Label>{t("弹窗内容", "Popup Content")}</Label>
            <Textarea
              value={settings.announcement_popup_content || ""}
              onChange={(e) => onSettingsChange({ announcement_popup_content: e.target.value })}
              rows={3}
              placeholder={t("例如：本周五晚 10:00-11:00 系统维护", "e.g. System maintenance this Friday 10:00-11:00 PM")}
            />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
