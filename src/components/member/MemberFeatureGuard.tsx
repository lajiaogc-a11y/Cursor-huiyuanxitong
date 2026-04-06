import type { ReactNode } from "react";
import { Navigate } from "react-router-dom";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { ROUTES } from "@/routes/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { MemberRouteSuspenseFallback } from "@/components/member/MemberRouteSuspenseFallback";
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
      <div aria-busy="true" aria-label={t("加载中…", "Loading…")}>
        <MemberRouteSuspenseFallback />
      </div>
    );
  }

  if (!settings[featureKey]) {
    return <Navigate to={ROUTES.MEMBER.DASHBOARD} replace />;
  }

  return <>{children}</>;
}
