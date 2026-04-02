/**
 * 会员端体验统一：骨架时长、Toast 文案等（避免各页各写一套）
 */
export type MemberPortalT = (zh: string, en: string) => string;

/** 首屏/列表骨架最短展示毫秒数，减轻「闪一下」的廉价感（弱网下仍会一直显示到数据返回） */
export const MEMBER_SKELETON_MIN_MS = 420;

export function memberPortalNetworkToastMessage(t: MemberPortalT): string {
  return t("网络不稳定，请稍后重试。", "Poor connection — please try again shortly.");
}

export function memberPortalLinkCopiedToast(t: MemberPortalT): string {
  return t("已复制", "Copied");
}

export function memberPortalCopyFailedToast(t: MemberPortalT): string {
  return t("复制失败，请手动选择复制", "Copy failed — copy manually");
}
