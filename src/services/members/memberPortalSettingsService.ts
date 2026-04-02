import { apiGet, apiPost, apiPut, apiDelete } from "@/api/client";
import {
  normalizeHomeBannerImageFit,
  normalizeHomeBannerLayout,
  sanitizeHomeBannerObjectPosition,
  type HomeBannerImageFit,
  type HomeBannerLayout,
} from "@/lib/memberHomeBannerStyle";
import {
  DEFAULT_PRIVACY_EN,
  DEFAULT_PRIVACY_ZH,
  DEFAULT_TERMS_EN,
  DEFAULT_TERMS_ZH,
} from "@/lib/memberLegalDefaults";

export interface CustomerServiceAgent {
  name: string;
  avatar_url: string | null;
  link: string;
}

/** 首页公告弹窗展示策略（与 member_portal_settings.announcement_popup_frequency 一致） */
export type AnnouncementPopupFrequency = "off" | "every_login" | "daily_first";

export interface AnnouncementItem {
  title: string;
  content: string;
  /** 公告配图 URL（与轮播共用上传接口） */
  image_url?: string | null;
  sort_order: number;
  /** 可选展示日期，如 YYYY-MM-DD（会员端列表右上角，与 premium-ui-boost 公告卡一致） */
  published_at?: string | null;
}

/** 登录页顶部轮播单条（中英标题与正文；会员端按语言优先展示） */
export interface LoginCarouselSlideItem {
  image_url: string;
  title_zh: string;
  title_en: string;
  body_zh: string;
  body_en: string;
  sort_order: number;
}

export interface MemberPortalSettings {
  company_name: string;
  logo_url: string | null;
  theme_primary_color: string;
  welcome_title: string;
  welcome_subtitle: string;
  announcement: string | null;
  announcements: AnnouncementItem[];
  enable_spin: boolean;
  enable_invite: boolean;
  enable_check_in: boolean;
  enable_share_reward: boolean;
  checkin_reward_base: number;
  checkin_reward_streak_3: number;
  checkin_reward_streak_7: number;
  share_reward_spins: number;
  daily_share_reward_limit: number;
  invite_reward_spins: number;
  daily_invite_reward_limit: number;
  daily_free_spins_per_day: number;
  login_badges: string[];
  footer_text: string;
  home_banners: {
    title: string;
    subtitle?: string;
    link?: string;
    image_url?: string;
    image_preset_id?: string;
    /** split：左文右图；full_image：轮播格内仅展示一张图（object-fit/position 可调） */
    banner_layout?: HomeBannerLayout;
    image_object_fit?: HomeBannerImageFit;
    image_object_position?: string;
  }[];
  show_announcement_popup: boolean;
  announcement_popup_frequency: AnnouncementPopupFrequency;
  announcement_popup_title: string;
  announcement_popup_content: string | null;
  /** 首页 Total Points 弹窗说明（中文）；与积分商城分开 */
  home_points_balance_hint_zh: string;
  /** 首页 Total Points 弹窗说明（英文）；与积分商城分开 */
  home_points_balance_hint_en: string;
  /** 兑换弹窗「规则」标题（中文）；空则会员端用默认英文 */
  points_mall_redeem_rules_title_zh: string;
  points_mall_redeem_rules_title_en: string;
  /** 兑换弹窗：未配置每日上限时整行说明（中文/英文） */
  points_mall_redeem_daily_unlimited_zh: string;
  points_mall_redeem_daily_unlimited_en: string;
  /** 兑换弹窗：未配置终身上限时整行说明（中文/英文） */
  points_mall_redeem_lifetime_unlimited_zh: string;
  points_mall_redeem_lifetime_unlimited_en: string;
  customer_service_label: string;
  /** @deprecated 已废弃：会员端仅展示 customer_service_agents；归一化后恒为 null */
  customer_service_link: string | null;
  customer_service_agents: CustomerServiceAgent[];
  home_module_order: string[];
  /** 登录页顶栏轮播；空则会员端使用内置默认幻灯 */
  login_carousel_slides: LoginCarouselSlideItem[];
  /** 自动向左切换间隔（秒），3–60 */
  login_carousel_interval_sec: number;
  /** 会员首页轮播自动切换间隔（秒），3–60 */
  home_banners_carousel_interval_sec: number;
  /** 服务条款（中文）；空则会员端与后台用内置默认 */
  terms_of_service_zh: string;
  terms_of_service_en: string;
  privacy_policy_zh: string;
  privacy_policy_en: string;
  /** 注册流程是否须勾选同意条款与隐私 */
  registration_require_legal_agreement: boolean;
  /** 首页「首笔交易」联系客服页说明（中文）；发布后会员端展示 */
  home_first_trade_contact_zh: string;
  /** 首页「首笔交易」联系客服页说明（英文） */
  home_first_trade_contact_en: string;
}

