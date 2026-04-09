import { useState, useRef, useCallback, type MutableRefObject } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Gift, Info, Link2, Share2, SlidersHorizontal, Users, Image as ImageIcon, Upload, Check } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { cn } from "@/lib/utils";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { BANNER_MAX_DIMENSION } from "@/lib/imageClientCompress";
import { uploadImageFileAsWebp } from "@/services/uploadService";
import { POSTER_FRAMES, type PosterFrame } from "@/lib/invitePosterFrames";
import { SectionTitle } from "./shared";
import { notify } from "@/lib/notifyHub";

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

      <PosterSettingsSection settings={settings} onSettingsChange={onSettingsChange} t={t} />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════
 *  海报设置区块
 * ════════════════════════════════════════════════════════════════════════ */

function PosterSettingsSection({
  settings,
  onSettingsChange,
  t,
}: {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
  t: (zh: string, en: string) => string;
}) {
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const handleUploadBg = useCallback(async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      notify.error(t("请选择图片文件", "Please select an image file"));
      return;
    }
    setUploading(true);
    try {
      const resp = await uploadImageFileAsWebp(file, {
        maxDimension: BANNER_MAX_DIMENSION,
        quality: 0.85,
        outputName: "poster-bg",
      });
      if (resp?.success && resp.url) {
        onSettingsChange({ poster_custom_bg_url: resp.url });
        notify.success(t("背景图已上传", "Background image uploaded"));
      } else {
        notify.error(t("上传失败", "Upload failed"));
      }
    } catch {
      notify.error(t("上传失败", "Upload failed"));
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }, [onSettingsChange, t]);

  return (
    <Card className="rounded-2xl border-2 border-violet-500/25 bg-gradient-to-b from-violet-500/[0.07] via-card to-card shadow-md overflow-hidden">
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="flex items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-400">
            <ImageIcon className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <h4 className="text-sm font-bold text-foreground tracking-tight">
              {t("邀请海报设置", "Invite poster settings")}
            </h4>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t(
                "配置会员端「保存邀请海报」的文字和模板样式；二维码自动嵌入海报中央。",
                "Configure text and visual template for the member \"Save invite poster\"; QR code auto-embeds in center.",
              )}
            </p>
          </div>
        </div>

        {/* 文字设置 */}
        <div className="rounded-xl border border-border/50 bg-muted/25 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("海报文字", "Poster text")}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("标题（中文）", "Headline (Chinese)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_headline_zh}
                onChange={(e) => onSettingsChange({ poster_headline_zh: e.target.value })}
                placeholder={t("邀请好友", "邀请好友")}
                maxLength={40}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("标题（英文）", "Headline (English)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_headline_en}
                onChange={(e) => onSettingsChange({ poster_headline_en: e.target.value })}
                placeholder="Invite friends"
                maxLength={40}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              "海报顶部大标题，分两行显示。留空则使用默认「邀请好友 / 赢取奖励」。",
              "Poster headline displayed in two lines. Leave empty for default \"Invite friends / Earn rewards\".",
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("副标题（中文）", "Subtext (Chinese)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_subtext_zh}
                onChange={(e) => onSettingsChange({ poster_subtext_zh: e.target.value })}
                placeholder={t("扫描下方二维码注册，双方各得 {spins} 次抽奖", "扫描下方二维码注册，双方各得 {spins} 次抽奖")}
                maxLength={80}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("副标题（英文）", "Subtext (English)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_subtext_en}
                onChange={(e) => onSettingsChange({ poster_subtext_en: e.target.value })}
                placeholder="Scan QR to register, {spins} free spins each"
                maxLength={80}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              "二维码上方说明文字。可使用 {spins} 占位符，系统会自动替换为当前奖励次数。留空使用默认文案。",
              "Text above QR code. Use {spins} placeholder—auto replaced with current reward spins. Leave empty for default.",
            )}
          </p>

          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("底部文字（中文）", "Footer (Chinese)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_footer_zh}
                onChange={(e) => onSettingsChange({ poster_footer_zh: e.target.value })}
                placeholder={t("公司名称", "Company Name")}
                maxLength={60}
              />
            </div>
            <div className="space-y-2">
              <Label className="text-xs font-semibold">{t("底部文字（英文）", "Footer (English)")}</Label>
              <Input
                className="h-10 rounded-xl border-border/60"
                value={settings.poster_footer_en}
                onChange={(e) => onSettingsChange({ poster_footer_en: e.target.value })}
                placeholder="Company Name"
                maxLength={60}
              />
            </div>
          </div>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t("海报最底部公司名或品牌文字。留空则使用公司名称。", "Company or brand name at poster bottom. Leave empty for company name.")}
          </p>
        </div>

        {/* 模板选择 */}
        <div className="rounded-xl border border-border/50 bg-muted/25 p-4 space-y-4">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
            {t("内置海报模板", "Built-in poster templates")}
          </p>
          <p className="text-[11px] text-muted-foreground -mt-2">
            {t(
              "选择一个内置配色模板。如上传自定义背景图，则模板配色仅用于文字颜色。",
              "Choose a built-in color scheme. If a custom background is uploaded, only text colors from the template are used.",
            )}
          </p>
          <div className="grid grid-cols-5 gap-2">
            {POSTER_FRAMES.map((frame) => (
              <PosterFramePreview
                key={frame.id}
                frame={frame}
                selected={settings.poster_frame_id === frame.id}
                onClick={() => onSettingsChange({ poster_frame_id: frame.id })}
                t={t}
              />
            ))}
          </div>
        </div>

        {/* 自定义背景 */}
        <div className="rounded-xl border border-border/50 bg-muted/25 p-4 space-y-3">
          <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
            <Upload className="h-3.5 w-3.5" aria-hidden />
            {t("自定义海报背景", "Custom poster background")}
          </p>
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            {t(
              "上传自定义背景图后将覆盖内置模板背景。推荐尺寸：750×1334px（9:16 竖屏比例）。二维码区域位于画布中央偏上（约 y=520, 280×280px），请在设计时预留该区域为浅色或透明。上传图片会自动转为 WebP 格式。",
              "Upload a custom background to override the built-in template. Recommended: 750×1334px (9:16 portrait). QR code area is center-upper (approx y=520, 280×280px)—keep that area light or transparent. Images auto-convert to WebP.",
            )}
          </p>

          <div className="flex items-center gap-3 flex-wrap">
            {settings.poster_custom_bg_url ? (
              <div className="relative">
                <img
                  src={settings.poster_custom_bg_url}
                  alt="poster bg"
                  className="h-28 w-auto rounded-lg border border-border/60 object-cover"
                />
                <button
                  type="button"
                  className="absolute -right-2 -top-2 flex h-6 w-6 items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-bold shadow"
                  onClick={() => onSettingsChange({ poster_custom_bg_url: null })}
                  title={t("移除", "Remove")}
                >
                  ×
                </button>
              </div>
            ) : null}
            <label
              className={cn(
                "flex h-28 w-28 cursor-pointer flex-col items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-border/60 text-muted-foreground transition-colors hover:border-primary/40 hover:bg-muted/30",
                uploading && "pointer-events-none opacity-50",
              )}
            >
              <Upload className="h-5 w-5" />
              <span className="text-[10px] font-medium">{uploading ? t("上传中…", "Uploading…") : t("上传图片", "Upload")}</span>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={handleUploadBg}
                disabled={uploading}
              />
            </label>
          </div>
        </div>

        <Alert className="rounded-xl border-violet-200/60 bg-violet-50/60 dark:border-violet-900/40 dark:bg-violet-950/25">
          <Info className="h-4 w-4 text-violet-700 dark:text-violet-400 shrink-0" />
          <AlertDescription className="text-xs text-foreground/85 leading-relaxed">
            {t(
              "海报由会员端「保存邀请海报」按钮实时生成，包含会员个人二维码。修改后保存草稿并发布，会员再次保存海报即生效。",
              "Posters are generated in real-time when members tap \"Save invite poster\", embedding their personal QR code. Save draft and publish for changes to take effect.",
            )}
          </AlertDescription>
        </Alert>
      </CardContent>
    </Card>
  );
}

