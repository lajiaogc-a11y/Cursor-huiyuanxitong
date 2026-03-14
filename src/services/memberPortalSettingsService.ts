import { supabase } from "@/integrations/supabase/client";

export interface MemberPortalSettings {
  company_name: string;
  logo_url: string | null;
  theme_primary_color: string;
  welcome_title: string;
  welcome_subtitle: string;
  announcement: string | null;
  enable_spin: boolean;
  enable_invite: boolean;
  enable_check_in: boolean;
  enable_share_reward: boolean;
  checkin_reward_base: number;
  checkin_reward_streak_3: number;
  checkin_reward_streak_7: number;
  share_reward_spins: number;
  invite_reward_spins: number;
  daily_free_spins_per_day: number;
  login_badges: string[];
  footer_text: string;
  home_banners: { title: string; subtitle?: string; link?: string; image_url?: string }[];
  show_announcement_popup: boolean;
  announcement_popup_title: string;
  announcement_popup_content: string | null;
  customer_service_label: string;
  customer_service_link: string | null;
  home_background_preset: string;
  home_module_order: string[];
}

export interface MemberPortalSettingsPayload {
  tenant_id: string | null;
  tenant_name: string;
  settings: MemberPortalSettings;
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
  enabled?: boolean;
}

const DEFAULT_SETTINGS: MemberPortalSettings = {
  company_name: "Spin & Win",
  logo_url: null,
  theme_primary_color: "#f59e0b",
  welcome_title: "Premium Member Platform",
  welcome_subtitle: "Sign in to your member account",
  announcement: null,
  enable_spin: true,
  enable_invite: true,
  enable_check_in: true,
  enable_share_reward: true,
  checkin_reward_base: 1,
  checkin_reward_streak_3: 1.5,
  checkin_reward_streak_7: 2,
  share_reward_spins: 1,
  invite_reward_spins: 3,
  daily_free_spins_per_day: 0,
  login_badges: ["🏆 签到奖励", "🎁 积分兑换", "👥 邀请好友"],
  footer_text: "账户数据安全加密，平台合规运营，请放心使用",
  home_banners: [],
  show_announcement_popup: false,
  announcement_popup_title: "系统公告",
  announcement_popup_content: null,
  customer_service_label: "联系客服",
  customer_service_link: null,
  home_background_preset: "deep_blue",
  home_module_order: ["shortcuts", "tasks", "security"],
};

function normalizeSettings(raw: any): MemberPortalSettings {
  const settings = { ...DEFAULT_SETTINGS, ...(raw || {}) };
  return {
    ...settings,
    login_badges: Array.isArray(raw?.login_badges) ? raw.login_badges.map((x: any) => String(x)) : DEFAULT_SETTINGS.login_badges,
    daily_free_spins_per_day: Math.max(0, Number(raw?.daily_free_spins_per_day ?? DEFAULT_SETTINGS.daily_free_spins_per_day)),
    home_banners: Array.isArray(raw?.home_banners)
      ? raw.home_banners
          .map((b: any) => ({
            title: String(b?.title || "").trim(),
            subtitle: String(b?.subtitle || "").trim(),
            link: String(b?.link || "").trim(),
            image_url: String(b?.image_url || "").trim(),
          }))
          .filter((b: any) => b.title || b.subtitle || b.link || b.image_url)
      : DEFAULT_SETTINGS.home_banners,
    home_module_order: Array.isArray(raw?.home_module_order)
      ? raw.home_module_order.map((x: any) => String(x)).filter(Boolean)
      : DEFAULT_SETTINGS.home_module_order,
  };
}

export async function getMyMemberPortalSettings(tenantId?: string | null): Promise<MemberPortalSettingsPayload> {
  const { data, error } = await (supabase.rpc as any)("get_my_member_portal_settings", {
    p_tenant_id: tenantId || null,
  });
  if (error) throw new Error(error.message || "Load settings failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load settings failed");
  return {
    tenant_id: r.tenant_id ?? null,
    tenant_name: r.tenant_name || "",
    settings: normalizeSettings(r.settings),
  };
}

