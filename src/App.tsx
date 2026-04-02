import { Suspense } from "react";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { Routes, Route, Navigate } from "react-router-dom";
import { Providers } from "@/components/Providers";
import { TenantViewProvider } from "@/contexts/TenantViewContext";
import { SharedDataTenantProvider } from "@/contexts/SharedDataTenantContext";
import { UpdatePrompt } from "@/components/UpdatePrompt";
import { TopProgressBar } from "@/components/TopProgressBar";
import { SpaNavigationBridge } from "@/components/SpaNavigationBridge";
import { SpaLayoutStability } from "@/components/SpaLayoutStability";
import { LocalizedErrorBoundary } from "@/components/ErrorBoundary";
import { ROUTES, LEGACY_STAFF_REDIRECTS } from "@/routes/constants";
import { SITE_MODE, showMemberPortal, showStaffPortal } from "@/routes/siteMode";
import {
  LegacyAdminSettingsTabRedirect,
  LegacyRedirect,
  MemberLayoutRoute,
  StaffLayoutRoute,
  StaffPlatformLayoutRoute,
} from "@/routes/RedirectRoutes";
import {
  commonPublicRoutes,
  memberProtectedRoutes,
  memberPublicRoutes,
  staffCoreRoutes,
  staffExtendedRoutes,
  staffPublicRoutes,
} from "@/routes/memberStaffRouteConfig";
import { CompanyManagement, NotFound, PlatformSettingsPage, PlatformTenantView } from "@/routes/lazyPages";
import MemberPortalNotFound from "@/pages/member/MemberPortalNotFound";
import { CrossPortalHardRedirect } from "@/components/CrossPortalHardRedirect";
const App = () => (
  <div className="app-root-shell">
  <Providers>
    <Sonner />
    <UpdatePrompt />
    <SpaNavigationBridge />
    <SpaLayoutStability />
    <TenantViewProvider>
      <SharedDataTenantProvider>
        <LocalizedErrorBoundary>
          <Suspense fallback={<TopProgressBar />}>
            <Routes>
              {showMemberPortal &&
                memberPublicRoutes.map((item) => (
                  <Route key={item.path} path={item.path} element={item.element} />
                ))}
              {showMemberPortal && (
                <Route element={<MemberLayoutRoute />}>
                  {memberProtectedRoutes.map((item) => (
                    <Route key={item.path} path={item.path} element={item.element} />
                  ))}
                  <Route path="/member/*" element={<MemberPortalNotFound />} />
                </Route>
              )}

              {showStaffPortal &&
                staffPublicRoutes.map((item) => (
                  <Route key={item.path} path={item.path} element={item.element} />
                ))}

              {commonPublicRoutes.map((item) => (
                <Route key={item.path} path={item.path} element={item.element} />
              ))}

              {showStaffPortal && (
                <Route element={<StaffLayoutRoute />}>
                  {staffCoreRoutes.map((item) => (
                    <Route key={item.path} path={item.path} element={item.element} />
                  ))}
                  {staffExtendedRoutes.map((item) => (
                    <Route key={item.path} path={item.path} element={item.element} />
                  ))}
                </Route>
              )}

              {showStaffPortal && (
                <Route element={<StaffPlatformLayoutRoute />}>
                  <Route path={ROUTES.STAFF.ADMIN_ROOT} element={<Navigate to={ROUTES.STAFF.ADMIN_TENANTS} replace />} />
                  <Route path={ROUTES.STAFF.ADMIN_TENANTS} element={<CompanyManagement />} />
                  <Route path={ROUTES.STAFF.ADMIN_TENANT_VIEW} element={<PlatformTenantView />} />
                  <Route path={ROUTES.STAFF.ADMIN_SETTINGS} element={<Navigate to={ROUTES.STAFF.ADMIN_SETTINGS_DEFAULT} replace />} />
                  <Route path={ROUTES.STAFF.ADMIN_SETTINGS_TAB} element={<PlatformSettingsPage />} />
                </Route>
              )}

              {showStaffPortal &&
                LEGACY_STAFF_REDIRECTS.map((item) => (
                  <Route key={item.from} path={item.from} element={<LegacyRedirect to={item.to} />} />
                ))}
              {showStaffPortal && <Route path="/admin/settings/:tab" element={<LegacyAdminSettingsTabRedirect />} />}

              {SITE_MODE === "staff" && <Route path="/" element={<Navigate to="/staff/login" replace />} />}

              {showMemberPortal && !showStaffPortal && (
                <Route path="/staff/*" element={<CrossPortalHardRedirect portal="staff" />} />
              )}
              {showStaffPortal && !showMemberPortal && (
                <>
                  <Route path="/member/*" element={<CrossPortalHardRedirect portal="member" />} />
                  <Route path="/invite" element={<CrossPortalHardRedirect portal="member" />} />
                  <Route path="/invite/*" element={<CrossPortalHardRedirect portal="member" />} />
                </>
              )}

              <Route path={ROUTES.NOT_FOUND} element={<NotFound />} />
              <Route path="*" element={<Navigate to={ROUTES.NOT_FOUND} replace />} />
            </Routes>
          </Suspense>
        </LocalizedErrorBoundary>
      </SharedDataTenantProvider>
    </TenantViewProvider>
  </Providers>
  </div>
);

export default App;
