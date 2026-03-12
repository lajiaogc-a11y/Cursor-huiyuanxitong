import { ReactNode } from "react";
import { MemberBottomNav } from "./MemberBottomNav";
import { ConfigProvider } from "antd";
import { ErrorBoundary } from "@/components/ErrorBoundary";

export function MemberLayout({ children }: { children: ReactNode }) {
  return (
    <ErrorBoundary>
      <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b", borderRadius: 12 } }}>
        <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
          <div className="pb-20">{children}</div>
          <MemberBottomNav />
        </div>
      </ConfigProvider>
    </ErrorBoundary>
  );
}