export async function upsertMyMemberPortalSettings(settings: MemberPortalSettings): Promise<void> {
  const { data, error } = await (supabase.rpc as any)("upsert_my_member_portal_settings", {
    p_company_name: settings.company_name,
    p_logo_url: settings.logo_url,
    p_theme_primary_color: settings.theme_primary_color,
    p_welcome_title: settings.welcome_title,
    p_welcome_subtitle: settings.welcome_subtitle,
    p_announcement: settings.announcement,
    p_enable_spin: settings.enable_spin,
    p_enable_invite: settings.enable_invite,
    p_enable_check_in: settings.enable_check_in,
    p_enable_share_reward: settings.enable_share_reward,
    p_checkin_reward_base: settings.checkin_reward_base,
    p_checkin_reward_streak_3: settings.checkin_reward_streak_3,
    p_checkin_reward_streak_7: settings.checkin_reward_streak_7,
    p_share_reward_spins: settings.share_reward_spins,
    p_invite_reward_spins: settings.invite_reward_spins,
    p_daily_free_spins_per_day: settings.daily_free_spins_per_day,
    p_login_badges: settings.login_badges,
    p_footer_text: settings.footer_text,
    p_home_banners: settings.home_banners,
    p_show_announcement_popup: settings.show_announcement_popup,
    p_announcement_popup_title: settings.announcement_popup_title,
    p_announcement_popup_content: settings.announcement_popup_content,
    p_customer_service_label: settings.customer_service_label,
    p_customer_service_link: settings.customer_service_link,
    p_home_background_preset: settings.home_background_preset,
    p_home_module_order: settings.home_module_order,
  });
  if (error) throw new Error(error.message || "Save settings failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Save settings failed");
}

export async function getMemberPortalSettingsByMember(memberId: string): Promise<MemberPortalSettingsPayload> {
  const { data, error } = await (supabase.rpc as any)("member_get_portal_settings", {
    p_member_id: memberId,
  });
  if (error) throw new Error(error.message || "Load portal settings failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load portal settings failed");
  return {
    tenant_id: r.tenant_id ?? null,
    tenant_name: r.tenant_name || "",
    settings: normalizeSettings(r.settings),
  };
}

export async function getMemberPortalSettingsByInviteCode(code: string): Promise<MemberPortalSettingsPayload | null> {
  const { data, error } = await (supabase.rpc as any)("member_get_portal_settings_by_invite_code", {
    p_code: code,
  });
  if (error) return null;
  const r = (data || {}) as any;
  if (!r.success) return null;
  return {
    tenant_id: r.tenant_id ?? null,
    tenant_name: r.tenant_name || "",
    settings: normalizeSettings(r.settings),
  };
}

export async function getMemberPortalSettingsByAccount(account: string): Promise<MemberPortalSettingsPayload | null> {
  const value = String(account || "").trim();
  if (!value) return null;
  const { data, error } = await (supabase.rpc as any)("member_get_portal_settings_by_account", {
    p_account: value,
  });
  if (error) return null;
  const r = (data || {}) as any;
  if (!r.success) return null;
  return {
    tenant_id: r.tenant_id ?? null,
    tenant_name: r.tenant_name || "",
    settings: normalizeSettings(r.settings),
  };
}

export async function getDefaultMemberPortalSettings(): Promise<MemberPortalSettingsPayload | null> {
  const { data, error } = await (supabase.rpc as any)("member_get_default_portal_settings");
  if (error) return null;
  const r = (data || {}) as any;
  if (!r.success) return null;
  return {
    tenant_id: r.tenant_id ?? null,
    tenant_name: r.tenant_name || "",
    settings: normalizeSettings(r.settings),
  };
}

