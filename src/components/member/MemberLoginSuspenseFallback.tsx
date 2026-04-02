/**
 * 会员登录页 JS chunk 懒加载时的回退 UI：与 SplashScreen 一致（Logo + 底部进度条），
 * 避免仅顶部 NProgress 细条、无品牌感知。
 */
import { useLayoutEffect, useMemo, type CSSProperties } from "react";
import SplashScreen from "@/components/member/SplashScreen";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import {
  parseInviteFromWindowSearch,
  readMemberPortalSplashBootstrap,
} from "@/lib/memberPortalSplashCache";
import { preloadMemberPortalLogo } from "@/lib/memberPortalLogoPreload";
import { applyMemberPortalFaviconFromLogoRaw } from "@/lib/memberPortalFavicon";
import "@/styles/member-portal.css";

const DEFAULT_THEME = "#4d8cff";

export function MemberLoginSuspenseFallback() {
  useLayoutEffect(() => {
    document.documentElement.classList.add("member-html");
    if (typeof window !== "undefined") {
      const boot = readMemberPortalSplashBootstrap(parseInviteFromWindowSearch(window.location.search));
      const logo = boot?.logo_url;
      if (logo) void preloadMemberPortalLogo(logo);
      applyMemberPortalFaviconFromLogoRaw(logo);
    }
    return () => {
      document.documentElement.classList.remove("member-html");
    };
  }, []);

  const { brandName, accentHex, logoUrl, pendingBrand } = useMemo(() => {
    if (typeof window === "undefined") {
      return {
        brandName: "FastGC",
        accentHex: DEFAULT_THEME,
        logoUrl: null as string | null,
        pendingBrand: true,
      };
    }
    const boot = readMemberPortalSplashBootstrap(parseInviteFromWindowSearch(window.location.search));
    const accentRaw = String(boot?.theme_primary_color ?? "").trim();
    const accentHex = /^#[0-9A-Fa-f]{6}$/i.test(accentRaw) ? accentRaw : DEFAULT_THEME;
    const brandName = String(boot?.company_name ?? "").trim() || "FastGC";
    const logoUrl = boot?.logo_url ?? null;
    const pendingBrand = !String(logoUrl ?? "").trim();
    return { brandName, accentHex, logoUrl, pendingBrand };
  }, []);

  const shellStyle = {
    "--m-theme": accentHex,
    ...memberPortalGoldCssVarsFromHex(accentHex),
    background: "hsl(var(--pu-m-bg-1))",
    color: "hsl(var(--pu-m-text))",
  } as CSSProperties;

  return (
    <div className="member-login-premium-root relative min-h-dvh overflow-hidden" style={shellStyle}>
      <SplashScreen
        holdUntilUnmount
        brandName={brandName}
        accentColor={accentHex}
        logoUrl={logoUrl}
        pendingBrand={pendingBrand}
        duration={2400}
      />
    </div>
  );
}
