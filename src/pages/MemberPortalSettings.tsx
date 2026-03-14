import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Loader2, Upload, GripVertical, Plus, Trash2,
  Building2, Image, Sparkles, History, Save, FileDown,
  RotateCcw, ChevronRight, RefreshCw,
  Home, ShoppingBag, Gift, Users, Settings, Star, Info, LogOut,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useIsPlatformAdminViewingTenant } from "@/hooks/useIsPlatformAdminViewingTenant";
import {
  approveMyMemberPortalSettingsVersion,
  submitMyMemberPortalSettingsForApproval,
  DEFAULT_SETTINGS,
  createMyMemberPortalSettingsVersion,
  getMyMemberPortalSettings,
  listMyMemberPortalSettingsVersions,
  listMyMemberSpinWheelPrizes,
  rollbackMyMemberPortalSettingsVersion,
  upsertMyMemberSpinWheelPrizes,
  uploadMemberPortalBannerImage,
  uploadMemberPortalLogo,
  type MemberPortalVersionItem,
  type MemberPortalSettings,
  type SpinWheelPrizeItem,
} from "@/services/memberPortalSettingsService";
import { cn } from "@/lib/utils";
import {
  listMyPointsMallItems,
  listMyPointsMallRedemptionOrders,
  processMyPointsMallRedemptionOrder,
  upsertMyPointsMallItems,
  type PointsMallRedemptionOrder,
  type PointsMallItem,
} from "@/services/memberPointsMallService";
import {
  emitForceRefreshPrompt,
  emitPortalSettingsUpdated,
} from "@/services/memberPortalLiveUpdateService";
import "@/styles/member-antd.css";

// ─── 预览 Tab 类型 ────────────────────────────────────────────────────────────
type PreviewTabKey = "dashboard" | "points" | "spin" | "invite" | "settings";

// ─── 类型 ────────────────────────────────────────────────────────────────────
const MODULES = [
  { key: "shortcuts", label: "快捷入口" },
  { key: "tasks", label: "今日任务" },
  { key: "security", label: "安全说明" },
] as const;
type ModuleKey = (typeof MODULES)[number]["key"];
type BannerItem = { title: string; subtitle: string; link: string; image_url: string };

// ─── Tab 定义 ─────────────────────────────────────────────────────────────────
const TABS = [
  { key: "brand",    label: "品牌外观",   icon: Building2 },
  { key: "homepage", label: "首页内容",   icon: Image },
  { key: "activity", label: "活动设置",   icon: Sparkles },
  { key: "publish",  label: "发布管理",   icon: History },
] as const;
type TabKey = (typeof TABS)[number]["key"];

// ─── 分区标题组件 ──────────────────────────────────────────────────────────────
function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-xs font-semibold uppercase tracking-widest text-muted-foreground mb-3 mt-6 first:mt-0">
      {children}
    </p>
  );
}