export interface MemberPortalSettingsPayload {
  tenant_id: string | null;
  tenant_name: string;
  settings: MemberPortalSettings;
  /** 已发布版本号（员工 GET /api/member-portal-settings）；用于多设备丢弃陈旧 localStorage 草稿 */
  published_version_no?: number | null;
  /** member_portal_settings.updated_at（ISO）；与 published_version_no 一起作发布基线标记 */
  settings_updated_at?: string | null;
}

export interface MemberPortalVersionItem {
  id: string;
  version_no: number;
  note: string | null;
  effective_at: string | null;
  is_applied: boolean;
  approval_status?: "pending" | "approved" | "rejected";
  review_note?: string | null;
  created_at: string;
  applied_at: string | null;
}

export interface SpinWheelPrizeItem {
  id?: string;
  name: string;
  prize_type: string;
  hit_rate: number;
  image_url?: string | null;
  enabled?: boolean;
}

export const DEFAULT_SETTINGS: MemberPortalSettings = {
  company_name: "Spin & Win",
  logo_url: null,
  theme_primary_color: "#4d8cff",
  welcome_title: "Premium Member Platform",
  welcome_subtitle: "Sign in to your member account",
  announcement: null,
  announcements: [],
  enable_spin: true,
  enable_invite: true,
  enable_check_in: true,
  enable_share_reward: true,
  checkin_reward_base: 1,
  checkin_reward_streak_3: 1.5,
  checkin_reward_streak_7: 2,
  share_reward_spins: 1,
  daily_share_reward_limit: 0,
  invite_reward_spins: 3,
  daily_invite_reward_limit: 0,
  daily_free_spins_per_day: 0,
  login_badges: ["🏆 签到奖励", "🎁 积分兑换", "👥 邀请好友"],
  footer_text: "账户数据安全加密，平台合规运营，请放心使用",
  home_banners: [],
  show_announcement_popup: false,
  announcement_popup_frequency: "off",
  announcement_popup_title: "系统公告",
  announcement_popup_content: null,
  home_points_balance_hint_zh: "",
  home_points_balance_hint_en: "",
  points_mall_redeem_rules_title_zh: "",
  points_mall_redeem_rules_title_en: "",
  points_mall_redeem_daily_unlimited_zh: "",
  points_mall_redeem_daily_unlimited_en: "",
  points_mall_redeem_lifetime_unlimited_zh: "",
  points_mall_redeem_lifetime_unlimited_en: "",
  customer_service_label: "联系客服",
  customer_service_link: null,
  customer_service_agents: [],
  home_module_order: ["shortcuts", "tasks", "security"],
  login_carousel_slides: [],
  login_carousel_interval_sec: 5,
  home_banners_carousel_interval_sec: 5,
  terms_of_service_zh: DEFAULT_TERMS_ZH,
  terms_of_service_en: DEFAULT_TERMS_EN,
  privacy_policy_zh: DEFAULT_PRIVACY_ZH,
  privacy_policy_en: DEFAULT_PRIVACY_EN,
  registration_require_legal_agreement: true,
  home_first_trade_contact_zh: "",
  home_first_trade_contact_en: "",
};

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function coalesceLegalBody(raw: unknown, fallback: string): string {
  const s = raw != null ? String(raw).trim() : "";
  return s || fallback;
}

/** 功能徽章：兼容 JSON 数组、JSON 字符串、换行文本；空则回退默认 */
function normalizeAnnouncementPopupFrequency(raw: Record<string, unknown>): AnnouncementPopupFrequency {
  const v = String(raw.announcement_popup_frequency ?? "")
    .trim()
    .toLowerCase();
  if (v === "daily_first" || v === "every_login" || v === "off") return v;
  const legacy = raw.show_announcement_popup;
  if (legacy === true || legacy === 1 || legacy === "1") return "every_login";
  return "off";
}

