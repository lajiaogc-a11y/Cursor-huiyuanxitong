import { Link, useLocation } from "react-router-dom";
import { ArrowLeft, Compass } from "lucide-react";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";

/**
 * 未匹配的 /member/* 路径：保留底栏与画布，避免空白 Outlet。
 */
export default function MemberPortalNotFound() {
  const { pathname } = useLocation();
  const { t } = useLanguage();

  return (
    <div className="relative flex min-h-[min(70dvh,560px)] flex-col items-center justify-center overflow-hidden px-6 pb-8 pt-4 text-center">
      <MemberPageAmbientOrbs />
      <div className="member-portal-notfound-card relative z-[1] max-w-[340px] rounded-2xl border px-8 py-10">
        <div className="mx-auto mb-5 flex h-14 w-14 items-center justify-center rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.5)] text-[hsl(var(--pu-m-text-dim))]">
          <Compass className="h-7 w-7" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="mb-2 text-[11px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--pu-m-text-dim))]">
          {t("会员中心", "Portal")}
        </p>
        <h1 className="mb-2 bg-gradient-to-br from-pu-gold-soft via-pu-gold to-pu-gold-deep bg-clip-text text-5xl font-extrabold tracking-tight text-transparent">
          404
        </h1>
        <p className="mb-1 text-base font-semibold text-[hsl(var(--pu-m-text))]">
          {t("页面不存在", "Page not found")}
        </p>
        <p className="mb-8 text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
          {t("该链接可能已失效或输入有误。", "This link may be invalid or the URL may be wrong.")}
        </p>
        <p className="mb-3 break-all font-mono text-[11px] text-[hsl(var(--pu-m-text-dim)/0.85)] opacity-90">{pathname}</p>
        <Link
          to={ROUTES.MEMBER.DASHBOARD}
          className="member-portal-notfound-cta inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl text-[15px] font-bold tracking-wide no-underline transition-[transform,opacity] duration-150 motion-reduce:transition-none hover:opacity-95 active:scale-[0.98] motion-reduce:active:scale-100"
        >
          <ArrowLeft className="h-4 w-4 shrink-0" aria-hidden />
          {t("返回首页", "Back to Home")}
        </Link>
      </div>
    </div>
  );
}
