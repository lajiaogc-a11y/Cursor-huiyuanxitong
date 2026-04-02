import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Gift, Info, Link2, Share2, SlidersHorizontal, Users } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { SectionTitle } from "./shared";

function SwitchRow({
  label,
  desc,
  checked,
  onChange,
  highlight,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** 邀请相关开关：左侧强调色条 */
  highlight?: "invite";
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between gap-4 rounded-xl border border-border/60 bg-card/80 px-4 py-3.5 shadow-sm transition-colors hover:border-primary/25 hover:bg-muted/20",
        highlight === "invite" && "border-emerald-500/30 bg-emerald-500/[0.04] hover:border-emerald-500/40",
      )}
    >
      <div className="min-w-0">
        <p className="text-sm font-semibold leading-snug">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} className="shrink-0" />
    </div>
  );
}

interface ActivityTabProps {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
}

export function ActivityTab({ settings, onSettingsChange }: ActivityTabProps) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      {/* 顶栏：与客服/登录等 tab 区分，一眼可见为新布局 */}
      <div className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/[0.08] via-card to-amber-500/[0.07] p-4 md:p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary shadow-inner">
            <Gift className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-bold tracking-tight text-foreground md:text-base">
              {t("任务与奖励", "Tasks & rewards")}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground md:text-[13px]">
              {t(
                "配置签到、分享、抽奖次数与会员邀请计划；与「幸运抽奖」奖品及会员端任务入口联动。修改后请保存草稿并发布。",
                "Check-in, share, spin counts, and the member invite program—linked to Lucky Spin prizes and member task UI. Save draft and publish to apply.",
              )}
            </p>
          </div>
        </div>
      </div>

      <p className="text-xs text-muted-foreground -mt-2 md:-mt-3">
        {t(
          "开关与数值：签到、分享、邀请、每日免费抽奖次数等；与「幸运抽奖」里的转盘奖品配置配合使用。",
          "Toggles and numbers for check-in, share, invite, daily free spins; works with prize config under Lucky Spin.",
        )}
      </p>

      <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
        <CardContent className="pt-5 pb-5 space-y-3">
          <SectionTitle className="flex items-center gap-2 !mt-0">
            <SlidersHorizontal className="h-4 w-4 text-primary" aria-hidden />
            {t("功能开关", "Feature toggles")}
          </SectionTitle>
          <SwitchRow
            label={t("启用抽奖功能", "Enable spin wheel")}
            desc={t("控制会员前端幸运抽奖入口", "Toggle the lucky spin entry in the member app")}
            checked={settings.enable_spin}
            onChange={(v) => onSettingsChange({ enable_spin: v })}
          />
          <SwitchRow
            label={t("启用邀请功能", "Enable invites")}
            desc={t("控制邀请好友入口与任务展示", "Toggle invite friends entry and tasks")}
            checked={settings.enable_invite}
            onChange={(v) => onSettingsChange({ enable_invite: v })}
            highlight="invite"
          />
          <SwitchRow
            label={t("启用签到任务", "Enable check-in")}
            desc={t("控制每日签到任务是否可见", "Toggle daily check-in task visibility")}
            checked={settings.enable_check_in}
            onChange={(v) => onSettingsChange({ enable_check_in: v })}
          />
          <SwitchRow
            label={t("启用分享奖励任务", "Enable share reward")}
            desc={t("控制 WhatsApp 分享领取抽奖次数任务", "Toggle WhatsApp share for spin chances")}
            checked={settings.enable_share_reward}
            onChange={(v) => onSettingsChange({ enable_share_reward: v })}
          />
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-sm overflow-hidden">
        <CardContent className="pt-5 pb-5 space-y-4">
          <SectionTitle className="flex items-center gap-2 !mt-0">
            <Gift className="h-4 w-4 text-amber-600 dark:text-amber-400" aria-hidden />
            {t("奖励数值配置", "Reward values")}
          </SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "单位：抽奖次数。以下数值决定会员通过各种行为可获得的抽奖机会。",
              "Unit: spin chances. These values determine how many spin chances members earn from activities.",
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("签到基础奖励", "Check-in base reward")}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                className="h-10 rounded-xl border-border/60"
                value={settings.checkin_reward_base}
                onChange={(e) => onSettingsChange({ checkin_reward_base: Number(e.target.value || 0) })}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("会员每天签到一次可获得的抽奖次数", "Spins per daily check-in")}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("连续签到 3 天额外奖励", "3-day streak bonus")}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                className="h-10 rounded-xl border-border/60"
                value={settings.checkin_reward_streak_3}
                onChange={(e) => onSettingsChange({ checkin_reward_streak_3: Number(e.target.value || 0) })}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("连续签到满3天时额外奖励的抽奖次数", "Extra spins at 3-day streak")}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("连续签到 7 天额外奖励", "7-day streak bonus")}</Label>
              <Input
                type="number"
                min={0}
                step={0.5}
                className="h-10 rounded-xl border-border/60"
                value={settings.checkin_reward_streak_7}
                onChange={(e) => onSettingsChange({ checkin_reward_streak_7: Number(e.target.value || 0) })}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("连续签到满7天时额外奖励的抽奖次数", "Extra spins at 7-day streak")}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("每日免费抽奖次数", "Daily free spins")}</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-10 rounded-xl border-border/60"
                value={settings.daily_free_spins_per_day}
                onChange={(e) =>
                  onSettingsChange({
                    daily_free_spins_per_day: Math.max(0, Number(e.target.value || 0)),
                  })
                }
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t(
                  "会员每天自动拥有的免费抽奖次数（无需做任务即可获得）",
                  "Free spins each day without completing tasks",
                )}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-border/50 bg-muted/25 p-4 space-y-4">
            <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
              <Share2 className="h-3.5 w-3.5" aria-hidden />
              {t("分享奖励", "Share rewards")}
            </p>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-2">
                <Label className="text-xs font-semibold">{t("分享奖励次数", "Share reward spins")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 rounded-xl border-border/60 bg-background"
                  value={settings.share_reward_spins}
                  onChange={(e) => onSettingsChange({ share_reward_spins: Number(e.target.value || 0) })}
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("会员每次成功分享可获得的抽奖次数", "Spins per successful share")}
                </p>
              </div>
              <div className="space-y-2">
                <Label className="text-xs font-semibold">{t("每日分享奖励上限", "Daily share reward limit")}</Label>
                <Input
                  type="number"
                  min={0}
                  step={1}
                  className="h-10 rounded-xl border-border/60 bg-background"
                  value={settings.daily_share_reward_limit}
                  onChange={(e) =>
                    onSettingsChange({
                      daily_share_reward_limit: Math.max(0, Number(e.target.value || 0)),
                    })
                  }
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  {t("会员每天通过分享最多可获得的奖励次数（0 = 不限制）", "Max share rewards per day (0 = unlimited)")}
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 会员邀请：独立视觉模块（与员工邀请码区分） */}
      <Card className="rounded-2xl border-2 border-emerald-500/25 bg-gradient-to-b from-emerald-500/[0.07] via-card to-card shadow-md overflow-hidden">
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-start gap-3">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
              <Users className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <h4 className="text-sm font-bold text-foreground tracking-tight">
                {t("会员邀请计划", "Member invite program")}
              </h4>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {t(
                  "配置邀请双方抽奖奖励、每日上限与分享前缀文案；会员在「邀请」页复制专属链接。",
                  "Invitee/inviter spin rewards, daily caps, and share prefix copy—members get links on the Invite page.",
                )}
              </p>
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("邀请奖励（双方各得）", "Invite reward (both sides)")}</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-10 rounded-xl border-emerald-500/20 bg-background"
                value={settings.invite_reward_spins}
                onChange={(e) => onSettingsChange({ invite_reward_spins: Number(e.target.value || 0) })}
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t(
                  "每成功邀请1位新会员，邀请者和被邀请者各获得的抽奖次数",
                  "Spins for both inviter and invitee per successful invite",
                )}
              </p>
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("每日邀请奖励上限", "Daily invite reward limit")}</Label>
              <Input
                type="number"
                min={0}
                step={1}
                className="h-10 rounded-xl border-emerald-500/20 bg-background"
                value={settings.daily_invite_reward_limit}
                onChange={(e) =>
                  onSettingsChange({
                    daily_invite_reward_limit: Math.max(0, Number(e.target.value || 0)),
                  })
                }
              />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                {t("会员每天通过邀请最多可获得的奖励次数（0 = 不限制）", "Max invite rewards per day (0 = unlimited)")}
              </p>
            </div>
          </div>

          <Alert className="rounded-xl border-amber-200/90 bg-amber-50/90 dark:border-amber-900/55 dark:bg-amber-950/35">
            <Info className="h-4 w-4 text-amber-700 dark:text-amber-400 shrink-0" />
            <AlertDescription className="text-sm text-foreground/90 leading-relaxed">
              {t(
                "此处为「会员邀请会员」：新用户通过链接中的令牌注册，或在会员端「注册」页输入同一令牌。与后台「系统设置 → 员工邀请码」（员工注册）不是同一功能。",
                "Member-to-member invites: new users register with the token in the link or on the member Register page. This is not System Settings → Staff invitation codes for employees.",
              )}
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <Label className="text-xs font-semibold flex items-center gap-2">
              <Link2 className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" aria-hidden />
              {t("邀请链接前缀文案", "Invite link prefix text")}
            </Label>
            <Textarea
              value={(settings as { invite_link_prefix?: string }).invite_link_prefix || ""}
              onChange={(e) => onSettingsChange({ invite_link_prefix: e.target.value } as Partial<MemberPortalSettings>)}
              placeholder={t("例如：🎁 Join us and win big prizes!", "e.g. 🎁 Join us and win big prizes!")}
              rows={3}
              className="resize-none rounded-xl border-emerald-500/20 bg-background min-h-[88px]"
            />
            <p className="text-[11px] text-muted-foreground leading-relaxed">
              {t("会员分享邀请链接时附带的宣传文案", "Promotional text when members share invite links")}
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
