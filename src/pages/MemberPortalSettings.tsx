import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { Button } from "@/components/ui/button";
import {
  Loader2,
  History, Save, FileDown,
  RotateCcw, ChevronRight, RefreshCw,
  Home, ShoppingBag, Info,
  Dices, Headphones, BarChart3,
  Globe2, LogIn, Scale,
  ClipboardList, Users, Bell,
} from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { showServiceErrorToast } from "@/lib/serviceErrorToast";
import { withTimeout } from "@/lib/withTimeout";
import { fetchRemoteFrontendBuildTime } from "@/lib/frontendVersion";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/auth/useIsPlatformAdminViewingTenant";
import { useIsMobile } from "@/hooks/ui/use-mobile";
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
  type AnnouncementItem,
} from "@/services/members/memberPortalSettingsService";
import { cn } from "@/lib/utils";
import { ROUTES } from "@/routes/constants";
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
import {
  portalSettingsEmptyShellClass,
  portalSettingsEmptyIconWrapClass,
} from "@/components/common/EmptyState";
import { WebsiteDataTab } from "./member-portal-settings/WebsiteDataTab";
import { ActivityDataTab } from "./member-portal-settings/ActivityDataTab";
import { InviteSimulationSettingsTab } from "./member-portal-settings/InviteSimulationSettingsTab";
import { HomepageTab } from "./member-portal-settings/HomepageTab";
import { BrandTab } from "./member-portal-settings/BrandTab";
import { LegalPoliciesTab } from "./member-portal-settings/LegalPoliciesTab";
import { ActivityTab } from "./member-portal-settings/ActivityTab";
import { PortalConfirmDialogs } from "./member-portal-settings/PortalConfirmDialogs";
import LoginSettingsTab from "./member-portal-settings/LoginSettingsTab";
import CustomerServiceTab from "./member-portal-settings/CustomerServiceTab";
import { MemberInboxTab } from "./member-portal-settings/MemberInboxTab";
import LuckySpinTab from "./member-portal-settings/LuckySpinTab";
import { PointsMallTab } from "./member-portal-settings/PointsMallTab";
import { PublishTab } from "./member-portal-settings/PublishTab";
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
  type LotterySettings,
} from '@/services/lottery/lotteryService';
import {
  getMemberPortalStaffSessionSnapshot,
  setMemberPortalStaffSessionSnapshot,
  invalidateMemberPortalStaffSessionSnapshot,
} from "@/lib/memberPortalStaffSessionCache";
import "@/styles/member-portal.css";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import {
  type ModuleKey,
  type BannerItem,
  type LoginCarouselFormRow,
  buildPortalPayloadSnapshot,
  stripEmptyAnnouncementsFromDraftMerge,
  fingerprintPublishedSettings,
  fingerprintPointsMallCatalog,
  fingerprintLotteryStaffState,
  parsePublishedBaselineMarkerFromPayload,
  readStoredPublishedBaselineMarker,
  persistPublishedBaselineMarker,
  publishedBaselineAdvancedOnServer,
  resolveInitialPortalSnapshot,
} from "./member-portal-settings/portalSettingsHelpers";

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
  { key: "legal_policies", label: "条款与隐私", labelEn: "Terms & Privacy", icon: Scale },
  { key: "publish",  label: "发布管理", labelEn: "Publishing",   icon: History },
] as const;
type TabKey = (typeof TABS)[number]["key"];

const MEMBER_PORTAL_TAB_KEY_SET = new Set<string>(TABS.map((x) => x.key));

