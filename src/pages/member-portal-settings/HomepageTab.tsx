import type { Dispatch, MutableRefObject, SetStateAction } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import {
  Loader2,
  Upload,
  GripVertical,
  Plus,
  Trash2,
  Megaphone,
  ChevronUp,
  ChevronDown,
  Home,
  Info,
} from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import type { MemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { formatAnnouncementPublishedAt } from "@/lib/memberPortalAnnouncementDate";
import type { HomeBannerLayout } from "@/lib/memberHomeBannerStyle";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import { StaffImageReplaceZone } from "@/components/staff/StaffImageReplaceZone";
import {
  HOME_BANNER_PRESETS_DARK,
  HOME_BANNER_PRESETS_LIGHT,
  HOME_BANNER_TEMPLATE_SIZE,
  getHomeBannerPresetById,
} from "@/lib/memberPortalHomeBannerPresets";
import { MODULES, type BannerItem, type ModuleKey } from "./portalSettingsHelpers";
import { FrontendSettingsTab } from "./FrontendSettingsTab";
import { PortalSettingsEmptyState, SectionTitle } from "./shared";

export type HomepageTabProps = {
  settings: MemberPortalSettings;
  setSettings: Dispatch<SetStateAction<MemberPortalSettings>>;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
  banners: BannerItem[];
  moduleOrder: ModuleKey[];
  uploadingBannerIndex: number | null;
  uploadingAnnouncementIndex: number | null;
  bannerInputRefs: MutableRefObject<Record<number, HTMLInputElement | null>>;
  announcementInputRefs: MutableRefObject<Record<number, HTMLInputElement | null>>;
  dragBannerFrom: MutableRefObject<number | null>;
  dragModuleFrom: MutableRefObject<number | null>;
  addBanner: () => void;
  updateBanner: (idx: number, patch: Partial<BannerItem>) => void;
  moveBanner: (from: number, to: number) => void;
  requestRemoveBanner: (idx: number) => void;
  moveModule: (from: number, to: number) => void;
  requestRemoveAnnouncement: (idx: number) => void;
  applyBannerPreset: (idx: number, presetId: string) => void;
  uploadAnnouncementImage: (idx: number, file?: File | null) => Promise<void>;
  uploadBannerImage: (idx: number, file?: File | null) => Promise<void>;
};

export function HomepageTab({
  settings,
  setSettings,
  onSettingsChange,
  banners,
  moduleOrder,
  uploadingBannerIndex,
  uploadingAnnouncementIndex,
  bannerInputRefs,
  announcementInputRefs,
  dragBannerFrom,
  dragModuleFrom,
  addBanner,
  updateBanner,
  moveBanner,
  requestRemoveBanner,
  moveModule,
  requestRemoveAnnouncement,
  applyBannerPreset,
  uploadAnnouncementImage,
  uploadBannerImage,
}: HomepageTabProps) {
  const { t, language } = useLanguage();

  return (
    <div className="space-y-6">
      <FrontendSettingsTab settings={settings} onSettingsChange={onSettingsChange} />

      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "配置会员登录后的首页：公告、轮播、模块顺序与弹窗公告。登录页顶部轮播请在「登录设置」中配置。",
          "Configure the member home after sign-in: announcements, banners, module order, popup. For the login page top carousel, use the Login tab.",
        )}
      </p>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>{t("首页公告", "Homepage Announcements")}</SectionTitle>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5"
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  announcements: [
                    ...(s.announcements || []),
                    {
                      title: "",
                      content: "",
                      image_url: "",
                      published_at: "",
                      sort_order: (s.announcements?.length || 0) + 1,
                    },
                  ],
                }))
              }
            >
              <Plus className="h-3.5 w-3.5" />
              {t("新增公告", "Add Announcement")}
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            {t(
              "显示在会员首页顶部：标题与配图在滚动条中从右向左循环展示，会员点击后弹窗查看正文。保存草稿/发布后会员端轮询即可同步。",
              "Top of member home: title and image scroll right-to-left; tap opens full content. Members sync via periodic refresh after you save or publish.",
            )}
          </p>
          {String(settings.announcement || "").trim() && (!(settings.announcements || []).length) && (
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                <span>
                  {t(
                    "检测到旧版「单条公告」字段仍有内容，而多条公告列表为空——后台这里会显示为空，但会员端仍可能显示该条文字。请点击「迁入多条公告」后保存并发布；若列表仍空，可到「发布管理」丢弃草稿或清除本机该租户缓存后重试。",
                    "Legacy single-field announcement still has text while the multi-announcement list is empty — this form looks blank, but members may still see that text. Click “Import into list”, then save and publish. If the list is still empty, discard the server draft under Publishing or clear this tenant’s local draft in the browser.",
                  )}
                </span>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  className="shrink-0"
                  onClick={() =>
                    setSettings((s) => {
                      const text = String(s.announcement || "").trim();
                      return {
                        ...s,
                        announcements: [{ title: "", content: text, image_url: "", published_at: "", sort_order: 1 }],
                        announcement: null,
                      };
                    })
                  }
                >
                  {t("迁入多条公告", "Import into list")}
                </Button>
              </AlertDescription>
            </Alert>
          )}
          {!settings.announcements || settings.announcements.length === 0 ? (
            <PortalSettingsEmptyState
              icon={Megaphone}
              title={t("暂无公告", "No announcements yet")}
              hint={t(
                "点击右上角「新增公告」创建；支持配图、正文与排序。",
                "Use “Add Announcement” above. Images, body text, and order are supported.",
              )}
            />
          ) : (
            settings.announcements.map((ann, idx) => (
              <div key={`ann-${idx}`} className="rounded-xl border p-4 space-y-3 bg-muted/20">
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <p className="text-sm font-medium flex-1">
                    {t("公告", "Announcement")} #{idx + 1}
                  </p>
                  <div className="flex items-center gap-1">
                    {idx > 0 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label="Move up"
                        onClick={() => {
                          setSettings((s) => {
                            const arr = [...(s.announcements || [])];
                            [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                            return { ...s, announcements: arr.map((a, i) => ({ ...a, sort_order: i + 1 })) };
                          });
                        }}
                      >
                        <ChevronUp className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    {idx < (settings.announcements?.length || 0) - 1 && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label="Move down"
                        onClick={() => {
                          setSettings((s) => {
                            const arr = [...(s.announcements || [])];
                            [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                            return { ...s, announcements: arr.map((a, i) => ({ ...a, sort_order: i + 1 })) };
                          });
                        }}
                      >
                        <ChevronDown className="h-3.5 w-3.5" />
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                      aria-label="Delete"
                      onClick={() => requestRemoveAnnouncement(idx)}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
                <Input
                  value={ann.title}
                  onChange={(e) =>
                    setSettings((s) => {
                      const arr = [...(s.announcements || [])];
                      arr[idx] = { ...arr[idx], title: e.target.value };
                      return { ...s, announcements: arr };
                    })
                  }
                  placeholder={t("公告标题（滚动条展示）", "Title (shown in ticker)")}
                />
                <div className="space-y-1.5">
                  <Label className="text-xs text-muted-foreground">{t("展示日期（可选）", "Display date (optional)")}</Label>
                  <Input
                    type="date"
                    value={String(ann.published_at ?? "").trim().slice(0, 10)}
                    onChange={(e) =>
                      setSettings((s) => {
                        const arr = [...(s.announcements || [])];
                        arr[idx] = { ...arr[idx], published_at: e.target.value || "" };
                        return { ...s, announcements: arr };
                      })
                    }
                    className="max-w-[200px]"
                  />
                  <p className="text-[10px] text-muted-foreground">
                    {t("会员端公告卡片右上角；留空则不显示。", "Shown on member announcement cards; leave blank to hide.")}
                  </p>
                </div>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("公告配图", "Announcement image")}</Label>
                  <input
                    ref={(el) => {
                      announcementInputRefs.current[idx] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      void uploadAnnouncementImage(idx, e.target.files?.[0]);
                      e.currentTarget.value = "";
                    }}
                  />
                  <StaffImageReplaceZone
                    idKey={`portal-ann-zone-${idx}-${ann.image_url || "e"}`}
                    imageUrl={ann.image_url || ""}
                    frameClassName="aspect-[2/1] w-full max-w-sm min-h-[72px]"
                    emptyLabel={t("点击上传公告配图", "Tap to upload image")}
                    replaceLabel={t("更换配图", "Replace image")}
                    tapHint={t("点击预览上传，或在下方填写链接。", "Tap preview to upload or paste a link below.")}
                    uploading={uploadingAnnouncementIndex === idx}
                    onPick={() => announcementInputRefs.current[idx]?.click()}
                  />
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={ann.image_url || ""}
                      onChange={(e) =>
                        setSettings((s) => {
                          const arr = [...(s.announcements || [])];
                          arr[idx] = { ...arr[idx], image_url: e.target.value };
                          return { ...s, announcements: arr };
                        })
                      }
                      placeholder={t("或粘贴图片 URL", "Or paste image URL")}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingAnnouncementIndex === idx}
                      className="h-9 shrink-0 gap-1.5 px-3"
                      onClick={() => announcementInputRefs.current[idx]?.click()}
                    >
                      {uploadingAnnouncementIndex === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t("本地上传", "Upload")}</span>
                    </Button>
                  </div>
                </div>
                <Textarea
                  value={ann.content}
                  onChange={(e) =>
                    setSettings((s) => {
                      const arr = [...(s.announcements || [])];
                      arr[idx] = { ...arr[idx], content: e.target.value };
                      return { ...s, announcements: arr };
                    })
                  }
                  placeholder={t("公告正文（点击滚动条后在弹窗中展示）", "Body text (shown in popup after tap)")}
                  rows={3}
                />
              </div>
            ))
          )}
          {settings.announcements && settings.announcements.length > 0 && (
            <div className="rounded-xl border border-dashed border-primary/25 bg-gradient-to-br from-slate-900 to-slate-800 p-4 space-y-2">
              <p className="text-xs font-medium text-slate-300 flex items-center gap-2">
                <Megaphone className="h-3.5 w-3.5 shrink-0 text-amber-200/90" />
                {t("会员端同步预览（当前编辑区，非已发布线上）", "Live preview of draft — not published until you save")}
              </p>
              <div className="member-home-ann-scroller member-portal-ann-preview-marquee overflow-hidden rounded-lg border border-[hsl(var(--pu-m-surface-border)/0.28)] bg-[hsl(var(--pu-m-surface)/0.12)] py-2">
                <div
                  className="member-home-ann-track flex w-max gap-4 px-2"
                  style={{
                    animationDuration: `${Math.max(14, (settings.announcements?.filter((a) => a.title || a.content || a.image_url).length || 1) * 5)}s`,
                  }}
                >
                  {[
                    ...(settings.announcements || []).filter((a) => a.title || a.content || a.image_url),
                    ...(settings.announcements || []).filter((a) => a.title || a.content || a.image_url),
                  ].map((a, i) => {
                    const annDate = formatAnnouncementPublishedAt(a.published_at, language === "zh" ? "zh" : "en");
                    return (
                      <div
                        key={`prev-${a.sort_order}-${i}`}
                        className="flex shrink-0 items-center gap-2 rounded-full border border-amber-400/25 bg-black/30 px-3 py-1.5 text-left"
                      >
                        {String(a.image_url || "").trim() ? (
                          <ResolvableMediaThumb
                            idKey={`portal-ann-marquee-${a.sort_order}-${i}`}
                            url={a.image_url}
                            tone="memberPreview"
                            frameClassName="h-7 w-7 shrink-0 rounded-md"
                            imgClassName="object-cover"
                          />
                        ) : (
                          <Megaphone className="h-4 w-4 shrink-0 text-amber-200/80" />
                        )}
                        <span className="flex min-w-0 max-w-[220px] flex-col gap-0.5">
                          <span className="truncate text-xs font-medium text-amber-100">
                            {a.title || a.content || t("公告", "Notice")}
                          </span>
                          {annDate ? <span className="truncate text-[10px] text-amber-200/55">{annDate}</span> : null}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <div className="flex items-center justify-between">
            <SectionTitle>{t("首页轮播", "Homepage Banners")}</SectionTitle>
            <Button type="button" variant="outline" size="sm" onClick={addBanner} className="gap-1.5">
              <Plus className="h-3.5 w-3.5" />
              {t("新增轮播", "Add Banner")}
            </Button>
          </div>

          <div className="flex flex-wrap items-end gap-3 rounded-lg border border-dashed border-border/50 bg-muted/30 px-3 py-2.5">
            <div className="space-y-1">
              <Label className="text-xs font-medium text-muted-foreground">{t("自动切换间隔", "Autoplay interval")}</Label>
              <div className="flex items-center gap-2">
                <Input
                  type="number"
                  min={3}
                  max={60}
                  step={1}
                  className="h-9 w-[4.5rem]"
                  value={settings.home_banners_carousel_interval_sec}
                  onChange={(e) => {
                    const n = Math.floor(Number(e.target.value));
                    const v = Number.isFinite(n) ? Math.min(60, Math.max(3, n)) : 5;
                    setSettings((s) => ({ ...s, home_banners_carousel_interval_sec: v }));
                  }}
                />
                <span className="text-xs text-muted-foreground">{t("秒（3–60）", "sec (3–60)")}</span>
              </div>
            </div>
            <p className="min-w-[200px] flex-1 text-[11px] leading-snug text-muted-foreground">
              {t(
                "会员端可左右滑动切换；每隔上述秒数自动切到下一张（从右向左）。",
                "Members can swipe between slides; after this many seconds the carousel advances to the next (slides left).",
              )}
            </p>
          </div>

          {banners.length === 0 ? (
            <PortalSettingsEmptyState
              icon={Home}
              title={t("暂无首页轮播", "No home banners yet")}
              hint={t(
                "点击右上角「新增轮播」上传配图、标题与跳转链接。",
                "Use “Add Banner” above for image, titles, and optional link.",
              )}
            />
          ) : (
            banners.map((banner, idx) => (
              <div
                key={`banner-${idx}`}
                className="rounded-xl border p-4 space-y-3 bg-muted/20"
                draggable
                onDragStart={() => {
                  dragBannerFrom.current = idx;
                }}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragBannerFrom.current === null) return;
                  moveBanner(dragBannerFrom.current, idx);
                  dragBannerFrom.current = null;
                }}
              >
                <div className="flex items-center gap-2">
                  <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                  <p className="text-sm font-medium flex-1">
                    {t("轮播", "Banner")} #{idx + 1}
                  </p>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                    aria-label="Delete"
                    onClick={() => requestRemoveBanner(idx)}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Input
                    value={banner.title}
                    onChange={(e) => updateBanner(idx, { title: e.target.value })}
                    placeholder={t("标题（必填）", "Title (required)")}
                  />
                  <Input
                    value={banner.subtitle}
                    onChange={(e) => updateBanner(idx, { subtitle: e.target.value })}
                    placeholder={t("副标题（可选）", "Subtitle (optional)")}
                  />
                </div>
                <Input
                  value={banner.link}
                  onChange={(e) => updateBanner(idx, { link: e.target.value })}
                  placeholder={t("跳转链接（可选）", "Link URL (optional)")}
                />
                <div className="grid gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">{t("展示布局", "Layout")}</Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                      value={banner.banner_layout}
                      onChange={(e) => updateBanner(idx, { banner_layout: e.target.value as HomeBannerLayout })}
                    >
                      <option value="full_image">{t("整图（单容器内图片）", "Full-width image")}</option>
                      <option value="split">{t("左文右图", "Text + image")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("图片适应", "Image fit (object-fit)")}
                    </Label>
                    <select
                      className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                      value={banner.image_object_fit}
                      onChange={(e) => updateBanner(idx, { image_object_fit: e.target.value })}
                    >
                      <option value="cover">{t("铺满裁剪", "Cover")}</option>
                      <option value="contain">{t("完整显示", "Contain")}</option>
                      <option value="fill">{t("拉伸填充", "Fill")}</option>
                      <option value="none">{t("原始尺寸", "None")}</option>
                      <option value="scale-down">{t("缩小适应", "Scale down")}</option>
                    </select>
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("图片位置", "Image position (object-position)")}
                    </Label>
                    <Input
                      value={banner.image_object_position}
                      onChange={(e) => updateBanner(idx, { image_object_position: e.target.value })}
                      placeholder={t("如：居中、左上角、50% 20%", "e.g. center, left top, 50% 20%")}
                      className="h-9"
                    />
                  </div>
                </div>
                <p className="text-[11px] text-muted-foreground leading-snug">
                  {t(
                    "整图：格内仅大图，可用适应/位置微调。左文右图：上传图铺满整卡作背景，标题与副标题叠在左侧（可配适应/位置）。",
                    "Full image: only your photo in the slot—tune with fit/position. Split: image fills the card as background; title and subtitle overlay on the left.",
                  )}
                </p>
                <div className="space-y-2">
                  <Label className="text-xs text-muted-foreground">{t("轮播配图", "Banner image")}</Label>
                  <input
                    ref={(el) => {
                      bannerInputRefs.current[idx] = el;
                    }}
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0];
                      void uploadBannerImage(idx, file);
                      e.currentTarget.value = "";
                    }}
                  />
                  {(() => {
                    const bannerThumbSrc = banner.image_preset_id
                      ? getHomeBannerPresetById(banner.image_preset_id)?.dataUrl?.trim() || ""
                      : String(banner.image_url || "").trim();
                    return (
                      <StaffImageReplaceZone
                        idKey={`portal-home-banner-zone-${idx}-${banner.image_preset_id || banner.image_url || "empty"}`}
                        imageUrl={bannerThumbSrc}
                        frameClassName="aspect-video w-full max-w-xl min-h-[140px]"
                        emptyLabel={t("点击上传或选用下方颜色模板", "Upload or pick a color template below")}
                        replaceLabel={t("更换配图", "Replace image")}
                        tapHint={t("点击预览上传自定义图；模板图在下方选择。", "Tap to upload; or choose a template below.")}
                        uploading={uploadingBannerIndex === idx}
                        onPick={() => bannerInputRefs.current[idx]?.click()}
                      />
                    );
                  })()}
                  <div className="flex flex-wrap items-center gap-2">
                    <Input
                      value={banner.image_url}
                      onChange={(e) => updateBanner(idx, { image_url: e.target.value, image_preset_id: "" })}
                      placeholder={t("或粘贴图片 URL（覆盖模板）", "Or paste image URL (overrides template)")}
                      className="min-w-0 flex-1"
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploadingBannerIndex === idx}
                      className="h-9 shrink-0 gap-1.5 px-3"
                      onClick={() => bannerInputRefs.current[idx]?.click()}
                    >
                      {uploadingBannerIndex === idx ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="h-4 w-4" />
                      )}
                      <span className="hidden sm:inline">{t("本地上传", "Upload")}</span>
                    </Button>
                  </div>
                </div>
                <div className="space-y-3 rounded-lg border border-dashed border-muted-foreground/25 bg-muted/10 p-3">
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t(
                      `颜色模板（${HOME_BANNER_TEMPLATE_SIZE.w}×${HOME_BANNER_TEMPLATE_SIZE.h}，16:9）：点击套用，会员端按模板 ID 渲染，避免长链接被截断。`,
                      `Color templates (${HOME_BANNER_TEMPLATE_SIZE.w}×${HOME_BANNER_TEMPLATE_SIZE.h}, 16:9). Click to apply; the member app renders by template id so long URLs are not truncated.`,
                    )}
                  </p>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      {t("浅色", "Light")}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {HOME_BANNER_PRESETS_LIGHT.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          title={t(preset.nameZh, preset.nameEn)}
                          onClick={() => applyBannerPreset(idx, preset.id)}
                          className="group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-background ring-offset-background transition hover:border-primary hover:ring-2 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ResolvableMediaThumb
                            idKey={`home-preset-light-${preset.id}`}
                            url={preset.dataUrl}
                            frameClassName="absolute inset-0 h-full w-full"
                            imgClassName="object-cover"
                          />
                          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-[9px] font-medium text-neutral-100 opacity-0 transition group-hover:opacity-100">
                            {t(preset.nameZh, preset.nameEn)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground mb-1.5">
                      {t("深色", "Dark")}
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                      {HOME_BANNER_PRESETS_DARK.map((preset) => (
                        <button
                          key={preset.id}
                          type="button"
                          title={t(preset.nameZh, preset.nameEn)}
                          onClick={() => applyBannerPreset(idx, preset.id)}
                          className="group relative aspect-video w-full overflow-hidden rounded-md border border-border bg-background ring-offset-background transition hover:border-primary hover:ring-2 hover:ring-primary/25 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                          <ResolvableMediaThumb
                            idKey={`home-preset-dark-${preset.id}`}
                            url={preset.dataUrl}
                            frameClassName="absolute inset-0 h-full w-full"
                            imgClassName="object-cover"
                          />
                          <span className="absolute bottom-0 left-0 right-0 truncate bg-black/55 px-1 py-0.5 text-[9px] font-medium text-neutral-100 opacity-0 transition group-hover:opacity-100">
                            {t(preset.nameZh, preset.nameEn)}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </div>
            ))
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("模块排序", "Module Order")}</SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t("拖拽调整会员首页模块显示顺序", "Drag to reorder homepage modules")}
          </p>
          <div className="space-y-2">
            {moduleOrder.map((key, idx) => {
              const mod = MODULES.find((m) => m.key === key);
              const title = mod ? t(mod.label, mod.labelEn) : key;
              return (
                <div
                  key={`${key}-${idx}`}
                  className="flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 cursor-grab"
                  draggable
                  onDragStart={() => {
                    dragModuleFrom.current = idx;
                  }}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={() => {
                    if (dragModuleFrom.current === null) return;
                    moveModule(dragModuleFrom.current, idx);
                    dragModuleFrom.current = null;
                  }}
                >
                  <GripVertical className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium flex-1">{title}</span>
                  <Badge variant="secondary" className="text-[11px] font-mono">
                    {idx + 1}
                  </Badge>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
