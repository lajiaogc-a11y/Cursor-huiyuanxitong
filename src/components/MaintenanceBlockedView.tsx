import { Button } from "@/components/ui/button";
import { LogOut, Wrench } from "lucide-react";
import { useLocation } from "react-router-dom";
import { useLanguage } from "@/contexts/LanguageContext";

interface MaintenanceBlockedViewProps {
  scope: "global" | "tenant";
  message?: string | null;
  onLogout?: () => void | Promise<void>;
}

function isMemberPortalPath(pathname: string) {
  return pathname.startsWith("/member") || pathname.startsWith("/invite");
}

export function MaintenanceBlockedView({ scope, message, onLogout }: MaintenanceBlockedViewProps) {
  const { t } = useLanguage();
  const { pathname } = useLocation();
  const memberSurface = isMemberPortalPath(pathname);

  const title =
    scope === "global"
      ? t("系统全站维护中", "System Maintenance")
      : t("当前租户维护中", "Tenant Maintenance");
  const description =
    message ||
    (scope === "global"
      ? t("平台正在进行全站维护，请稍后再试。", "The platform is under maintenance. Please try again later.")
      : t("当前租户正在维护中，请稍后再试。", "This tenant is under maintenance. Please try again later."));

  if (memberSurface) {
    return (
      <div className="flex min-h-dvh min-h-screen items-center justify-center bg-[#070B14] px-5 py-10">
        <div className="w-full max-w-[400px] rounded-2xl border border-white/[0.08] bg-[linear-gradient(168deg,rgba(17,24,39,0.95)_0%,rgba(7,11,20,0.98)_100%)] px-8 py-10 text-center shadow-[0_24px_64px_rgba(0,0,0,0.5),inset_0_1px_0_hsl(var(--pu-gold)/0.08)]">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-2xl border border-pu-gold/25 bg-pu-gold/[0.12]">
            <Wrench className="h-7 w-7 text-pu-gold-soft" strokeWidth={1.75} />
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.18em] text-[#94A3B8]">
            {t("会员中心", "Member")}
          </p>
          <h1 className="mb-3 text-xl font-bold tracking-tight text-[#F8FAFC]">{title}</h1>
          <p className="text-sm leading-relaxed text-[#94A3B8]">{description}</p>
          {onLogout ? (
            <Button
              type="button"
              onClick={onLogout}
              className="mt-8 h-11 w-full rounded-xl border border-white/15 bg-white/[0.06] text-[#F8FAFC] hover:bg-white/[0.1] hover:text-white"
              variant="outline"
            >
              <LogOut className="mr-2 h-4 w-4 opacity-80" />
              {t("返回登录", "Back to Login")}
            </Button>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-background">
      <div className="mx-4 flex max-w-lg flex-col items-center gap-4 text-center">
        <div className="flex h-14 w-14 items-center justify-center rounded-full bg-amber-500/10">
          <Wrench className="h-7 w-7 text-amber-500" />
        </div>
        <h1 className="text-xl font-bold text-foreground">{title}</h1>
        <p className="text-muted-foreground">{description}</p>
        {onLogout ? (
          <Button onClick={onLogout} variant="outline">
            <LogOut className="mr-2 h-4 w-4" />
            {t("返回登录", "Back to Login")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
