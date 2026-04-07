import { useLocation, useNavigate } from "react-router-dom";
import { Home, Gift, Star, Users, Settings } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import { stashPointsHashBeforeInviteNavigation } from "@/lib/memberPortalInviteReturn";
import { cn } from "@/lib/utils";
import { preloadMemberRouteChunk } from "@/lib/memberRouteChunkPreload";
import "@/styles/member-portal.css";

function hapticNavTap() {
  if (!navigator.vibrate) return;
  try {
    if (typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    navigator.vibrate(8);
  } catch {
    /* noop */
  }
}

/** 对齐 premium-ui-boost-main `MemberBottomNav.tsx`：深底模糊顶栏 + 激活项顶部金蓝光条与图标强调 */
const navItems = [
  { path: ROUTES.MEMBER.DASHBOARD, icon: Home, zh: "首页", en: "Home" },
  { path: ROUTES.MEMBER.POINTS, icon: Gift, zh: "商城", en: "Mall" },
  { path: ROUTES.MEMBER.SPIN, icon: Star, zh: "抽奖", en: "Spin" },
  { path: ROUTES.MEMBER.INVITE, icon: Users, zh: "邀请", en: "Invite" },
  { path: ROUTES.MEMBER.SETTINGS, icon: Settings, zh: "设置", en: "Settings" },
] as const;

const _memberNavPrefetchedPaths = new Set<string>();

function prefetchMemberNavPath(path: string) {
  if (_memberNavPrefetchedPaths.has(path)) return;
  _memberNavPrefetchedPaths.add(path);
  void preloadMemberRouteChunk(path);
}

export function MemberBottomNav() {
  const location = useLocation();
  const navigate = useNavigate();
  const { member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  const { t } = useLanguage();
  const [pendingPath, setPendingPath] = useState<string | null>(null);

  useEffect(() => {
    if (pendingPath) setPendingPath(null);
  }, [location.pathname]);

  const filteredItems = navItems.filter((item) => {
    if (item.path === ROUTES.MEMBER.SPIN) return settings.enable_spin;
    if (item.path === ROUTES.MEMBER.INVITE) return settings.enable_invite;
    return true;
  });

  const handleNav = useCallback(
    (e: React.MouseEvent<HTMLAnchorElement>, path: string) => {
      e.preventDefault();
      hapticNavTap();
      if (location.pathname === path) return;
      setPendingPath(path);
      prefetchMemberNavPath(path);
      if (path === ROUTES.MEMBER.INVITE) {
        stashPointsHashBeforeInviteNavigation(location.pathname, location.hash);
      }
      navigate(path);
    },
    [location.pathname, location.hash, navigate],
  );

  return (
    <nav
      className="member-bottom-nav member-bottom-nav--pu-boost"
      aria-label={t("会员导航", "Member navigation")}
    >
      <div className="mx-auto flex h-16 max-w-lg items-center justify-around px-2">
        {filteredItems.map((item) => {
          const isActive = (pendingPath ?? location.pathname) === item.path;
          const Icon = item.icon;
          const label = t(item.zh, item.en);
          return (
            <a
              key={item.path}
              href={item.path}
              aria-current={isActive ? "page" : undefined}
              onClick={(e) => handleNav(e, item.path)}
              onPointerEnter={() => prefetchMemberNavPath(item.path)}
              onFocus={() => prefetchMemberNavPath(item.path)}
              onTouchStart={() => prefetchMemberNavPath(item.path)}
              className={cn(
                "relative flex flex-col items-center gap-0.5 rounded-xl px-3 py-1.5 transition-[color,transform,opacity] duration-180 motion-reduce:transition-none",
                "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pu-gold-soft focus-visible:ring-offset-2 focus-visible:ring-offset-[hsl(220_22%_5%)]",
                isActive ? "text-[hsl(var(--pu-m-text))]" : "text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text)/0.7)]",
              )}
            >
              {isActive ? (
                <span
                  className="absolute -top-1 left-1/2 h-1 w-5 -translate-x-1/2 rounded-full bg-gradient-to-r from-pu-gold to-pu-gold-soft shadow-[0_0_12px_2px_hsl(var(--pu-gold)/0.5)] motion-reduce:animate-none animate-[member-nav-glow-pu_2s_ease-in-out_infinite]"
                  aria-hidden
                />
              ) : null}
              <Icon
                className={cn(
                  "h-5 w-5 transition-[color,transform,filter] duration-180 motion-reduce:transition-none",
                  isActive &&
                    "scale-110 text-pu-gold-soft drop-shadow-[0_0_10px_hsl(var(--pu-gold)/0.6)] motion-reduce:scale-100 motion-reduce:drop-shadow-none",
                )}
                strokeWidth={isActive ? 2.2 : 1.5}
                aria-hidden
              />
              <span
                className={cn(
                  "text-[10px] font-bold tracking-wide transition-[color,opacity] duration-180 motion-reduce:transition-none",
                  isActive && "text-[hsl(var(--pu-gold-soft))]",
                )}
              >
                {label}
              </span>
            </a>
          );
        })}
      </div>
    </nav>
  );
}