export async function uploadMemberPortalLogo(tenantId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const fileName = `member-portal/${tenantId}/logo/logo-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from("task-posters")
    .upload(fileName, file, {
      upsert: true,
      contentType: file.type || "image/png",
      cacheControl: "3600",
    });
  if (error) throw new Error(error.message || "Upload logo failed");
  const { data: publicUrlData } = supabase.storage.from("task-posters").getPublicUrl(data.path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

export async function uploadMemberPortalBannerImage(tenantId: string, file: File): Promise<string> {
  const ext = (file.name.split(".").pop() || "png").toLowerCase();
  const fileName = `member-portal/${tenantId}/banners/banner-${Date.now()}.${ext}`;
  const { data, error } = await supabase.storage
    .from("task-posters")
    .upload(fileName, file, {
      upsert: true,
      contentType: file.type || "image/png",
      cacheControl: "3600",
    });
  if (error) throw new Error(error.message || "Upload banner failed");
  const { data: publicUrlData } = supabase.storage.from("task-posters").getPublicUrl(data.path);
  return `${publicUrlData.publicUrl}?v=${Date.now()}`;
}

export async function createMyMemberPortalSettingsVersion(
  payload: MemberPortalSettings,
  note?: string,
  effectiveAt?: string | null,
  tenantId?: string | null
): Promise<{ success: boolean; version_id?: string; version_no?: number; is_applied?: boolean; error?: string }> {
  const { data, error } = await (supabase.rpc as any)("create_my_member_portal_settings_version", {
    p_payload: payload,
    p_note: note || null,
    p_effective_at: effectiveAt || null,
    p_tenant_id: tenantId || null,
  });
  if (error) return { success: false, error: error.message || "Create version failed" };
  const r = (data || {}) as any;
  return {
    success: !!r.success,
    version_id: r.version_id,
    version_no: r.version_no,
    is_applied: r.is_applied,
    error: r.error,
  };
}

export async function listMyMemberPortalSettingsVersions(limit = 20, tenantId?: string | null): Promise<MemberPortalVersionItem[]> {
  const { data, error } = await (supabase.rpc as any)("list_my_member_portal_settings_versions", {
    p_limit: limit,
    p_tenant_id: tenantId || null,
  });
  if (error) throw new Error(error.message || "Load versions failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load versions failed");
  return (r.versions || []) as MemberPortalVersionItem[];
}

export async function rollbackMyMemberPortalSettingsVersion(versionId: string, tenantId?: string | null): Promise<boolean> {
  const { data, error } = await (supabase.rpc as any)("rollback_my_member_portal_settings_version", {
    p_version_id: versionId,
    p_tenant_id: tenantId || null,
  });
  if (error) throw new Error(error.message || "Rollback failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Rollback failed");
  return true;
}

export async function submitMyMemberPortalSettingsForApproval(
  payload: MemberPortalSettings,
  note?: string,
  effectiveAt?: string | null,
  tenantId?: string | null
): Promise<{ success: boolean; version_id?: string; version_no?: number; error?: string }> {
  const { data, error } = await (supabase.rpc as any)("submit_my_member_portal_settings_for_approval", {
    p_payload: payload,
    p_note: note || null,
    p_effective_at: effectiveAt || null,
    p_tenant_id: tenantId || null,
  });
  if (error) return { success: false, error: error.message || "Submit approval failed" };
  const r = (data || {}) as any;
  return {
    success: !!r.success,
    version_id: r.version_id,
    version_no: r.version_no,
    error: r.error,
  };
}

export async function approveMyMemberPortalSettingsVersion(
  versionId: string,
  reviewNote?: string,
  approve = true,
  tenantId?: string | null
): Promise<{ success: boolean; approved?: boolean; error?: string }> {
  const { data, error } = await (supabase.rpc as any)("approve_my_member_portal_settings_version", {
    p_version_id: versionId,
    p_review_note: reviewNote || null,
    p_approve: approve,
    p_tenant_id: tenantId || null,
  });
  if (error) return { success: false, error: error.message || "Approve failed" };
  const r = (data || {}) as any;
  return { success: !!r.success, approved: r.approved, error: r.error };
}

export async function listMyMemberSpinWheelPrizes(): Promise<SpinWheelPrizeItem[]> {
  const { data, error } = await (supabase.rpc as any)("list_my_member_spin_wheel_prizes");
  if (error) throw new Error(error.message || "Load spin prizes failed");
  const r = (data || {}) as any;
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
}

export async function upsertMyMemberSpinWheelPrizes(items: SpinWheelPrizeItem[]): Promise<void> {
  const { data, error } = await (supabase.rpc as any)("upsert_my_member_spin_wheel_prizes", {
    p_items: items.map((x, idx) => ({
      name: x.name,
      prize_type: x.prize_type,
      hit_rate: x.hit_rate,
      enabled: x.enabled !== false,
      sort_order: idx + 1,
    })),
  });
  if (error) throw new Error(error.message || "Save spin prizes failed");
  const r = (data || {}) as any;
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
  const { data, error } = await (supabase.rpc as any)("member_get_spin_wheel_prizes", {
    p_member_id: memberId,
  });
  if (error) throw new Error(error.message || "Load member spin prizes failed");
  const r = (data || {}) as any;
  if (!r.success) throw new Error(r.error || "Load member spin prizes failed");
  return Array.isArray(r.items)
    ? r.items.map((x: any) => ({
        name: String(x.name || "").trim(),
        prize_type: String(x.prize_type || "custom"),
        hit_rate: Number(x.hit_rate || 0),
        enabled: true,
      }))
    : [];
}

export { DEFAULT_SETTINGS };