function normalizeLoginBadgesField(raw: unknown): string[] {
  const fromArray = (arr: unknown[]): string[] =>
    arr.map((x) => String(x).trim()).filter((s) => s.length > 0);
  if (Array.isArray(raw)) {
    const out = fromArray(raw);
    return out.length > 0 ? out : DEFAULT_SETTINGS.login_badges;
  }
  if (typeof raw === "string") {
    const s = raw.trim();
    if (!s) return DEFAULT_SETTINGS.login_badges;
    try {
      const p = JSON.parse(s) as unknown;
      if (Array.isArray(p)) {
        const out = fromArray(p);
        return out.length > 0 ? out : DEFAULT_SETTINGS.login_badges;
      }
    } catch {
      /* 单行或多行纯文本 */
    }
    const lines = fromArray(s.split(/\r?\n/));
    return lines.length > 0 ? lines : DEFAULT_SETTINGS.login_badges;
  }
  return DEFAULT_SETTINGS.login_badges;
}

function normalizeSettings(raw: Record<string, unknown> = {}): MemberPortalSettings {
  const { home_background_preset: _legacyHeroBg, ...rawSansHeroBg } = raw || {};
  void _legacyHeroBg;
  const settings = { ...DEFAULT_SETTINGS, ...rawSansHeroBg };
  const popupFreq = normalizeAnnouncementPopupFrequency({ ...settings, ...raw });
  return {
    ...settings,
    announcement_popup_frequency: popupFreq,
    show_announcement_popup: popupFreq !== "off",
    login_badges: normalizeLoginBadgesField(raw?.login_badges),
    daily_free_spins_per_day: Math.max(0, Number(raw?.daily_free_spins_per_day ?? DEFAULT_SETTINGS.daily_free_spins_per_day)),
    daily_share_reward_limit: Math.max(0, Number(raw?.daily_share_reward_limit ?? DEFAULT_SETTINGS.daily_share_reward_limit)),
    daily_invite_reward_limit: Math.max(0, Number(raw?.daily_invite_reward_limit ?? DEFAULT_SETTINGS.daily_invite_reward_limit)),
    home_points_balance_hint_zh:
      raw?.home_points_balance_hint_zh != null ? String(raw.home_points_balance_hint_zh) : DEFAULT_SETTINGS.home_points_balance_hint_zh,
    home_points_balance_hint_en:
      raw?.home_points_balance_hint_en != null ? String(raw.home_points_balance_hint_en) : DEFAULT_SETTINGS.home_points_balance_hint_en,
    points_mall_redeem_rules_title_zh:
      raw?.points_mall_redeem_rules_title_zh != null ? String(raw.points_mall_redeem_rules_title_zh) : DEFAULT_SETTINGS.points_mall_redeem_rules_title_zh,
    points_mall_redeem_rules_title_en:
      raw?.points_mall_redeem_rules_title_en != null ? String(raw.points_mall_redeem_rules_title_en) : DEFAULT_SETTINGS.points_mall_redeem_rules_title_en,
    points_mall_redeem_daily_unlimited_zh:
      raw?.points_mall_redeem_daily_unlimited_zh != null
        ? String(raw.points_mall_redeem_daily_unlimited_zh)
        : DEFAULT_SETTINGS.points_mall_redeem_daily_unlimited_zh,
    points_mall_redeem_daily_unlimited_en:
      raw?.points_mall_redeem_daily_unlimited_en != null
        ? String(raw.points_mall_redeem_daily_unlimited_en)
        : DEFAULT_SETTINGS.points_mall_redeem_daily_unlimited_en,
    points_mall_redeem_lifetime_unlimited_zh:
      raw?.points_mall_redeem_lifetime_unlimited_zh != null
        ? String(raw.points_mall_redeem_lifetime_unlimited_zh)
        : DEFAULT_SETTINGS.points_mall_redeem_lifetime_unlimited_zh,
    points_mall_redeem_lifetime_unlimited_en:
      raw?.points_mall_redeem_lifetime_unlimited_en != null
        ? String(raw.points_mall_redeem_lifetime_unlimited_en)
        : DEFAULT_SETTINGS.points_mall_redeem_lifetime_unlimited_en,
    home_first_trade_contact_zh:
      raw?.home_first_trade_contact_zh != null
        ? String(raw.home_first_trade_contact_zh)
        : DEFAULT_SETTINGS.home_first_trade_contact_zh,
    home_first_trade_contact_en:
      raw?.home_first_trade_contact_en != null
        ? String(raw.home_first_trade_contact_en)
        : DEFAULT_SETTINGS.home_first_trade_contact_en,
    announcements: (() => {
      const mapped: AnnouncementItem[] = Array.isArray(raw?.announcements)
        ? raw.announcements
            .map((a: unknown, idx: number) => {
              const o = isPlainObject(a) ? a : {};
              const title = String(o.title ?? o.subject ?? "").trim();
              const content = String(o.content ?? o.body ?? o.message ?? o.text ?? "").trim();
              const imgRaw = o.image_url ?? o.image ?? o.imageUrl;
              const image_url = imgRaw != null && String(imgRaw).trim() ? String(imgRaw).trim() : "";
              return {
                title,
                content,
                image_url,
                sort_order: typeof o.sort_order === "number" ? o.sort_order : idx + 1,
              };
            })
            .filter((a) => a.title || a.content || a.image_url)
            .sort((a: AnnouncementItem, b: AnnouncementItem) => a.sort_order - b.sort_order)
        : [];
      if (mapped.length > 0) return mapped;
      const legacy =
        raw?.announcement !== undefined && raw?.announcement !== null ? String(raw.announcement).trim() : "";
      if (legacy) return [{ title: "", content: legacy, image_url: "", sort_order: 1 }];
      return DEFAULT_SETTINGS.announcements;
    })(),
    home_banners: Array.isArray(raw?.home_banners)
      ? raw.home_banners
          .map((b: unknown) => {
            const o = isPlainObject(b) ? b : {};
            return {
              title: String(o.title || "").trim(),
              subtitle: String(o.subtitle || "").trim(),
              link: String(o.link || "").trim(),
              image_url: String(o.image_url || "").trim(),
              image_preset_id: String(o.image_preset_id || "").trim(),
              banner_layout: normalizeHomeBannerLayout(o.banner_layout),
              image_object_fit: normalizeHomeBannerImageFit(o.image_object_fit),
              image_object_position: sanitizeHomeBannerObjectPosition(o.image_object_position),
            };
          })
          .filter((b) => b.title || b.subtitle || b.link || b.image_url || b.image_preset_id)
      : DEFAULT_SETTINGS.home_banners,
    home_module_order: Array.isArray(raw?.home_module_order)
      ? raw.home_module_order.map((x: unknown) => String(x)).filter(Boolean)
      : DEFAULT_SETTINGS.home_module_order,
    customer_service_agents: Array.isArray(raw?.customer_service_agents)
      ? raw.customer_service_agents
          .map((a: unknown) => {
            const o = isPlainObject(a) ? a : {};
            return {
              name: String(o.name || "").trim(),
              avatar_url: o.avatar_url ? String(o.avatar_url).trim() : null,
              link: String(o.link || o.whatsapp_number || "").trim(),
            };
          })
          .filter((a) => a.name && a.link)
      : DEFAULT_SETTINGS.customer_service_agents,
    /** 仅坐席列表生效，全局链接已废弃，避免与后台配置条数不一致 */
    customer_service_link: null,
    login_carousel_slides: (() => {
      const mapped: LoginCarouselSlideItem[] = Array.isArray(raw?.login_carousel_slides)
        ? raw.login_carousel_slides
            .map((item: unknown, idx: number) => {
              const o = isPlainObject(item) ? item : {};
              const image_url = o.image_url != null ? String(o.image_url).trim() : "";
              const title_zh = String(o.title_zh ?? o.title ?? "").trim();
              const title_en = String(o.title_en ?? "").trim();
              const body_zh = String(o.body_zh ?? o.body ?? "").trim();
              const body_en = String(o.body_en ?? "").trim();
              return {
                image_url,
                title_zh,
                title_en,
                body_zh,
                body_en,
                sort_order: typeof o.sort_order === "number" ? o.sort_order : idx + 1,
              };
            })
            .filter((s) => s.image_url || s.title_zh || s.title_en || s.body_zh || s.body_en)
            .sort((a, b) => a.sort_order - b.sort_order)
            .slice(0, 8)
        : [];
      return mapped;
    })(),
    login_carousel_interval_sec: Math.min(
      60,
      Math.max(3, Math.floor(Number(raw?.login_carousel_interval_sec ?? DEFAULT_SETTINGS.login_carousel_interval_sec) || 5)),
    ),
    home_banners_carousel_interval_sec: Math.min(
      60,
      Math.max(
        3,
        Math.floor(
          Number(raw?.home_banners_carousel_interval_sec ?? DEFAULT_SETTINGS.home_banners_carousel_interval_sec) || 5,
        ),
      ),
    ),
    terms_of_service_zh: coalesceLegalBody(raw?.terms_of_service_zh, DEFAULT_TERMS_ZH),
    terms_of_service_en: coalesceLegalBody(raw?.terms_of_service_en, DEFAULT_TERMS_EN),
    privacy_policy_zh: coalesceLegalBody(raw?.privacy_policy_zh, DEFAULT_PRIVACY_ZH),
    privacy_policy_en: coalesceLegalBody(raw?.privacy_policy_en, DEFAULT_PRIVACY_EN),
    registration_require_legal_agreement: (() => {
      const v = raw?.registration_require_legal_agreement;
      if (v === false || v === 0 || v === "0") return false;
      return true;
    })(),
  };
}

