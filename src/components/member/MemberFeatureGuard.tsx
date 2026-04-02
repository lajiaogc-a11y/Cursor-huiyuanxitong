import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { ROUTES } from "@/routes/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import "@/styles/member-portal.css";

interface Props {
  featureKey: "enable_spin" | "enable_invite";
  children: ReactNode;
}

export function MemberFeatureGuard({ featureKey, children }: Props) {
  const { t } = useLanguage();
  const { member } = useMemberAuth();
  const { settings, loading } = useMemberPortalSettings(member?.id);

  if (loading) {
    return (
      <div
        className="member-feature-guard-skeleton px-4 py-5"
        aria-busy="true"
        aria-label={t("加载中…", "Loading…")}
      >
        <div className="member-skeleton--dark mb-4 h-36 rounded-2xl" aria-hidden />
        <div className="member-skeleton mb-3 h-4 w-[32%] max-w-[140px] rounded-md" aria-hidden />
        <div className="member-skeleton mb-3 h-3 w-[55%] max-w-[220px] rounded-md" aria-hidden />
        <div className="member-skeleton h-28 rounded-2xl" aria-hidden />
      </div>
    );
  }

  if (!settings[featureKey]) {
    return <Navigate to={ROUTES.MEMBER.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
