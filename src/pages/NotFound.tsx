import { useEffect } from "react";
import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, ShieldAlert } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import { getSiteMode } from "@/routes/siteMode";
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";

const NotFound = () => {
  const location = useLocation();
  const { t } = useLanguage();
  const memberHost = getSiteMode() === "member";

  useEffect(() => {
    console.info("404: non-existent route:", location.pathname);
  }, [location.pathname]);

  if (memberHost) {
    return (
      <div className="member-portal-wrap m-page-bg relative flex min-h-dvh min-h-screen items-center justify-center overflow-hidden px-5 py-10">
        <MemberPageAmbientOrbs />
        <div className="member-portal-notfound-card relative z-[1] w-full max-w-[400px] rounded-2xl border px-8 py-10 text-center">
          <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.5)] text-[hsl(var(--pu-m-text-dim))]">
            <ShieldAlert className="h-7 w-7" strokeWidth={1.75} aria-hidden />
          </div>
          <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--pu-m-text-dim))]">
            {t("会员中心", "Portal")}
          </p>
          <h1 className="mb-2 bg-gradient-to-br from-pu-gold-soft via-pu-gold to-pu-gold-deep bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">
            404
          </h1>
          <p className="mb-1 text-base font-semibold text-[hsl(var(--pu-m-text))]">
            {t("页面未找到", "Page not found")}
          </p>
          <p className="mb-8 text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            {t("您访问的页面不存在或已移动。", "This page does not exist or has been moved.")}
          </p>
          <p className="mb-6 break-all font-mono text-[11px] text-[hsl(var(--pu-m-text-dim)/0.85)] opacity-90">
            {location.pathname}
          </p>
          <Link
            to={ROUTES.MEMBER.ROOT}
            className="member-portal-notfound-cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold tracking-wide no-underline transition-[transform,opacity] duration-150 motion-reduce:transition-none hover:opacity-95 active:scale-[0.98] motion-reduce:active:scale-100"
          >
            <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
            {t("返回首页", "Return to Home")}
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted">
      <div className="text-center">
        <h1 className="mb-4 text-4xl font-bold">404</h1>
        <p className="mb-4 text-xl text-muted-foreground">{t("页面未找到", "Oops! Page not found")}</p>
        <Link to="/" className="text-primary underline hover:text-primary/90">
          {t("返回首页", "Return to Home")}
        </Link>
      </div>
    </div>
  );
};

export default NotFound;
