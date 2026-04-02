import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import type { LucideIcon } from "lucide-react";
import {
  Loader2, Upload, GripVertical, Plus, Trash2, Megaphone,
  History, Save, FileDown,
  RotateCcw, ChevronRight, RefreshCw, ChevronUp, ChevronDown,
  Home, ShoppingBag, Star, Info,
  Dices, ScrollText, Link2, Headphones, BarChart3, Coins,
  Globe2, Database, LogIn, Scale,
  ClipboardList, Users, Bell,
} from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { withTimeout } from "@/lib/withTimeout";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import {
  approveMyMemberPortalSettingsVersion,
  submitMyMemberPortalSettingsForApproval,
  DEFAULT_SETTINGS,
  getMyMemberPortalSettings,
  listMyMemberPortalSettingsVersions,
  rollbackMyMemberPortalSettingsVersion,
  uploadMemberPortalBannerImage,
  uploadMemberPortalLogo,
  saveDraftToServer,
  getServerDraft,
  publishServerDraft,
  discardServerDraft,
  type MemberPortalVersionItem,
  type MemberPortalSettings,
  type MemberPortalSettingsPayload,
  type LoginCarouselSlideItem,
  type AnnouncementItem,
} from "@/services/members/memberPortalSettingsService";
import { cn } from "@/lib/utils";
import { formatAnnouncementPublishedAt } from "@/lib/memberPortalAnnouncementDate";
import {
  BANNER_MAX_DIMENSION,
  LOGO_MAX_DIMENSION,
  MALL_IMAGE_MAX_DIMENSION,
  AVATAR_MAX_DIMENSION,
  compressImageToUploadableFile,
  compressImageToDataUrl,
} from "@/lib/imageClientCompress";
import {
  normalizeHomeBannerImageFit,
  normalizeHomeBannerLayout,
  sanitizeHomeBannerObjectPosition,
  type HomeBannerLayout,
} from "@/lib/memberHomeBannerStyle";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { AdminOperationLogsTab } from "./member-portal/AdminOperationLogsTab";
import {
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "./member-portal/shared";
import { WebsiteDataTab } from "./member-portal-settings/WebsiteDataTab";
import { DataManagementTab } from "./member-portal-settings/DataManagementTab";
import { ActivityDataTab } from "./member-portal-settings/ActivityDataTab";
import { InviteSimulationSettingsTab } from "./member-portal-settings/InviteSimulationSettingsTab";
import { FrontendSettingsTab } from "./member-portal-settings/FrontendSettingsTab";
import { BrandTab } from "./member-portal-settings/BrandTab";
import { LegalPoliciesTab } from "./member-portal-settings/LegalPoliciesTab";
import { ActivityTab } from "./member-portal-settings/ActivityTab";
import LoginSettingsTab from "./member-portal-settings/LoginSettingsTab";
import CustomerServiceTab from "./member-portal-settings/CustomerServiceTab";
import LuckySpinTab from "./member-portal-settings/LuckySpinTab";
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { verifyAdminPasswordApi } from "@/services/admin/adminApiService";
import {
  listMyPointsMallItems,
  listMyPointsMallCategories,
  saveMyPointsMallCategories,
  upsertMyPointsMallItems,
  type PointsMallItem,
  type PointsMallCategory,
} from "@/services/members/memberPointsMallService";
import {
  emitForceRefreshPrompt,
  emitPortalSettingsUpdated,
} from "@/services/members/memberPortalLiveUpdateService";
import {
  adminGetLotteryPrizes,
  adminSaveLotteryPrizes,
  adminGetLotterySettings,
  adminSaveLotterySettings,
  type LotteryPrize,
  type LotteryPrizeType,
  type LotterySettings,
} from '@/services/lottery/lotteryService';
import {
  getMemberPortalStaffSessionSnapshot,
  setMemberPortalStaffSessionSnapshot,
  invalidateMemberPortalStaffSessionSnapshot,
} from "@/lib/memberPortalStaffSessionCache";
import "@/styles/member-portal.css";
import { formatBeijingTime } from "@/lib/beijingTime";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import { ResolvableMediaThumb } from "@/components/ResolvableMediaThumb";
import { StaffImageReplaceZone } from "@/components/staff/StaffImageReplaceZone";
import {
  HOME_BANNER_PRESETS_DARK,
  HOME_BANNER_PRESETS_LIGHT,
  HOME_BANNER_TEMPLATE_SIZE,
  getHomeBannerPresetById,
} from "@/lib/memberPortalHomeBannerPresets";

// ─── 类型 ────────────────────────────────────────────────────────────────────
const MODULES = [
  { key: "shortcuts", label: "快捷入口", labelEn: "Quick Access" },
  { key: "tasks", label: "今日任务", labelEn: "Daily Tasks" },
  { key: "security", label: "安全说明", labelEn: "Security Info" },
] as const;
type ModuleKey = (typeof MODULES)[number]["key"];
type BannerItem = {
  title: string;
  subtitle: string;
  link: string;
  image_url: string;
  image_preset_id: string;
  banner_layout: HomeBannerLayout;
  image_object_fit: string;
  image_object_position: string;
};
type LoginCarouselFormRow = Omit<LoginCarouselSlideItem, "sort_order">;

/**
 * 与表单内 buildPayload 完全一致的快照对象（用于「已发布基线」与当前编辑对比）
 */
function buildPortalPayloadSnapshot(
  settings: MemberPortalSettings,
  badgesText: string,
  banners: BannerItem[],
  moduleOrder: ModuleKey[],
  loginCarouselSlides: LoginCarouselFormRow[],
): Record<string, unknown> {
  const parsedBadges = badgesText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
  const parsedBanners = banners
    .map((b) => {
      const image_preset_id = String(b.image_preset_id || "").trim();
      const image_url = b.image_url.trim();
      const row: Record<string, unknown> = {
        title: b.title.trim(),
        subtitle: b.subtitle.trim(),
        link: b.link.trim(),
        image_url,
        banner_layout: normalizeHomeBannerLayout(b.banner_layout),
        image_object_fit: normalizeHomeBannerImageFit(b.image_object_fit),
        image_object_position: sanitizeHomeBannerObjectPosition(b.image_object_position),
      };
      if (image_preset_id) row.image_preset_id = image_preset_id;
      return row;
    })
    .filter((b) => b.title || b.subtitle || b.link || b.image_url || b.image_preset_id)
    .slice(0, 8);
  const parsedModuleOrder = moduleOrder.filter((s) => ["shortcuts", "tasks", "security"].includes(s));
  const parsedAgents = (settings.customer_service_agents || [])
    .map((a) => ({
      name: String(a.name || "").trim(),
      avatar_url: a.avatar_url ? String(a.avatar_url).trim() : null,
      link: String(a.link || "").trim(),
    }))
    .filter((a) => a.name && a.link);
  const parsedLoginCarousel = loginCarouselSlides
    .map((s, idx) => ({
      image_url: s.image_url.trim(),
      title_zh: s.title_zh.trim(),
      title_en: s.title_en.trim(),
      body_zh: s.body_zh.trim(),
      body_en: s.body_en.trim(),
      sort_order: idx + 1,
    }))
    .filter((s) => s.image_url || s.title_zh || s.title_en || s.body_zh || s.body_en)
    .slice(0, 8);
  const intervalSec = Math.min(60, Math.max(3, Math.floor(Number(settings.login_carousel_interval_sec) || 5)));
  const homeBannersIntervalSec = Math.min(
    60,
    Math.max(3, Math.floor(Number(settings.home_banners_carousel_interval_sec) || 5)),
  );
  return {
    ...settings,
    login_badges: parsedBadges.length > 0 ? parsedBadges : DEFAULT_SETTINGS.login_badges,
    home_banners: parsedBanners,
    home_module_order: parsedModuleOrder.length > 0 ? parsedModuleOrder : DEFAULT_SETTINGS.home_module_order,
    customer_service_link: null,
    customer_service_agents: parsedAgents,
    login_carousel_slides: parsedLoginCarousel,
    login_carousel_interval_sec: intervalSec,
    home_banners_carousel_interval_sec: homeBannersIntervalSec,
  };
}

/**
 * 草稿/本地缓存若带 `announcements: []`，会与已发布合并时整块覆盖列表，导致「公告突然没了」。
 * 在已发布仍有条目时，忽略草稿里的空数组（清空公告应通过发布新版本生效）。
 */
function stripEmptyAnnouncementsFromDraftMerge(
  basePublished: MemberPortalSettings,
  draftPatch: Partial<MemberPortalSettings>,
): Partial<MemberPortalSettings> {
  const d = { ...draftPatch };
  const pub = basePublished.announcements || [];
  const dr = d.announcements;
  const legacyPub = basePublished.announcement != null && String(basePublished.announcement).trim() !== "";
  if (Array.isArray(dr) && dr.length === 0 && (pub.length > 0 || legacyPub)) {
    delete d.announcements;
  }
  return d;
}

/** 从接口返回的已发布 settings 生成与 buildPayload 相同规则的 JSON 指纹（勿直接用 JSON.stringify(data.settings)） */
function fingerprintPublishedSettings(settingsRow: MemberPortalSettings): string {
  const merged = { ...DEFAULT_SETTINGS, ...settingsRow };
  const badgesText = (merged.login_badges || []).join("\n");
  const banners: BannerItem[] = (merged.home_banners || []).map((b) => ({
    title: b.title || "",
    subtitle: b.subtitle || "",
    link: b.link || "",
    image_url: b.image_url || "",
    image_preset_id: String((b as { image_preset_id?: string }).image_preset_id || "").trim(),
    banner_layout: normalizeHomeBannerLayout((b as { banner_layout?: string }).banner_layout),
    image_object_fit: String(normalizeHomeBannerImageFit((b as { image_object_fit?: string }).image_object_fit)),
    image_object_position: sanitizeHomeBannerObjectPosition((b as { image_object_position?: string }).image_object_position),
  }));
  const mo = (merged.home_module_order || []).filter((k) => ["shortcuts", "tasks", "security"].includes(k as string)) as ModuleKey[];
  const moduleOrder = mo.length > 0 ? mo : (["shortcuts", "tasks", "security"] as ModuleKey[]);
  const loginCarouselRows: LoginCarouselFormRow[] = (merged.login_carousel_slides || [])
    .slice()
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((s) => ({
      image_url: s.image_url || "",
      title_zh: s.title_zh || "",
      title_en: s.title_en || "",
      body_zh: s.body_zh || "",
      body_en: s.body_en || "",
    }));
  return JSON.stringify(buildPortalPayloadSnapshot(merged, badgesText, banners, moduleOrder, loginCarouselRows));
}

/**
 * 积分商城商品独立落库，不参与 buildPayload；须与 saveMallItems 规范化规则一致，
 * 否则「仅改商品后发布」会被误判为无变更。
 */
function fingerprintPointsMallCatalog(items: PointsMallItem[], categories: PointsMallCategory[]): string {
  const rows = items.map((x, idx) => ({
    id: String(x.id ?? "").trim(),
    mall_category_id: x.mall_category_id ? String(x.mall_category_id).trim() : null,
    title: String(x.title ?? "").trim(),
    description: String(x.description ?? "").trim() || null,
    image_url: String(x.image_url ?? "").trim() || null,
    points_cost: Math.max(1, Number(x.points_cost || 0)),
    stock_remaining: Number(x.stock_remaining) < 0 ? -1 : Math.max(0, Number(x.stock_remaining || 0)),
    per_order_limit: Math.max(1, Number(x.per_order_limit || 1)),
    per_user_daily_limit: Math.max(0, Number(x.per_user_daily_limit || 0)),
    per_user_lifetime_limit: Math.max(0, Number(x.per_user_lifetime_limit || 0)),
    enabled: x.enabled !== false,
    sort_order: idx + 1,
  }));
  const cats = categories.map((c, i) => ({
    id: String(c.id ?? "").trim(),
    name_zh: String(c.name_zh ?? "").trim(),
    name_en: String(c.name_en ?? "").trim(),
    sort_order: i + 1,
  }));
  return JSON.stringify({ items: rows, categories: cats });
}

/**
 * 幸运抽奖配置独立落库，不参与 buildPayload；须纳入「发布/保存草稿」是否有变更的判断，
 * 否则仅改会员端「概率说明」或奖品等会被误判为无变更。
 */
function fingerprintLotteryStaffState(settings: LotterySettings, prizes: LotteryPrize[]): string {
  const settingsNorm = {
    enabled: settings.enabled !== false,
    daily_free_spins: Math.max(0, Math.floor(Number(settings.daily_free_spins) || 0)),
    probability_notice:
      settings.probability_notice == null || String(settings.probability_notice).trim() === ""
        ? null
        : String(settings.probability_notice),
    order_completed_spin_enabled: settings.order_completed_spin_enabled === true,
    order_completed_spin_amount: Math.max(0, Math.floor(Number(settings.order_completed_spin_amount) || 0)),
  };
  const rows = [...prizes]
    .map((p, i) => ({ p, i }))
    .sort((a, b) => (a.p.sort_order ?? a.i) - (b.p.sort_order ?? b.i))
    .map(({ p }, idx) => ({
      id: String(p.id ?? "").trim(),
      name: String(p.name ?? "").trim(),
      type: p.type,
      value: p.type === "none" ? 0 : Number(p.value) || 0,
      description:
        p.description == null || String(p.description).trim() === "" ? null : String(p.description).trim(),
      probability: Number(p.probability) || 0,
      display_probability:
        p.display_probability == null ? null : Number(p.display_probability),
      image_url:
        p.image_url == null || String(p.image_url).trim() === "" ? null : String(p.image_url).trim(),
      sort_order: idx + 1,
      enabled: p.enabled !== false,
    }));
  return JSON.stringify({ settings: settingsNorm, prizes: rows });
}

/** 与 localStorage `member_portal_published_marker_${tenantId}` 一致 */
type PublishedBaselineMarker = { v: number | null; ms: number };

function publishedBaselineMarkerKey(tenantId: string) {
  return `member_portal_published_marker_${tenantId}`;
}

function parsePublishedBaselineMarkerFromPayload(data: MemberPortalSettingsPayload): PublishedBaselineMarker {
  const vn = data.published_version_no;
  const v = vn != null && Number.isFinite(Number(vn)) ? Number(vn) : null;
  const raw = data.settings_updated_at;
  let ms = 0;
  if (raw) {
    const p = Date.parse(String(raw));
    if (Number.isFinite(p)) ms = p;
  }
  return { v, ms };
}

function readStoredPublishedBaselineMarker(tenantId: string | null): PublishedBaselineMarker | null {
  if (!tenantId) return null;
  try {
    const raw = localStorage.getItem(publishedBaselineMarkerKey(tenantId));
    if (!raw) return null;
    const o = JSON.parse(raw) as { v?: unknown; ms?: unknown };
    const v = o.v != null && Number.isFinite(Number(o.v)) ? Number(o.v) : null;
    const ms = Number(o.ms) || 0;
    return { v, ms };
  } catch {
    return null;
  }
}

function persistPublishedBaselineMarker(tenantId: string | null, m: PublishedBaselineMarker) {
  if (!tenantId) return;
  try {
    localStorage.setItem(publishedBaselineMarkerKey(tenantId), JSON.stringify({ v: m.v, ms: m.ms }));
  } catch {
    /* ignore */
  }
}

/**
 * 服务端已发布基线是否比本机记录的更新（另一台设备已发布等）。
 * 无本机基线时返回 false：允许正常合并服务器草稿 / 本地工作副本（首次打开或旧版未写入标记时）。
 */
function publishedBaselineAdvancedOnServer(server: PublishedBaselineMarker, stored: PublishedBaselineMarker | null): boolean {
  if (!stored) return false;
  if (server.v != null && stored.v != null && server.v !== stored.v) return server.v > stored.v;
  if (server.v != null && stored.v == null) return true;
  if (server.v == null && stored.v != null) return server.ms > stored.ms;
  return server.ms > stored.ms;
}

/**
 * 合并服务器已发布设置、服务器草稿、可选的 localStorage 工作副本。
 * @param remotePublishNewer 为 true 时：他机已发布新版本，仅采用线上已发布数据，丢弃服务器草稿与本机 working 缓存，避免陈旧草稿覆盖新数据。
 */
async function resolveInitialPortalSnapshot(
  data: MemberPortalSettingsPayload,
  tenantId: string | null,
  workingDraftKey: string,
  remotePublishNewer: boolean,
): Promise<{ initialSnapshot: MemberPortalSettings; draftFound: boolean; publishedFp: string }> {
  const publishedFp = fingerprintPublishedSettings(data.settings);
  const basePublished: MemberPortalSettings = { ...DEFAULT_SETTINGS, ...data.settings };

  if (remotePublishNewer) {
    try {
      localStorage.removeItem(workingDraftKey);
    } catch {
      /* ignore */
    }
    invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
    discardServerDraft(tenantId).catch((err) => {
      console.warn("[MemberPortalSettings] discardServerDraft (remotePublishNewer) failed:", err);
    });
    return { initialSnapshot: basePublished, draftFound: false, publishedFp };
  }

  let initialSnapshot = basePublished;
  let draftFound = false;
  let serverDraftQueryOk = false;
  try {
    const draftRes = await getServerDraft(tenantId);
    serverDraftQueryOk = true;
    if (draftRes.success && draftRes.draft?.payload && typeof draftRes.draft.payload === "object") {
      const draftPayload = stripEmptyAnnouncementsFromDraftMerge(
        basePublished,
        draftRes.draft.payload as Partial<MemberPortalSettings>,
      );
      const draftFingerprint = JSON.stringify({ ...basePublished, ...draftPayload });
      const publishedFingerprint = fingerprintPublishedSettings(basePublished);
      if (draftFingerprint !== publishedFingerprint) {
        const merged = { ...basePublished, ...draftPayload };
        const mediaKeys: (keyof MemberPortalSettings)[] = ["logo_url"];
        for (const k of mediaKeys) {
          if (merged[k] == null && basePublished[k] != null) {
            (merged as Record<string, unknown>)[k as string] = basePublished[k];
          }
        }
        initialSnapshot = merged;
        draftFound = true;
      } else {
        discardServerDraft(tenantId).catch((err) => {
          console.warn("[MemberPortalSettings] discardServerDraft failed:", err);
        });
      }
    }
  } catch {
    serverDraftQueryOk = false;
  }

  if (!draftFound) {
    if (serverDraftQueryOk) {
      try {
        localStorage.removeItem(workingDraftKey);
      } catch {
        /* ignore */
      }
      invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
    } else {
      try {
        const raw = localStorage.getItem(workingDraftKey);
        if (raw) {
          const parsed = stripEmptyAnnouncementsFromDraftMerge(
            basePublished,
            JSON.parse(raw) as Partial<MemberPortalSettings>,
          );
          const localFingerprint = JSON.stringify({ ...basePublished, ...parsed });
          const publishedFingerprint = fingerprintPublishedSettings(basePublished);
          if (localFingerprint !== publishedFingerprint) {
            const merged = { ...basePublished, ...parsed };
            if (merged.logo_url == null && basePublished.logo_url != null) {
              merged.logo_url = basePublished.logo_url;
            }
            initialSnapshot = merged;
          }
        }
      } catch {
        /* ignore */
      }
    }
  }

  return { initialSnapshot, draftFound, publishedFp };
}

// ─── Tab 定义 ─────────────────────────────────────────────────────────────────
/** 顶部导航顺序 = 功能分区；与左侧 Tab 内容块顺序保持一致便于维护 */
const TABS = [
  { key: "login",    label: "登录设置", labelEn: "Login",        icon: LogIn },
  { key: "homepage", label: "首页内容", labelEn: "Homepage",     icon: Home },
  { key: "activity", label: "任务与奖励", labelEn: "Tasks & Rewards", icon: ClipboardList },
  { key: "lucky_spin", label: "幸运抽奖", labelEn: "Lucky Spin", icon: Dices },
  { key: "mall",     label: "积分商城", labelEn: "Points Mall",  icon: ShoppingBag },
  { key: "activity_data", label: "活动数据", labelEn: "Activity Data", icon: BarChart3 },
  { key: "invite_simulation", label: "邀请与模拟", labelEn: "Invite & simulation", icon: Users },
  { key: "customer_service", label: "客服设置", labelEn: "Customer Service", icon: Headphones },
  { key: "member_inbox", label: "会员通知", labelEn: "Member inbox", icon: Bell },
  { key: "website_data", label: "网站数据", labelEn: "Site analytics", icon: Globe2 },
  { key: "data_management", label: "数据管理", labelEn: "Data cleanup", icon: Database },
  { key: "legal_policies", label: "条款与隐私", labelEn: "Terms & Privacy", icon: Scale },
  { key: "publish",  label: "发布管理", labelEn: "Publishing",   icon: History },
  { key: "logs",     label: "操作日志", labelEn: "Member Logs",  icon: ScrollText },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ─── 分区标题组件 ──────────────────────────────────────────────────────────────
function SectionTitle({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <p className={cn("text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0", className)}>
      {children}
    </p>
  );
}

function PortalSettingsEmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
}) {
  return (
    <div className={cn(portalSettingsEmptyShellClass)}>
      <div className="relative flex flex-col items-center">
        <div className={cn("mb-3", portalSettingsEmptyIconWrapClass)}>
          <Icon className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="text-sm font-medium text-foreground">{title}</p>
        {hint ? <p className="mt-1.5 max-w-lg text-xs leading-relaxed text-muted-foreground">{hint}</p> : null}
      </div>
    </div>
  );
}

