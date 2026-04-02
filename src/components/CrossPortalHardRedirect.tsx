import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";
import { memberPortalOrigin, staffPortalOrigin } from "@/lib/crossPortalNavigation";

type Props = {
  portal: "member" | "staff";
  /** 若省略，则使用当前 location（用于 /staff/* → 员工域 等兜底路由） */
  path?: string;
};

/**
 * 跨子域整页跳转（replace），避免会员域 SPA 内无 /staff 路由、员工域无 /member 路由导致 404。
 */
export function CrossPortalHardRedirect({ portal, path }: Props) {
  const location = useLocation();
  const { t } = useLanguage();
  const suffix = path ?? `${location.pathname}${location.search}${location.hash}`;

  useEffect(() => {
    const base = portal === "member" ? memberPortalOrigin() : staffPortalOrigin();
    if (!base) return;
    const p = suffix.startsWith("/") ? suffix : `/${suffix}`;
    window.location.replace(`${base}${p}`);
  }, [portal, suffix]);

  const toMember = portal === "member";

  return (
    <div
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-6"
      style={{
        background: toMember ? "#070B14" : "hsl(var(--background))",
      }}
    >
      <div
        className={`h-9 w-9 animate-spin rounded-full border-2 border-t-transparent ${
          toMember ? "border-[#4d8cff]" : "border-primary"
        }`}
        aria-hidden
      />
      <p className={`max-w-xs text-center text-sm ${toMember ? "text-[#94A3B8]" : "text-muted-foreground"}`}>
        {t("正在跳转到对应站点…", "Redirecting to the correct site…")}
      </p>
    </div>
  );
}
