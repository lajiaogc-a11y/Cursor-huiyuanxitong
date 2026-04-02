/**
 * Providers — 将 App 级 Context Provider 嵌套集中到一个组件，
 * 减少 App.tsx 的缩进层级，便于阅读和维护。
 * 行为与之前完全一致，仅做结构提取。
 *
 * 注意：LanguageProvider 放在 AppRouter 内以便根据路径区分会员端（固定英文）与员工端（可切换）。
 * TenantViewProvider / SharedDataTenantProvider 保留在 App.tsx 中，
 * 因为 Sonner / UpdatePrompt 等工具组件原本位于它们之外。
 */
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { queryClient } from "@/lib/queryClient";
import { ThemeProvider } from "@/contexts/ThemeContext";
import { LanguageProvider } from "@/contexts/LanguageContext";
import { LayoutProvider } from "@/contexts/LayoutContext";
import { AuthProvider } from "@/contexts/AuthContext";
import { MemberAuthProvider } from "@/contexts/MemberAuthContext";
import { RealtimeProvider } from "@/contexts/RealtimeContext";
import { AppRouter } from "@/components/AppRouter";

export function Providers({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <AppRouter>
          <LanguageProvider>
            <LayoutProvider>
              <AuthProvider>
                <MemberAuthProvider>
                  <RealtimeProvider>
                    {children}
                  </RealtimeProvider>
                </MemberAuthProvider>
              </AuthProvider>
            </LayoutProvider>
          </LanguageProvider>
        </AppRouter>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