export async function getMyMemberPortalSettings(tenantId?: string | null): Promise<MemberPortalSettingsPayload> {
  try {
    const qs = new URLSearchParams();
    if (tenantId) qs.set("tenant_id", tenantId);
    qs.set("_t", String(Date.now()));
    const r = await apiGet<{
      success: boolean;
      tenant_id?: string;
      tenant_name?: string;
      settings?: any;
      published_version_no?: number | null;
      settings_updated_at?: string | null;
      error?: string;
    }>(`/api/member-portal-settings?${qs.toString()}`);
    if (!r.success) throw new Error(r.error || "Load settings failed");
    return {
      tenant_id: r.tenant_id ?? null,
      tenant_name: r.tenant_name || "",
      settings: normalizeSettings(r.settings),
      published_version_no: r.published_version_no ?? null,
      settings_updated_at: r.settings_updated_at ?? null,
    };
  } catch (e: unknown) {
    throw new Error((e instanceof Error ? e.message : String(e)) || "Load settings failed");
  }
}

export async function upsertMyMemberPortalSettings(settings: MemberPortalSettings): Promise<void> {
  const r = await apiPut<{ success: boolean; error?: string }>("/api/member-portal-settings/", { settings });
  if (!r.success) throw new Error(r.error || "Save settings failed");
}

