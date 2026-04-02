import { useEffect, useLayoutEffect, useState } from "react";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getMyMemberPortalSettings } from "@/services/members/memberPortalSettingsService";
import { resolveMemberMediaUrl } from "@/lib/memberMediaUrl";
import { getPlatformBrandLogoUrl } from "@/lib/memberPortalPlatformBrandLogo";
import { GCLogo } from "@/components/GCLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";

/**
 * 员工端侧栏/顶栏品牌位：与会员端一致，优先使用平台基准租户（最早一条会员门户设置）已发布 Logo；
 * 未配置时再使用当前查看租户的门户 Logo；仍无则 GC。
 */
export function StaffChromeLogo({ size, className }: { size: number; className?: string }) {
  const { viewingTenantId } = useTenantView() || {};
  const tid = viewingTenantId ?? null;
  const [ready, setReady] = useState(false);
  const [resolved, setResolved] = useState<string | null>(null);
  const [imgFailed, setImgFailed] = useState(false);

  useLayoutEffect(() => {
    setReady(false);
  }, [tid]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const platformLogo = await getPlatformBrandLogoUrl();
        const p = String(platformLogo ?? "").trim();
        if (p) {
          const url = resolveMemberMediaUrl(p);
          if (!cancelled) {
            setResolved(url && url.length > 0 ? url : null);
            setReady(true);
          }
          return;
        }
        if (!tid) {
          if (!cancelled) {
            setResolved(null);
            setReady(true);
          }
          return;
        }
        const data = await getMyMemberPortalSettings(tid);
        const raw = data.settings?.logo_url;
        const t = String(raw ?? "").trim();
        const url = t ? resolveMemberMediaUrl(t) : null;
        if (!cancelled) {
          setResolved(url && url.length > 0 ? url : null);
          setReady(true);
        }
      } catch {
        if (!cancelled) {
          setResolved(null);
          setReady(true);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [tid]);

  useEffect(() => {
    setImgFailed(false);
  }, [resolved]);

  if (!ready) {
    return (
      <Skeleton
        className={cn("shrink-0 rounded-lg", className)}
        style={{ width: size, height: size }}
        aria-hidden
      />
    );
  }

  if (resolved && !imgFailed) {
    return (
      <img
        src={resolved}
        alt=""
        width={size}
        height={size}
        className={cn(
          "shrink-0 rounded-lg object-contain bg-muted/30 dark:bg-muted/20",
          className,
        )}
        onError={() => setImgFailed(true)}
      />
    );
  }

  return <GCLogo size={size} className={className} />;
}
