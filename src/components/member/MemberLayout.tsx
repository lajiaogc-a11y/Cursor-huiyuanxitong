import { ReactNode } from "react";
import { MemberBottomNav } from "./MemberBottomNav";
import { ConfigProvider } from "antd";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";

export function MemberLayout({ children }: { children: ReactNode }) {
  const { member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  return (
    <ErrorBoundary>
      <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b", borderRadius: 12 } }}>
        <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
          <div className="pb-20">{children}</div>
          <MemberBottomNav />
        </div>
      </ConfigProvider>
    </ErrorBoundary>
  );
}