/** 合并同一 memberId 的并发请求（多组件各调 useMemberPortalSettings 时切 Tab 只打一条） */
const memberPortalSettingsByMemberInflight = new Map<string, Promise<MemberPortalSettingsPayload>>();

export async function getMemberPortalSettingsByMember(memberId: string): Promise<MemberPortalSettingsPayload> {
  const existing = memberPortalSettingsByMemberInflight.get(memberId);
  if (existing) return existing;

  const p = (async (): Promise<MemberPortalSettingsPayload> => {
    try {
      const r = await apiGet<{ success: boolean; tenant_id?: string; tenant_name?: string; settings?: any; error?: string }>(
        `/api/member-portal-settings/by-member/${encodeURIComponent(memberId)}`
      );
      if (!r.success) throw new Error(r.error || "Load portal settings failed");
      return {
        tenant_id: r.tenant_id ?? null,
        tenant_name: r.tenant_name || "",
        settings: normalizeSettings(r.settings),
      };
    } catch (e: unknown) {
      throw new Error((e instanceof Error ? e.message : String(e)) || "Load portal settings failed");
    } finally {
      memberPortalSettingsByMemberInflight.delete(memberId);
    }
  })();

  memberPortalSettingsByMemberInflight.set(memberId, p);
  return p;
}

export async function getMemberPortalSettingsByInviteCode(code: string): Promise<MemberPortalSettingsPayload | null> {
  try {
    const r = await apiGet<{ success: boolean; tenant_id?: string; tenant_name?: string; settings?: any }>(
      `/api/member-portal-settings/by-invite-token/${encodeURIComponent(code)}`
    );
    if (!r.success) return null;
    return {
      tenant_id: r.tenant_id ?? null,
      tenant_name: r.tenant_name || "",
      settings: normalizeSettings(r.settings),
    };
  } catch {
    return null;
  }
}