/** 将图片文件转为 WebP data URL（客户端压缩，默认头像尺寸） */
async function imageFileToWebpDataUrl(file: File, maxSize = AVATAR_MAX_DIMENSION): Promise<string> {
  return compressImageToDataUrl(file, maxSize, 0.85);
}


// ─── 开关行组件 ───────────────────────────────────────────────────────────────
function SwitchRow({
  label,
  desc,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border bg-card px-4 py-3 gap-4",
        disabled && "opacity-60",
      )}
    >
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} disabled={disabled} />
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function MemberPortalSettingsPage() {
  const { t, language } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const isMobile = useIsMobile();
  const tenantId = viewingTenantId || employee?.tenant_id || null;
  const canPublish        = employee?.role === "admin" || !!employee?.is_super_admin;
  const canSubmitApproval = employee?.role === "manager" || canPublish;
  const canEdit           = canSubmitApproval;

  const [activeTab, setActiveTab]       = useState<TabKey>("login");
  const [settings, setSettings]         = useState<MemberPortalSettings>(DEFAULT_SETTINGS);
  const [badgesText, setBadgesText]     = useState(DEFAULT_SETTINGS.login_badges.join("\n"));
  const [banners, setBanners]           = useState<BannerItem[]>([]);
  const [loginCarouselSlides, setLoginCarouselSlides] = useState<LoginCarouselFormRow[]>([]);
  const [moduleOrder, setModuleOrder]   = useState<ModuleKey[]>(["shortcuts", "tasks", "security"]);
  const [uploadingBannerIndex, setUploadingBannerIndex] = useState<number | null>(null);
  const [uploadingLoginCarouselIndex, setUploadingLoginCarouselIndex] = useState<number | null>(null);
  const [uploadingAnnouncementIndex, setUploadingAnnouncementIndex] = useState<number | null>(null);
  const announcementInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const dragModuleFrom = useRef<number | null>(null);
  const dragBannerFrom = useRef<number | null>(null);
  const bannerInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const loginCarouselInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const agentAvatarInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploadingAgentAvatarIdx, setUploadingAgentAvatarIdx] = useState<number | null>(null);

  const [tenantName, setTenantName]   = useState("");
  const [publishNote, setPublishNote] = useState("");
  const [scheduleAt, setScheduleAt]   = useState("");
  const [reviewNote, setReviewNote]   = useState("");
  const [versions, setVersions]       = useState<MemberPortalVersionItem[]>([]);
  const [lastPublishedSnapshot, setLastPublishedSnapshot] = useState("");
  const [lastPublishedMallCatalogFingerprint, setLastPublishedMallCatalogFingerprint] = useState("");
  const [lastPublishedLotteryFingerprint, setLastPublishedLotteryFingerprint] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [hasDraft, setHasDraft] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [lotteryPrizes, setLotteryPrizes] = useState<LotteryPrize[]>([]);
  const [lotterySettings, setLotterySettings] = useState<LotterySettings>({
    daily_free_spins: 1,
    enabled: true,
    probability_notice: null,
    order_completed_spin_enabled: false,
    order_completed_spin_amount: 1,
  });
  const [savingSpinPrizes, setSavingSpinPrizes] = useState(false);
  const [mallItems, setMallItems] = useState<PointsMallItem[]>([]);
  const [mallCategories, setMallCategories] = useState<PointsMallCategory[]>([]);
  const [savingMallCategories, setSavingMallCategories] = useState(false);
  const [savingMallItems, setSavingMallItems] = useState(false);
  const [uploadingMallImageIndex, setUploadingMallImageIndex] = useState<number | null>(null);
  const mallItemInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [onlineBuildTime, setOnlineBuildTime] = useState<string>("");
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [deleteAgentIdx, setDeleteAgentIdx] = useState<number | null>(null);
  const [deleteAgentPwd, setDeleteAgentPwd] = useState("");
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [confirmForceRefreshOpen, setConfirmForceRefreshOpen] = useState(false);
  const [confirmRemoveMallIdx, setConfirmRemoveMallIdx] = useState<number | null>(null);
  const [confirmRemoveMallCategoryIdx, setConfirmRemoveMallCategoryIdx] = useState<number | null>(null);
  const [confirmRemoveBannerIdx, setConfirmRemoveBannerIdx] = useState<number | null>(null);
  const [confirmRemoveAnnouncementIdx, setConfirmRemoveAnnouncementIdx] = useState<number | null>(null);
  const [confirmDiscardDraftOpen, setConfirmDiscardDraftOpen] = useState(false);
  const [confirmResetDefaultOpen, setConfirmResetDefaultOpen] = useState(false);
  const [confirmPublishOpen, setConfirmPublishOpen] = useState(false);
  const [confirmSubmitReviewOpen, setConfirmSubmitReviewOpen] = useState(false);
  const [confirmRollbackVersionId, setConfirmRollbackVersionId] = useState<string | null>(null);
  const [confirmVersionRejectId, setConfirmVersionRejectId] = useState<string | null>(null);
  const [confirmVersionApproveId, setConfirmVersionApproveId] = useState<string | null>(null);
  const localBuildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "unknown";
  const lotteryRateTotal = useMemo(
    () => lotteryPrizes.reduce((acc, x) => acc + Math.max(0, Number(x.probability || 0)), 0),
    [lotteryPrizes]
  );
  const isLotteryRateValid = Math.abs(lotteryRateTotal - 100) < 0.001;
  const hasThanksPrize = useMemo(() => lotteryPrizes.some(p => p.type === 'none'), [lotteryPrizes]);

  /** 与会员端一致：上传返回多为 `/api/upload/image/:id`，分域部署须拼 VITE_API_BASE，否则 <img> 会打到静态站 404 */
  const logoPreview = useMemo(
    () => resolveMemberMediaUrl(settings.logo_url) || "",
    [settings.logo_url],
  );
  const workingDraftKey = useMemo(() => `member_portal_working_${tenantId || "none"}`, [tenantId]);
  const handleSettingsChange = useCallback((patch: Partial<MemberPortalSettings>) => {
    setSettings((prev) => ({ ...prev, ...patch }));
  }, []);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const blockReadonly = useCallback((actionZh: string, actionEn?: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    toast.error(t(`平台总管理查看租户时为只读，无法${actionZh}`, `Read-only in platform admin tenant view: cannot ${actionEn || actionZh}`));
    return true;
  }, [isPlatformAdminReadonlyView, t]);

  // ── 构建 payload ──────────────────────────────────────────────────────────
  const buildPayload = () =>
    buildPortalPayloadSnapshot(settings, badgesText, banners, moduleOrder, loginCarouselSlides);
  const getPayloadSnapshot = () => JSON.stringify(buildPayload());

  const applySettingsSnapshot = (snapshot: MemberPortalSettings) => {
    const merged = { ...DEFAULT_SETTINGS, ...snapshot, customer_service_link: null };
    setSettings(merged);
    setBadgesText((snapshot.login_badges || []).join("\n"));
    setBanners(
      (snapshot.home_banners || []).map((b) => ({
        title: b.title || "",
        subtitle: b.subtitle || "",
        link: b.link || "",
        image_url: b.image_url || "",
        image_preset_id: String((b as { image_preset_id?: string }).image_preset_id || "").trim(),
        banner_layout: normalizeHomeBannerLayout((b as { banner_layout?: string }).banner_layout),
        image_object_fit: String(normalizeHomeBannerImageFit((b as { image_object_fit?: string }).image_object_fit)),
        image_object_position: sanitizeHomeBannerObjectPosition((b as { image_object_position?: string }).image_object_position),
      }))
    );
    const nm = (snapshot.home_module_order || []).filter((k) => ["shortcuts", "tasks", "security"].includes(k as string)) as ModuleKey[];
    setModuleOrder(nm.length > 0 ? nm : ["shortcuts", "tasks", "security"]);
    setLoginCarouselSlides(
      (snapshot.login_carousel_slides || [])
        .slice()
        .sort((a, b) => a.sort_order - b.sort_order)
        .map((s) => ({
          image_url: s.image_url || "",
          title_zh: s.title_zh || "",
          title_en: s.title_en || "",
          body_zh: s.body_zh || "",
          body_en: s.body_en || "",
        })),
    );
  };

  // ── 版本列表 ──────────────────────────────────────────────────────────────
  const refreshVersions = async () => {
    setLoadingVersions(true);
    try {
      setVersions(await listMyMemberPortalSettingsVersions(30, tenantId));
    } catch (e: any) {
      showServiceErrorToast(e, t, "版本列表加载失败", "Failed to load version list");
    } finally {
      setLoadingVersions(false);
    }
  };

  const refreshOnlineVersion = useCallback(
    async (userInitiated = false) => {
      if (userInitiated) setCheckingVersion(true);
      const fetchOnce = async (): Promise<string> => {
        const res = await withTimeout(
          fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" }),
          15000,
          t("请求超时", "Request timed out"),
        );
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as { buildTime?: string };
        return String(data?.buildTime || "").trim();
      };
      const fetchWithRetry = async (): Promise<string> => {
        try {
          return await fetchOnce();
        } catch {
          await new Promise((r) => setTimeout(r, 400));
          return await fetchOnce();
        }
      };
      try {
        const build = await fetchWithRetry();
        setOnlineBuildTime(build);
      } catch (e) {
        if (userInitiated) {
          showServiceErrorToast(e, t, "在线版本读取失败", "Failed to read online version");
        }
      } finally {
        if (userInitiated) setCheckingVersion(false);
      }
    },
    [t],
  );

  const executeNotifyForceRefresh = async () => {
    try {
      await emitForceRefreshPrompt(onlineBuildTime || localBuildTime);
      toast.success(t("已发送全员刷新提示", "Refresh prompt sent to all users"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "发送失败，请稍后重试", "Send failed, please retry later");
    }
  };
  const onNotifyForceRefreshClick = () => {
    if (blockReadonly("发送刷新通知", "send refresh notification")) return;
    if (!canPublish) {
      toast.error(t("仅管理员可操作", "Admin only"));
      return;
    }
    setConfirmForceRefreshOpen(true);
  };

  // ── 初始加载 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    const cached = getMemberPortalStaffSessionSnapshot(workingDraftKey);
    // sessionStorage 缓存不得恢复设置草稿/已发布基线：他机发布后数据会陈旧；F5 仍保留 sessionStorage。
    if (cached) {
      setLotteryPrizes(cached.lotteryPrizes);
      setLotterySettings(cached.lotterySettings);
      setMallItems(cached.mallItems);
      setMallCategories(cached.mallCategories ?? []);
      setVersions(cached.versions);
      if (cached.lastPublishedLotteryFingerprint) {
        setLastPublishedLotteryFingerprint(cached.lastPublishedLotteryFingerprint);
      }
    }

    const run = async () => {
      try {
        const data = await getMyMemberPortalSettings(tenantId);
        if (cancelled) return;
        setTenantName(data.tenant_name || "");

        const serverMarker = parsePublishedBaselineMarkerFromPayload(data);
        const storedMarker = readStoredPublishedBaselineMarker(tenantId);
        const remotePublishNewer =
          storedMarker != null && publishedBaselineAdvancedOnServer(serverMarker, storedMarker);

        const { initialSnapshot, draftFound, publishedFp } = await resolveInitialPortalSnapshot(
          data,
          tenantId,
          workingDraftKey,
          remotePublishNewer,
        );
        persistPublishedBaselineMarker(tenantId, serverMarker);

        if (cancelled) return;
        setLastPublishedSnapshot(publishedFp);
        applySettingsSnapshot(initialSnapshot);
        setHasDraft(draftFound);

        let lotteryPrizesData: LotteryPrize[] = [];
        let lotterySettingsData: LotterySettings = {
          daily_free_spins: 1,
          enabled: true,
          probability_notice: null,
          order_completed_spin_enabled: false,
          order_completed_spin_amount: 1,
        };
        try {
          lotteryPrizesData = await adminGetLotteryPrizes();
          lotterySettingsData = await adminGetLotterySettings();
          setLotteryPrizes(lotteryPrizesData);
          setLotterySettings(lotterySettingsData);
        } catch (e: any) {
          if (!cancelled) showServiceErrorToast(e, t, "抽奖奖品配置加载失败", "Failed to load lottery prizes");
        }
        if (!cancelled) {
          setLastPublishedLotteryFingerprint(
            fingerprintLotteryStaffState(lotterySettingsData, lotteryPrizesData),
          );
        }
        if (cancelled) return;
        let mallItemsData: PointsMallItem[] = [];
        let mallCategoriesData: PointsMallCategory[] = [];
        try {
          [mallItemsData, mallCategoriesData] = await Promise.all([
            listMyPointsMallItems(tenantId),
            listMyPointsMallCategories(tenantId),
          ]);
          setMallItems(mallItemsData);
          setMallCategories(mallCategoriesData);
          if (!cancelled) {
            setLastPublishedMallCatalogFingerprint(fingerprintPointsMallCatalog(mallItemsData, mallCategoriesData));
          }
        } catch (e: any) {
          if (!cancelled) showServiceErrorToast(e, t, "积分商城商品加载失败", "Failed to load points mall items");
        }
        if (cancelled) return;

        let versionsData: MemberPortalVersionItem[] = [];
        setLoadingVersions(true);
        try {
          versionsData = await listMyMemberPortalSettingsVersions(30, tenantId);
          setVersions(versionsData);
        } catch (e: any) {
          if (!cancelled) showServiceErrorToast(e, t, "版本列表加载失败", "Failed to load version list");
        } finally {
          setLoadingVersions(false);
        }

        if (!cancelled) {
          setMemberPortalStaffSessionSnapshot(workingDraftKey, {
            lastPublishedSnapshot: publishedFp,
            lastPublishedMallCatalogFingerprint: fingerprintPointsMallCatalog(mallItemsData, mallCategoriesData),
            lastPublishedLotteryFingerprint: fingerprintLotteryStaffState(lotterySettingsData, lotteryPrizesData),
            tenantName: data.tenant_name || "",
            initialSnapshot,
            hasDraft: draftFound,
            lotteryPrizes: lotteryPrizesData,
            lotterySettings: lotterySettingsData,
            mallItems: mallItemsData,
            mallCategories: mallCategoriesData,
            versions: versionsData,
          });
        }
      } catch (e: any) {
        if (!cancelled) {
          showServiceErrorToast(e, t, "加载会员系统设置失败", "Failed to load member portal settings");
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    };
    void run();
    return () => {
      cancelled = true;
    };
  }, [workingDraftKey, tenantId]);

  // 仅「发布管理」需要在线版本号；避免在其它 Tab 每 30s 拉 version.json（移动网络易失败且会误弹 Toast）
  useEffect(() => {
    if (activeTab !== "publish") return;
    void refreshOnlineVersion(false);
    const timer = window.setInterval(() => {
      void refreshOnlineVersion(false);
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refreshOnlineVersion, activeTab]);

  // 自动保存当前编辑态：仅当用户实际修改了内容（与已发布基线不同）时才写服务器草稿，
  // 防止页面加载后无修改也创建/覆盖草稿（旧草稿 logo_url=null 覆盖已发布值的根源）。
  useEffect(() => {
    if (!tenantId || loading) return;
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    try { localStorage.setItem(workingDraftKey, snapshot); } catch { /* ignore */ }
    if (snapshot === lastPublishedSnapshot) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      saveDraftToServer(payload, undefined, tenantId).then((r) => {
        if (r.success) setHasDraft(true);
      }).catch((err) => { console.warn('[MemberPortalSettings] auto-save draft failed:', err); /* auto-save 静默失败 */ });
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  }, [tenantId, loading, workingDraftKey, settings, badgesText, banners, moduleOrder, loginCarouselSlides, lastPublishedSnapshot]);

  // ── Logo 上传 ─────────────────────────────────────────────────────────────
  const onUploadLogo = async (file?: File | null) => {
    if (blockReadonly("上传Logo", "upload logo")) return;
    if (!file || !tenantId) return;
    if (!file.type.startsWith("image/")) { toast.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error(t("Logo 大小不能超过 2MB", "Logo size must not exceed 2MB")); return; }
    setUploading(true);
    try {
      const toSend = await compressImageToUploadableFile(file, {
        maxDimension: LOGO_MAX_DIMENSION,
        quality: 0.88,
        outputName: "logo",
      });
      const url = await uploadMemberPortalLogo(tenantId, toSend);
      setSettings((prev) => {
        const next = { ...prev, logo_url: url };
        // 立即保存草稿，避免刷新页面后 logo 丢失
        const p = buildPortalPayloadSnapshot(next, badgesText, banners, moduleOrder, loginCarouselSlides);
        saveDraftToServer(p as MemberPortalSettings, undefined, tenantId).then((r) => {
          if (r.success) setHasDraft(true);
        }).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer failed:', err); });
        return next;
      });
      toast.success(t("Logo 上传成功", "Logo uploaded successfully"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "Logo 上传失败", "Logo upload failed");
    } finally {
      setUploading(false);
    }
  };

  // ── Banner 操作 ───────────────────────────────────────────────────────────
  const updateBanner = (idx: number, patch: Partial<BannerItem>) =>
    setBanners((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  const addBanner    = () =>
    setBanners((prev) => [
      ...prev,
      {
        title: "",
        subtitle: "",
        link: "",
        image_url: "",
        image_preset_id: "",
        banner_layout: "full_image",
        image_object_fit: "cover",
        image_object_position: "center",
      },
    ]);
  const removeBanner = (idx: number) => setBanners((prev) => prev.filter((_, i) => i !== idx));
  const uploadBannerImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传轮播图", "upload banner")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error(t("轮播图大小不能超过 3MB", "Banner size must not exceed 3MB")); return; }
    setUploadingBannerIndex(idx);
    try {
      const toSend = await compressImageToUploadableFile(file, {
        maxDimension: BANNER_MAX_DIMENSION,
        quality: 0.82,
        outputName: `banner-${idx}`,
      });
      const bannerUrl = await uploadMemberPortalBannerImage(tenantId, toSend);
      updateBanner(idx, { image_url: bannerUrl, image_preset_id: "" });
      // banner 状态更新后立即保存草稿
      const updatedBanners = banners.map((b, i) => (i === idx ? { ...b, image_url: bannerUrl, image_preset_id: "" } : b));
      const p = buildPortalPayloadSnapshot(settings, badgesText, updatedBanners, moduleOrder, loginCarouselSlides);
      saveDraftToServer(p as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (banner upload) failed:', err); });
      toast.success(t("轮播图上传成功", "Banner image uploaded successfully"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "轮播图上传失败", "Banner upload failed");
    } finally {
      setUploadingBannerIndex(null);
    }
  };

  const applyBannerPreset = (idx: number, presetId: string) => {
    if (blockReadonly("套用轮播模板", "apply banner template")) return;
    updateBanner(idx, { image_url: "", image_preset_id: presetId });
    const updatedBanners = banners.map((b, i) =>
      i === idx ? { ...b, image_url: "", image_preset_id: presetId } : b,
    );
    const p = buildPortalPayloadSnapshot(settings, badgesText, updatedBanners, moduleOrder, loginCarouselSlides);
    saveDraftToServer(p as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (template apply) failed:', err); });
    toast.success(t("已套用模板", "Template applied"));
  };

  const uploadAnnouncementImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传公告图", "upload announcement image")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error(t("图片大小不能超过 3MB", "Image size must not exceed 3MB")); return; }
    setUploadingAnnouncementIndex(idx);
    try {
      const toSend = await compressImageToUploadableFile(file, {
        maxDimension: BANNER_MAX_DIMENSION,
        quality: 0.82,
        outputName: `announcement-${idx}`,
      });
      const url = await uploadMemberPortalBannerImage(tenantId, toSend);
      setSettings((s) => {
        const arr = [...(s.announcements || [])];
        arr[idx] = { ...arr[idx], image_url: url };
        return { ...s, announcements: arr };
      });
      toast.success(t("公告图片上传成功", "Announcement image uploaded"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "公告图片上传失败", "Announcement image upload failed");
    } finally {
      setUploadingAnnouncementIndex(null);
    }
  };

  const uploadLoginCarouselImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传登录轮播图", "upload login carousel image")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error(t("图片大小不能超过 3MB", "Image size must not exceed 3MB")); return; }
    setUploadingLoginCarouselIndex(idx);
    try {
      const toSend = await compressImageToUploadableFile(file, {
        maxDimension: BANNER_MAX_DIMENSION,
        quality: 0.82,
        outputName: `login-carousel-${idx}`,
      });
      const url = await uploadMemberPortalBannerImage(tenantId, toSend);
      const updated = loginCarouselSlides.map((row, i) => (i === idx ? { ...row, image_url: url } : row));
      setLoginCarouselSlides(updated);
      const p = buildPortalPayloadSnapshot(settings, badgesText, banners, moduleOrder, updated);
      saveDraftToServer(p as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (carousel upload) failed:', err); });
      toast.success(t("图片上传成功", "Image uploaded"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "图片上传失败", "Image upload failed");
    } finally {
      setUploadingLoginCarouselIndex(null);
    }
  };

  const addLotteryPrize = () => {
    setLotteryPrizes(prev => [...prev, { name: '', type: 'points' as LotteryPrizeType, value: 0, description: null, probability: 0, display_probability: null, image_url: null, sort_order: prev.length }]);
  };
  const removeLotteryPrize = (idx: number) => {
    setLotteryPrizes(prev => prev.filter((_, i) => i !== idx));
  };
  const updateLotteryPrize = (idx: number, patch: Partial<LotteryPrize>) => {
    setLotteryPrizes(prev => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };
  const saveLotteryPrizes = async () => {
    if (!isLotteryRateValid) {
      toast.error(t('所有奖品概率总和必须等于 100%', 'Prize probabilities must total 100%'));
      return;
    }
    if (!hasThanksPrize) {
      toast.error(t('必须包含一个"感谢参与"类型奖品', 'Must include a "Thanks for participating" prize'));
      return;
    }
    setSavingSpinPrizes(true);
    try {
      await adminSaveLotteryPrizes(lotteryPrizes);
      setLotteryPrizes(await adminGetLotteryPrizes());
      toast.success(t('奖品配置已保存', 'Prize config saved'));
    } catch (e: any) {
      toast.error(e?.message || t('保存失败', 'Save failed'));
    } finally {
      setSavingSpinPrizes(false);
    }
  };
  const saveLotterySettingsHandler = async () => {
    try {
      await adminSaveLotterySettings(lotterySettings);
      toast.success(t('抽奖设置已保存', 'Lottery settings saved'));
    } catch (e: any) {
      toast.error(e?.message || t('保存失败', 'Save failed'));
    }
  };
  const addMallItem = () => {
    setMallItems((prev) => [
      ...prev,
      {
        id: `local-${Date.now()}-${Math.random()}`,
        title: "",
        description: "",
        image_url: "",
        points_cost: 100,
        stock_remaining: -1,
        per_order_limit: 1,
        per_user_daily_limit: 0,
        per_user_lifetime_limit: 0,
        enabled: true,
        sort_order: prev.length + 1,
        mall_category_id: null,
      },
    ]);
    setTimeout(() => {
      const container = document.querySelector('.max-h-\\[min\\(70vh\\,640px\\)\\]');
      if (container) container.scrollTop = container.scrollHeight;
    }, 50);
  };
  const requestRemoveMallItem = (idx: number) => setConfirmRemoveMallIdx(idx);
  const confirmRemoveMallItem = () => {
    const idx = confirmRemoveMallIdx;
    setConfirmRemoveMallIdx(null);
    if (idx == null) return;
    setMallItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const requestRemoveBanner = (idx: number) => setConfirmRemoveBannerIdx(idx);
  const confirmRemoveBanner = () => {
    const idx = confirmRemoveBannerIdx;
    setConfirmRemoveBannerIdx(null);
    if (idx == null) return;
    removeBanner(idx);
  };
  const requestRemoveAnnouncement = (idx: number) => setConfirmRemoveAnnouncementIdx(idx);
  const confirmRemoveAnnouncement = () => {
    const idx = confirmRemoveAnnouncementIdx;
    setConfirmRemoveAnnouncementIdx(null);
    if (idx == null) return;
    setSettings((s) => ({
      ...s,
      announcements: (s.announcements || []).filter((_, i) => i !== idx).map((a, i) => ({ ...a, sort_order: i + 1 })),
    }));
  };
  const moveMallItem = (from: number, to: number) => {
    setMallItems((prev) => {
      if (to < 0 || to >= prev.length || from === to) return prev;
      const next = [...prev];
      const [row] = next.splice(from, 1);
      next.splice(to, 0, row);
      return next;
    });
  };
  const addMallCategory = () => {
    setMallCategories((prev) => [
      ...prev,
      {
        id: `local-cat-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
        name_zh: "",
        name_en: "",
        sort_order: prev.length + 1,
      },
    ]);
  };
  const removeMallCategory = (idx: number) => {
    setMallCategories((prev) => prev.filter((_, i) => i !== idx));
  };
  const requestRemoveMallCategory = (idx: number) => setConfirmRemoveMallCategoryIdx(idx);
  const confirmRemoveMallCategory = () => {
    const idx = confirmRemoveMallCategoryIdx;
    setConfirmRemoveMallCategoryIdx(null);
    if (idx == null) return;
    removeMallCategory(idx);
  };
  const updateMallCategory = (idx: number, patch: Partial<PointsMallCategory>) => {
    setMallCategories((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };
  const saveMallCategoriesHandler = async () => {
    if (blockReadonly("保存商城分类", "save mall categories")) return;
    const errors: string[] = [];
    mallCategories.forEach((c, idx) => {
      if (!String(c.name_zh ?? "").trim()) {
        errors.push(t(`分类第 ${idx + 1} 行：中文名称不能为空`, `Category row ${idx + 1}: Chinese name is required`));
      }
    });
    if (errors.length > 0) {
      toast.error(errors.join("\n"), { style: { whiteSpace: "pre-line" } });
      return;
    }
    if (!tenantId) return;
    setSavingMallCategories(true);
    try {
      await saveMyPointsMallCategories(
        mallCategories.map((c) => ({
          id: String(c.id || "").startsWith("local-cat-") ? undefined : c.id,
          name_zh: String(c.name_zh ?? "").trim(),
          name_en: String(c.name_en ?? "").trim(),
        })),
        tenantId,
      );
      const next = await listMyPointsMallCategories(tenantId);
      setMallCategories(next);
      toast.success(t("商城分类已保存", "Mall categories saved"));
    } catch (e: unknown) {
      showServiceErrorToast(e, t, "保存分类失败", "Failed to save categories");
    } finally {
      setSavingMallCategories(false);
    }
  };
  const updateMallItem = (idx: number, patch: Partial<PointsMallItem>) => {
    setMallItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };
  const uploadMallItemImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传商品图", "upload product image")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error(t("商品图大小不能超过 3MB", "Product image size must not exceed 3MB")); return; }
    setUploadingMallImageIndex(idx);
    try {
      const toSend = await compressImageToUploadableFile(file, {
        maxDimension: MALL_IMAGE_MAX_DIMENSION,
        quality: 0.82,
        outputName: `mall-${idx}`,
      });
      const url = await uploadMemberPortalBannerImage(tenantId, toSend);
      updateMallItem(idx, { image_url: url });

      const uuidRe = /^[0-9a-f-]{36}$/i;
      const updatedItems = mallItems.map((x, i) => {
        const rawId = String(x.id ?? "").trim();
        const rawCat = String(x.mall_category_id ?? "").trim();
        return {
          ...(uuidRe.test(rawId) ? { id: rawId } : {}),
          title: String(x.title ?? "").trim() || t("商品", "Product"),
          description: String(x.description ?? "").trim() || null,
          image_url: i === idx ? url : (String(x.image_url ?? "").trim() || null),
          points_cost: Math.max(1, Number(x.points_cost || 0)),
          stock_remaining: Number(x.stock_remaining) < 0 ? -1 : Math.max(0, Number(x.stock_remaining || 0)),
          per_order_limit: Math.max(1, Number(x.per_order_limit || 1)),
          per_user_daily_limit: Math.max(0, Number(x.per_user_daily_limit || 0)),
          per_user_lifetime_limit: Math.max(0, Number(x.per_user_lifetime_limit || 0)),
          enabled: x.enabled !== false,
          sort_order: i + 1,
          mall_category_id: uuidRe.test(rawCat) ? rawCat : null,
        };
      });
      await upsertMyPointsMallItems(updatedItems, tenantId);
      setMallItems(await listMyPointsMallItems(tenantId));
      toast.success(t("商品图已上传并保存", "Product image uploaded and saved"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "商品图上传失败", "Product image upload failed");
    } finally {
      setUploadingMallImageIndex(null);
    }
  };
  const saveMallItems = async () => {
    if (blockReadonly("保存积分商城商品", "save points mall items")) return;
    setSavingMallItems(true);
    try {
      const errors: string[] = [];
      mallItems.forEach((x, idx) => {
        const title = String(x.title ?? "").trim();
        if (!title) errors.push(t(`第 ${idx + 1} 行：商品标题不能为空`, `Row ${idx + 1}: Product title is required`));
        if (Number(x.points_cost || 0) <= 0) errors.push(t(`第 ${idx + 1} 行「${title || '?'}」：积分必须大于 0`, `Row ${idx + 1} "${title || '?'}": Points must be > 0`));
      });
      if (errors.length > 0) {
        toast.error(errors.join("\n"), { style: { whiteSpace: "pre-line" } });
        setSavingMallItems(false);
        return;
      }
      const uuidRe = /^[0-9a-f-]{36}$/i;
      const payload = mallItems.map((x, idx) => {
        const rawId = String(x.id ?? "").trim();
        const rawCat = String(x.mall_category_id ?? "").trim();
        return {
          ...(uuidRe.test(rawId) ? { id: rawId } : {}),
          title: String(x.title ?? "").trim() || t("商品", "Product"),
          description: String(x.description ?? "").trim() || null,
          image_url: String(x.image_url ?? "").trim() || null,
          points_cost: Math.max(1, Number(x.points_cost || 0)),
          stock_remaining: Number(x.stock_remaining) < 0 ? -1 : Math.max(0, Number(x.stock_remaining || 0)),
          per_order_limit: Math.max(1, Number(x.per_order_limit || 1)),
          per_user_daily_limit: Math.max(0, Number(x.per_user_daily_limit || 0)),
          per_user_lifetime_limit: Math.max(0, Number(x.per_user_lifetime_limit || 0)),
          enabled: x.enabled !== false,
          sort_order: idx + 1,
          mall_category_id: uuidRe.test(rawCat) ? rawCat : null,
        };
      });
      await upsertMyPointsMallItems(payload, tenantId);
      setMallItems(await listMyPointsMallItems(tenantId));
      toast.success(
        t("积分商城已保存：当前表格即为线上商品全集", "Mall saved: the table is now the full catalog online"),
      );
    } catch (e: any) {
      showServiceErrorToast(e, t, "积分商城商品保存失败", "Failed to save points mall items");
    } finally {
      setSavingMallItems(false);
    }
  };

  // ── 模块排序 ──────────────────────────────────────────────────────────────
  const moveModule = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= moduleOrder.length || to >= moduleOrder.length) return;
    setModuleOrder((prev) => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  };
  const moveBanner = (from: number, to: number) => {
    if (from === to || from < 0 || to < 0 || from >= banners.length || to >= banners.length) return;
    setBanners((prev) => { const next = [...prev]; const [item] = next.splice(from, 1); next.splice(to, 0, item); return next; });
  };

  // ── 草稿（保存到服务器） ────────────────────────────────────────────────
  const saveDraft = async () => {
    if (blockReadonly("保存草稿", "save draft")) return;
    if (!canSubmitApproval) { toast.error(t("无权限保存", "No permission to save")); return; }
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    const noteTrim = publishNote.trim();
    const mallCatalogDirty =
      fingerprintPointsMallCatalog(mallItems, mallCategories) !== lastPublishedMallCatalogFingerprint;
    const lotteryDirty =
      lastPublishedLotteryFingerprint !== "" &&
      fingerprintLotteryStaffState(lotterySettings, lotteryPrizes) !== lastPublishedLotteryFingerprint;
    // 仅发布说明变更也应允许保存草稿；服务端有草稿时勿误判为无变更；积分商城 / 幸运抽奖独立落库须算有变更
    if (snapshot === lastPublishedSnapshot && !hasDraft && !noteTrim && !mallCatalogDirty && !lotteryDirty) {
      try {
        const d = await getServerDraft(tenantId);
        if (!d.success || !d.draft) {
          toast.info(t("无变更内容，无需保存", "No changes to save"));
          return;
        }
      } catch {
        toast.info(t("无变更内容，无需保存", "No changes to save"));
        return;
      }
    }
    setSavingDraft(true);
    try {
      const result = await saveDraftToServer(payload, publishNote.trim() || undefined, tenantId);
      if (!result.success) { showServiceErrorToast({ message: result.error }, t, "草稿保存失败", "Draft save failed"); return; }
      setHasDraft(true);
      toast.success(t("草稿已保存（尚未发布，会员端不会看到变更）", "Draft saved (not published yet, members won't see changes)"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "草稿保存失败", "Draft save failed");
    } finally {
      setSavingDraft(false);
    }
  };

  const onDiscardDraftClick = () => {
    if (blockReadonly("丢弃草稿", "discard draft")) return;
    setConfirmDiscardDraftOpen(true);
  };
  const executeDiscardDraft = async () => {
    setSavingDraft(true);
    try {
      await discardServerDraft(tenantId);
      const data = await getMyMemberPortalSettings(tenantId);
      applySettingsSnapshot(data.settings);
      setLastPublishedSnapshot(fingerprintPublishedSettings(data.settings));
      persistPublishedBaselineMarker(tenantId, parsePublishedBaselineMarkerFromPayload(data));
      setHasDraft(false);
      invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
      toast.success(t("草稿已丢弃，已恢复为线上版本", "Draft discarded, restored to published version"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "丢弃草稿失败", "Discard draft failed");
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraftFromServer = async () => {
    try {
      const res = await getServerDraft(tenantId);
      if (!res.success || !res.draft?.payload) { toast.info(t("没有可用的服务器草稿", "No server draft available")); return; }
      applySettingsSnapshot(res.draft.payload as unknown as MemberPortalSettings);
      toast.success(t("服务器草稿已载入", "Server draft loaded"));
    } catch (e) { showServiceErrorToast(e, t, "草稿载入失败", "Draft load failed"); }
  };
  const onResetToDefaultClick = () => {
    if (blockReadonly("恢复默认模板", "reset to default template")) return;
    setConfirmResetDefaultOpen(true);
  };
  const executeResetToDefault = () => {
    setSettings(DEFAULT_SETTINGS);
    setBadgesText(DEFAULT_SETTINGS.login_badges.join("\n"));
    setBanners([]);
    setLoginCarouselSlides([]);
    setModuleOrder(["shortcuts", "tasks", "security"]);
    toast.success(t("已恢复默认模板（未保存）", "Restored to default template (not saved)"));
  };

  // ── 回滚 & 审核 ───────────────────────────────────────────────────────────
  const requestRollback = (versionId: string) => {
    if (blockReadonly("回滚版本", "rollback version")) return;
    if (!canPublish) { toast.error(t("仅管理员可回滚", "Admin only to rollback")); return; }
    setConfirmRollbackVersionId(versionId);
  };
  const executeRollback = async () => {
    const versionId = confirmRollbackVersionId;
    setConfirmRollbackVersionId(null);
    if (!versionId) return;
    setSaving(true);
    try {
      await rollbackMyMemberPortalSettingsVersion(versionId, tenantId);
      const data = await getMyMemberPortalSettings(tenantId);
      applySettingsSnapshot(data.settings);
      setLastPublishedSnapshot(fingerprintPublishedSettings(data.settings));
      persistPublishedBaselineMarker(tenantId, parsePublishedBaselineMarkerFromPayload(data));
      await refreshVersions();
      void emitPortalSettingsUpdated(tenantId);
      invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
      toast.success(t("回滚成功并已发布", "Rollback successful and published"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "回滚失败", "Rollback failed");
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (versionId: string, approve: boolean) => {
    if (blockReadonly(approve ? "审核通过版本" : "驳回版本", approve ? "approve version" : "reject version")) return;
    if (!canPublish) { toast.error(t("仅管理员可审核", "Admin only to review")); return; }
    setSaving(true);
    try {
      const result = await approveMyMemberPortalSettingsVersion(versionId, reviewNote.trim() || undefined, approve, tenantId);
      if (!result.success) { showServiceErrorToast({ message: result.error }, t, "审核失败", "Review failed"); return; }
      if (approve) {
        void emitPortalSettingsUpdated(tenantId);
        invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
        try {
          const d = await getMyMemberPortalSettings(tenantId);
          applySettingsSnapshot(d.settings);
          setLastPublishedSnapshot(fingerprintPublishedSettings(d.settings));
          persistPublishedBaselineMarker(tenantId, parsePublishedBaselineMarkerFromPayload(d));
        } catch {
          /* ignore */
        }
      }
      toast.success(approve ? t("审核通过并已处理发布", "Approved and published") : t("已驳回", "Rejected"));
      setReviewNote("");
      await refreshVersions();
    } catch (e: any) {
      showServiceErrorToast(e, t, "审核失败", "Review failed");
    } finally {
      setSaving(false);
    }
  };

  // ── 发布上线（先保存草稿，再发布） ───────────────────────────────────────
  const onPublishClick = async () => {
    if (blockReadonly("发布上线", "publish")) return;
    if (!canPublish) { toast.error(t("仅管理员可发布", "Admin only to publish")); return; }
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    const noteTrim = publishNote.trim();
    const mallCatalogDirty =
      fingerprintPointsMallCatalog(mallItems, mallCategories) !== lastPublishedMallCatalogFingerprint;
    const lotteryDirty =
      lastPublishedLotteryFingerprint !== "" &&
      fingerprintLotteryStaffState(lotterySettings, lotteryPrizes) !== lastPublishedLotteryFingerprint;
    // 1) 基线指纹已与 buildPayload 对齐。2) 填了发布说明应允许发版。3) 服务端仍有草稿时须允许发布。4) 仅改积分商城 / 幸运抽奖（含概率说明）也已落库或待推送，应允许发版。
    if (snapshot === lastPublishedSnapshot && !hasDraft && !noteTrim && !mallCatalogDirty && !lotteryDirty) {
      try {
        const d = await getServerDraft(tenantId);
        if (!d.success || !d.draft) {
          toast.info(t("无最新内容，无需重复发布", "No new changes, no need to republish"));
          return;
        }
      } catch {
        toast.info(t("无最新内容，无需重复发布", "No new changes, no need to republish"));
        return;
      }
    }
    setConfirmPublishOpen(true);
  };
  const executePublish = async () => {
    setConfirmPublishOpen(false);
    const lotteryDirtyForPublish =
      lastPublishedLotteryFingerprint !== "" &&
      fingerprintLotteryStaffState(lotterySettings, lotteryPrizes) !== lastPublishedLotteryFingerprint;
    if (lotteryDirtyForPublish) {
      if (!isLotteryRateValid || !hasThanksPrize) {
        toast.error(
          t(
            "抽奖有未保存变更，但奖品概率须合计 100% 且须含「感谢参与」才能写入。请先在「幸运抽奖」页保存后再发布。",
            "Lottery has unsaved changes but prizes must total 100% with a Thanks prize. Save on the Lucky Spin tab first, then publish.",
          ),
        );
        return;
      }
    }

    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    setSaving(true);
    let lotteryRefetched: { prizes: LotteryPrize[]; settings: LotterySettings } | null = null;
    try {
      if (lotteryDirtyForPublish) {
        await adminSaveLotterySettings(lotterySettings);
        await adminSaveLotteryPrizes(lotteryPrizes);
        const [np, ns] = await Promise.all([adminGetLotteryPrizes(), adminGetLotterySettings()]);
        setLotteryPrizes(np);
        setLotterySettings(ns);
        lotteryRefetched = { prizes: np, settings: ns };
      }

      const draftResult = await saveDraftToServer(payload, publishNote.trim() || undefined, tenantId);
      if (!draftResult.success) { showServiceErrorToast({ message: draftResult.error }, t, "草稿保存失败", "Draft save failed"); return; }

      const result = await publishServerDraft(publishNote.trim() || undefined, tenantId);
      if (!result.success) { showServiceErrorToast({ message: result.error }, t, "发布失败", "Publish failed"); return; }

      void emitPortalSettingsUpdated(tenantId);

      try {
        const freshData = await getMyMemberPortalSettings(tenantId);
        const freshPublished: MemberPortalSettings = { ...DEFAULT_SETTINGS, ...freshData.settings };
        applySettingsSnapshot(freshPublished);
        setLastPublishedSnapshot(fingerprintPublishedSettings(freshPublished));
        persistPublishedBaselineMarker(tenantId, parsePublishedBaselineMarkerFromPayload(freshData));
      } catch {
        setLastPublishedSnapshot(snapshot);
      }
      setHasDraft(false);
      setLastPublishedMallCatalogFingerprint(fingerprintPointsMallCatalog(mallItems, mallCategories));
      setLastPublishedLotteryFingerprint(
        lotteryRefetched
          ? fingerprintLotteryStaffState(lotteryRefetched.settings, lotteryRefetched.prizes)
          : fingerprintLotteryStaffState(lotterySettings, lotteryPrizes),
      );
      setPublishNote(""); setScheduleAt("");
      try { localStorage.removeItem(workingDraftKey); } catch { /* ignore */ }
      await refreshVersions();
      invalidateMemberPortalStaffSessionSnapshot(workingDraftKey);
      toast.success(t(`已发布版本 V${result.version_no}，会员端已生效`, `Published version V${result.version_no}, now live for members`));
    } catch (e: any) {
      showServiceErrorToast(e, t, "发布失败", "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  // ── 提审（旧流程保留兼容） ─────────────────────────────────────────────
  const onSubmitForReviewClick = () => {
    if (blockReadonly("提交审核", "submit for review")) return;
    if (!canSubmitApproval) { toast.error(t("无权限提交", "No permission to submit")); return; }
    setConfirmSubmitReviewOpen(true);
  };
  const executeSubmitForReview = async () => {
    setConfirmSubmitReviewOpen(false);
    const payload = buildPayload();
    setSaving(true);
    try {
      const submitResult = await submitMyMemberPortalSettingsForApproval(payload, publishNote.trim() || undefined, scheduleAt || null, tenantId);
      if (!submitResult.success) { showServiceErrorToast({ message: submitResult.error }, t, "提交审批失败", "Submit for approval failed"); return; }
      toast.success(t(`已提交审核 V${submitResult.version_no}`, `Submitted for review V${submitResult.version_no}`));
      setPublishNote(""); setScheduleAt("");
      await refreshVersions();
    } catch (e: any) {
      showServiceErrorToast(e, t, "提交失败", "Submit failed");
    } finally {
      setSaving(false);
    }
  };

  // ─── 无租户 / 加载中 ──────────────────────────────────────────────────────
  if (!tenantId) return (
    <div className="flex min-h-[40vh] items-center justify-center p-6">
      <div className={cn(portalSettingsEmptyShellClass, "relative w-full max-w-md px-6 py-10")}>
        <div className={cn("relative mx-auto mb-4", portalSettingsEmptyIconWrapClass)}>
          <Globe2 className="h-5 w-5" strokeWidth={1.75} aria-hidden />
        </div>
        <h1 className="text-lg font-bold tracking-tight">{t("会员系统", "Member Portal")}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">
          {t("未检测到租户，请先登录租户账号或进入租户视图。", "No tenant detected. Please log in to a tenant account or enter tenant view.")}
        </p>
      </div>
    </div>
  );
  if (loading) return (
    <div className="space-y-0">
      <div
        className={cn(
          "sticky top-0 z-20 border-b border-border",
          isMobile ? "bg-background" : "bg-background/95 backdrop-blur",
        )}
      >
        <div className="flex items-center justify-between px-6 pt-5 pb-3 gap-4">
          <div className="min-w-0">
            <div className="h-6 w-48 bg-muted animate-pulse rounded" />
            <div className="h-3 w-32 bg-muted animate-pulse rounded mt-2" />
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <div className="h-9 w-20 bg-muted animate-pulse rounded" />
            <div className="h-9 w-24 bg-muted animate-pulse rounded" />
          </div>
        </div>
        <div className="flex gap-0 border-b border-border/60 bg-muted/20 px-6">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-10 rounded bg-muted animate-pulse my-1 mx-1" style={{ width: `${70 + i * 6}px`, opacity: 1 - i * 0.08 }} />
          ))}
        </div>
      </div>
      <div className="px-6 py-6 w-full max-w-none space-y-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="rounded-lg border bg-card p-5 space-y-3">
            <div className="h-4 w-28 bg-muted animate-pulse rounded" />
            <div className="h-10 w-full bg-muted animate-pulse rounded" />
            <div className="h-10 w-3/4 bg-muted animate-pulse rounded" style={{ opacity: 0.7 }} />
          </div>
        ))}
      </div>
    </div>
  );

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0">

      {/* ── 顶部 Header 区 ────────────────────────────────────────────────── */}
      {/* 移动端不用 backdrop-blur，避免纵向滚动时与下层内容合成闪烁（易被误认为 Tab/客服图标「闪现」） */}
      <div
        className={cn(
          "sticky top-0 z-20 border-b border-border",
          isMobile ? "bg-background" : "bg-background/95 backdrop-blur",
        )}
      >
        {/* 标题行 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-none">{t("会员系统设置", "Member Portal Settings")}</h1>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              {t("当前租户", "Current tenant")}：{tenantName || t("未命名租户", "Unnamed tenant")}
            </p>
          </div>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 保存草稿按钮 */}
            <Button type="button" variant="outline" onClick={saveDraft} disabled={savingDraft || saving || !canEdit} className="h-9 gap-2 px-4">
              {savingDraft
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <Save className="h-4 w-4" />}
              {t("保存", "Save")}
            </Button>

            {/* 发布上线按钮 */}
            {canPublish ? (
              <Button onClick={onPublishClick} disabled={saving || savingDraft || !canEdit} className="h-9 gap-2 px-4">
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ChevronRight className="h-4 w-4" />}
                {t("发布上线", "Publish")}
              </Button>
            ) : (
              <Button onClick={onSubmitForReview} disabled={saving || savingDraft || !canEdit} className="h-9 gap-2 px-4">
                {saving
                  ? <Loader2 className="h-4 w-4 animate-spin" />
                  : <ChevronRight className="h-4 w-4" />}
                {t("提交审核", "Submit for Review")}
              </Button>
            )}
          </div>
        </div>

        {/* Tab 导航 */}
        <div className={cn("flex gap-0 border-b border-border/60 bg-muted/20", isMobile ? "px-3 overflow-x-auto scrollbar-hide" : "px-6 flex-wrap")}>
          {TABS.map(({ key, label, labelEn, icon: Icon }) => (
            <button
              key={key}
              onClick={() => setActiveTab(key)}
              className={cn(
                "flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors whitespace-nowrap",
                activeTab === key
                  ? "border-primary text-primary"
                  : "border-transparent text-muted-foreground hover:text-foreground hover:border-border"
              )}
            >
              <Icon className="h-4 w-4" />
              {t(label, labelEn)}
            </button>
          ))}
        </div>
      </div>

      <div
        className={cn(
          "mt-4 rounded-xl border border-border bg-gradient-to-br from-primary/[0.06] via-muted/30 to-muted/20 px-4 py-3 shadow-sm",
          isMobile ? "mx-3" : "mx-6",
        )}
      >
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-4 w-4" aria-hidden />
          </div>
          <p className="min-w-0 pt-0.5 text-sm leading-relaxed text-muted-foreground">
            {t(
              "在此配置会员端登录、品牌、积分商城、抽奖、邀请与客服等；保存或发布后，变更按当前租户对会员生效。",
              "Configure member login, branding, points mall, lottery, invites and support. Saving or publishing applies changes to members for this tenant.",
            )}
          </p>
        </div>
      </div>

      {/* ── 草稿状态提示 ─────────────────────────────────────────────── */}
      {hasDraft && (
        <div className="mx-6 mt-4 flex items-center justify-between gap-3 rounded-lg border border-amber-300 bg-amber-50 px-4 py-3 dark:border-amber-700 dark:bg-amber-950/40">
          <div className="flex items-center gap-2 text-sm text-amber-800 dark:text-amber-200">
            <Save className="h-4 w-4 shrink-0" />
            <span>{t("当前为草稿状态，会员端尚未生效。点击「发布上线」使变更对会员可见。", "Draft mode — changes are not live yet. Click \"Publish\" to make changes visible to members.")}</span>
          </div>
          <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-amber-700 dark:text-amber-300 shrink-0" onClick={onDiscardDraftClick} disabled={savingDraft}>
            {t("丢弃草稿", "Discard Draft")}
          </Button>
        </div>
      )}

      {/* ── Tab 内容区 ─────────────────────────────────────────────────────── */}
      <div className={cn("flex gap-8 py-6", isMobile ? "px-3" : "px-6")}>
        {/* Tab 内容 */}
        <div className="flex-1 min-w-0 w-full max-w-none">
        {/* 前端设置已合并至首页内容 */}

        {/* ════ 登录设置（未登录落地页）+ 品牌外观 ════════════════════════════ */}
        {activeTab === "login" && (
          <>
          <LoginSettingsTab
            settings={settings}
            onSettingsFieldChange={(key, value) => setSettings((s) => ({ ...s, [key]: value }))}
            badgesText={badgesText}
            onBadgesTextChange={setBadgesText}
            loginCarouselSlides={loginCarouselSlides}
            onLoginCarouselSlidesChange={setLoginCarouselSlides}
            uploadLoginCarouselImage={uploadLoginCarouselImage}
            uploadingLoginCarouselIndex={uploadingLoginCarouselIndex}
          />
          {/* 品牌外观（原独立 tab，合并至登录设置） */}
          <div className="mt-6">
            <BrandTab
              settings={settings}
              onSettingsChange={handleSettingsChange}
              tenantId={tenantId}
              logoPreview={logoPreview}
              uploading={uploading}
              onUploadLogo={onUploadLogo}
            />
          </div>
          </>
        )}

        {/* 品牌外观已合并至登录设置 */}

        {/* ════ 客服设置 ════════════════════════════════════════════════════ */}
        {activeTab === "customer_service" && (
          <CustomerServiceTab
            settings={settings}
            onSettingsChange={handleSettingsChange}
            imageFileToWebpDataUrl={imageFileToWebpDataUrl}
          />
        )}

        {activeTab === "member_inbox" && (
          <div className="space-y-4">
            <p className="text-xs text-muted-foreground">
              {t(
                "控制会员端「消息通知」入口与收件箱。总开关关闭时：会员端不展示铃铛、接口不返回列表且不会写入新通知；下方子项仍可预先勾选，保存/发布后写入数据库，待总开关打开即按子项生效。",
                "Member inbox and bell. When master is off: bell hidden, API returns no rows, no new writes. Sub-options stay editable as presets—save/publish stores them; when you turn master on, each channel follows its switch.",
              )}
            </p>
            <SwitchRow
              label={t("启用会员收件箱", "Enable member inbox")}
              desc={t("关闭后会员端隐藏通知入口，列表与未读数为空。", "When off, the bell is hidden; list and unread count are empty.")}
              checked={!!settings.enable_member_inbox}
              onChange={(v) => handleSettingsChange({ enable_member_inbox: v })}
            />
            <SwitchRow
              label={t("交易完成转盘奖励通知", "Trade completed — spin reward")}
              desc={t(
                "总开关开启且此项开启时写入通知；总开关关闭时仅保存偏好，不推送。",
                "Writes when master is on and this is on; when master is off, only saves your preference.",
              )}
              checked={!!settings.member_inbox_notify_order_spin}
              onChange={(v) => handleSettingsChange({ member_inbox_notify_order_spin: v })}
            />
            <SwitchRow
              label={t("积分商城兑换结果通知", "Points mall redemption outcome")}
              desc={t(
                "总开关开启且此项开启时写入通知；总开关关闭时仅保存偏好，不推送。",
                "Writes when master is on and this is on; when master is off, only saves your preference.",
              )}
              checked={!!settings.member_inbox_notify_mall_redemption}
              onChange={(v) => handleSettingsChange({ member_inbox_notify_mall_redemption: v })}
            />
            <SwitchRow
              label={t("门户公告同步至收件箱", "Portal announcements → inbox")}
              desc={t(
                "总开关开启且此项开启时同步公告；总开关关闭时仅保存偏好，不推送。",
                "Fan-out when master is on and this is on; when master is off, only saves your preference.",
              )}
              checked={!!settings.member_inbox_notify_announcement}
              onChange={(v) => handleSettingsChange({ member_inbox_notify_announcement: v })}
            />
          </div>
        )}

        {activeTab === "legal_policies" && (
          <LegalPoliciesTab settings={settings} onSettingsChange={handleSettingsChange} />
        )}

        {/* ════ 首页内容 + 前端设置 ════════════════════════════════════════ */}
        {activeTab === "homepage" && (
          <div className="space-y-6">
            {/* 前端设置（原独立 tab，合并至首页内容） */}
            <FrontendSettingsTab settings={settings} onSettingsChange={handleSettingsChange} />

            <p className="text-xs text-muted-foreground -mb-2">
              {t(
                "配置会员登录后的首页：公告、轮播、模块顺序与弹窗公告。登录页顶部轮播请在「登录设置」中配置。",
                "Configure the member home after sign-in: announcements, banners, module order, popup. For the login page top carousel, use the Login tab.",
              )}
            </p>

            {/* 首页公告（多条） */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>{t("首页公告", "Homepage Announcements")}</SectionTitle>
                  <Button type="button" variant="outline" size="sm" className="gap-1.5"
                    onClick={() => setSettings((s) => ({
                      ...s,
                      announcements: [...(s.announcements || []), { title: "", content: "", image_url: "", published_at: "", sort_order: (s.announcements?.length || 0) + 1 }],
                    }))}>
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
                {String(settings.announcement || "").trim() &&
                  (!(settings.announcements || []).length) && (
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
                              announcements: [
                                { title: "", content: text, image_url: "", published_at: "", sort_order: 1 },
                              ],
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
                {(!settings.announcements || settings.announcements.length === 0) ? (
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
                        <p className="text-sm font-medium flex-1">{t("公告", "Announcement")} #{idx + 1}</p>
                        <div className="flex items-center gap-1">
                          {idx > 0 && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                              setSettings((s) => {
                                const arr = [...(s.announcements || [])];
                                [arr[idx - 1], arr[idx]] = [arr[idx], arr[idx - 1]];
                                return { ...s, announcements: arr.map((a, i) => ({ ...a, sort_order: i + 1 })) };
                              });
                            }}><ChevronUp className="h-3.5 w-3.5" /></Button>
                          )}
                          {idx < (settings.announcements?.length || 0) - 1 && (
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" onClick={() => {
                              setSettings((s) => {
                                const arr = [...(s.announcements || [])];
                                [arr[idx], arr[idx + 1]] = [arr[idx + 1], arr[idx]];
                                return { ...s, announcements: arr.map((a, i) => ({ ...a, sort_order: i + 1 })) };
                              });
                            }}><ChevronDown className="h-3.5 w-3.5" /></Button>
                          )}
                          <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive"
                            onClick={() => requestRemoveAnnouncement(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <Input
                        value={ann.title}
                        onChange={(e) => setSettings((s) => {
                          const arr = [...(s.announcements || [])];
                          arr[idx] = { ...arr[idx], title: e.target.value };
                          return { ...s, announcements: arr };
                        })}
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
                          ref={(el) => { announcementInputRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            uploadAnnouncementImage(idx, e.target.files?.[0]);
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
                            onChange={(e) => setSettings((s) => {
                              const arr = [...(s.announcements || [])];
                              arr[idx] = { ...arr[idx], image_url: e.target.value };
                              return { ...s, announcements: arr };
                            })}
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
                            {uploadingAnnouncementIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                            <span className="hidden sm:inline">{t("本地上传", "Upload")}</span>
                          </Button>
                        </div>
                      </div>
                      <Textarea
                        value={ann.content}
                        onChange={(e) => setSettings((s) => {
                          const arr = [...(s.announcements || [])];
                          arr[idx] = { ...arr[idx], content: e.target.value };
                          return { ...s, announcements: arr };
                        })}
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
                        {[...(settings.announcements || []).filter((a) => a.title || a.content || a.image_url), ...(settings.announcements || []).filter((a) => a.title || a.content || a.image_url)].map((a, i) => {
                          const annDate = formatAnnouncementPublishedAt(
                            a.published_at,
                            language === "zh" ? "zh" : "en",
                          );
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
                              {annDate ? (
                                <span className="truncate text-[10px] text-amber-200/55">{annDate}</span>
                              ) : null}
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

            {/* 轮播图 */}
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
                    <Label className="text-xs font-medium text-muted-foreground">
                      {t("自动切换间隔", "Autoplay interval")}
                    </Label>
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
                      onDragStart={() => { dragBannerFrom.current = idx; }}
                      onDragOver={(e) => e.preventDefault()}
                      onDrop={() => { if (dragBannerFrom.current === null) return; moveBanner(dragBannerFrom.current, idx); dragBannerFrom.current = null; }}
                    >
                      <div className="flex items-center gap-2">
                        <GripVertical className="h-4 w-4 text-muted-foreground cursor-grab" />
                        <p className="text-sm font-medium flex-1">{t("轮播", "Banner")} #{idx + 1}</p>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => requestRemoveBanner(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={banner.title}    onChange={(e) => updateBanner(idx, { title: e.target.value })}    placeholder={t("标题（必填）", "Title (required)")} />
                        <Input value={banner.subtitle} onChange={(e) => updateBanner(idx, { subtitle: e.target.value })} placeholder={t("副标题（可选）", "Subtitle (optional)")} />
                      </div>
                      <Input value={banner.link} onChange={(e) => updateBanner(idx, { link: e.target.value })} placeholder={t("跳转链接（可选）", "Link URL (optional)")} />
                      <div className="grid gap-3 sm:grid-cols-3">
                        <div className="space-y-1.5">
                          <Label className="text-xs font-medium text-muted-foreground">{t("展示布局", "Layout")}</Label>
                          <select
                            className="flex h-9 w-full rounded-md border border-input bg-background px-2 py-1 text-sm shadow-sm"
                            value={banner.banner_layout}
                            onChange={(e) =>
                              updateBanner(idx, { banner_layout: e.target.value as HomeBannerLayout })
                            }
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
                            placeholder={t(
                              "如：居中、左上角、50% 20%",
                              "e.g. center, left top, 50% 20%",
                            )}
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
                          ref={(el) => { bannerInputRefs.current[idx] = el; }}
                          type="file"
                          accept="image/*"
                          className="hidden"
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            uploadBannerImage(idx, file);
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
                            {uploadingBannerIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
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

            {/* 首页模块排序 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>{t("模块排序", "Module Order")}</SectionTitle>
                <p className="text-xs text-muted-foreground -mt-2">{t("拖拽调整会员首页模块显示顺序", "Drag to reorder homepage modules")}</p>
                <div className="space-y-2">
                  {moduleOrder.map((key, idx) => {
                    const mod = MODULES.find((m) => m.key === key);
                    const title = mod ? t(mod.label, mod.labelEn) : key;
                    return (
                      <div
                        key={`${key}-${idx}`}
                        className="flex items-center gap-3 rounded-xl border bg-muted/20 px-3 py-2.5 cursor-grab"
                        draggable
                        onDragStart={() => { dragModuleFrom.current = idx; }}
                        onDragOver={(e) => e.preventDefault()}
                        onDrop={() => { if (dragModuleFrom.current === null) return; moveModule(dragModuleFrom.current, idx); dragModuleFrom.current = null; }}
                      >
                        <GripVertical className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-medium flex-1">{title}</span>
                        <Badge variant="secondary" className="text-[11px] font-mono">{idx + 1}</Badge>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ 任务与奖励 ════════════════════════════════════════════════════ */}
        {activeTab === "activity" && (
          <ActivityTab settings={settings} onSettingsChange={handleSettingsChange} />
        )}

        {/* ════ 幸运抽奖：设置 + 奖品配置 + 抽奖记录 ═══════════════════════ */}
        {/* ════ 幸运抽奖 ════════════════════════════════════════════════════ */}
        {activeTab === "lucky_spin" && (
          <LuckySpinTab
            lotteryPrizes={lotteryPrizes}
            setLotteryPrizes={setLotteryPrizes}
            lotterySettings={lotterySettings}
            setLotterySettings={setLotterySettings}
            savingSpinPrizes={savingSpinPrizes}
            setSavingSpinPrizes={setSavingSpinPrizes}
          />
        )}

        {/* ════ 活动数据：抽奖流水 / 签到流水（本租户全量）══════════════════════════ */}
        {activeTab === "activity_data" && (
          <ActivityDataTab tenantId={tenantId} canManage={canEdit} />
        )}

        {activeTab === "invite_simulation" && (
          <InviteSimulationSettingsTab tenantId={tenantId} canManage={canEdit} />
        )}

        {/* ════ 网站数据（本租户会员全量）════════════════════════════════════════ */}
        {activeTab === "website_data" && (
          <WebsiteDataTab tenantId={tenantId} canManage={canEdit} />
        )}

        {/* ════ 数据管理（闲置邀请会员清理）════════════════════════════════════════ */}
        {activeTab === "data_management" && (
          <DataManagementTab tenantId={tenantId} canManage={canEdit} />
        )}

        {/* ════ 积分商城 ════════════════════════════════════════════════════ */}
        {activeTab === "mall" && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground -mb-2">
              {t(
                "可兑换商品与兑换订单处理；与「任务与奖励」中的消费积分体系配合。",
                "Redeemable products and redemption orders; works with points from tasks.",
              )}
            </p>
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle className="!mt-0">
                  {t("兑换弹窗文案（会员端）", "Redeem dialog copy (member app)")}
                </SectionTitle>
                <p className="text-xs text-muted-foreground -mt-2">
                  {t(
                    "会员在积分商城点击兑换时弹出窗口内的「规则」标题，以及未配置每日/终身上限时显示的整行说明。留空则使用默认英文。",
                    "Title of the rules box and the full-line lines when daily/lifetime limits are unset in admin. Leave empty to use the default English.",
                  )}
                </p>
                <div className="space-y-2">
                  <Label>{t("规则标题（英文）", "Rules title (English)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_rules_title_en}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_rules_title_en: e.target.value }))}
                    placeholder="Rules (synced with admin)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("规则标题（中文）", "Rules title (Chinese)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_rules_title_zh}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_rules_title_zh: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("未设每日上限时整行（英文）", "Daily unlimited line (English)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_daily_unlimited_en}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_daily_unlimited_en: e.target.value }))}
                    placeholder="Daily limit: none (per admin)"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("未设每日上限时整行（中文）", "Daily unlimited line (Chinese)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_daily_unlimited_zh}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_daily_unlimited_zh: e.target.value }))}
                    placeholder=""
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("未设终身上限时整行（英文）", "Lifetime unlimited line (English)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_lifetime_unlimited_en}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_lifetime_unlimited_en: e.target.value }))}
                    placeholder="Lifetime limit: none"
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("未设终身上限时整行（中文）", "Lifetime unlimited line (Chinese)")}</Label>
                  <Input
                    value={settings.points_mall_redeem_lifetime_unlimited_zh}
                    onChange={(e) => setSettings((s) => ({ ...s, points_mall_redeem_lifetime_unlimited_zh: e.target.value }))}
                    placeholder=""
                  />
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <SectionTitle>{t("商城展示分类", "Mall display categories")}</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addMallCategory} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {t("新增分类", "Add category")}
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      disabled={savingMallCategories || !tenantId}
                      onClick={() => void saveMallCategoriesHandler()}
                      className="gap-1.5"
                    >
                      {savingMallCategories ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                      {t("保存分类", "Save categories")}
                    </Button>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {t(
                    "会员端筛选项除「全部」「受欢迎的」外，其余来自此处。删除分类后，原归属商品变为未分类（仅出现在「全部」）。请先保存分类再为商品选择分类。",
                    "Member filters use these (besides “All” and “Popular”). Deleting a category unassigns items. Save categories before assigning products.",
                  )}
                </p>
                {mallCategories.length === 0 ? (
                  <PortalSettingsEmptyState
                    icon={ShoppingBag}
                    title={t("暂无分类", "No categories")}
                    hint={t("点击「新增分类」添加，默认迁移会创建「优惠券」「礼品」。", "Add categories; migration seeds Coupons & Gifts by default.")}
                  />
                ) : (
                  <div className="space-y-3">
                    {mallCategories.map((cat, cidx) => (
                      <div key={cat.id || cidx} className="flex flex-wrap items-end gap-2 rounded-lg border bg-muted/20 p-3">
                        <div className="grid flex-1 min-w-[140px] gap-1">
                          <Label className="text-[10px] text-muted-foreground">{t("中文名", "Name (ZH)")}</Label>
                          <Input
                            value={cat.name_zh}
                            onChange={(e) => updateMallCategory(cidx, { name_zh: e.target.value })}
                            className="h-8 text-xs"
                            placeholder={t("例如：优惠券", "e.g. Coupons")}
                          />
                        </div>
                        <div className="grid flex-1 min-w-[140px] gap-1">
                          <Label className="text-[10px] text-muted-foreground">{t("英文名", "Name (EN)")}</Label>
                          <Input
                            value={cat.name_en}
                            onChange={(e) => updateMallCategory(cidx, { name_en: e.target.value })}
                            className="h-8 text-xs"
                            placeholder="Coupons"
                          />
                        </div>
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 text-destructive hover:text-destructive"
                          onClick={() => requestRemoveMallCategory(cidx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between gap-2 flex-wrap">
                  <SectionTitle>{t("积分商城商品", "Points Mall Items")}</SectionTitle>
                  <div className="flex flex-wrap gap-2">
                    <Button type="button" variant="outline" size="sm" onClick={addMallItem} className="gap-1.5">
                      <Plus className="h-3.5 w-3.5" />
                      {t("新增商品", "Add Item")}
                    </Button>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="gap-1.5 text-destructive border-destructive/40 hover:bg-destructive/10"
                          disabled={mallItems.length === 0}
                        >
                          {t("清空列表", "Clear list")}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>{t("清空商品列表？", "Clear all products in the table?")}</AlertDialogTitle>
                          <AlertDialogDescription>
                            {t(
                              "将移除表格中所有行（仅本页编辑区）。清空后请点「保存积分商城商品」才会同步到数据库；保存后会员端只显示你保存后的商品。",
                              "Removes all rows in this editor only. Click Save to update the database; members will only see items you save.",
                            )}
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                          <AlertDialogAction
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                            onClick={() => setMallItems([])}
                          >
                            {t("确认清空", "Clear")}
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  {t(
                    "一行一个商品，可新增、改字段、删行、排序。「保存」会按当前表格全量覆盖数据库中本租户商品（与清空后只录第二条等场景一致）。",
                    "One row per product: add, edit, delete, reorder. Save replaces the full catalog for your tenant (e.g. after clearing and adding new items).",
                  )}
                </p>
                {mallItems.length === 0 ? (
                  <PortalSettingsEmptyState
                    icon={ShoppingBag}
                    title={t("暂无商品", "No items yet")}
                    hint={t(
                      "点击右上角「新增商品」填写积分价、库存与配图，再点「保存积分商城商品」。",
                      "Use “Add Item” above for points, stock, and image, then “Save Points Mall Items”.",
                    )}
                  />
                ) : isMobile ? (
                  <MobileCardList>
                    {mallItems.map((item, idx) => (
                      <MobileCard key={`${item.id || "item"}-${idx}`}>
                        <MobileCardHeader>
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="text-xs text-muted-foreground font-mono">{idx + 1}.</span>
                            {String(item.image_url || "").trim() ? (
                              <ResolvableMediaThumb
                                idKey={`portal-mall-m-${String(item.id ?? idx)}`}
                                url={item.image_url}
                                frameClassName="h-8 w-8 shrink-0 rounded-md"
                                imgClassName="border object-cover"
                              />
                            ) : (
                              <div className="h-8 w-8 shrink-0 rounded-md border bg-muted/40" />
                            )}
                            <span className="font-medium text-sm truncate">{item.title || t("未命名", "Untitled")}</span>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateMallItem(idx, { enabled: v })} />
                            <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => requestRemoveMallItem(idx)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </MobileCardHeader>
                        <div className="space-y-2 mt-2">
                          <Input value={item.title || ""} onChange={(e) => updateMallItem(idx, { title: e.target.value })} placeholder={t("商品标题", "Title")} className="h-8 text-xs" />
                          <div className="space-y-1">
                            <Label className="text-[10px] text-muted-foreground">{t("展示分类", "Category")}</Label>
                            <Select
                              value={
                                item.mall_category_id &&
                                mallCategories.some((c) => c.id === item.mall_category_id)
                                  ? String(item.mall_category_id)
                                  : "__none__"
                              }
                              onValueChange={(v) =>
                                updateMallItem(idx, { mall_category_id: v === "__none__" ? null : v })
                              }
                            >
                              <SelectTrigger className="h-8 text-xs w-full">
                                <SelectValue placeholder={t("未分类", "Uncategorized")} />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="__none__">{t("未分类", "Uncategorized")}</SelectItem>
                                {mallCategories.map((c) => (
                                  <SelectItem key={c.id} value={c.id}>
                                    {language === "en" ? c.name_en || c.name_zh : c.name_zh}
                                  </SelectItem>
                                ))}
                              </SelectContent>
                            </Select>
                          </div>
                          <Textarea value={item.description || ""} onChange={(e) => updateMallItem(idx, { description: e.target.value })} rows={2} placeholder={t("商品描述", "Description")} className="min-h-[44px] max-h-24 text-xs py-1.5 resize-y" />
                          <div className="flex items-center gap-2">
                            <Input value={item.image_url || ""} onChange={(e) => updateMallItem(idx, { image_url: e.target.value })} placeholder={t("图片 URL", "Image URL")} className="h-8 text-xs font-mono flex-1" />
                            <input ref={(el) => { mallItemInputRefs.current[idx] = el; }} type="file" accept="image/*" className="hidden" onChange={(e) => { const file = e.target.files?.[0]; uploadMallItemImage(idx, file); e.currentTarget.value = ""; }} />
                            <Button type="button" variant="outline" size="sm" className="h-8 w-8 p-0 shrink-0" onClick={() => mallItemInputRefs.current[idx]?.click()} disabled={uploadingMallImageIndex === idx}>
                              {uploadingMallImageIndex === idx ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                            </Button>
                          </div>
                          <div className="grid grid-cols-3 gap-2">
                            <div><Label className="text-[10px] text-muted-foreground">{t("积分", "Pts")}</Label><Input type="number" min={0} value={item.points_cost ?? 0} onChange={(e) => updateMallItem(idx, { points_cost: Number(e.target.value || 0) })} className="h-8 text-xs px-2" /></div>
                            <div><Label className="text-[10px] text-muted-foreground">{t("库存", "Stock")}</Label><Input type="number" value={item.stock_remaining ?? -1} onChange={(e) => updateMallItem(idx, { stock_remaining: Number(e.target.value || -1) })} className="h-8 text-xs px-2" title={t("-1 无限", "-1 = unlimited")} /></div>
                            <div><Label className="text-[10px] text-muted-foreground">{t("每单", "Per order")}</Label><Input type="number" min={1} value={item.per_order_limit ?? 1} onChange={(e) => updateMallItem(idx, { per_order_limit: Number(e.target.value || 1) })} className="h-8 text-xs px-2" /></div>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div><Label className="text-[10px] text-muted-foreground">{t("日限", "Daily limit")}</Label><Input type="number" min={0} value={item.per_user_daily_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_daily_limit: Number(e.target.value || 0) })} className="h-8 text-xs px-2" title={t("0 不限", "0 = no limit")} /></div>
                            <div><Label className="text-[10px] text-muted-foreground">{t("终身", "Life")}</Label><Input type="number" min={0} value={item.per_user_lifetime_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_lifetime_limit: Number(e.target.value || 0) })} className="h-8 text-xs px-2" title={t("0 不限", "0 = no limit")} /></div>
                          </div>
                          <div className="flex items-center justify-between pt-1">
                            <div className="flex items-center gap-1">
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx === 0} onClick={() => moveMallItem(idx, idx - 1)} title={t("上移", "Up")}><ChevronUp className="h-4 w-4" /></Button>
                              <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0" disabled={idx >= mallItems.length - 1} onClick={() => moveMallItem(idx, idx + 1)} title={t("下移", "Down")}><ChevronDown className="h-4 w-4" /></Button>
                            </div>
                          </div>
                        </div>
                      </MobileCard>
                    ))}
                  </MobileCardList>
                ) : (
                  <div className="rounded-lg border bg-card">
                    <div className="max-h-[min(70vh,640px)] overflow-auto">
                      <Table className="min-w-[1140px] text-xs">
                        <TableHeader className="sticky top-0 z-10 bg-muted/95 backdrop-blur-sm shadow-sm">
                          <TableRow className="hover:bg-transparent border-b">
                            <TableHead className="w-10 whitespace-nowrap">#</TableHead>
                            <TableHead className="w-[72px] text-center whitespace-nowrap">{t("排序", "Sort")}</TableHead>
                            <TableHead className="w-[52px]">{t("图", "Img")}</TableHead>
                            <TableHead className="min-w-[140px]">{t("标题", "Title")}</TableHead>
                            <TableHead className="min-w-[130px] whitespace-nowrap">{t("展示分类", "Category")}</TableHead>
                            <TableHead className="min-w-[160px]">{t("描述", "Desc")}</TableHead>
                            <TableHead className="min-w-[200px]">{t("图片链接", "Image URL")}</TableHead>
                            <TableHead className="w-[72px] whitespace-nowrap">{t("积分", "Pts")}</TableHead>
                            <TableHead className="w-[72px] whitespace-nowrap">{t("库存", "Stock")}</TableHead>
                            <TableHead className="w-[64px] whitespace-nowrap">{t("每单", "Per order")}</TableHead>
                            <TableHead className="w-[64px] whitespace-nowrap">{t("日限", "Daily limit")}</TableHead>
                            <TableHead className="w-[64px] whitespace-nowrap">{t("终身", "Life")}</TableHead>
                            <TableHead className="w-[56px] text-center">{t("上架", "On")}</TableHead>
                            <TableHead className="w-12 text-right">{t("操作", "Action")}</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {mallItems.map((item, idx) => (
                            <TableRow key={`${item.id || "item"}-${idx}`} className="align-top">
                              <TableCell className="font-mono text-muted-foreground">{idx + 1}</TableCell>
                              <TableCell>
                                <div className="flex flex-col items-center gap-0.5">
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={idx === 0}
                                    onClick={() => moveMallItem(idx, idx - 1)}
                                    title={t("上移", "Up")}
                                  >
                                    <ChevronUp className="h-4 w-4" />
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    disabled={idx >= mallItems.length - 1}
                                    onClick={() => moveMallItem(idx, idx + 1)}
                                    title={t("下移", "Down")}
                                  >
                                    <ChevronDown className="h-4 w-4" />
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <div className="flex flex-col items-center gap-1">
                                  {String(item.image_url || "").trim() ? (
                                    <ResolvableMediaThumb
                                      idKey={`portal-mall-t-${String(item.id ?? idx)}`}
                                      url={item.image_url}
                                      frameClassName="h-10 w-10 shrink-0 rounded-md"
                                      imgClassName="border object-cover"
                                    />
                                  ) : (
                                    <div className="h-10 w-10 shrink-0 rounded-md border bg-muted/40" />
                                  )}
                                  <input
                                    ref={(el) => {
                                      mallItemInputRefs.current[idx] = el;
                                    }}
                                    type="file"
                                    accept="image/*"
                                    className="hidden"
                                    onChange={(e) => {
                                      const file = e.target.files?.[0];
                                      uploadMallItemImage(idx, file);
                                      e.currentTarget.value = "";
                                    }}
                                  />
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 w-7 p-0"
                                    onClick={() => mallItemInputRefs.current[idx]?.click()}
                                    disabled={uploadingMallImageIndex === idx}
                                    title={t("上传图片", "Upload")}
                                  >
                                    {uploadingMallImageIndex === idx ? (
                                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                    ) : (
                                      <Upload className="h-3.5 w-3.5" />
                                    )}
                                  </Button>
                                </div>
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.title || ""}
                                  onChange={(e) => updateMallItem(idx, { title: e.target.value })}
                                  placeholder={t("商品标题", "Title")}
                                  className="h-8 text-xs"
                                />
                              </TableCell>
                              <TableCell>
                                <Select
                                  value={
                                    item.mall_category_id &&
                                    mallCategories.some((c) => c.id === item.mall_category_id)
                                      ? String(item.mall_category_id)
                                      : "__none__"
                                  }
                                  onValueChange={(v) =>
                                    updateMallItem(idx, { mall_category_id: v === "__none__" ? null : v })
                                  }
                                >
                                  <SelectTrigger className="h-8 text-xs w-[min(160px,100%)]">
                                    <SelectValue placeholder={t("未分类", "Uncategorized")} />
                                  </SelectTrigger>
                                  <SelectContent>
                                    <SelectItem value="__none__">{t("未分类", "Uncategorized")}</SelectItem>
                                    {mallCategories.map((c) => (
                                      <SelectItem key={c.id} value={c.id}>
                                        {language === "en" ? c.name_en || c.name_zh : c.name_zh}
                                      </SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </TableCell>
                              <TableCell>
                                <Textarea
                                  value={item.description || ""}
                                  onChange={(e) => updateMallItem(idx, { description: e.target.value })}
                                  rows={2}
                                  placeholder={t("商品描述", "Description")}
                                  className="min-h-[52px] max-h-28 text-xs py-1.5 resize-y"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  value={item.image_url || ""}
                                  onChange={(e) => updateMallItem(idx, { image_url: e.target.value })}
                                  placeholder={t("图片 URL", "Image URL")}
                                  className="h-8 text-xs font-mono"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.points_cost ?? 0}
                                  onChange={(e) => updateMallItem(idx, { points_cost: Number(e.target.value || 0) })}
                                  className="h-8 text-xs px-2"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  value={item.stock_remaining ?? -1}
                                  onChange={(e) => updateMallItem(idx, { stock_remaining: Number(e.target.value || -1) })}
                                  className="h-8 text-xs px-2"
                                  title={t("-1 无限", "-1 = unlimited")}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={1}
                                  value={item.per_order_limit ?? 1}
                                  onChange={(e) => updateMallItem(idx, { per_order_limit: Number(e.target.value || 1) })}
                                  className="h-8 text-xs px-2"
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.per_user_daily_limit ?? 0}
                                  onChange={(e) => updateMallItem(idx, { per_user_daily_limit: Number(e.target.value || 0) })}
                                  className="h-8 text-xs px-2"
                                  title={t("0 不限", "0 = no limit")}
                                />
                              </TableCell>
                              <TableCell>
                                <Input
                                  type="number"
                                  min={0}
                                  value={item.per_user_lifetime_limit ?? 0}
                                  onChange={(e) => updateMallItem(idx, { per_user_lifetime_limit: Number(e.target.value || 0) })}
                                  className="h-8 text-xs px-2"
                                  title={t("0 不限", "0 = no limit")}
                                />
                              </TableCell>
                              <TableCell className="text-center">
                                <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateMallItem(idx, { enabled: v })} />
                              </TableCell>
                              <TableCell className="text-right">
                                <Button
                                  type="button"
                                  variant="ghost"
                                  size="sm"
                                  className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                                  onClick={() => requestRemoveMallItem(idx)}
                                >
                                  <Trash2 className="h-3.5 w-3.5" />
                                </Button>
                              </TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                  </div>
                )}
                <Button onClick={saveMallItems} disabled={savingMallItems} className="w-full gap-2">
                  {savingMallItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  {t("保存积分商城商品", "Save Points Mall Items")}
                </Button>
                <p className="text-xs text-muted-foreground text-center leading-relaxed">
                  {t(
                    "会员提交的商城兑换单请在「订单管理 → 商城订单」中处理。",
                    "Process mall redemption orders under Orders → Mall orders.",
                  )}
                </p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ 发布管理 ════════════════════════════════════════════════════ */}
        {activeTab === "publish" && (
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
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={onNotifyForceRefreshClick}
                    disabled={!canPublish}
                  >
                    <RefreshCw className="h-4 w-4" />
                    {t("一键强制全员刷新提示", "Force Refresh All Users")}
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 发布流程说明 */}
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

            {/* 发布操作 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>{t("发布操作", "Publish Actions")}</SectionTitle>
                <div className="space-y-2">
                  <Label>{t("发布备注", "Publish Note")}</Label>
                  <Input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder={t("例如：五一活动主题上线", "e.g. May Day campaign launch")} />
                </div>

                {canPublish && (
                  <div className="space-y-2">
                    <Label>{t("审核意见", "Review Comments")} <span className="text-muted-foreground font-normal text-xs">{t("（审核时填写）", "(fill in when reviewing)")}</span></Label>
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
                    <Button onClick={onSubmitForReview} disabled={saving || savingDraft || !canEdit} className="gap-2">
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

            {/* 高级草稿工具 */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionTitle>{t("高级工具", "Advanced Tools")}</SectionTitle>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={loadDraftFromServer} className="gap-2">
                    <FileDown className="h-3.5 w-3.5" />{t("载入服务器草稿", "Load Server Draft")}
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={onResetToDefaultClick} className="gap-2 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />{t("恢复默认模板", "Reset to Default")}
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t("本地草稿保存在浏览器中，作为备份恢复使用。", "Local drafts are saved in the browser as a backup.")}</p>
              </CardContent>
            </Card>

            {/* 版本历史 */}
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
                  <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
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
                      // MySQL 可能返回 0/1；仅以「当前线上」版本 is_applied 为真（服务端保证租户内至多一条为 1）
                      const applied = v.is_applied === true || v.is_applied === 1 || String(v.is_applied) === "1";
                      const statusLabel =
                        v.approval_status === "draft"   ? { text: t("草稿（未发布）", "Draft (not published)"), cls: "bg-muted text-muted-foreground border-border" } :
                        v.approval_status === "pending"  ? { text: t("待审核", "Pending Review"), cls: "bg-amber-50 text-amber-700 border-amber-200" } :
                        v.approval_status === "rejected" ? { text: t("已驳回", "Rejected"), cls: "bg-rose-50 text-rose-700 border-rose-200" } :
                        applied                          ? { text: t("当前线上（已生效）", "Live (active)"), cls: "bg-emerald-50 text-emerald-700 border-emerald-200" } :
                                                           { text: t("历史版本（已被替换）", "Superseded"), cls: "bg-zinc-100 text-zinc-600 border-zinc-200" };
                      return (
                        <div key={v.id} className="rounded-xl border bg-card p-4">
                          <div className="flex items-start justify-between gap-3">
                            <div className="min-w-0 flex-1">
                              <div className="flex items-center gap-2 mb-1">
                                <span className="text-sm font-bold">V{v.version_no}</span>
                                <span className={cn("text-[11px] font-medium border rounded-full px-2 py-0.5", statusLabel.cls)}>
                                  {statusLabel.text}
                                </span>
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
                                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => setConfirmVersionRejectId(v.id)} disabled={saving}>{t("驳回", "Reject")}</Button>
                                  <Button type="button" size="sm" className="h-7 text-xs" onClick={() => setConfirmVersionApproveId(v.id)} disabled={saving}>{t("通过", "Approve")}</Button>
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
        )}

        {/* ════ 操作日志 ════════════════════════════════════════════════════ */}
        {activeTab === "logs" && <AdminOperationLogsTab t={t} />}

        </div>

      </div>

      <AlertDialog open={confirmForceRefreshOpen} onOpenChange={setConfirmForceRefreshOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("向全员发送刷新提示？", "Send “Update Now” to all users?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("会员端将收到立即更新提示，确定继续？", "Members will see an update prompt. Continue?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setConfirmForceRefreshOpen(false);
                void executeNotifyForceRefresh();
              }}
            >
              {t("发送", "Send")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveMallCategoryIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveMallCategoryIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("删除该分类？", "Delete this category?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "删除后原归属该分类的积分商品将变为未分类；需点击「保存分类」后才会写入数据库。",
                "Items in this category become uncategorized. Click Save categories to persist.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveMallCategory}>
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveMallIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveMallIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该商品？", "Remove this product?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveMallItem}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveBannerIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveBannerIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该横幅？", "Remove this banner?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveBanner}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmRemoveAnnouncementIdx !== null} onOpenChange={(open) => !open && setConfirmRemoveAnnouncementIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该公告？", "Remove this announcement?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("从列表中移除后需点击「保存」才会写入数据库。", "Removed from the list until you click Save to persist.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction className="bg-destructive text-destructive-foreground hover:bg-destructive/90" onClick={confirmRemoveAnnouncement}>
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmDiscardDraftOpen} onOpenChange={setConfirmDiscardDraftOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("丢弃草稿？", "Discard draft?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将恢复为当前已发布的设置，未发布修改将丢失。", "Restores published settings; unpublished changes will be lost.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmDiscardDraftOpen(false);
                void executeDiscardDraft();
              }}
            >
              {t("丢弃", "Discard")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmResetDefaultOpen} onOpenChange={setConfirmResetDefaultOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("恢复为系统默认模板？", "Reset to system default template?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将用内置默认配置替换当前编辑区内容（含轮播、登录幻灯、模块顺序等），不会立即写入服务器；需保存草稿或发布后才生效。",
                "Replaces the editor with the built-in defaults (banners, login slides, module order, etc.). Nothing is saved to the server until you save a draft or publish.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setConfirmResetDefaultOpen(false);
                executeResetToDefault();
              }}
            >
              {t("恢复默认", "Reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmPublishOpen} onOpenChange={setConfirmPublishOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认发布上线？", "Publish now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("发布后会员端将立即生效。", "Changes will take effect immediately for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executePublish()}>{t("发布", "Publish")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={confirmSubmitReviewOpen} onOpenChange={setConfirmSubmitReviewOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("提交审核？", "Submit for review?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("提交后需管理员审核通过才会对会员生效。", "An admin must approve before changes go live for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={() => void executeSubmitForReview()}>{t("提交", "Submit")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmRollbackVersionId} onOpenChange={(open) => !open && setConfirmRollbackVersionId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("回滚到此版本？", "Rollback to this version?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("将发布该历史版本并替换当前线上配置，请谨慎操作。", "This version will be published and replace the current live settings.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => void executeRollback()}
            >
              {t("回滚", "Rollback")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmVersionApproveId} onOpenChange={(open) => !open && setConfirmVersionApproveId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("审核通过并发布？", "Approve and publish?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("通过后该版本将按流程发布，会员端将按规则生效。", "This version will be published per your workflow and take effect for members.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                const id = confirmVersionApproveId;
                setConfirmVersionApproveId(null);
                if (id) void onApprove(id, true);
              }}
            >
              {t("通过", "Approve")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={!!confirmVersionRejectId} onOpenChange={(open) => !open && setConfirmVersionRejectId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("驳回该版本审核？", "Reject this version?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("驳回后该版本不会上线，提交人需修改后重新提交。", "The version will not go live; submitter must revise and resubmit.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = confirmVersionRejectId;
                setConfirmVersionRejectId(null);
                if (id) void onApprove(id, false);
              }}
            >
              {t("驳回", "Reject")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