function PosterFramePreview({
  frame,
  selected,
  onClick,
  t,
}: {
  frame: PosterFrame;
  selected: boolean;
  onClick: () => void;
  t: (zh: string, en: string) => string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawnRef = useRef(false);

  const drawPreview = useCallback(
    (node: HTMLCanvasElement | null) => {
      if (!node || drawnRef.current) return;
      (canvasRef as MutableRefObject<HTMLCanvasElement | null>).current = node;
      const ctx = node.getContext("2d");
      if (!ctx) return;
      node.width = 75;
      node.height = 133;
      ctx.save();
      ctx.scale(75 / 750, 133 / 1334);
      frame.drawBackground(ctx);
      // Mini QR placeholder
      ctx.fillStyle = frame.qrBgColor;
      ctx.fillRect(235, 520, 280, 280);
      ctx.restore();
      drawnRef.current = true;
    },
    [frame],
  );

  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "group relative flex flex-col items-center gap-1.5 rounded-xl border-2 p-1.5 transition-all",
        selected
          ? "border-primary bg-primary/10 shadow-md"
          : "border-border/40 hover:border-primary/30 hover:bg-muted/20",
      )}
    >
      {selected && (
        <div className="absolute -right-1.5 -top-1.5 z-10 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-primary-foreground shadow">
          <Check className="h-3 w-3" strokeWidth={3} />
        </div>
      )}
      <canvas ref={drawPreview} className="rounded-md" style={{ width: 75, height: 133 }} />
      <span className="text-[10px] font-medium leading-tight text-center">
        {t(frame.labelZh, frame.labelEn)}
      </span>
    </button>
  );
}