export async function getMemberPortalSettingsByAccount(account: string): Promise<MemberPortalSettingsPayload | null> {
  const value = String(account || "").trim();
  if (!value) return null;
  try {
    const r = await apiGet<{ success: boolean; tenant_id?: string; tenant_name?: string; settings?: any }>(
      `/api/member-portal-settings/by-account/${encodeURIComponent(value)}`
    );
    if (!r.success) return null;
    return {
      tenant_id: r.tenant_id ?? null,
      tenant_name: r.tenant_name || "",
      settings: normalizeSettings(r.settings),
    };
  } catch {
    return null;
  }
}

export async function getDefaultMemberPortalSettings(): Promise<MemberPortalSettingsPayload | null> {
  try {
    const r = await apiGet<{ success: boolean; tenant_id?: string; tenant_name?: string; settings?: any }>(
      `/api/member-portal-settings/default`
    );
    if (!r.success) return null;
    return {
      tenant_id: r.tenant_id ?? null,
      tenant_name: r.tenant_name || "",
      settings: normalizeSettings(r.settings),
    };
  } catch {
    return null;
  }
}

async function uploadImageToServer(tenantId: string, file: File): Promise<string> {
  const base64 = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as string);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
  const resp = await apiPost<{ success: boolean; url?: string; error?: string }>('/api/upload/image', {
    data: base64,
    content_type: file.type || 'image/webp',
    file_name: file.name,
    tenant_id: tenantId,
  });
  if (!resp?.success || !resp.url) throw new Error(resp?.error || 'Upload failed');
  return resp.url;
}

export async function uploadMemberPortalLogo(tenantId: string, file: File): Promise<string> {
  return uploadImageToServer(tenantId, file);
}

export async function uploadMemberPortalBannerImage(tenantId: string, file: File): Promise<string> {
  return uploadImageToServer(tenantId, file);
}

export async function createMyMemberPortalSettingsVersion(
  payload: MemberPortalSettings,
  note?: string,
  effectiveAt?: string | null,
  tenantId?: string | null
): Promise<{ success: boolean; version_id?: string; version_no?: number; is_applied?: boolean; error?: string }> {
  try {
    const r = await apiPost<{ success: boolean; version_id?: string; version_no?: number; is_applied?: boolean; error?: { code?: string; message?: string } }>(
      "/api/member-portal-settings/versions",
      { payload, note: note || null, effective_at: effectiveAt || null, tenant_id: tenantId || null }
    );
    if (!r.success) {
      const err = r.error;
      const msg = err && typeof err === "object" ? (err as { message?: string }).message : err;
      return { success: false, error: msg || "Create version failed" };
    }
    return {
      success: true,
      version_id: r.version_id,
      version_no: r.version_no,
      is_applied: r.is_applied,
    };
  } catch (e: unknown) {
    const msg = (e instanceof Error ? e.message : String(e)) || "Create version failed";
    return { success: false, error: msg };
  }
}

export async function listMyMemberPortalSettingsVersions(limit = 20, tenantId?: string | null): Promise<MemberPortalVersionItem[]> {
  const params = new URLSearchParams();
  params.set("limit", String(limit));
  if (tenantId) params.set("tenant_id", tenantId);
  const r = await apiGet<{ success: boolean; versions?: MemberPortalVersionItem[]; error?: string }>(
    `/api/member-portal-settings/versions?${params.toString()}`
  );
  if (!r.success) throw new Error(r.error || "Load versions failed");
  return (r.versions || []) as MemberPortalVersionItem[];
}

export async function rollbackMyMemberPortalSettingsVersion(versionId: string, tenantId?: string | null): Promise<boolean> {
  const params = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
  const r = await apiPost<{ success: boolean; error?: string }>(
    `/api/member-portal-settings/versions/${versionId}/rollback${params}`,
    {}
  );
  if (!r.success) throw new Error(r.error || "Rollback failed");
  return true;
}

export async function submitMyMemberPortalSettingsForApproval(
  payload: MemberPortalSettings,
  note?: string,
  effectiveAt?: string | null,
  tenantId?: string | null
): Promise<{ success: boolean; version_id?: string; version_no?: number; error?: string }> {
  try {
    const r = await apiPost<{ success: boolean; version_id?: string; version_no?: number; error?: string }>(
      "/api/member-portal-settings/versions/submit-approval",
      { payload, note: note || null, effective_at: effectiveAt || null, tenant_id: tenantId || null }
    );
    return {
      success: !!r.success,
      version_id: r.version_id,
      version_no: r.version_no,
      error: r.error,
    };
  } catch (e: unknown) {
    return { success: false, error: (e instanceof Error ? e.message : String(e)) || "Submit approval failed" };
  }
}