/** 将图片文件转为 WebP data URL（客户端压缩，默认头像尺寸） */
async function imageFileToWebpDataUrl(file: File, maxSize = AVATAR_MAX_DIMENSION): Promise<string> {
  return compressImageToDataUrl(file, maxSize, 0.85);
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function MemberPortalSettingsPage() {
  const { t, language } = useLanguage();
  const navigate = useNavigate();
  const { tabKey: tabKeyParam } = useParams<{ tabKey: string }>();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const isMobile = useIsMobile();
  const tenantId = viewingTenantId || employee?.tenant_id || null;
  const canPublish        = employee?.role === "admin" || !!employee?.is_super_admin;
  const canSubmitApproval = employee?.role === "manager" || canPublish;
  const canEdit           = canSubmitApproval;

  const [activeTab, setActiveTab]       = useState<TabKey>("login");

  const goToPortalTab = useCallback(
    (key: TabKey) => {
      setActiveTab(key);
      navigate(`/staff/member-portal/${key}`, { replace: true });
    },
    [navigate],
  );

  useEffect(() => {
    if (!tabKeyParam) return;
    if (tabKeyParam === "data_management") {
      navigate(`${ROUTES.STAFF.DATA_MANAGEMENT}?dataDeleteFocus=1`, { replace: true });
      return;
    }
    if (tabKeyParam === "logs") {
      navigate("/staff/operation-logs?tab=member", { replace: true });
      return;
    }
    if (!MEMBER_PORTAL_TAB_KEY_SET.has(tabKeyParam)) {
      navigate("/staff/member-portal/login", { replace: true });
      return;
    }
    setActiveTab(tabKeyParam as TabKey);
  }, [tabKeyParam, navigate]);
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
    daily_free_spins: 0,
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
  const lotteryWeightTotal = useMemo(
    () => lotteryPrizes.reduce((acc, x) => acc + Math.max(0, Number(x.probability || 0)), 0),
    [lotteryPrizes]
  );
  const isLotteryWeightsValid = lotteryWeightTotal > 0;
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
    notify.error(t(`平台总管理查看租户时为只读，无法${actionZh}`, `Read-only in platform admin tenant view: cannot ${actionEn || actionZh}`));
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

  const applySettingsSnapshotRef = useRef(applySettingsSnapshot);
  applySettingsSnapshotRef.current = applySettingsSnapshot;

  /** 同一会话内再次进入「会员系统」：用缓存完整还原 UI，避免先全屏 loading；数据仍由下方 effect 后台刷新 */
  useLayoutEffect(() => {
    const cached = getMemberPortalStaffSessionSnapshot(workingDraftKey);
    if (cached) {
      setTenantName(cached.tenantName);
      setLastPublishedSnapshot(cached.lastPublishedSnapshot);
      if (cached.lastPublishedMallCatalogFingerprint) {
        setLastPublishedMallCatalogFingerprint(cached.lastPublishedMallCatalogFingerprint);
      }
      if (cached.lastPublishedLotteryFingerprint) {
        setLastPublishedLotteryFingerprint(cached.lastPublishedLotteryFingerprint);
      }
      applySettingsSnapshotRef.current(cached.initialSnapshot);
      setHasDraft(cached.hasDraft);
      setLotteryPrizes(cached.lotteryPrizes.map((x) => ({ ...x })));
      setLotterySettings({ ...cached.lotterySettings });
      setMallItems(cached.mallItems.map((x) => ({ ...x })));
      setMallCategories((cached.mallCategories ?? []).map((x) => ({ ...x })));
      setVersions(cached.versions.map((x) => ({ ...x })));
      setLoading(false);
    } else {
      setLoading(true);
    }
  }, [workingDraftKey, tenantId]);

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
        const build = await withTimeout(
          fetchRemoteFrontendBuildTime(),
          15000,
          t("请求超时", "Request timed out"),
        );
        if (build === undefined) throw new Error("version.json unavailable");
        return build;
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
      notify.success(t("已发送全员刷新提示", "Refresh prompt sent to all users"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "发送失败，请稍后重试", "Send failed, please retry later");
    }
  };
  const onNotifyForceRefreshClick = () => {
    if (blockReadonly("发送刷新通知", "send refresh notification")) return;
    if (!canPublish) {
      notify.error(t("仅管理员可操作", "Admin only"));
      return;
    }
    setConfirmForceRefreshOpen(true);
  };

  // ── 初始加载（后台对齐服务端；有会话缓存时由 useLayoutEffect 已秒开界面）────────────────
  useEffect(() => {
    let cancelled = false;

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
          daily_free_spins: 0,
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
  }, [workingDraftKey, tenantId, t]);

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
      saveDraftToServer(payload as unknown as MemberPortalSettings, undefined, tenantId).then((r) => {
        if (r.success) setHasDraft(true);
      }).catch((err) => { console.warn('[MemberPortalSettings] auto-save draft failed:', err); /* auto-save 静默失败 */ });
    }, 5000);
    return () => { if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current); };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenantId, loading, workingDraftKey, settings, badgesText, banners, moduleOrder, loginCarouselSlides, lastPublishedSnapshot]);

  // Keep session snapshot in sync so local changes (like mall item deletions) survive tab navigation
  useEffect(() => {
    if (loading || !tenantId) return;
    const existing = getMemberPortalStaffSessionSnapshot(workingDraftKey);
    if (!existing) return;
    setMemberPortalStaffSessionSnapshot(workingDraftKey, {
      ...existing,
      mallItems,
      mallCategories,
      lotteryPrizes,
      lotterySettings,
    });
  }, [mallItems, mallCategories, lotteryPrizes, lotterySettings, workingDraftKey, loading, tenantId]);

  // ── Logo 上传 ─────────────────────────────────────────────────────────────
  const onUploadLogo = async (file?: File | null) => {
    if (blockReadonly("上传Logo", "upload logo")) return;
    if (!file || !tenantId) return;
    if (!file.type.startsWith("image/")) { notify.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 2 * 1024 * 1024) { notify.error(t("Logo 大小不能超过 2MB", "Logo size must not exceed 2MB")); return; }
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
        saveDraftToServer(p as unknown as MemberPortalSettings, undefined, tenantId).then((r) => {
          if (r.success) setHasDraft(true);
        }).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer failed:', err); });
        return next;
      });
      notify.success(t("Logo 上传成功", "Logo uploaded successfully"));
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
    if (!file.type.startsWith("image/")) { notify.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { notify.error(t("轮播图大小不能超过 3MB", "Banner size must not exceed 3MB")); return; }
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
      saveDraftToServer(p as unknown as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (banner upload) failed:', err); });
      notify.success(t("轮播图上传成功", "Banner image uploaded successfully"));
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
    saveDraftToServer(p as unknown as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (template apply) failed:', err); });
    notify.success(t("已套用模板", "Template applied"));
  };

  const uploadAnnouncementImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传公告图", "upload announcement image")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { notify.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { notify.error(t("图片大小不能超过 3MB", "Image size must not exceed 3MB")); return; }
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
      notify.success(t("公告图片上传成功", "Announcement image uploaded"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "公告图片上传失败", "Announcement image upload failed");
    } finally {
      setUploadingAnnouncementIndex(null);
    }
  };

  const uploadLoginCarouselImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传登录轮播图", "upload login carousel image")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { notify.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { notify.error(t("图片大小不能超过 3MB", "Image size must not exceed 3MB")); return; }
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
      saveDraftToServer(p as unknown as MemberPortalSettings, undefined, tenantId).catch((err) => { console.warn('[MemberPortalSettings] saveDraftToServer (carousel upload) failed:', err); });
      notify.success(t("图片上传成功", "Image uploaded"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "图片上传失败", "Image upload failed");
    } finally {
      setUploadingLoginCarouselIndex(null);
    }
  };

  // Old inline lottery handlers removed — LuckySpinTab handles its own save/add/remove internally
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
      notify.error(errors.join("\n"), { style: { whiteSpace: "pre-line" } });
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
      notify.success(t("商城分类已保存", "Mall categories saved"));
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
    if (!file.type.startsWith("image/")) { notify.error(t("请上传图片文件", "Please upload image file")); return; }
    if (file.size > 3 * 1024 * 1024) { notify.error(t("商品图大小不能超过 3MB", "Product image size must not exceed 3MB")); return; }
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
      notify.success(t("商品图已上传并保存", "Product image uploaded and saved"));
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
        notify.error(errors.join("\n"), { style: { whiteSpace: "pre-line" } });
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
      notify.success(
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
    if (!canSubmitApproval) { notify.error(t("无权限保存", "No permission to save")); return; }
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
          notify.info(t("无变更内容，无需保存", "No changes to save"));
          return;
        }
      } catch {
        notify.info(t("无变更内容，无需保存", "No changes to save"));
        return;
      }
    }
    setSavingDraft(true);
    try {
      const result = await saveDraftToServer(payload as unknown as MemberPortalSettings, publishNote.trim() || undefined, tenantId);
      if (!result.success) { showServiceErrorToast({ message: result.error }, t, "草稿保存失败", "Draft save failed"); return; }
      setHasDraft(true);
      notify.success(t("草稿已保存（尚未发布，会员端不会看到变更）", "Draft saved (not published yet, members won't see changes)"));
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
      notify.success(t("草稿已丢弃，已恢复为线上版本", "Draft discarded, restored to published version"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "丢弃草稿失败", "Discard draft failed");
    } finally {
      setSavingDraft(false);
    }
  };

  const loadDraftFromServer = async () => {
    try {
      const res = await getServerDraft(tenantId);
      if (!res.success || !res.draft?.payload) { notify.info(t("没有可用的服务器草稿", "No server draft available")); return; }
      applySettingsSnapshot(res.draft.payload as unknown as MemberPortalSettings);
      notify.success(t("服务器草稿已载入", "Server draft loaded"));
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
    notify.success(t("已恢复默认模板（未保存）", "Restored to default template (not saved)"));
  };

  // ── 回滚 & 审核 ───────────────────────────────────────────────────────────
  const requestRollback = (versionId: string) => {
    if (blockReadonly("回滚版本", "rollback version")) return;
    if (!canPublish) { notify.error(t("仅管理员可回滚", "Admin only to rollback")); return; }
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
      notify.success(t("回滚成功并已发布", "Rollback successful and published"));
    } catch (e: any) {
      showServiceErrorToast(e, t, "回滚失败", "Rollback failed");
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (versionId: string, approve: boolean) => {
    if (blockReadonly(approve ? "审核通过版本" : "驳回版本", approve ? "approve version" : "reject version")) return;
    if (!canPublish) { notify.error(t("仅管理员可审核", "Admin only to review")); return; }
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
      notify.success(approve ? t("审核通过并已处理发布", "Approved and published") : t("已驳回", "Rejected"));
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
    if (!canPublish) { notify.error(t("仅管理员可发布", "Admin only to publish")); return; }
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
          notify.info(t("无最新内容，无需重复发布", "No new changes, no need to republish"));
          return;
        }
      } catch {
        notify.info(t("无最新内容，无需重复发布", "No new changes, no need to republish"));
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
      if (!isLotteryWeightsValid || !hasThanksPrize) {
        notify.error(
          t(
            "抽奖有未保存变更，奖品权重须大于 0 且须含「感谢参与」才能写入。请先在「幸运抽奖」页保存后再发布。",
            "Lottery has unsaved changes — prize weights must be > 0 and include a Thanks prize. Save on the Lucky Spin tab first, then publish.",
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

      const draftResult = await saveDraftToServer(payload as unknown as MemberPortalSettings, publishNote.trim() || undefined, tenantId);
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
      notify.success(t(`已发布版本 V${result.version_no}，会员端已生效`, `Published version V${result.version_no}, now live for members`));
    } catch (e: any) {
      showServiceErrorToast(e, t, "发布失败", "Publish failed");
    } finally {
      setSaving(false);
    }
  };

  // ── 提审（旧流程保留兼容） ─────────────────────────────────────────────
  const onSubmitForReviewClick = () => {
    if (blockReadonly("提交审核", "submit for review")) return;
    if (!canSubmitApproval) { notify.error(t("无权限提交", "No permission to submit")); return; }
    setConfirmSubmitReviewOpen(true);
  };
  const executeSubmitForReview = async () => {
    setConfirmSubmitReviewOpen(false);
    const payload = buildPayload();
    setSaving(true);
    try {
      const submitResult = await submitMyMemberPortalSettingsForApproval(payload as unknown as MemberPortalSettings, publishNote.trim() || undefined, scheduleAt || null, tenantId);
      if (!submitResult.success) { showServiceErrorToast({ message: submitResult.error }, t, "提交审批失败", "Submit for approval failed"); return; }
      notify.success(t(`已提交审核 V${submitResult.version_no}`, `Submitted for review V${submitResult.version_no}`));
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
              <Button onClick={onSubmitForReviewClick} disabled={saving || savingDraft || !canEdit} className="h-9 gap-2 px-4">
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
              onClick={() => goToPortalTab(key)}
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
          <MemberInboxTab settings={settings} onSettingsChange={handleSettingsChange} />
        )}

        {activeTab === "legal_policies" && (
          <LegalPoliciesTab settings={settings} onSettingsChange={handleSettingsChange} />
        )}

        {/* ════ 首页内容 + 前端设置 ════════════════════════════════════════ */}
        {activeTab === "homepage" && (
          <HomepageTab
            settings={settings}
            setSettings={setSettings}
            onSettingsChange={handleSettingsChange}
            banners={banners}
            moduleOrder={moduleOrder}
            uploadingBannerIndex={uploadingBannerIndex}
            uploadingAnnouncementIndex={uploadingAnnouncementIndex}
            bannerInputRefs={bannerInputRefs}
            announcementInputRefs={announcementInputRefs}
            dragBannerFrom={dragBannerFrom}
            dragModuleFrom={dragModuleFrom}
            addBanner={addBanner}
            updateBanner={updateBanner}
            moveBanner={moveBanner}
            requestRemoveBanner={requestRemoveBanner}
            moveModule={moveModule}
            requestRemoveAnnouncement={requestRemoveAnnouncement}
            applyBannerPreset={applyBannerPreset}
            uploadAnnouncementImage={uploadAnnouncementImage}
            uploadBannerImage={uploadBannerImage}
          />
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
        {activeTab === "activity_data" && <ActivityDataTab tenantId={tenantId} />}

        {activeTab === "invite_simulation" && (
          <InviteSimulationSettingsTab tenantId={tenantId} canManage={canEdit} />
        )}

        {/* ════ 网站数据（本租户会员全量）════════════════════════════════════════ */}
        {activeTab === "website_data" && (
          <WebsiteDataTab tenantId={tenantId} canManage={canEdit} />
        )}

        {/* ════ 积分商城 ════════════════════════════════════════════════════ */}
        {activeTab === "mall" && (
          <PointsMallTab
            t={t}
            language={language}
            settings={settings}
            setSettings={setSettings}
            mallItems={mallItems}
            setMallItems={setMallItems}
            mallCategories={mallCategories}
            savingMallCategories={savingMallCategories}
            savingMallItems={savingMallItems}
            tenantId={tenantId}
            isMobile={isMobile}
            uploadingMallImageIndex={uploadingMallImageIndex}
            mallItemInputRefs={mallItemInputRefs}
            addMallCategory={addMallCategory}
            saveMallCategories={saveMallCategoriesHandler}
            updateMallCategory={updateMallCategory}
            requestRemoveMallCategory={requestRemoveMallCategory}
            addMallItem={addMallItem}
            requestRemoveMallItem={requestRemoveMallItem}
            updateMallItem={updateMallItem}
            moveMallItem={moveMallItem}
            uploadMallItemImage={uploadMallItemImage}
            saveMallItems={saveMallItems}
          />
        )}

        {/* ════ 发布管理 ════════════════════════════════════════════════════ */}
        {activeTab === "publish" && (
          <PublishTab
            localBuildTime={localBuildTime}
            onlineBuildTime={onlineBuildTime}
            checkingVersion={checkingVersion}
            refreshOnlineVersion={refreshOnlineVersion}
            onNotifyForceRefreshClick={onNotifyForceRefreshClick}
            canPublish={canPublish}
            canEdit={canEdit}
            hasDraft={hasDraft}
            publishNote={publishNote}
            setPublishNote={setPublishNote}
            reviewNote={reviewNote}
            setReviewNote={setReviewNote}
            saveDraft={saveDraft}
            savingDraft={savingDraft}
            saving={saving}
            onPublishClick={onPublishClick}
            onSubmitForReviewClick={onSubmitForReviewClick}
            onDiscardDraftClick={onDiscardDraftClick}
            loadDraftFromServer={loadDraftFromServer}
            onResetToDefaultClick={onResetToDefaultClick}
            versions={versions}
            loadingVersions={loadingVersions}
            refreshVersions={refreshVersions}
            setConfirmVersionRejectId={setConfirmVersionRejectId}
            setConfirmVersionApproveId={setConfirmVersionApproveId}
            requestRollback={requestRollback}
          />
        )}

        </div>

      </div>

      <PortalConfirmDialogs
        confirmForceRefreshOpen={confirmForceRefreshOpen}
        setConfirmForceRefreshOpen={setConfirmForceRefreshOpen}
        executeNotifyForceRefresh={executeNotifyForceRefresh}
        confirmRemoveMallCategoryIdx={confirmRemoveMallCategoryIdx}
        setConfirmRemoveMallCategoryIdx={setConfirmRemoveMallCategoryIdx}
        confirmRemoveMallCategory={confirmRemoveMallCategory}
        confirmRemoveMallIdx={confirmRemoveMallIdx}
        setConfirmRemoveMallIdx={setConfirmRemoveMallIdx}
        confirmRemoveMallItem={confirmRemoveMallItem}
        confirmRemoveBannerIdx={confirmRemoveBannerIdx}
        setConfirmRemoveBannerIdx={setConfirmRemoveBannerIdx}
        confirmRemoveBanner={confirmRemoveBanner}
        confirmRemoveAnnouncementIdx={confirmRemoveAnnouncementIdx}
        setConfirmRemoveAnnouncementIdx={setConfirmRemoveAnnouncementIdx}
        confirmRemoveAnnouncement={confirmRemoveAnnouncement}
        confirmDiscardDraftOpen={confirmDiscardDraftOpen}
        setConfirmDiscardDraftOpen={setConfirmDiscardDraftOpen}
        executeDiscardDraft={executeDiscardDraft}
        confirmResetDefaultOpen={confirmResetDefaultOpen}
        setConfirmResetDefaultOpen={setConfirmResetDefaultOpen}
        executeResetToDefault={executeResetToDefault}
        confirmPublishOpen={confirmPublishOpen}
        setConfirmPublishOpen={setConfirmPublishOpen}
        executePublish={executePublish}
        confirmSubmitReviewOpen={confirmSubmitReviewOpen}
        setConfirmSubmitReviewOpen={setConfirmSubmitReviewOpen}
        executeSubmitForReview={executeSubmitForReview}
        confirmRollbackVersionId={confirmRollbackVersionId}
        setConfirmRollbackVersionId={setConfirmRollbackVersionId}
        executeRollback={executeRollback}
        confirmVersionApproveId={confirmVersionApproveId}
        setConfirmVersionApproveId={setConfirmVersionApproveId}
        confirmVersionRejectId={confirmVersionRejectId}
        setConfirmVersionRejectId={setConfirmVersionRejectId}
        onApprove={onApprove}
      />
    </div>
  );
}