// ─── 开关行组件 ───────────────────────────────────────────────────────────────
function SwitchRow({
  label,
  desc,
  checked,
  onChange,
}: {
  label: string;
  desc?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between rounded-xl border bg-card px-4 py-3 gap-4">
      <div>
        <p className="text-sm font-medium leading-none">{label}</p>
        {desc && <p className="text-xs text-muted-foreground mt-1">{desc}</p>}
      </div>
      <Switch checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function MemberPortalSettingsPage() {
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const isPlatformAdminReadonlyView = useIsPlatformAdminViewingTenant();
  const tenantId = viewingTenantId || employee?.tenant_id || null;
  const canPublish        = employee?.role === "admin" || !!employee?.is_super_admin;
  const canSubmitApproval = employee?.role === "manager" || canPublish;
  const canEdit           = canSubmitApproval;

  const [activeTab, setActiveTab]       = useState<TabKey>("brand");
  const [settings, setSettings]         = useState<MemberPortalSettings>(DEFAULT_SETTINGS);
  const [badgesText, setBadgesText]     = useState(DEFAULT_SETTINGS.login_badges.join("\n"));
  const [banners, setBanners]           = useState<BannerItem[]>([]);
  const [moduleOrder, setModuleOrder]   = useState<ModuleKey[]>(["shortcuts", "tasks", "security"]);
  const [uploadingBannerIndex, setUploadingBannerIndex] = useState<number | null>(null);
  const dragModuleFrom = useRef<number | null>(null);
  const dragBannerFrom = useRef<number | null>(null);
  const logoInputRef = useRef<HTMLInputElement | null>(null);
  const bannerInputRefs = useRef<Record<number, HTMLInputElement | null>>({});

  const [tenantName, setTenantName]   = useState("");
  const [publishNote, setPublishNote] = useState("");
  const [scheduleAt, setScheduleAt]   = useState("");
  const [reviewNote, setReviewNote]   = useState("");
  const [versions, setVersions]       = useState<MemberPortalVersionItem[]>([]);
  const [lastPublishedSnapshot, setLastPublishedSnapshot] = useState("");
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);
  const [uploading, setUploading] = useState(false);
  const [spinPrizes, setSpinPrizes] = useState<SpinWheelPrizeItem[]>([]);
  const [savingSpinPrizes, setSavingSpinPrizes] = useState(false);
  const [mallItems, setMallItems] = useState<PointsMallItem[]>([]);
  const [savingMallItems, setSavingMallItems] = useState(false);
  const [uploadingMallImageIndex, setUploadingMallImageIndex] = useState<number | null>(null);
  const mallItemInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [mallOrders, setMallOrders] = useState<PointsMallRedemptionOrder[]>([]);
  const [loadingMallOrders, setLoadingMallOrders] = useState(false);
  const [processingMallOrderId, setProcessingMallOrderId] = useState<string | null>(null);
  const [onlineBuildTime, setOnlineBuildTime] = useState<string>("");
  const [checkingVersion, setCheckingVersion] = useState(false);
  const [previewTab, setPreviewTab] = useState<PreviewTabKey>("dashboard");
  const localBuildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : "unknown";
  const enabledSpinPrizes = useMemo(
    () => spinPrizes.filter((x) => x.enabled !== false),
    [spinPrizes]
  );
  const spinRateTotal = useMemo(
    () => enabledSpinPrizes.reduce((acc, x) => acc + Math.max(0, Number(x.hit_rate || 0)), 0),
    [enabledSpinPrizes]
  );
  const isSpinRateValid = Math.abs(spinRateTotal - 100) < 0.0001;

  const logoPreview = useMemo(() => settings.logo_url || "", [settings.logo_url]);
  const draftKey    = useMemo(() => `member_portal_draft_${tenantId || "none"}`, [tenantId]);
  const workingDraftKey = useMemo(() => `member_portal_working_${tenantId || "none"}`, [tenantId]);
  const blockReadonly = useCallback((action: string) => {
    if (!isPlatformAdminReadonlyView) return false;
    toast.error(`平台总管理查看租户时为只读，无法${action}`);
    return true;
  }, [isPlatformAdminReadonlyView]);

  // ── 构建 payload ──────────────────────────────────────────────────────────
  const buildPayload = () => {
    const parsedBadges = badgesText.split("\n").map((s) => s.trim()).filter(Boolean).slice(0, 6);
    const parsedBanners = banners
      .map((b) => ({ title: b.title.trim(), subtitle: b.subtitle.trim(), link: b.link.trim(), image_url: b.image_url.trim() }))
      .filter((b) => b.title || b.subtitle || b.link || b.image_url)
      .slice(0, 8);
    const parsedModuleOrder = moduleOrder.filter((s) => ["shortcuts", "tasks", "security"].includes(s));
    return {
      ...settings,
      login_badges:      parsedBadges.length > 0 ? parsedBadges : DEFAULT_SETTINGS.login_badges,
      home_banners:      parsedBanners,
      home_module_order: parsedModuleOrder.length > 0 ? parsedModuleOrder : DEFAULT_SETTINGS.home_module_order,
    };
  };
  const getPayloadSnapshot = () => JSON.stringify(buildPayload());

  const applySettingsSnapshot = (snapshot: MemberPortalSettings) => {
    setSettings({ ...DEFAULT_SETTINGS, ...snapshot });
    setBadgesText((snapshot.login_badges || []).join("\n"));
    setBanners(
      (snapshot.home_banners || []).map((b) => ({
        title: b.title || "",
        subtitle: b.subtitle || "",
        link: b.link || "",
        image_url: b.image_url || "",
      }))
    );
    const nm = (snapshot.home_module_order || []).filter((k) => ["shortcuts", "tasks", "security"].includes(k as string)) as ModuleKey[];
    setModuleOrder(nm.length > 0 ? nm : ["shortcuts", "tasks", "security"]);
  };

  // ── 版本列表 ──────────────────────────────────────────────────────────────
  const refreshVersions = async () => {
    setLoadingVersions(true);
    try {
      setVersions(await listMyMemberPortalSettingsVersions(30, tenantId));
    } catch (e: any) {
      toast.error(e?.message || "版本列表加载失败");
    } finally {
      setLoadingVersions(false);
    }
  };

  const refreshOnlineVersion = useCallback(async () => {
    setCheckingVersion(true);
    try {
      const res = await fetch(`/version.json?t=${Date.now()}`, { cache: "no-store" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = (await res.json()) as { buildTime?: string };
      setOnlineBuildTime(String(data?.buildTime || "").trim());
    } catch {
      toast.error("在线版本读取失败");
    } finally {
      setCheckingVersion(false);
    }
  }, []);

  const notifyForceRefreshAll = async () => {
    if (blockReadonly("发送刷新通知")) return;
    if (!canPublish) {
      toast.error("仅管理员可操作");
      return;
    }
    if (!window.confirm("确认向全员发送“立即更新”提示？")) return;
    try {
      await emitForceRefreshPrompt(onlineBuildTime || localBuildTime);
      toast.success("已发送全员刷新提示");
    } catch (e: any) {
      toast.error(e?.message || "发送失败，请稍后重试");
    }
  };

  // ── 初始加载 ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const run = async () => {
      setLoading(true);
      try {
        const data = await getMyMemberPortalSettings(tenantId);
        let initialSnapshot = data.settings;
        try {
          const raw = localStorage.getItem(workingDraftKey);
          if (raw) {
            const parsed = JSON.parse(raw) as MemberPortalSettings;
            initialSnapshot = { ...DEFAULT_SETTINGS, ...parsed };
          }
        } catch {
          // ignore local draft parse error
        }
        applySettingsSnapshot(initialSnapshot);
        setLastPublishedSnapshot(JSON.stringify(data.settings));
        setTenantName(data.tenant_name || "");
        try {
          setSpinPrizes(await listMyMemberSpinWheelPrizes());
        } catch (e: any) {
          toast.error(e?.message || "抽奖奖品配置加载失败");
        }
        try {
          setMallItems(await listMyPointsMallItems());
        } catch (e: any) {
          toast.error(e?.message || "积分商城商品加载失败");
        }
        await refreshMallOrders();
        await refreshVersions();
      } catch (e: any) {
        toast.error(e?.message || "加载会员系统设置失败");
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [workingDraftKey, tenantId]);

  useEffect(() => {
    void refreshOnlineVersion();
    const timer = window.setInterval(() => {
      void refreshOnlineVersion();
    }, 30000);
    return () => window.clearInterval(timer);
  }, [refreshOnlineVersion]);

  // 自动保存当前编辑态：切换到其他页面后返回不会清空
  useEffect(() => {
    if (!tenantId || loading) return;
    try {
      localStorage.setItem(workingDraftKey, JSON.stringify(buildPayload()));
    } catch {
      // ignore storage errors
    }
  }, [tenantId, loading, workingDraftKey, settings, badgesText, banners, moduleOrder]);

  // ── Logo 上传 ─────────────────────────────────────────────────────────────
  const onUploadLogo = async (file?: File | null) => {
    if (blockReadonly("上传Logo")) return;
    if (!file || !tenantId) return;
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    if (file.size > 2 * 1024 * 1024) { toast.error("Logo 大小不能超过 2MB"); return; }
    setUploading(true);
    try {
      const url = await uploadMemberPortalLogo(tenantId, file);
      setSettings((prev) => ({ ...prev, logo_url: url }));
      toast.success("Logo 上传成功");
    } catch (e: any) {
      toast.error(e?.message || "Logo 上传失败");
    } finally {
      setUploading(false);
    }
  };

  // ── Banner 操作 ───────────────────────────────────────────────────────────
  const updateBanner = (idx: number, patch: Partial<BannerItem>) =>
    setBanners((prev) => prev.map((item, i) => (i === idx ? { ...item, ...patch } : item)));
  const addBanner    = () => setBanners((prev) => [...prev, { title: "", subtitle: "", link: "", image_url: "" }]);
  const removeBanner = (idx: number) => setBanners((prev) => prev.filter((_, i) => i !== idx));
  const uploadBannerImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传轮播图")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("轮播图大小不能超过 3MB"); return; }
    setUploadingBannerIndex(idx);
    try {
      updateBanner(idx, { image_url: await uploadMemberPortalBannerImage(tenantId, file) });
      toast.success("轮播图上传成功");
    } catch (e: any) {
      toast.error(e?.message || "轮播图上传失败");
    } finally {
      setUploadingBannerIndex(null);
    }
  };

  const addSpinPrize = () => {
    setSpinPrizes((prev) => {
      if (prev.length >= 10) {
        toast.info("最多 10 个奖品");
        return prev;
      }
      return [...prev, { name: "", prize_type: "custom", hit_rate: 1, enabled: true }];
    });
  };
  const removeSpinPrize = (idx: number) => {
    setSpinPrizes((prev) => {
      if (prev.length <= 6) {
        toast.info("最少保留 6 个奖品");
        return prev;
      }
      return prev.filter((_, i) => i !== idx);
    });
  };
  const updateSpinPrize = (idx: number, patch: Partial<SpinWheelPrizeItem>) => {
    setSpinPrizes((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };
  const saveSpinPrizes = async () => {
    if (blockReadonly("保存抽奖奖品配置")) return;
    if (!isSpinRateValid) {
      toast.error("启用奖品命中率总和必须等于 100%");
      return;
    }
    setSavingSpinPrizes(true);
    try {
      const payload = spinPrizes.map((x) => ({
        ...x,
        name: (x.name || "").trim() || "奖品",
        hit_rate: Math.min(100, Math.max(0, Number(x.hit_rate || 0))),
        enabled: x.enabled !== false,
      }));
      await upsertMyMemberSpinWheelPrizes(payload);
      setSpinPrizes(await listMyMemberSpinWheelPrizes());
      toast.success("抽奖奖品配置已保存");
    } catch (e: any) {
      toast.error(e?.message || "抽奖奖品配置保存失败");
    } finally {
      setSavingSpinPrizes(false);
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
      },
    ]);
  };
  const removeMallItem = (idx: number) => {
    setMallItems((prev) => prev.filter((_, i) => i !== idx));
  };
  const updateMallItem = (idx: number, patch: Partial<PointsMallItem>) => {
    setMallItems((prev) => prev.map((x, i) => (i === idx ? { ...x, ...patch } : x)));
  };
  const uploadMallItemImage = async (idx: number, file?: File | null) => {
    if (blockReadonly("上传商品图")) return;
    if (!tenantId || !file) return;
    if (!file.type.startsWith("image/")) { toast.error("请上传图片文件"); return; }
    if (file.size > 3 * 1024 * 1024) { toast.error("商品图大小不能超过 3MB"); return; }
    setUploadingMallImageIndex(idx);
    try {
      const url = await uploadMemberPortalBannerImage(tenantId, file);
      updateMallItem(idx, { image_url: url });
      toast.success("商品图上传成功");
    } catch (e: any) {
      toast.error(e?.message || "商品图上传失败");
    } finally {
      setUploadingMallImageIndex(null);
    }
  };
  const saveMallItems = async () => {
    if (blockReadonly("保存积分商城商品")) return;
    setSavingMallItems(true);
    try {
      const payload = mallItems.map((x, idx) => ({
        title: (x.title || "").trim() || "商品",
        description: (x.description || "").trim() || null,
        image_url: (x.image_url || "").trim() || null,
        points_cost: Math.max(0, Number(x.points_cost || 0)),
        stock_remaining: Number(x.stock_remaining) < 0 ? -1 : Math.max(0, Number(x.stock_remaining || 0)),
        per_order_limit: Math.max(1, Number(x.per_order_limit || 1)),
        per_user_daily_limit: Math.max(0, Number(x.per_user_daily_limit || 0)),
        per_user_lifetime_limit: Math.max(0, Number(x.per_user_lifetime_limit || 0)),
        enabled: x.enabled !== false,
        sort_order: idx + 1,
      }));
      await upsertMyPointsMallItems(payload);
      setMallItems(await listMyPointsMallItems());
      toast.success("积分商城商品已保存");
    } catch (e: any) {
      toast.error(e?.message || "积分商城商品保存失败");
    } finally {
      setSavingMallItems(false);
    }
  };
  const refreshMallOrders = async () => {
    setLoadingMallOrders(true);
    try {
      setMallOrders(await listMyPointsMallRedemptionOrders(undefined, 80));
    } catch (e: any) {
      toast.error(e?.message || "积分商城订单加载失败");
    } finally {
      setLoadingMallOrders(false);
    }
  };
  const processMallOrder = async (orderId: string, action: "complete" | "reject") => {
    if (blockReadonly("处理商城订单")) return;
    setProcessingMallOrderId(orderId);
    try {
      await processMyPointsMallRedemptionOrder(orderId, action);
      toast.success(action === "complete" ? "订单已标记完成" : "订单已驳回并已退回积分");
      await refreshMallOrders();
      setMallItems(await listMyPointsMallItems());
    } catch (e: any) {
      toast.error(e?.message || "订单处理失败");
    } finally {
      setProcessingMallOrderId(null);
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

  // ── 草稿 ──────────────────────────────────────────────────────────────────
  const saveDraft = () => {
    try { localStorage.setItem(draftKey, JSON.stringify(buildPayload())); toast.success("草稿已保存（本机）"); }
    catch { toast.error("草稿保存失败"); }
  };
  const loadDraft = () => {
    try {
      const raw = localStorage.getItem(draftKey);
      if (!raw) { toast.info("没有可用草稿"); return; }
      const parsed = JSON.parse(raw) as MemberPortalSettings;
      applySettingsSnapshot(parsed);
      toast.success("草稿已载入");
    } catch { toast.error("草稿载入失败"); }
  };
  const clearDraft    = () => { try { localStorage.removeItem(draftKey); toast.success("草稿已清除"); } catch { toast.error("草稿清除失败"); } };
  const resetToDefault = () => {
    setSettings(DEFAULT_SETTINGS);
    setBadgesText(DEFAULT_SETTINGS.login_badges.join("\n"));
    setBanners([]);
    setModuleOrder(["shortcuts", "tasks", "security"]);
    toast.success("已恢复默认模板（未发布）");
  };

  // ── 回滚 & 审核 ───────────────────────────────────────────────────────────
  const onRollback = async (versionId: string) => {
    if (blockReadonly("回滚版本")) return;
    if (!canPublish) { toast.error("仅管理员可回滚"); return; }
    setSaving(true);
    try {
      await rollbackMyMemberPortalSettingsVersion(versionId, tenantId);
      const data = await getMyMemberPortalSettings(tenantId);
      applySettingsSnapshot(data.settings);
      await refreshVersions();
      void emitPortalSettingsUpdated(tenantId);
      toast.success("回滚成功并已发布");
    } catch (e: any) {
      toast.error(e?.message || "回滚失败");
    } finally {
      setSaving(false);
    }
  };

  const onApprove = async (versionId: string, approve: boolean) => {
    if (blockReadonly(approve ? "审核通过版本" : "驳回版本")) return;
    if (!canPublish) { toast.error("仅管理员可审核"); return; }
    setSaving(true);
    try {
      const result = await approveMyMemberPortalSettingsVersion(versionId, reviewNote.trim() || undefined, approve, tenantId);
      if (!result.success) { toast.error(result.error || "审核失败"); return; }
      if (approve) {
        void emitPortalSettingsUpdated(tenantId);
      }
      toast.success(approve ? "审核通过并已处理发布" : "已驳回");
      setReviewNote("");
      await refreshVersions();
    } catch (e: any) {
      toast.error(e?.message || "审核失败");
    } finally {
      setSaving(false);
    }
  };

  // ── 发布 / 提审 ───────────────────────────────────────────────────────────
  const onSave = async () => {
    if (blockReadonly("提交发布")) return;
    if (!canSubmitApproval) { toast.error("无权限提交"); return; }
    const payload = buildPayload();
    const snapshot = JSON.stringify(payload);
    if (snapshot === lastPublishedSnapshot) {
      toast.info("无最新内容，无需重复发布");
      return;
    }
    if (!window.confirm(canPublish ? "确认发布上线？" : "确认提交审核？")) {
      return;
    }
    setSaving(true);
    try {
      if (canPublish) {
        const result = await createMyMemberPortalSettingsVersion(payload, publishNote.trim() || undefined, scheduleAt || null);
        if (!result.success) { toast.error(result.error || "发布失败"); return; }
        if (result.is_applied) {
          void emitPortalSettingsUpdated(tenantId);
        }
        toast.success(result.is_applied ? `已发布版本 V${result.version_no}` : `已创建定时版本 V${result.version_no}`);
      } else {
        const submitResult = await submitMyMemberPortalSettingsForApproval(payload, publishNote.trim() || undefined, scheduleAt || null, tenantId);
        if (!submitResult.success) { toast.error(submitResult.error || "提交审批失败"); return; }
        toast.success(`已提交审核 V${submitResult.version_no}`);
      }
      setLastPublishedSnapshot(snapshot);
      setPublishNote(""); setScheduleAt("");
      await refreshVersions();
    } catch (e: any) {
      toast.error(e?.message || "保存失败");
    } finally {
      setSaving(false);
    }
  };

  // ── 背景色预览 ────────────────────────────────────────────────────────────
  const previewGradient =
    settings.home_background_preset === "sunset"  ? "linear-gradient(145deg,#7c2d12,#f97316)" :
    settings.home_background_preset === "emerald" ? "linear-gradient(145deg,#064e3b,#10b981)" :
    settings.home_background_preset === "violet"  ? "linear-gradient(145deg,#312e81,#8b5cf6)" :
                                                    "linear-gradient(145deg,#0f172a,#1e3a5f)";

  // ─── 无租户 / 加载中 ──────────────────────────────────────────────────────
  if (!tenantId) return (
    <div className="space-y-3">
      <h1 className="text-2xl font-bold">会员系统</h1>
      <p className="text-sm text-muted-foreground">未检测到租户，请先登录租户账号或进入租户视图。</p>
    </div>
  );
  if (loading) return (
    <div className="h-[40vh] flex items-center justify-center">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
    </div>
  );

  // ─── 渲染 ─────────────────────────────────────────────────────────────────
  return (
    <div className="space-y-0">

      {/* ── 顶部 Header 区 ────────────────────────────────────────────────── */}
      <div className="sticky top-0 z-20 bg-background/95 backdrop-blur border-b border-border">
        {/* 标题行 */}
        <div className="flex items-center justify-between px-6 pt-5 pb-3 gap-4">
          <div className="min-w-0">
            <h1 className="text-xl font-bold leading-none">会员系统设置</h1>
            <p className="text-xs text-muted-foreground mt-1.5 flex items-center gap-1">
              <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500" />
              当前租户：{tenantName || "未命名租户"}
            </p>
          </div>

          {/* 右侧操作区 */}
          <div className="flex items-center gap-2 shrink-0">
            {/* 草稿工具 */}
            <div className="hidden sm:flex items-center gap-1 border rounded-lg p-1">
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={saveDraft} title="保存草稿">
                <Save className="h-3.5 w-3.5" />
                <span className="hidden md:inline">保存草稿</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1" onClick={loadDraft} title="载入草稿">
                <FileDown className="h-3.5 w-3.5" />
                <span className="hidden md:inline">载入草稿</span>
              </Button>
              <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs gap-1 text-muted-foreground" onClick={resetToDefault} title="恢复默认">
                <RotateCcw className="h-3.5 w-3.5" />
                <span className="hidden md:inline">恢复默认</span>
              </Button>
            </div>

            {/* 主发布按钮 */}
            <Button onClick={onSave} disabled={saving || !canEdit} className="h-9 gap-2 px-4">
              {saving
                ? <Loader2 className="h-4 w-4 animate-spin" />
                : <ChevronRight className="h-4 w-4" />}
              {canPublish ? "发布上线" : "提交审核"}
            </Button>
          </div>
        </div>

        {/* Tab 导航 */}
        <div className="flex px-6 gap-0">
          {TABS.map(({ key, label, icon: Icon }) => (
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
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Tab 内容区（左侧 Tab 内容 + 右侧预览始终显示）──────────────────────── */}
      <div className="flex gap-8 px-6 py-6">
        {/* 左侧：Tab 内容 */}
        <div className="flex-1 min-w-0 max-w-3xl">
        {/* ════ 品牌外观 ════════════════════════════════════════════════════ */}
        {activeTab === "brand" && (
          <div className="space-y-6">
            {/* 基本信息 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>基本信息</SectionTitle>
                <div className="space-y-2">
                  <Label>公司名字</Label>
                  <Input
                    value={settings.company_name}
                    onChange={(e) => setSettings((s) => ({ ...s, company_name: e.target.value }))}
                    placeholder="例如：GC 集团"
                  />
                </div>

                <div className="grid gap-4 md:grid-cols-2">
                  <div className="space-y-2">
                    <Label>登录页标题</Label>
                    <Input
                      value={settings.welcome_title}
                      onChange={(e) => setSettings((s) => ({ ...s, welcome_title: e.target.value }))}
                      placeholder="例如：会员中心"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>登录页副标题</Label>
                    <Input
                      value={settings.welcome_subtitle}
                      onChange={(e) => setSettings((s) => ({ ...s, welcome_subtitle: e.target.value }))}
                      placeholder="例如：欢迎登录"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>登录页底部文案</Label>
                  <Input
                    value={settings.footer_text}
                    onChange={(e) => setSettings((s) => ({ ...s, footer_text: e.target.value }))}
                    placeholder="例如：账户数据安全加密，平台合规运营，请放心使用"
                  />
                </div>

                <div className="space-y-2">
                  <Label>会员公告（横幅文字）</Label>
                  <Textarea
                    value={settings.announcement || ""}
                    onChange={(e) => setSettings((s) => ({ ...s, announcement: e.target.value }))}
                    placeholder="例如：本周五晚 10:00-11:00 系统维护"
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Logo */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>Logo 与徽章</SectionTitle>
                <div className="flex flex-wrap items-center gap-4">
                  {logoPreview
                    ? <img src={logoPreview} alt="logo" className="h-16 w-16 rounded-xl object-cover border shadow-sm" />
                    : <div className="h-16 w-16 rounded-xl border grid place-items-center text-xs text-muted-foreground bg-muted">无 Logo</div>
                  }
                  <div className="space-y-1.5">
                    <input
                      ref={logoInputRef}
                      type="file"
                      accept="image/*"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        onUploadLogo(file);
                        e.currentTarget.value = "";
                      }}
                    />
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={uploading}
                      className="gap-2"
                      onClick={() => logoInputRef.current?.click()}
                    >
                      {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
                      上传 Logo
                    </Button>
                    {settings.logo_url && (
                      <Button type="button" variant="ghost" size="sm" onClick={() => setSettings((s) => ({ ...s, logo_url: null }))} className="text-muted-foreground text-xs">
                        清除
                      </Button>
                    )}
                    <p className="text-xs text-muted-foreground">建议 512×512 正方形，最大 2MB</p>
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>登录页功能徽章 <span className="text-muted-foreground font-normal text-xs">（每行一条，最多 6 条）</span></Label>
                  <Textarea
                    value={badgesText}
                    onChange={(e) => setBadgesText(e.target.value)}
                    rows={4}
                    placeholder={"🏆 签到奖励\n🎁 积分兑换\n👥 邀请好友"}
                  />
                </div>
              </CardContent>
            </Card>

            {/* 主题颜色 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>主题颜色</SectionTitle>
                <div className="space-y-2">
                  <Label>首页背景模板</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {[
                      { value: "deep_blue", label: "深蓝", bg: "linear-gradient(135deg,#0f172a,#1e3a5f)" },
                      { value: "sunset",    label: "夕阳", bg: "linear-gradient(135deg,#7c2d12,#f97316)" },
                      { value: "emerald",   label: "翡翠", bg: "linear-gradient(135deg,#064e3b,#10b981)" },
                      { value: "violet",    label: "紫罗兰", bg: "linear-gradient(135deg,#312e81,#8b5cf6)" },
                    ].map(({ value, label, bg }) => (
                      <button
                        key={value}
                        onClick={() => setSettings((s) => ({ ...s, home_background_preset: value }))}
                        className={cn(
                          "relative h-14 rounded-xl border-2 transition-all overflow-hidden",
                          settings.home_background_preset === value ? "border-primary ring-2 ring-primary/30" : "border-transparent"
                        )}
                        style={{ background: bg }}
                        title={value}
                      >
                        <span className="absolute bottom-1.5 left-0 right-0 text-[10px] text-white text-center font-medium drop-shadow">
                          {label}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>积分商城商品配置</SectionTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addMallItem} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    新增商品
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">
                  支持配置：商品图片、标题、描述、兑换积分、库存、每单限制、每日每人限制、终身每人限制。
                </p>
                <div className="space-y-3">
                  {mallItems.length === 0 ? (
                    <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground text-center">
                      暂无商品，点击右上角“新增商品”创建。
                    </div>
                  ) : (
                    mallItems.map((item, idx) => (
                      <div key={`${item.id || "item"}-${idx}`} className="rounded-xl border p-3 bg-muted/20 space-y-2.5">
                        <div className="flex items-center gap-2">
                          <Badge variant="secondary" className="text-[11px] font-mono">{idx + 1}</Badge>
                          <Input
                            value={item.title || ""}
                            onChange={(e) => updateMallItem(idx, { title: e.target.value })}
                            placeholder="商品标题"
                            className="flex-1"
                          />
                          <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateMallItem(idx, { enabled: v })} />
                          <Button type="button" variant="ghost" size="sm" className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeMallItem(idx)}>
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                        <Textarea
                          value={item.description || ""}
                          onChange={(e) => updateMallItem(idx, { description: e.target.value })}
                          rows={2}
                          placeholder="商品描述"
                        />
                        <div className="flex items-center gap-2">
                          <Input
                            value={item.image_url || ""}
                            onChange={(e) => updateMallItem(idx, { image_url: e.target.value })}
                            placeholder="商品图片链接或上传"
                            className="flex-1"
                          />
                          <input
                            ref={(el) => { mallItemInputRefs.current[idx] = el; }}
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
                            className="h-9 w-9 p-0 shrink-0"
                            onClick={() => mallItemInputRefs.current[idx]?.click()}
                            disabled={uploadingMallImageIndex === idx}
                          >
                            {uploadingMallImageIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                          </Button>
                          {item.image_url ? <img src={item.image_url} className="h-9 w-9 rounded-md object-cover border shrink-0" alt="" /> : null}
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4">
                          <div className="space-y-1">
                            <Label className="text-xs">兑换积分</Label>
                            <Input type="number" min={0} value={item.points_cost ?? 0} onChange={(e) => updateMallItem(idx, { points_cost: Number(e.target.value || 0) })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">库存（-1 无限）</Label>
                            <Input type="number" value={item.stock_remaining ?? -1} onChange={(e) => updateMallItem(idx, { stock_remaining: Number(e.target.value || -1) })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">每单限制</Label>
                            <Input type="number" min={1} value={item.per_order_limit ?? 1} onChange={(e) => updateMallItem(idx, { per_order_limit: Number(e.target.value || 1) })} />
                          </div>
                          <div className="space-y-1">
                            <Label className="text-xs">每日每人限制（0不限）</Label>
                            <Input type="number" min={0} value={item.per_user_daily_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_daily_limit: Number(e.target.value || 0) })} />
                          </div>
                        </div>
                        <div className="grid gap-2 sm:grid-cols-2">
                          <div className="space-y-1">
                            <Label className="text-xs">终身每人限制（0不限）</Label>
                            <Input type="number" min={0} value={item.per_user_lifetime_limit ?? 0} onChange={(e) => updateMallItem(idx, { per_user_lifetime_limit: Number(e.target.value || 0) })} />
                          </div>
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <Button onClick={saveMallItems} disabled={savingMallItems} className="w-full gap-2">
                  {savingMallItems ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存积分商城商品
                </Button>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>积分商城兑换订单</SectionTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={refreshMallOrders} className="h-7 text-xs gap-1">
                    {loadingMallOrders ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    刷新
                  </Button>
                </div>
                {loadingMallOrders ? (
                  <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : mallOrders.length === 0 ? (
                  <div className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground text-center">
                    暂无兑换订单
                  </div>
                ) : (
                  <div className="space-y-2">
                    {mallOrders.map((o) => (
                      <div key={o.id} className="rounded-xl border bg-card p-3 flex items-center gap-3">
                        {o.item_image_url ? (
                          <img src={o.item_image_url} alt="" className="h-12 w-12 rounded-md border object-cover shrink-0" />
                        ) : (
                          <div className="h-12 w-12 rounded-md border bg-muted/40 grid place-items-center text-xs text-muted-foreground shrink-0">商品</div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{o.item_title}</p>
                          <p className="text-xs text-muted-foreground">
                            会员：{o.member_code || o.member_phone || "-"} · 数量：{o.quantity} · 消耗：{o.points_used}积分
                          </p>
                          <p className="text-xs text-muted-foreground">{new Date(o.created_at).toLocaleString()}</p>
                        </div>
                        <Badge variant={o.status === "pending" ? "secondary" : "outline"} className="shrink-0">
                          {o.status === "pending" ? "待处理" : o.status === "completed" ? "已完成" : o.status === "rejected" ? "已驳回" : o.status}
                        </Badge>
                        {o.status === "pending" && (
                          <div className="flex gap-1 shrink-0">
                            <Button
                              type="button"
                              size="sm"
                              variant="outline"
                              className="h-7 text-xs"
                              disabled={processingMallOrderId === o.id}
                              onClick={() => processMallOrder(o.id, "reject")}
                            >
                              驳回
                            </Button>
                            <Button
                              type="button"
                              size="sm"
                              className="h-7 text-xs"
                              disabled={processingMallOrderId === o.id}
                              onClick={() => processMallOrder(o.id, "complete")}
                            >
                              完成
                            </Button>
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ 首页内容 ════════════════════════════════════════════════════ */}
        {activeTab === "homepage" && (
          <div className="space-y-6">
            {/* 轮播图 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>首页轮播</SectionTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addBanner} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    新增轮播
                  </Button>
                </div>

                {banners.length === 0
                  ? <p className="text-sm text-muted-foreground py-4 text-center border rounded-xl border-dashed">暂无轮播，点击右上角"新增轮播"创建</p>
                  : banners.map((banner, idx) => (
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
                        <p className="text-sm font-medium flex-1">轮播 #{idx + 1}</p>
                        <Button type="button" variant="ghost" size="sm" className="h-7 w-7 p-0 text-muted-foreground hover:text-destructive" onClick={() => removeBanner(idx)}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        <Input value={banner.title}    onChange={(e) => updateBanner(idx, { title: e.target.value })}    placeholder="标题（必填）" />
                        <Input value={banner.subtitle} onChange={(e) => updateBanner(idx, { subtitle: e.target.value })} placeholder="副标题（可选）" />
                      </div>
                      <Input value={banner.link} onChange={(e) => updateBanner(idx, { link: e.target.value })} placeholder="跳转链接（可选）" />
                      <div className="flex items-center gap-2">
                        <Input value={banner.image_url} onChange={(e) => updateBanner(idx, { image_url: e.target.value })} placeholder="图片链接或上传" className="flex-1" />
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
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          disabled={uploadingBannerIndex === idx}
                          className="h-9 w-9 p-0 shrink-0"
                          onClick={() => bannerInputRefs.current[idx]?.click()}
                        >
                          {uploadingBannerIndex === idx ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
                        </Button>
                        {banner.image_url && <img src={banner.image_url} className="h-9 w-9 rounded-md object-cover border shrink-0" alt="" />}
                      </div>
                    </div>
                  ))
                }
              </CardContent>
            </Card>

            {/* 首页模块排序 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>模块排序</SectionTitle>
                <p className="text-xs text-muted-foreground -mt-2">拖拽调整会员首页模块显示顺序</p>
                <div className="space-y-2">
                  {moduleOrder.map((key, idx) => {
                    const title = MODULES.find((m) => m.key === key)?.label || key;
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

            {/* 公告弹窗 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>公告弹窗</SectionTitle>
                <SwitchRow
                  label="启用首页公告弹窗"
                  desc="会员登录后首页弹出公告（每会话一次）"
                  checked={settings.show_announcement_popup}
                  onChange={(v) => setSettings((s) => ({ ...s, show_announcement_popup: v }))}
                />
                <div className="space-y-2">
                  <Label>弹窗标题</Label>
                  <Input
                    value={settings.announcement_popup_title}
                    onChange={(e) => setSettings((s) => ({ ...s, announcement_popup_title: e.target.value }))}
                    placeholder="系统公告"
                  />
                </div>
                <div className="space-y-2">
                  <Label>弹窗内容</Label>
                  <Textarea
                    value={settings.announcement_popup_content || ""}
                    onChange={(e) => setSettings((s) => ({ ...s, announcement_popup_content: e.target.value }))}
                    rows={3}
                    placeholder="例如：本周五晚 10:00-11:00 系统维护"
                  />
                </div>
              </CardContent>
            </Card>

            {/* 客服按钮 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>客服按钮</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>按钮文案</Label>
                    <Input
                      value={settings.customer_service_label}
                      onChange={(e) => setSettings((s) => ({ ...s, customer_service_label: e.target.value }))}
                      placeholder="联系客服"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>跳转链接</Label>
                    <Input
                      value={settings.customer_service_link || ""}
                      onChange={(e) => setSettings((s) => ({ ...s, customer_service_link: e.target.value }))}
                      placeholder="https://wa.me/234xxxxxxxxxx"
                    />
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ 活动设置 ════════════════════════════════════════════════════ */}
        {activeTab === "activity" && (
          <div className="space-y-6">
            {/* 功能开关 */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionTitle>功能开关</SectionTitle>
                <SwitchRow label="启用抽奖功能"    desc="控制会员前端幸运抽奖入口"           checked={settings.enable_spin}         onChange={(v) => setSettings((s) => ({ ...s, enable_spin: v }))} />
                <SwitchRow label="启用邀请功能"    desc="控制邀请好友入口与任务展示"          checked={settings.enable_invite}       onChange={(v) => setSettings((s) => ({ ...s, enable_invite: v }))} />
                <SwitchRow label="启用签到任务"    desc="控制每日签到任务是否可见"              checked={settings.enable_check_in}     onChange={(v) => setSettings((s) => ({ ...s, enable_check_in: v }))} />
                <SwitchRow label="启用分享奖励任务" desc="控制 WhatsApp 分享领取抽奖次数任务"   checked={settings.enable_share_reward} onChange={(v) => setSettings((s) => ({ ...s, enable_share_reward: v }))} />
              </CardContent>
            </Card>

            {/* 奖励数值 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>奖励数值配置</SectionTitle>
                <p className="text-xs text-muted-foreground -mt-2">单位：抽奖次数</p>

                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>签到基础奖励</Label>
                    <Input type="number" min={0} step={0.5} value={settings.checkin_reward_base}
                      onChange={(e) => setSettings((s) => ({ ...s, checkin_reward_base: Number(e.target.value || 0) }))} />
                    <p className="text-xs text-muted-foreground">每次签到获得的抽奖次数</p>
                  </div>
                  <div className="space-y-2">
                    <Label>连续签到 3 天额外奖励</Label>
                    <Input type="number" min={0} step={0.5} value={settings.checkin_reward_streak_3}
                      onChange={(e) => setSettings((s) => ({ ...s, checkin_reward_streak_3: Number(e.target.value || 0) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>连续签到 7 天额外奖励</Label>
                    <Input type="number" min={0} step={0.5} value={settings.checkin_reward_streak_7}
                      onChange={(e) => setSettings((s) => ({ ...s, checkin_reward_streak_7: Number(e.target.value || 0) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>分享奖励次数</Label>
                    <Input type="number" min={0} step={1} value={settings.share_reward_spins}
                      onChange={(e) => setSettings((s) => ({ ...s, share_reward_spins: Number(e.target.value || 0) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>邀请奖励（双方各得）</Label>
                    <Input type="number" min={0} step={1} value={settings.invite_reward_spins}
                      onChange={(e) => setSettings((s) => ({ ...s, invite_reward_spins: Number(e.target.value || 0) }))} />
                  </div>
                  <div className="space-y-2">
                    <Label>每日免费抽奖次数</Label>
                    <Input
                      type="number"
                      min={0}
                      step={1}
                      value={settings.daily_free_spins_per_day}
                      onChange={(e) =>
                        setSettings((s) => ({
                          ...s,
                          daily_free_spins_per_day: Math.max(0, Number(e.target.value || 0)),
                        }))
                      }
                    />
                    <p className="text-xs text-muted-foreground">会员每天自动拥有的免费抽奖次数</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>抽奖奖品与命中率</SectionTitle>
                  <Button type="button" variant="outline" size="sm" onClick={addSpinPrize} className="gap-1.5">
                    <Plus className="h-3.5 w-3.5" />
                    新增奖品
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground -mt-2">支持 6~10 个奖品，命中率按百分比配置（仅统计启用项，总和必须为 100%）。</p>
                <div className={cn("text-xs font-medium", isSpinRateValid ? "text-emerald-600" : "text-destructive")}>
                  已启用奖品命中率总和：{spinRateTotal.toFixed(1)}%
                </div>
                <div className="space-y-2">
                  {spinPrizes.map((item, idx) => (
                    <div key={`${idx}-${item.id || "new"}`} className="rounded-xl border p-3 bg-muted/20 space-y-2">
                      <div className="flex items-center gap-2">
                        <Badge variant="secondary" className="text-[11px] font-mono">{idx + 1}</Badge>
                        <Input
                          value={item.name}
                          onChange={(e) => updateSpinPrize(idx, { name: e.target.value })}
                          placeholder="奖品名称"
                          className="flex-1"
                        />
                        <Input
                          type="number"
                          min={0}
                          step={0.1}
                          value={item.hit_rate}
                          max={100}
                          onChange={(e) => updateSpinPrize(idx, { hit_rate: Math.min(100, Math.max(0, Number(e.target.value || 0))) })}
                          className="w-28"
                          placeholder="命中率(%)"
                        />
                        <Switch checked={item.enabled !== false} onCheckedChange={(v) => updateSpinPrize(idx, { enabled: v })} />
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-8 w-8 p-0 text-muted-foreground hover:text-destructive"
                          onClick={() => removeSpinPrize(idx)}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  ))}
                </div>
                <Button onClick={saveSpinPrizes} disabled={savingSpinPrizes || spinPrizes.length < 6 || spinPrizes.length > 10 || !isSpinRateValid} className="w-full gap-2">
                  {savingSpinPrizes ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                  保存抽奖奖品配置
                </Button>
              </CardContent>
            </Card>
          </div>
        )}

        {/* ════ 发布管理 ════════════════════════════════════════════════════ */}
        {activeTab === "publish" && (
          <div className="space-y-6">
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>在线版本控制</SectionTitle>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">本地版本号</p>
                    <p className="text-sm font-mono mt-1 break-all">{localBuildTime}</p>
                  </div>
                  <div className="rounded-xl border bg-muted/20 p-3">
                    <p className="text-xs text-muted-foreground">在线版本号</p>
                    <p className="text-sm font-mono mt-1 break-all">{onlineBuildTime || "读取中/未知"}</p>
                  </div>
                </div>
                <div className="rounded-xl border bg-card p-3 text-xs text-muted-foreground">
                  状态：
                  {onlineBuildTime
                    ? onlineBuildTime === localBuildTime
                      ? "已同步（线上版本与本地一致）"
                      : "未同步（本地与线上版本不同）"
                    : "在线版本暂不可用"}
                </div>
                <div className="grid gap-2 sm:grid-cols-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="gap-2"
                    onClick={refreshOnlineVersion}
                    disabled={checkingVersion}
                  >
                    {checkingVersion ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
                    刷新在线版本
                  </Button>
                  <Button
                    type="button"
                    className="gap-2"
                    onClick={notifyForceRefreshAll}
                    disabled={!canPublish}
                  >
                    <RefreshCw className="h-4 w-4" />
                    一键强制全员刷新提示
                  </Button>
                </div>
              </CardContent>
            </Card>

            {/* 发布选项 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <SectionTitle>发布选项</SectionTitle>
                <div className="grid gap-4 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label>{canPublish ? "发布备注" : "提审备注"}</Label>
                    <Input value={publishNote} onChange={(e) => setPublishNote(e.target.value)} placeholder="例如：五一活动主题上线" />
                  </div>
                  <div className="space-y-2">
                    <Label>定时生效 <span className="text-muted-foreground font-normal text-xs">（留空=立即发布）</span></Label>
                    <Input type="datetime-local" value={scheduleAt} onChange={(e) => setScheduleAt(e.target.value)} />
                  </div>
                </div>

                {canPublish && (
                  <div className="space-y-2">
                    <Label>审核意见 <span className="text-muted-foreground font-normal text-xs">（审核时填写）</span></Label>
                    <Input value={reviewNote} onChange={(e) => setReviewNote(e.target.value)} placeholder="例如：请补充活动文案后再提审" />
                  </div>
                )}

                <Button onClick={onSave} disabled={saving || !canEdit} className="w-full gap-2">
                  {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
                  {canPublish ? "立即发布上线" : "提交审核"}
                </Button>
              </CardContent>
            </Card>

            {/* 草稿操作（mobile 友好，这里也放一份） */}
            <Card>
              <CardContent className="pt-5 space-y-3">
                <SectionTitle>草稿操作</SectionTitle>
                <div className="grid grid-cols-3 gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={saveDraft} className="gap-2">
                    <Save className="h-3.5 w-3.5" />保存草稿
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={loadDraft} className="gap-2">
                    <FileDown className="h-3.5 w-3.5" />载入草稿
                  </Button>
                  <Button type="button" variant="outline" size="sm" onClick={resetToDefault} className="gap-2 text-muted-foreground">
                    <RotateCcw className="h-3.5 w-3.5" />恢复默认
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">草稿保存在本机浏览器，不会发布到生产环境。</p>
              </CardContent>
            </Card>

            {/* 版本历史 */}
            <Card>
              <CardContent className="pt-5 space-y-4">
                <div className="flex items-center justify-between">
                  <SectionTitle>版本历史</SectionTitle>
                  <Button type="button" variant="ghost" size="sm" onClick={refreshVersions} className="h-7 text-xs gap-1">
                    {loadingVersions ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RotateCcw className="h-3.5 w-3.5" />}
                    刷新
                  </Button>
                </div>

                {loadingVersions ? (
                  <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
                ) : versions.length === 0 ? (
                  <div className="py-6 text-center text-sm text-muted-foreground border rounded-xl border-dashed">暂无版本历史</div>
                ) : (
                  <div className="space-y-2">
                    {versions.map((v) => {
                      const statusLabel =
                        v.approval_status === "pending"  ? { text: "待审核", cls: "bg-amber-50 text-amber-700 border-amber-200" } :
                        v.approval_status === "rejected" ? { text: "已驳回", cls: "bg-rose-50 text-rose-700 border-rose-200" } :
                        v.is_applied                     ? { text: "已生效", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" } :
                                                           { text: "待生效", cls: "bg-blue-50 text-blue-700 border-blue-200" };
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
                                备注：{v.note || "无"} · {new Date(v.created_at).toLocaleString()}
                              </p>
                              {v.effective_at && (
                                <p className="text-xs text-muted-foreground">
                                  定时生效：{new Date(v.effective_at).toLocaleString()}
                                </p>
                              )}
                              {v.review_note && (
                                <p className="text-xs text-amber-700 mt-1 bg-amber-50 rounded px-2 py-1">
                                  审核意见：{v.review_note}
                                </p>
                              )}
                            </div>
                            <div className="flex flex-col gap-1.5 shrink-0">
                              {canPublish && v.approval_status === "pending" && (
                                <>
                                  <Button type="button" variant="outline" size="sm" className="h-7 text-xs" onClick={() => onApprove(v.id, false)} disabled={saving}>驳回</Button>
                                  <Button type="button" size="sm" className="h-7 text-xs" onClick={() => onApprove(v.id, true)} disabled={saving}>通过</Button>
                                </>
                              )}
                              {canPublish && (
                                <Button type="button" variant="ghost" size="sm" className="h-7 text-xs text-muted-foreground" onClick={() => onRollback(v.id)} disabled={saving}>
                                  回滚
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
        </div>

        {/* 右侧：主题颜色实时预览（始终显示） */}
        <div className="w-[400px] shrink-0 sticky top-24 self-start">
          <p className="text-xs font-medium text-muted-foreground mb-3">主题颜色实时预览</p>
          <div className="rounded-[28px] border-4 border-zinc-800 overflow-hidden shadow-xl bg-black">
            <div className="member-antd-wrap h-[72vh] min-h-[520px] max-h-[780px] flex flex-col bg-[#f1f5f9] relative">
              <div style={{ background: previewGradient, padding: "8px 16px 4px", color: "white", flexShrink: 0 }}>
                <div className="flex items-center justify-between text-[11px] opacity-90">
                  <span>9:41</span>
                  <span>5G</span>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto min-h-0">
                <div style={{ background: previewGradient, padding: "12px 16px 88px", position: "relative", overflow: "hidden" }}>
                  <div style={{ position: "absolute", top: -40, right: -40, width: 120, height: 120, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
                    <div>
                      <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 11, margin: 0, letterSpacing: "0.5px", textTransform: "uppercase" }}>欢迎回来</p>
                      <h1 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: "4px 0 0", letterSpacing: "-0.3px" }}>RTLCA96</h1>
                    </div>
                    <div style={{ background: "rgba(255,255,255,0.1)", border: "1px solid rgba(255,255,255,0.15)", borderRadius: 10, color: "rgba(255,255,255,0.7)", padding: "6px 10px", fontSize: 11, display: "flex", alignItems: "center", gap: 4 }}>
                      <LogOut className="h-3 w-3" />
                      退出
                    </div>
                  </div>
                  <div className="member-card">
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                        {logoPreview ? (
                          <img src={logoPreview} alt="" style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }} />
                        ) : null}
                        <span style={{ color: "white", fontSize: 13, fontWeight: 800, letterSpacing: "1px" }}>
                          {settings.company_name || "Spin & Win"}
                        </span>
                      </div>
                      <span className="member-badge member-badge-gold">★ MEMBER</span>
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
                      <div>
                        <p style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.7)", fontSize: 10, margin: 0 }}>
                          <Star className="h-3 w-3" style={{ color: "#f59e0b" }} />
                          消费积分
                          <Info className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.4)" }} />
                        </p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "#fbbf24", margin: "4px 0 0", lineHeight: 1.2 }}>0</p>
                      </div>
                      <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 10 }}>
                        <p style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.7)", fontSize: 10, margin: 0 }}>
                          <Star className="h-3 w-3" style={{ color: "#34d399" }} />
                          推广积分
                          <Info className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.4)" }} />
                        </p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "#34d399", margin: "4px 0 0", lineHeight: 1.2 }}>0</p>
                      </div>
                      <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 10 }}>
                        <p style={{ display: "flex", alignItems: "center", gap: 4, color: "rgba(255,255,255,0.7)", fontSize: 10, margin: 0 }}>
                          <Star className="h-3 w-3" style={{ color: "#a78bfa" }} />
                          总积分
                          <Info className="h-2.5 w-2.5" style={{ color: "rgba(255,255,255,0.4)" }} />
                        </p>
                        <p style={{ fontSize: 16, fontWeight: 800, color: "#a78bfa", margin: "4px 0 0", lineHeight: 1.2 }}>0</p>
                      </div>
                    </div>
                    <div style={{ marginTop: 12, paddingTop: 12, borderTop: "1px solid rgba(255,255,255,0.1)", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                      <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 10, letterSpacing: "1px", textTransform: "uppercase" }}>Member ID</span>
                      <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 11, fontFamily: "monospace", letterSpacing: "1.5px" }}>RTLCA96</span>
                    </div>
                  </div>
                </div>
                <div className="member-content-area" style={{ paddingTop: 20 }}>
                  {previewTab === "dashboard" && (
                    <>
                      {banners[0] && (
                        <div style={{ marginBottom: 14, padding: "10px 12px", borderRadius: 10, border: "1px solid rgba(245,158,11,0.3)", background: "rgba(245,158,11,0.08)", color: "#92400e", fontSize: 11 }}>
                          📢 {banners[0].title || "首页轮播"}
                        </div>
                      )}

                      {moduleOrder.includes("shortcuts") && (
                        <>
                          <p className="member-section-title" style={{ marginBottom: 10 }}>快捷入口</p>
                          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 16 }}>
                            {settings.enable_spin && (
                              <div className="member-shortcut-card">
                                <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
                                  <Gift className="h-5 w-5" style={{ color: "#d97706" }} />
                                </div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#0f172a" }}>幸运抽奖</p>
                                <p style={{ margin: "4px 0 0", fontSize: 10, color: "#f59e0b", fontWeight: 600 }}>
                                  每日免费{settings.daily_free_spins_per_day}次
                                </p>
                              </div>
                            )}
                            <div className="member-shortcut-card">
                              <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}>
                                <ShoppingBag className="h-5 w-5" style={{ color: "#7c3aed" }} />
                              </div>
                              <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#0f172a" }}>积分商城</p>
                              <p style={{ margin: "4px 0 0", fontSize: 10, color: "#64748b" }}>兑换好礼</p>
                            </div>
                            {settings.enable_invite && (
                              <div className="member-shortcut-card">
                                <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }}>
                                  <Users className="h-5 w-5" style={{ color: "#059669" }} />
                                </div>
                                <p style={{ margin: 0, fontWeight: 700, fontSize: 12, color: "#0f172a" }}>邀请好友</p>
                                <p style={{ margin: "4px 0 0", fontSize: 10, color: "#059669", fontWeight: 600 }}>+{settings.invite_reward_spins}次抽奖</p>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {moduleOrder.includes("tasks") && (
                        <>
                          <p className="member-section-title" style={{ marginBottom: 10 }}>今日任务</p>
                          <div style={{ background: "white", borderRadius: 12, padding: "4px 12px", boxShadow: "0 1px 3px rgba(15,23,42,0.06)", border: "1px solid rgba(15,23,42,0.05)" }}>
                            {settings.enable_check_in && (
                              <div className="member-task-item">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>📅</div>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 12, color: "#0f172a" }}>每日签到</p>
                                    <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>获得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{settings.checkin_reward_base} 次</span> 免费抽奖</p>
                                  </div>
                                </div>
                                <div style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "#f59e0b", color: "white" }}>签到</div>
                              </div>
                            )}
                            {settings.enable_share_reward && (
                              <div className="member-task-item">
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(37,211,102,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>💬</div>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 12, color: "#0f172a" }}>分享到 WhatsApp</p>
                                    <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>获得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{settings.share_reward_spins} 次</span> 抽奖机会</p>
                                  </div>
                                </div>
                                <div style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, background: "#25D366", color: "white" }}>分享</div>
                              </div>
                            )}
                            {settings.enable_invite && (
                              <div className="member-task-item" style={{ borderBottom: "none" }}>
                                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                                  <div style={{ width: 36, height: 36, borderRadius: 10, background: "rgba(5,150,105,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 14, flexShrink: 0 }}>👥</div>
                                  <div>
                                    <p style={{ margin: 0, fontWeight: 600, fontSize: 12, color: "#0f172a" }}>邀请好友</p>
                                    <p style={{ margin: 0, fontSize: 11, color: "#64748b" }}>双方各得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{settings.invite_reward_spins} 次</span> 抽奖</p>
                                  </div>
                                </div>
                                <div style={{ padding: "4px 12px", borderRadius: 8, fontSize: 11, fontWeight: 600, border: "1px solid #e2e8f0", color: "#475569" }}>去邀请 →</div>
                              </div>
                            )}
                          </div>
                        </>
                      )}

                      {moduleOrder.includes("security") && (
                        <div style={{ marginTop: 14, padding: "12px 14px", background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(217,119,6,0.04))", borderRadius: 12, border: "1px solid rgba(245,158,11,0.12)", textAlign: "center" }}>
                          <p style={{ margin: 0, fontSize: 11, color: "#92400e", fontWeight: 500 }}>
                            🔐 {settings.footer_text || "账户数据安全加密，平台合规运营，请放心使用"}
                          </p>
                        </div>
                      )}
                    </>
                  )}
                  {previewTab === "points" && (
                    <div style={{ padding: "4px 0" }}>
                      <p className="member-section-title" style={{ marginBottom: 12 }}>积分商城</p>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                        {[1, 2, 3, 4].map((i) => (
                          <div key={i} className="member-shortcut-card" style={{ padding: 12 }}>
                            <div style={{ height: 72, borderRadius: 10, background: "linear-gradient(135deg, #fde68a, #f59e0b)", marginBottom: 8 }} />
                            <p style={{ margin: 0, fontSize: 12, fontWeight: 600, color: "#0f172a" }}>商品 {i}</p>
                            <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>100 积分</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {previewTab === "spin" && (
                    <div style={{ padding: "20px 0", textAlign: "center" }}>
                      <p className="member-section-title" style={{ marginBottom: 16 }}>幸运抽奖</p>
                      <div style={{ width: 140, height: 140, margin: "0 auto 16px", borderRadius: "50%", background: "linear-gradient(135deg, #fbbf24, #f59e0b)", display: "flex", alignItems: "center", justifyContent: "center", boxShadow: "0 8px 32px rgba(245,158,11,0.4)" }}>
                        <Gift className="h-14 w-14" style={{ color: "white" }} />
                      </div>
                      <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>剩余 0 次抽奖</p>
                      <p style={{ margin: "4px 0 0", fontSize: 12, color: "#64748b" }}>完成今日任务获取更多</p>
                    </div>
                  )}
                  {previewTab === "invite" && (
                    <div style={{ padding: "4px 0" }}>
                      <p className="member-section-title" style={{ marginBottom: 12 }}>邀请好友</p>
                      <div style={{ padding: 16, background: "white", borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", textAlign: "center" }}>
                        <Users className="h-12 w-12" style={{ color: "#059669", margin: "0 auto 12px" }} />
                        <p style={{ margin: 0, fontSize: 14, fontWeight: 600, color: "#0f172a" }}>邀请好友得抽奖</p>
                        <p style={{ margin: "8px 0 0", fontSize: 12, color: "#64748b" }}>双方各得 +3 次抽奖机会</p>
                        <div style={{ marginTop: 16, padding: "10px 14px", borderRadius: 10, background: "#f1f5f9", fontSize: 11, color: "#64748b", fontFamily: "monospace" }}>邀请链接...</div>
                      </div>
                    </div>
                  )}
                  {previewTab === "settings" && (
                    <div style={{ padding: "4px 0" }}>
                      <p className="member-section-title" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ width: 3, height: 18, borderRadius: 999, background: "#f59e0b", display: "inline-block" }} />
                        设置
                      </p>
                      <div style={{ background: "white", borderRadius: 16, boxShadow: "0 1px 3px rgba(15,23,42,0.06)", overflow: "hidden" }}>
                        {["账号与安全", "隐私设置", "关于我们"].map((label, i) => (
                          <div key={i} style={{ padding: "20px 16px", borderBottom: i < 2 ? "1px solid rgba(15,23,42,0.06)" : "none", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                            <span style={{ fontSize: 14, color: "#0f172a", fontWeight: 500 }}>{label}</span>
                            <ChevronRight className="h-4 w-4 text-muted-foreground" />
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
              <nav style={{
                position: "absolute",
                bottom: 0,
                left: 0,
                right: 0,
                background: "rgba(255,255,255,0.94)",
                backdropFilter: "blur(20px)",
                borderTop: "1px solid rgba(15,23,42,0.08)",
                boxShadow: "0 -4px 20px rgba(15,23,42,0.08)",
                padding: "8px 4px 4px",
                paddingBottom: "max(8px, env(safe-area-inset-bottom))",
                display: "flex",
                justifyContent: "space-around",
                alignItems: "flex-end",
                flexShrink: 0,
              }}>
                {[
                  { key: "dashboard" as const, icon: Home, label: "首页" },
                  { key: "points" as const, icon: ShoppingBag, label: "积分商城" },
                  { key: "spin" as const, icon: Gift, label: "抽奖", isSpin: true, visible: settings.enable_spin },
                  { key: "invite" as const, icon: Users, label: "邀请", visible: settings.enable_invite },
                  { key: "settings" as const, icon: Settings, label: "设置" },
                ].filter((item) => item.visible !== false).map(({ key, icon: Icon, label, isSpin }) => {
                  const isActive = previewTab === key;
                  if (isSpin) {
                    return (
                      <button
                        key={key}
                        type="button"
                        onClick={() => setPreviewTab(key)}
                        style={{
                          display: "flex",
                          flexDirection: "column",
                          alignItems: "center",
                          flex: 1,
                          background: "none",
                          border: "none",
                          cursor: "pointer",
                          paddingBottom: 6,
                          marginTop: -22,
                        }}
                      >
                        <div style={{
                          width: 48,
                          height: 48,
                          borderRadius: "50%",
                          background: isActive ? "linear-gradient(135deg, #fbbf24, #f59e0b)" : "linear-gradient(135deg, #f59e0b, #d97706)",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          boxShadow: isActive ? "0 -4px 20px rgba(245,158,11,0.55)" : "0 -2px 16px rgba(245,158,11,0.35)",
                          border: "3px solid white",
                        }}
                        >
                          <Icon className="h-5 w-5" style={{ color: "white" }} />
                        </div>
                        <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? "#d97706" : "#94a3b8", marginTop: 4 }}>{label}</span>
                      </button>
                    );
                  }
                  return (
                    <button
                      key={key}
                      type="button"
                      onClick={() => setPreviewTab(key)}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        flex: 1,
                          position: "relative",
                        background: "none",
                        border: "none",
                        cursor: "pointer",
                        padding: "4px 0 8px",
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: "absolute",
                          top: 0,
                          left: "50%",
                          transform: "translateX(-50%)",
                          width: 30,
                          height: 22,
                          borderRadius: 8,
                          background: "rgba(245,158,11,0.1)",
                        }} />
                      )}
                      <Icon className="h-5 w-5" style={{ color: isActive ? "#f59e0b" : "#94a3b8", marginBottom: 2 }} />
                      <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? "#d97706" : "#94a3b8" }}>{label}</span>
                      {isActive && (
                        <div style={{
                          width: 4,
                          height: 4,
                          borderRadius: "50%",
                          background: "#f59e0b",
                          marginTop: 3,
                          boxShadow: "0 0 6px rgba(245,158,11,0.6)",
                        }} />
                      )}
                    </button>
                  );
                })}
              </nav>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
