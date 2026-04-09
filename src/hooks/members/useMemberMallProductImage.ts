import { useState, useEffect, useCallback, useMemo, type SyntheticEvent } from "react";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";

/**
 * 会员门户可解析图片：先短重试一次，仍失败则占位（避免 handleImgError 把 img display:none 留空）。
 * 历史名：`useMemberMallProductImage`（同文件导出别名）。
 */
export function useMemberResolvableMedia(entityId: string, rawImageUrl: string | null | undefined) {
  const resolvedSrc = useMemo(() => {
    const s = typeof rawImageUrl === "string" ? rawImageUrl.trim() : "";
    return s ? resolveMemberMediaUrl(rawImageUrl) : "";
  }, [rawImageUrl]);

  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [entityId, resolvedSrc]);

  const onImageError = useCallback((e: SyntheticEvent<HTMLImageElement>) => {
    const img = e.currentTarget;
    const retried = img.dataset.retried;
    if (!retried && img.src) {
      img.dataset.retried = "1";
      const original = img.src;
      img.src = "";
      window.setTimeout(() => {
        img.src = original;
      }, 2000);
      return;
    }
    setFailed(true);
  }, []);

  const usePlaceholder = !resolvedSrc || failed;

  return { resolvedSrc, usePlaceholder, onImageError };
}

/** @deprecated 请使用 `useMemberResolvableMedia`（自 `@/hooks/useMemberResolvableMedia` 导入） */
export const useMemberMallProductImage = useMemberResolvableMedia;
