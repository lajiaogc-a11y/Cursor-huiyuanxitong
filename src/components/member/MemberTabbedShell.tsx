import { Suspense, useEffect, useLayoutEffect, useRef, useState } from "react";
import { ROUTES } from "@/routes/constants";
import { MemberFeatureGuard } from "@/components/member/MemberFeatureGuard";
import {
  MemberDashboard,
  MemberInvite,
  MemberPoints,
  MemberSettings,
  MemberSpin,
} from "@/routes/lazyPages";
import { MemberDeferredRouteSuspenseFallback } from "@/components/member/MemberRouteSuspenseFallback";
import { cn } from "@/lib/utils";

function TabPanel({
  path,
  activePath,
  mounted,
  children,
}: {
  path: string;
  activePath: string;
  mounted: boolean;
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
      aria-hidden={!show}
      className={cn(
        "member-tab-panel transition-[opacity,transform] member-motion-base motion-reduce:transition-none",
        show
          ? "relative z-[1] translate-y-0 opacity-100"
          : "pointer-events-none absolute inset-0 z-0 translate-y-1 opacity-0",
      )}
      inert={!show ? true : undefined}
      data-member-tab-panel={path}
    >
      {mounted ? children : null}
    </div>
  );
}

const suspenseFallback = <MemberDeferredRouteSuspenseFallback delayMs={120} />;

/**
 * 底部 Tab 区：五个面板**始终挂载**（keep-alive），切换仅切换 visibility，不销毁子树。
 * 单面板内不再使用 `{path===x ? <Page/> : null}`，避免延迟插入子组件。
 */
export function MemberTabbedShell({ activePath }: { activePath: string }) {
  const [mountedPaths, setMountedPaths] = useState<Set<string>>(() => new Set([activePath]));

  useEffect(() => {
    setMountedPaths((prev) => {
      if (prev.has(activePath)) return prev;
      const next = new Set(prev);
      next.add(activePath);
      return next;
    });
  }, [activePath]);

  return (
    <div className="relative min-h-[20vh]">
      <TabPanel
        path={ROUTES.MEMBER.DASHBOARD}
        activePath={activePath}
        mounted={mountedPaths.has(ROUTES.MEMBER.DASHBOARD)}
      >
        <Suspense fallback={suspenseFallback}>
          <MemberDashboard />
        </Suspense>
      </TabPanel>

      <TabPanel
        path={ROUTES.MEMBER.POINTS}
        activePath={activePath}
        mounted={mountedPaths.has(ROUTES.MEMBER.POINTS)}
      >
        <Suspense fallback={suspenseFallback}>
          <MemberPoints />
        </Suspense>
      </TabPanel>

      <TabPanel
        path={ROUTES.MEMBER.SPIN}
        activePath={activePath}
        mounted={mountedPaths.has(ROUTES.MEMBER.SPIN)}
      >
        <Suspense fallback={suspenseFallback}>
          <MemberFeatureGuard featureKey="enable_spin">
            <MemberSpin />
          </MemberFeatureGuard>
        </Suspense>
      </TabPanel>

      <TabPanel
        path={ROUTES.MEMBER.INVITE}
        activePath={activePath}
        mounted={mountedPaths.has(ROUTES.MEMBER.INVITE)}
      >
        <Suspense fallback={suspenseFallback}>
          <MemberFeatureGuard featureKey="enable_invite">
            <MemberInvite />
          </MemberFeatureGuard>
        </Suspense>
      </TabPanel>

      <TabPanel
        path={ROUTES.MEMBER.SETTINGS}
        activePath={activePath}
        mounted={mountedPaths.has(ROUTES.MEMBER.SETTINGS)}
      >
        <Suspense fallback={suspenseFallback}>
          <MemberSettings />
        </Suspense>
      </TabPanel>
    </div>
  );
}
