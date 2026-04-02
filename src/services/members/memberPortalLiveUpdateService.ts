import {
  getMemberPortalSettingsByMember,
  type MemberPortalSettings,
} from "@/services/members/memberPortalSettingsService";

/**
 * Member Portal Live Update Service.
 *
 * 轮询门户配置时使用与 useMemberPortalSettings 相同的 REST 接口，走 apiClient 统一鉴权。
 * emit* 仍为占位，待推送通道接入。
 */

export type MemberPortalLiveUpdatePayload = {
  type: "portal_settings_updated" | "force_refresh";
  tenantId?: string | null;
  buildTime?: string;
  triggeredAt: number;
};

/** 每 30s 拉取门户配置，变更时回调（当前仓库内无引用，保留供后续会员端实时刷新接入） */
export function subscribeMemberPortalLiveUpdate(
  memberId: string,
  onUpdate: (settings: MemberPortalSettings) => void,
): () => void {
  const timer = setInterval(async () => {
    try {
      const data = await getMemberPortalSettingsByMember(memberId);
      onUpdate(data.settings);
    } catch {
      /* 网络错误忽略 */
    }
  }, 30_000);
  return () => clearInterval(timer);
}

/** No-op — push channel not yet available. */
export async function emitPortalSettingsUpdated(_tenantId?: string | null): Promise<void> {}

/** No-op — push channel not yet available. */
export async function emitForceRefreshPrompt(_buildTime?: string): Promise<void> {}
