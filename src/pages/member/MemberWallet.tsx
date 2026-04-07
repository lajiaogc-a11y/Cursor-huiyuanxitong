/**
 * MemberWallet — temporarily disabled; shows a "coming soon" placeholder.
 * The original wallet implementation is preserved in git history.
 */
import { Wallet, Construction, ArrowLeft } from "lucide-react";
import BackHeader from "@/components/member/BackHeader";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { useLanguage } from "@/contexts/LanguageContext";
import { useNavigate } from "react-router-dom";
import { ROUTES } from "@/routes/constants";

export default function MemberWallet() {
  const { t } = useLanguage();
  const navigate = useNavigate();

  return (
    <div className="m-page-bg relative min-h-full">
      <BackHeader title={t("我的钱包", "My wallet")} />

      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />

        <div className="relative z-[1] flex flex-col items-center px-5 pb-6 pt-16 text-center">
          <div className="mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-pu-silver/20 to-pu-silver-soft/10 ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.15)]">
            <div className="relative">
              <Wallet
                className="h-9 w-9 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                strokeWidth={1.5}
                aria-hidden
              />
              <Construction
                className="absolute -bottom-1 -right-2 h-5 w-5 text-pu-gold-soft"
                strokeWidth={2}
                aria-hidden
              />
            </div>
          </div>

          <h1 className="mb-2 text-xl font-extrabold text-[hsl(var(--pu-m-text))]">
            {t("钱包功能维护中", "Wallet is under maintenance")}
          </h1>
          <p className="mb-8 max-w-[280px] text-sm leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            {t(
              "钱包功能正在升级，敬请期待。",
              "We're working on something great. This feature will be available soon.",
            )}
          </p>

          <button
            type="button"
            onClick={() => navigate(ROUTES.MEMBER.DASHBOARD)}
            className="inline-flex items-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.6)] px-5 py-2.5 text-sm font-bold text-[hsl(var(--pu-m-text))] member-transition-surface member-motion-fast hover:bg-[hsl(var(--pu-m-surface)/0.8)] active:scale-95"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden />
            {t("返回首页", "Back to home")}
          </button>
        </div>
      </div>
    </div>
  );
}
