/**
 * 会员头像 hook — 云端优先，本地 localStorage 回退
 *
 * 读取优先级：member.avatar_url（云端）> localStorage（本地）
 * 写入：压缩后同时写云端 + 本地缓存
 * 清除：同时清云端 + 本地
 */
import { useCallback, useEffect, useState } from "react";
import {
  compressImageFileToAvatarDataUrl,
  readMemberLocalAvatar,
  removeMemberLocalAvatar,
  writeMemberLocalAvatar,
} from "@/lib/memberPortalLocalAvatar";
import { memberUpdateAvatar } from "@/services/memberPortal/memberActivityService";

export function useMemberLocalAvatar(
  memberId: string | undefined,
  cloudAvatarUrl?: string | null,
  /** 云端写入成功后回调（例如 refreshMember 同步上下文） */
  onCloudAvatarPersisted?: () => void,
) {
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  // 初始化：云端优先，本地回退
  useEffect(() => {
    if (!memberId) {
      setAvatarUrl(null);
      return;
    }
    const cloud = cloudAvatarUrl?.trim() || null;
    if (cloud) {
      setAvatarUrl(cloud);
      return;
    }
    setAvatarUrl(readMemberLocalAvatar(memberId));
  }, [memberId, cloudAvatarUrl]);

  const setFromFile = useCallback(
    async (file: File) => {
      if (!memberId) return;
      const dataUrl = await compressImageFileToAvatarDataUrl(file);

      // 写本地缓存（即时显示）
      try {
        writeMemberLocalAvatar(memberId, dataUrl);
      } catch (e) {
        if (e instanceof DOMException && e.name === "QuotaExceededError") throw e;
        throw e;
      }
      setAvatarUrl(dataUrl);

      // 异步写云端
      try {
        await memberUpdateAvatar(memberId, dataUrl);
        onCloudAvatarPersisted?.();
      } catch {
        // 云端失败不影响本地显示，下次登录会重试
        console.warn("[useMemberLocalAvatar] cloud upload failed, local cache kept");
      }
    },
    [memberId, onCloudAvatarPersisted],
  );

  const clear = useCallback(async () => {
    if (!memberId) return;
    removeMemberLocalAvatar(memberId);
    setAvatarUrl(null);

    // 异步清云端
    try {
      await memberUpdateAvatar(memberId, null);
      onCloudAvatarPersisted?.();
    } catch {
      console.warn("[useMemberLocalAvatar] cloud clear failed");
    }
  }, [memberId, onCloudAvatarPersisted]);

  return { avatarUrl, setFromFile, clear };
}