export async function approveMyMemberPortalSettingsVersion(
  versionId: string,
  reviewNote?: string,
  approve = true,
  tenantId?: string | null
): Promise<{ success: boolean; approved?: boolean; error?: string }> {
  try {
    const r = await apiPost<{ success: boolean; approved?: boolean; error?: string }>(
      `/api/member-portal-settings/versions/${versionId}/approve`,
      { review_note: reviewNote || null, approve, tenant_id: tenantId || null }
    );
    return { success: !!r.success, approved: r.approved, error: r.error };
  } catch (e: unknown) {
    return { success: false, error: (e instanceof Error ? e.message : String(e)) || "Approve failed" };
  }
}

/* ── 草稿 / 发布 API ── */

export interface ServerDraft {
  id: string;
  payload: MemberPortalSettings;
  note: string | null;
  updated_at: string;
}

export async function saveDraftToServer(
  payload: MemberPortalSettings,
  note?: string,
  tenantId?: string | null
): Promise<{ success: boolean; draft_id?: string; error?: string }> {
  try {
    const r = await apiPost<{ success: boolean; draft_id?: string; error?: string }>(
      "/api/member-portal-settings/draft",
      { payload, note: note || null, tenant_id: tenantId || null }
    );
    return { success: !!r.success, draft_id: r.draft_id, error: r.error };
  } catch (e: unknown) {
    return { success: false, error: (e instanceof Error ? e.message : String(e)) || "Save draft failed" };
  }
}

export async function getServerDraft(
  tenantId?: string | null
): Promise<{ success: boolean; draft: ServerDraft | null; error?: string }> {
  try {
    const params = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
    const r = await apiGet<{ success: boolean; draft?: ServerDraft | null; error?: string }>(
      `/api/member-portal-settings/draft${params}`,
      PORTAL_SETTINGS_GET,
    );
    return { success: !!r.success, draft: r.draft ?? null, error: r.error };
  } catch (e: unknown) {
    return { success: false, draft: null, error: (e instanceof Error ? e.message : String(e)) || "Get draft failed" };
  }
}

export async function publishServerDraft(
  note?: string,
  tenantId?: string | null
): Promise<{ success: boolean; version_id?: string; version_no?: number; is_applied?: boolean; error?: string }> {
  try {
    const r = await apiPost<{ success: boolean; version_id?: string; version_no?: number; is_applied?: boolean; error?: string }>(
      "/api/member-portal-settings/publish",
      { note: note || null, tenant_id: tenantId || null }
    );
    return { success: !!r.success, version_id: r.version_id, version_no: r.version_no, is_applied: r.is_applied, error: r.error };
  } catch (e: unknown) {
    return { success: false, error: (e instanceof Error ? e.message : String(e)) || "Publish failed" };
  }
}

export async function discardServerDraft(
  tenantId?: string | null
): Promise<{ success: boolean; error?: string }> {
  try {
    const params = tenantId ? `?tenant_id=${encodeURIComponent(tenantId)}` : "";
    const r = await apiDelete<{ success: boolean; error?: string }>(
      `/api/member-portal-settings/draft${params}`
    );
    return { success: !!r.success, error: r.error };
  } catch (e: unknown) {
    return { success: false, error: (e instanceof Error ? e.message : String(e)) || "Discard draft failed" };
  }
}

export async function listMyMemberSpinWheelPrizes(): Promise<SpinWheelPrizeItem[]> {
  try {
    const r = await apiGet<{ success: boolean; items?: any[]; error?: string }>(
      "/api/member-portal-settings/spin-wheel-prizes"
    );
    if (!r.success) throw new Error(r.error || "Load spin prizes failed");
    return Array.isArray(r.items)
      ? r.items.map((x: any) => ({
          id: x.id,
          name: String(x.name || "").trim(),
          prize_type: String(x.prize_type || "custom"),
          hit_rate: Number(x.hit_rate || 0),
          enabled: x.enabled !== false,
        }))
      : [];
  } catch (e: unknown) {
    throw new Error((e instanceof Error ? e.message : String(e)) || "Load spin prizes failed");
  }
}

