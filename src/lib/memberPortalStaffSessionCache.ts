/**
 * 员工端「会员系统」设置页体积大、首屏请求多；路由切换会卸载组件导致每次进入都重新拉数。
 * 在同一会话、同一租户下短时复用上次成功加载的快照，先瞬时还原 UI，再在后台静默刷新。
 * 发布/回滚等会调用 invalidate，避免展示过期配置。
 * TTL 仅控制「是否用缓存秒开」；进入后仍会后台拉接口对齐服务端，故可放宽以减少侧栏来回切换时的全屏加载感。
 */
import type { MemberPortalSettings, MemberPortalVersionItem } from "@/services/members/memberPortalSettingsService";
import type {
  PointsMallItem,
  PointsMallCategory,
} from "@/services/members/memberPointsMallService";
import type { LotteryPrize, LotterySettings } from "@/services/lottery/lotteryService";

const TTL_MS = 30 * 60 * 1000;

export type MemberPortalStaffSessionSnapshot = {
  lastPublishedSnapshot: string;
  /** 与「发布上线」时对比用：上次加载/发布后的积分商城目录指纹（不含门户 JSON） */
  lastPublishedMallCatalogFingerprint?: string;
  /** 与「发布上线」时对比用：上次加载/发布后的幸运抽奖配置指纹（含概率说明，不含门户 JSON） */
  lastPublishedLotteryFingerprint?: string;
  tenantName: string;
  initialSnapshot: MemberPortalSettings;
  hasDraft: boolean;
  lotteryPrizes: LotteryPrize[];
  lotterySettings: LotterySettings;
  mallItems: PointsMallItem[];
  /** 积分商城展示分类（与 mallItems 一并缓存） */
  mallCategories?: PointsMallCategory[];
  versions: MemberPortalVersionItem[];
};

type Entry = { at: number; snap: MemberPortalStaffSessionSnapshot };

const store = new Map<string, Entry>();

export function getMemberPortalStaffSessionSnapshot(cacheKey: string): MemberPortalStaffSessionSnapshot | null {
  const e = store.get(cacheKey);
  if (!e) return null;
  if (Date.now() - e.at > TTL_MS) {
    store.delete(cacheKey);
    return null;
  }
  return {
    ...e.snap,
    initialSnapshot: { ...e.snap.initialSnapshot },
    lotteryPrizes: e.snap.lotteryPrizes.map((x) => ({ ...x })),
    lotterySettings: { ...e.snap.lotterySettings },
    mallItems: e.snap.mallItems.map((x) => ({ ...x })),
    mallCategories: (e.snap.mallCategories ?? []).map((x) => ({ ...x })),
    versions: e.snap.versions.map((x) => ({ ...x })),
  };
}

export function setMemberPortalStaffSessionSnapshot(cacheKey: string, snap: MemberPortalStaffSessionSnapshot): void {
  store.set(cacheKey, {
    at: Date.now(),
    snap: {
      ...snap,
      initialSnapshot: { ...snap.initialSnapshot },
      lotteryPrizes: snap.lotteryPrizes.map((x) => ({ ...x })),
      lotterySettings: { ...snap.lotterySettings },
      mallItems: snap.mallItems.map((x) => ({ ...x })),
      mallCategories: (snap.mallCategories ?? []).map((x) => ({ ...x })),
      versions: snap.versions.map((x) => ({ ...x })),
    },
  });
}

/** 不传 key 时清空全部（例如切换平台租户视图时由调用方决定） */
export function invalidateMemberPortalStaffSessionSnapshot(cacheKey?: string): void {
  if (cacheKey == null) {
    store.clear();
    return;
  }
  store.delete(cacheKey);
}
