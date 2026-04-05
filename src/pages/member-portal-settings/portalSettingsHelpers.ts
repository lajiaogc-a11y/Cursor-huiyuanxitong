import {
  DEFAULT_SETTINGS,
  discardServerDraft,
  getServerDraft,
  type LoginCarouselSlideItem,
  type MemberPortalSettings,
  type MemberPortalSettingsPayload,
} from "@/services/members/memberPortalSettingsService";
import {
  normalizeHomeBannerImageFit,
  normalizeHomeBannerLayout,
  sanitizeHomeBannerObjectPosition,
  type HomeBannerLayout,
} from "@/lib/memberHomeBannerStyle";
import { invalidateMemberPortalStaffSessionSnapshot } from "@/lib/memberPortalStaffSessionCache";
import type { PointsMallCategory, PointsMallItem } from "@/services/members/memberPointsMallService";
import type { LotteryPrize, LotterySettings } from "@/services/lottery/lotteryService";

export const MODULES = [
  { key: "shortcuts", label: "快捷入口", labelEn: "Quick Access" },
  { key: "tasks", label: "今日任务", labelEn: "Daily Tasks" },
  { key: "security", label: "安全说明", labelEn: "Security Info" },
] as const;
export type ModuleKey = (typeof MODULES)[number]["key"];
export type BannerItem = {
  title: string;
  subtitle: string;
  link: string;
  image_url: string;
  image_preset_id: string;
  banner_layout: HomeBannerLayout;
  image_object_fit: string;
  image_object_position: string;
};
export type LoginCarouselFormRow = Omit<LoginCarouselSlideItem, "sort_order">;

/**
 * 与表单内 buildPayload 完全一致的快照对象（用于「已发布基线」与当前编辑对比）
 */
export function buildPortalPayloadSnapshot(
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
export function stripEmptyAnnouncementsFromDraftMerge(
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
export function fingerprintPublishedSettings(settingsRow: MemberPortalSettings): string {
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
export function fingerprintPointsMallCatalog(items: PointsMallItem[], categories: PointsMallCategory[]): string {
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
export function fingerprintLotteryStaffState(settings: LotterySettings, prizes: LotteryPrize[]): string {
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
export type PublishedBaselineMarker = { v: number | null; ms: number };

export function publishedBaselineMarkerKey(tenantId: string) {
  return `member_portal_published_marker_${tenantId}`;
}

export function parsePublishedBaselineMarkerFromPayload(data: MemberPortalSettingsPayload): PublishedBaselineMarker {
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

export function readStoredPublishedBaselineMarker(tenantId: string | null): PublishedBaselineMarker | null {
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

export function persistPublishedBaselineMarker(tenantId: string | null, m: PublishedBaselineMarker) {
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
export function publishedBaselineAdvancedOnServer(server: PublishedBaselineMarker, stored: PublishedBaselineMarker | null): boolean {
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
export async function resolveInitialPortalSnapshot(
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
