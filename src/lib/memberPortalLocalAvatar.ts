/**
 * 会员门户「本地头像」——仅存浏览器 localStorage（按会员 ID），不上传服务器。
 * 其它设备、无痕模式、清除站点数据后均看不到；登出时与门户缓存一并清理（见 clearMemberPortalSettingsBrowserCaches）。
 *
 * 未来若要做「云端头像」：需接会员资料接口（读写 avatar URL）+ 对象存储。
 * 需要上传到存储服务时，建议在前端用预签名 URL 等方式直传对象存储（S3/R2/OSS），
 * 避免大图经业务 Node 中转；业务后端只保存最终 URL 与鉴权。
 */
/** 原图大小上限（压缩写入 localStorage 前校验） */
import { compressImageToDataUrl } from "@/lib/imageClientCompress";

export const MEMBER_LOCAL_AVATAR_MAX_FILE_BYTES = 8 * 1024 * 1024;
export const MEMBER_LOCAL_AVATAR_KEY_PREFIX = "member_portal_local_avatar_v1:";

export function memberLocalAvatarStorageKey(memberId: string): string {
  return `${MEMBER_LOCAL_AVATAR_KEY_PREFIX}${memberId}`;
}

export function readMemberLocalAvatar(memberId: string): string | null {
  try {
    const raw = localStorage.getItem(memberLocalAvatarStorageKey(memberId));
    if (!raw || !raw.startsWith("data:image/")) return null;
    return raw;
  } catch {
    return null;
  }
}

export function writeMemberLocalAvatar(memberId: string, dataUrl: string): void {
  try {
    localStorage.setItem(memberLocalAvatarStorageKey(memberId), dataUrl);
  } catch (e) {
    if (e instanceof DOMException && e.name === "QuotaExceededError") throw e;
    throw e instanceof Error ? e : new Error("STORAGE_WRITE_FAILED");
  }
}

export function removeMemberLocalAvatar(memberId: string): void {
  try {
    localStorage.removeItem(memberLocalAvatarStorageKey(memberId));
  } catch {
    /* ignore */
  }
}

const MAX_EDGE = 320;
const WEBP_QUALITY = 0.82;
const JPEG_QUALITY = 0.82;

/**
 * 将用户选择的图片缩放后编码为 **WebP**（data URL），浏览器不支持 WebP 导出时回退为 JPEG。
 * 与会员资料 RPC 200KB 上限配合：边长上限 320，一般远小于限制。
 */
export async function compressImageFileToAvatarDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith("image/")) {
    throw new Error("NOT_IMAGE");
  }
  if (file.size > MEMBER_LOCAL_AVATAR_MAX_FILE_BYTES) {
    throw new Error("FILE_TOO_LARGE");
  }

  // iOS / some WebViews may throw "找不到对象" (Object not found) for createImageBitmap
  // or fail to decode certain formats. Fall back to the FileReader+Image pipeline.
  if (typeof (globalThis as any).createImageBitmap === "function") {
    try {
      const bitmap = await (globalThis as any).createImageBitmap(file);
      try {
        const w = bitmap.width;
        const h = bitmap.height;
        const scale = Math.min(1, MAX_EDGE / Math.max(w, h, 1));
        const cw = Math.max(1, Math.round(w * scale));
        const ch = Math.max(1, Math.round(h * scale));

        const canvas = document.createElement("canvas");
        canvas.width = cw;
        canvas.height = ch;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("NO_CONTEXT");

        ctx.imageSmoothingEnabled = true;
        ctx.imageSmoothingQuality = "high";
        ctx.drawImage(bitmap, 0, 0, cw, ch);

        let dataUrl = canvas.toDataURL("image/webp", WEBP_QUALITY);
        if (!dataUrl.startsWith("data:image/webp")) {
          dataUrl = canvas.toDataURL("image/jpeg", JPEG_QUALITY);
        }
        if (!dataUrl || dataUrl.length < 32) throw new Error("ENCODE_FAILED");
        return dataUrl;
      } finally {
        try { bitmap.close?.(); } catch { /* ignore */ }
      }
    } catch (e) {
      console.warn("[memberPortalLocalAvatar] createImageBitmap failed, falling back:", e);
    }
  }

  // Fallback path: decode via FileReader+Image (more compatible on mobile Safari/WebViews).
  const dataUrl = await compressImageToDataUrl(file, MAX_EDGE, WEBP_QUALITY);
  if (!dataUrl || typeof dataUrl !== "string" || dataUrl.length < 32 || !dataUrl.startsWith("data:image/")) {
    throw new Error("ENCODE_FAILED");
  }
  return dataUrl;
}