export async function upsertMyMemberSpinWheelPrizes(items: SpinWheelPrizeItem[]): Promise<void> {
  const r = await apiPost<{ success: boolean; error?: string }>(
    "/api/member-portal-settings/spin-wheel-prizes",
    {
      items: items.map((x, idx) => ({
        name: x.name,
        prize_type: x.prize_type,
        hit_rate: x.hit_rate,
        enabled: x.enabled !== false,
        sort_order: idx + 1,
      })),
    }
  );
  if (!r.success) {
    if (r.error === "ITEM_COUNT_OUT_OF_RANGE") throw new Error("奖品数量需在 6~10 个");
    if (r.error === "ENABLED_ITEMS_TOO_FEW") throw new Error("至少保留 6 个启用奖品");
    if (r.error === "INVALID_HIT_RATE") throw new Error("命中率配置无效");
    if (r.error === "RATE_SUM_NOT_100") throw new Error("启用奖品命中率总和必须等于 100%");
    if (r.error === "HIT_RATE_OUT_OF_RANGE") throw new Error("每个奖品命中率必须在 0%~100% 之间");
    throw new Error(r.error || "Save spin prizes failed");
  }
}

export async function getMemberSpinWheelPrizesByMember(memberId: string): Promise<SpinWheelPrizeItem[]> {
  try {
    const r = await apiGet<{ success: boolean; items?: any[]; error?: string }>(
      `/api/member-portal-settings/spin-wheel-prizes/by-member/${encodeURIComponent(memberId)}`
    );
    if (!r.success) throw new Error(r.error || "Load member spin prizes failed");
    return Array.isArray(r.items)
      ? r.items.map((x: any) => ({
          name: String(x.name || "").trim(),
          prize_type: String(x.prize_type || "custom"),
          hit_rate: Number(x.hit_rate || 0),
          enabled: true,
        }))
      : [];
  } catch (e: unknown) {
    throw new Error((e instanceof Error ? e.message : String(e)) || "Load member spin prizes failed");
  }
}

/** 员工端：活动数据 — 签到流水 */
export interface PortalCheckInLogRow {
  id: string;
  member_id: string;
  check_in_date: string;
  streak: number | null;
  points_awarded: number | string | null;
  created_at: string;
  nickname: string | null;
  phone_number: string | null;
}

export async function adminListPortalCheckIns(options?: {
  limit?: number;
  offset?: number;
  tenantId?: string | null;
}): Promise<{ rows: PortalCheckInLogRow[]; total: number }> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("offset", String(offset));
  if (options?.tenantId) q.set("tenant_id", options.tenantId);
  const r = await apiGet<{ success: boolean; check_ins?: PortalCheckInLogRow[]; total?: number }>(
    `/api/member-portal-settings/check-ins?${q.toString()}`,
  );
  return { rows: r?.check_ins ?? [], total: r?.total ?? 0 };
}

export type PortalLotteryPointsLedgerRow = {
  id: string;
  member_id: string;
  amount: number | string;
  description: string | null;
  created_at: string;
  reference_id: string | null;
  reference_type: string | null;
  nickname: string | null;
  phone_number: string | null;
  member_code: string | null;
  prize_name: string | null;
};

export async function adminListLotteryPointsLedger(options?: {
  limit?: number;
  offset?: number;
  tenantId?: string | null;
  q?: string;
}): Promise<{
  rows: PortalLotteryPointsLedgerRow[];
  total: number;
  stats: { total_lottery_points_earned: number };
}> {
  const limit = options?.limit ?? 50;
  const offset = options?.offset ?? 0;
  const q = new URLSearchParams();
  q.set("limit", String(limit));
  q.set("offset", String(offset));
  if (options?.tenantId) q.set("tenant_id", options.tenantId);
  if (options?.q?.trim()) q.set("q", options.q.trim());
  const r = await apiGet<{
    success: boolean;
    rows?: PortalLotteryPointsLedgerRow[];
    total?: number;
    stats?: { total_lottery_points_earned?: number };
  }>(`/api/member-portal-settings/lottery-points-ledger?${q.toString()}`);
  return {
    rows: r?.rows ?? [],
    total: r?.total ?? 0,
    stats: { total_lottery_points_earned: Number(r?.stats?.total_lottery_points_earned ?? 0) },
  };
}
