import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ROUTES } from "@/routes/constants";
import { MEMBER_BOTTOM_TAB_PATHS } from "@/lib/memberBottomTabPaths";
import { MemberFeatureGuard } from "@/components/member/MemberFeatureGuard";
import {
  MemberDashboard,
  MemberInvite,
  MemberPoints,
  MemberSettings,
  MemberSpin,
} from "@/routes/lazyPages";
import { DashboardSkeleton, MemberPageSkeleton } from "@/components/member/MemberSkeleton";
import { cn } from "@/lib/utils";

function TabPanel({
  path,
  activePath,
  children,
}: {
  path: string;
  activePath: string;
  children: React.ReactNode;
}) {
  const show = path === activePath;
  const panelRef = useRef<HTMLDivElement | null>(null);

  useLayoutEffect(() => {
    if (show) return;
    const root = panelRef.current;
    const ae = document.activeElement;
    if (root && ae instanceof HTMLElement && root.contains(ae)) {
      ae.blur();
    }
  }, [show]);

  return (
    <div
      ref={panelRef}
      role="tabpanel"
      hidden={!show}
      className={cn(!show && "hidden")}
      inert={!show ? true : undefined}
    >
      {children}
    </div>
  );
}

/**
 * 底部 Tab 页 keep-alive：已访问过的路由对应页面保持挂载，切换时不销毁、不丢本地 state。
 * 数据层：组件不卸载则 React Query 等订阅保持；配合 PullToRefresh 的 Tab 间 scroll 记忆。
 */
export function MemberTabbedShell({ activePath }: { activePath: string }) {
  const [visited, setVisited] = useState(() => new Set<string>([activePath]));

  useEffect(() => {
    setVisited((prev) => {
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  return (
    <>
      {MEMBER_BOTTOM_TAB_PATHS.map((path) => {
        if (!visited.has(path)) return null;
        const fallback =
          path === ROUTES.MEMBER.DASHBOARD ? <DashboardSkeleton /> : <MemberPageSkeleton />;
        return (
          <TabPanel key={path} path={path} activePath={activePath}>
            <Suspense fallback={fallback}>
              {path === ROUTES.MEMBER.DASHBOARD ? <MemberDashboard /> : null}
              {path === ROUTES.MEMBER.POINTS ? <MemberPoints /> : null}
              {path === ROUTES.MEMBER.SPIN ? (
                <MemberFeatureGuard featureKey="enable_spin">
                  <MemberSpin />
                </MemberFeatureGuard>
              ) : null}
              {path === ROUTES.MEMBER.INVITE ? (
                <MemberFeatureGuard featureKey="enable_invite">
                  <MemberInvite />
                </MemberFeatureGuard>
              ) : null}
              {path === ROUTES.MEMBER.SETTINGS ? <MemberSettings /> : null}
            </Suspense>
          </TabPanel>
        );
      })}
    </>
  );
}
