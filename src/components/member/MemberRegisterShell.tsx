import { type CSSProperties, type ReactNode } from "react";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import "@/styles/member-portal.css";

interface MemberRegisterShellProps {
  themeColor: string;
  children: ReactNode;
}

export function MemberRegisterShell({ themeColor, children }: MemberRegisterShellProps) {
  const portalRootStyle: CSSProperties = {
    ...memberPortalGoldCssVarsFromHex(themeColor),
    "--m-theme": themeColor,
  } as CSSProperties;

  return (
    <div
      className="member-login-premium-root member-portal-wrap relative flex min-h-dvh flex-col overflow-x-hidden overflow-y-auto"
      style={{
        background: "hsl(var(--pu-m-bg-1))",
        color: "hsl(var(--pu-m-text))",
        ...portalRootStyle,
      }}
    >
      <MemberPageAmbientOrbs />
      {children}
    </div>
  );
}
