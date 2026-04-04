import { useState, useEffect, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";
import {
  LayoutDashboard,
  Calculator,
  ClipboardList,
  BarChart3,
  Star,
  UserCog,
  Users,
  Building2,
  Store,
  Settings,
  Shield,
  History,
  LogIn,
  ChevronLeft,
  ChevronDown,
  BookOpen,
  X,
  ListTodo,
  Landmark,
  SlidersHorizontal,
  MonitorSmartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useIsLgUp } from "@/hooks/use-mobile";
import { useUnreadCount } from "@/hooks/useKnowledge";
import { usePendingAuditCount } from "@/hooks/usePendingAuditCount";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { StaffChromeLogo } from "@/components/layout/StaffChromeLogo";
import { Skeleton } from "@/components/ui/skeleton";
import { useNavigationVisibility } from "@/hooks/useNavigationVisibility";
import { prefetchStaffMemberPortalPage, STAFF_MEMBER_PORTAL_PATH } from "@/lib/prefetchStaffMemberPortalPage";
import { ROUTES } from "@/routes/constants";
import { useLanguage } from "@/contexts/LanguageContext";
import { canonicalStaffMembersNavPath } from "@/lib/staffMembersNav";

interface MenuItem {
  icon: typeof LayoutDashboard;
  labelZh: string;
  labelEn: string;
  path: string;
  navKey: string;
  children?: {
    labelZh: string;
    labelEn: string;
    path: string;
    /** 中文分组小标题（系统设置子项） */
    sectionLabel?: string;
    sectionLabelEn?: string;
  }[];
  badgeType?: 'unread' | 'pending';
}

// 侧栏文案以 labelZh/labelEn + 语言切换为准；可见性由权限（navigation 模块）与管理员规则决定
const allMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, labelZh: "数据统计", labelEn: "Dashboard", path: "/staff", navKey: "dashboard" },
  { icon: Calculator, labelZh: "汇率计算", labelEn: "Exchange Rate", path: "/staff/exchange-rate", navKey: "exchange_rate" },
  { icon: ClipboardList, labelZh: "订单管理", labelEn: "Orders", path: "/staff/orders", navKey: "orders" },
  {
    icon: Star,
    labelZh: "会员管理",
    labelEn: "Users",
    path: "/staff/members",
    navKey: "members",
    children: [
      { labelZh: "会员数据", labelEn: "User Data", path: "/staff/members?tab=members" },
      { labelZh: "活动数据", labelEn: "Activity Data", path: "/staff/members?tab=activity" },
      { labelZh: "活动赠送", labelEn: "Activity Gifts", path: "/staff/members?tab=gifts" },
      { labelZh: "积分明细", labelEn: "Points Ledger", path: "/staff/members?tab=points" },
    ],
  },
  { icon: Landmark, labelZh: "商家结算", labelEn: "Settlement", path: "/staff/merchant-settlement", navKey: "merchant_settlement" },
  { icon: BookOpen, labelZh: "公司文档", labelEn: "Company Docs", path: "/staff/knowledge", navKey: "knowledge_base", badgeType: "unread" as const },
  { icon: BarChart3, labelZh: "报表管理", labelEn: "Reports", path: "/staff/reports", navKey: "reports" },
  {
    icon: ListTodo,
    labelZh: "工作任务",
    labelEn: "Tasks",
    path: "/staff/tasks/settings",
    navKey: "work_tasks",
    children: [
      { labelZh: "维护设置", labelEn: "Settings", path: "/staff/tasks/settings" },
      { labelZh: "维护历史", labelEn: "History", path: "/staff/tasks/history" },
      { labelZh: "动态任务", labelEn: "Post Tasks", path: "/staff/tasks/posters" },
      { labelZh: "提取设置", labelEn: "Extract Settings", path: "/staff/tasks/phone-extract" },
    ],
  },
  {
    icon: Store,
    labelZh: "商家管理",
    labelEn: "Merchants",
    path: "/staff/merchants",
    navKey: "merchant_management",
    children: [
      { labelZh: "卡片管理", labelEn: "Cards", path: "/staff/merchants?tab=cards" },
      { labelZh: "卡商管理", labelEn: "Vendors", path: "/staff/merchants?tab=vendors" },
      { labelZh: "代付商家", labelEn: "Payment Providers", path: "/staff/merchants?tab=payment-providers" },
    ],
  },
  { icon: Shield, labelZh: "审核中心", labelEn: "Audit", path: "/staff/audit-center", navKey: "audit_center", badgeType: "pending" as const },
  { icon: UserCog, labelZh: "员工管理", labelEn: "Employees", path: "/staff/employees", navKey: "employees" },
  { icon: MonitorSmartphone, labelZh: "会员系统", labelEn: "Member Portal", path: "/staff/member-portal", navKey: "member_portal_settings" },
  { icon: History, labelZh: "操作日志", labelEn: "Logs", path: "/staff/operation-logs", navKey: "operation_logs" },
  { icon: LogIn, labelZh: "登录日志", labelEn: "Login Logs", path: "/staff/login-logs", navKey: "login_logs" },
  {
    icon: Settings,
    labelZh: "系统设置",
    labelEn: "Settings",
    path: "/staff/settings",
    navKey: "system_settings",
    children: [
      {
        labelZh: "手续费设置",
        labelEn: "Fee",
        path: "/staff/settings?tab=fee",
        sectionLabel: "业务配置",
        sectionLabelEn: "Business",
      },
      { labelZh: "汇率设置", labelEn: "Exchange", path: "/staff/settings?tab=exchange" },
      { labelZh: "币种设置", labelEn: "Currency", path: "/staff/settings?tab=currency" },
      {
        labelZh: "积分设置",
        labelEn: "Points",
        path: "/staff/settings?tab=points",
        sectionLabel: "会员配置",
        sectionLabelEn: "Membership",
      },
      { labelZh: "会员等级", labelEn: "User levels", path: "/staff/settings?tab=member-levels" },
      { labelZh: "活动设置", labelEn: "Activity", path: "/staff/settings?tab=activity" },
      { labelZh: "活动类型", labelEn: "Activity Type", path: "/staff/settings?tab=activityType" },
      { labelZh: "活动分配", labelEn: "Gift Distribution", path: "/staff/settings?tab=giftDistribution" },
      { labelZh: "客户来源", labelEn: "Customer Source", path: "/staff/settings?tab=source" },
      {
        labelZh: "数据管理",
        labelEn: "Data",
        path: "/staff/settings?tab=data",
        sectionLabel: "系统管理",
        sectionLabelEn: "System",
      },
      { labelZh: "复制设置", labelEn: "Copy", path: "/staff/settings?tab=copy" },
      { labelZh: "员工邀请码", labelEn: "Staff invite", path: "/staff/settings?tab=staff-invite" },
      { labelZh: "登录IP限制", labelEn: "Staff login IP", path: "/staff/settings?tab=staff-login-ip" },
      { labelZh: "后台登录设备", labelEn: "Staff login devices", path: "/staff/settings?tab=staff-devices" },
      { labelZh: "版本更新", labelEn: "Version update", path: "/staff/settings?tab=version-update" },
      { labelZh: "权限设置", labelEn: "Permissions", path: "/staff/settings?tab=permission" },
      { labelZh: "API管理", labelEn: "API", path: "/staff/settings?tab=api" },
      { labelZh: "设置总览", labelEn: "Overview", path: "/staff/settings?tab=overview" },
    ],
  },
  { icon: Building2, labelZh: "租户管理", labelEn: "Tenants", path: "/staff/admin/tenants", navKey: "platform_tenant_management" },
  { icon: Users, labelZh: "租户数据查看", labelEn: "View Tenant Data", path: "/staff/admin/tenant-view", navKey: "platform_tenant_view" },
  { icon: SlidersHorizontal, labelZh: "平台设置", labelEn: "Platform Settings", path: "/staff/admin/settings", navKey: "platform_settings" },
];

export function Sidebar() {
  const { t, language } = useLanguage();
  const isLgUp = useIsLgUp();
  /** 与 MainLayout 一致：<lg 使用叠层侧栏（含手机），避免常驻侧栏挤占主内容 */
  const overlaySidebar = !isLgUp;
  const { tabletSidebarOpen, setTabletSidebarOpen, navScrollTop, setNavScrollTop } = useLayout();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const { isNavKeyVisible, loaded: permissionsLoaded } = useNavigationVisibility();
  const location = useLocation();
  const { employee } = useAuth();
  const { unreadCount } = useUnreadCount();
  const { pendingCount } = usePendingAuditCount();
  const navRef = useRef<HTMLElement | null>(null);

  // 在组件挂载或路由/权限加载完成后，恢复上一次的滚动位置
  useEffect(() => {
    if (navRef.current && navScrollTop > 0) {
      navRef.current.scrollTop = navScrollTop;
    }
  }, [navScrollTop, permissionsLoaded]);

  // Close overlay sidebar on route change
  useEffect(() => {
    if (overlaySidebar) {
      setTabletSidebarOpen(false);
    }
  }, [location.pathname, overlaySidebar, setTabletSidebarOpen]);

  // 进入对应路径时自动展开下拉菜单（用 navKey，避免与界面语言耦合）
  useEffect(() => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (location.pathname.startsWith("/staff/tasks")) next.add("work_tasks");
      if (location.pathname === "/staff/members" || location.pathname === "/staff/member-management") {
        next.add("members");
      }
      if (location.pathname === "/staff/merchants") next.add("merchant_management");
      if (location.pathname === "/staff/settings") next.add("system_settings");
      return next;
    });
  }, [location.pathname]);

  const menuLabelFor = (item: MenuItem) => t(item.labelZh, item.labelEn);

  const platformOnlyNavKeys = ["platform_tenant_management", "platform_tenant_view", "platform_settings"];

  const menuItems = allMenuItems.filter((item) => {
    if (employee?.is_platform_super_admin) {
      return true;
    }
    if (platformOnlyNavKeys.includes(item.navKey)) {
      return false;
    }
    if (!permissionsLoaded) {
      return false;
    }
    return isNavKeyVisible(item.navKey);
  });

  const sidebarMenuItems = menuItems;

  const isPlatformRoute = platformOnlyNavKeys.some((k) =>
    menuItems.find((m) => m.navKey === k && location.pathname === m.path),
  );

  useEffect(() => {
    if (overlaySidebar && isPlatformRoute && navRef.current) {
      requestAnimationFrame(() => {
        navRef.current?.scrollTo({ top: navRef.current.scrollHeight, behavior: "smooth" });
      });
    }
  }, [overlaySidebar, isPlatformRoute]);

  const toggleMenu = (navKey: string) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(navKey)) {
      newExpanded.delete(navKey);
    } else {
      newExpanded.add(navKey);
    }
    setExpandedMenus(newExpanded);
  };

  // Shared nav item renderer
  const renderNavItem = (item: MenuItem, isOverlay = false) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.navKey);
    const fullPath = location.pathname + (location.search || "");
    const memberNavCanonical = canonicalStaffMembersNavPath(location.pathname, location.search || "");
    const isActive =
      (item.navKey === "members" && memberNavCanonical != null) ||
      location.pathname === item.path ||
      (item.path === ROUTES.STAFF.MEMBER_PORTAL && location.pathname.startsWith(`${ROUTES.STAFF.MEMBER_PORTAL}/`)) ||
      (hasChildren && item.children?.some((c) => fullPath === c.path));
    const isChildActive =
      hasChildren &&
      (item.navKey === "members" && memberNavCanonical
        ? item.children?.some((c) => memberNavCanonical === c.path) === true
        : item.children?.some((c) => fullPath === c.path) === true);
    const menuLabel = menuLabelFor(item);
    const showLabel = isOverlay || !collapsed;

    if (hasChildren && showLabel) {
      return (
        <li key={item.path}>
          <button
            onClick={() => toggleMenu(item.navKey)}
            className={cn(
              "w-full flex items-center justify-between px-3 rounded-md text-sm transition-colors",
              isOverlay ? "py-3" : "py-2.5",
              isChildActive
                ? "bg-sidebar-primary/15 text-sidebar-primary dark:bg-sidebar-accent/50 dark:text-sidebar-accent-foreground"
                : "hover:bg-sidebar-accent text-sidebar-foreground/80 hover:text-sidebar-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <item.icon className="h-5 w-5 flex-shrink-0" />
              <span>{menuLabel}</span>
            </div>
            <ChevronDown className={cn(
              "h-4 w-4 transition-transform",
              isExpanded && "rotate-180"
            )} />
          </button>
          {isExpanded && (
            <ul className="ml-4 mt-1 space-y-1">
              {item.children
                ?.filter((child) => {
                  if (item.navKey !== "system_settings") return true;
                  const pathTab = child.path.split("tab=")[1]?.split("&")[0];
                  if (pathTab === "permission" || pathTab === "api") {
                    return employee?.role === "admin";
                  }
                  if (pathTab === "staff-invite") {
                    return (
                      employee?.role === "admin" ||
                      !!employee?.is_super_admin ||
                      !!employee?.is_platform_super_admin
                    );
                  }
                  if (pathTab === "member-levels") {
                    return (
                      !!employee?.is_platform_super_admin || isNavKeyVisible("member_promotion")
                    );
                  }
                  return true;
                })
                ?.map((child) => {
                const isSubActive =
                  item.navKey === "members" && memberNavCanonical
                    ? memberNavCanonical === child.path
                    : fullPath === child.path;
                const childLabel = t(child.labelZh, child.labelEn);
                const sectionHeading = child.sectionLabel
                  ? t(child.sectionLabel, child.sectionLabelEn ?? child.sectionLabel)
                  : undefined;
                return (
                  <li key={child.path}>
                    {sectionHeading && (
                      <div
                        className={cn(
                          "px-3 pt-2 pb-0.5 text-[10px] font-semibold text-sidebar-foreground/40 tracking-wider select-none",
                          language === "en" && "uppercase",
                        )}
                      >
                        {sectionHeading}
                      </div>
                    )}
                    <NavLink
                      to={child.path}
                      className={cn(
                        "flex items-center gap-2 px-3 rounded-md text-sm transition-colors",
                        isOverlay ? "py-3" : "py-2",
                        isSubActive
                          ? "bg-sidebar-primary text-sidebar-primary-foreground dark:bg-sidebar-accent dark:text-sidebar-accent-foreground dark:border-l-[3px] dark:border-l-sidebar-primary dark:rounded-r-none"
                          : "hover:bg-sidebar-accent text-sidebar-foreground/70 hover:text-sidebar-foreground"
                      )}
                    >
                      <span className="w-1 h-1 rounded-full bg-current" />
                      <span>{childLabel}</span>
                    </NavLink>
                  </li>
                );
              })}
            </ul>
          )}
        </li>
      );
    }

    const linkContent = (
      <NavLink
        to={item.path}
        onMouseEnter={item.path === STAFF_MEMBER_PORTAL_PATH ? prefetchStaffMemberPortalPage : undefined}
        className={cn(
          "flex items-center gap-3 px-3 rounded-lg text-sm transition-all duration-150 relative",
          isOverlay ? "py-3" : "py-2.5",
          !showLabel && "justify-center px-0",
          isActive
            ? "bg-sidebar-primary text-sidebar-primary-foreground shadow-sm dark:shadow-none dark:bg-sidebar-accent dark:text-sidebar-accent-foreground dark:border-l-[3px] dark:border-l-sidebar-primary dark:rounded-r-none"
            : "hover:bg-sidebar-accent/80 text-sidebar-foreground/80 hover:text-sidebar-foreground"
        )}
      >
        <item.icon className="h-5 w-5 flex-shrink-0" />
        {showLabel && <span className="font-medium">{menuLabel}</span>}
        {item.badgeType === 'unread' && unreadCount > 0 && (
          <span className={cn(
            "z-10 h-5 min-w-5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-xs font-medium px-1",
            "absolute -top-1 -right-1"
          )}>
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
        {item.badgeType === 'pending' && pendingCount > 0 && (
          <span className={cn(
            "z-10 h-5 min-w-5 flex items-center justify-center rounded-full bg-amber-500 text-white text-xs font-medium px-1",
            "absolute -top-1 -right-1"
          )}>
            {pendingCount > 99 ? '99+' : pendingCount}
          </span>
        )}
      </NavLink>
    );

    // When collapsed (desktop only), wrap in tooltip
    if (!showLabel) {
      return (
        <li key={item.path}>
          <Tooltip delayDuration={0}>
            <TooltipTrigger asChild>
              {linkContent}
            </TooltipTrigger>
            <TooltipContent side="right" className="font-medium">
              {menuLabel}
            </TooltipContent>
          </Tooltip>
        </li>
      );
    }

    return <li key={item.path}>{linkContent}</li>;
  };

  // 窄视口：叠层侧栏（平板 + 手机）
  if (overlaySidebar) {
    return (
      <>
        {/* Backdrop */}
        <div
          className={cn(
            "fixed inset-0 z-40 bg-black/50 transition-opacity duration-200 ease-out",
            tabletSidebarOpen ? "opacity-100" : "pointer-events-none opacity-0",
          )}
          onClick={() => setTabletSidebarOpen(false)}
          aria-hidden={!tabletSidebarOpen}
        />
        {/* Sliding sidebar */}
        <aside role="navigation" aria-label="Main navigation" className={cn(
          "fixed left-0 top-0 z-50 h-[100dvh] max-h-[100dvh] w-64 bg-sidebar text-sidebar-foreground flex flex-col min-h-0 border-r border-sidebar-border shadow-xl will-change-transform transition-transform duration-200 ease-out",
          tabletSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Header */}
          <div className="h-14 shrink-0 flex items-center justify-between border-b border-sidebar-border px-4">
            <div className="flex items-center">
              <StaffChromeLogo size={32} />
            </div>
            <button 
              onClick={() => setTabletSidebarOpen(false)}
              aria-label={t("关闭菜单", "Close menu")}
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
        <nav
          ref={navRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden py-4 overscroll-y-contain"
          onScroll={(e) => setNavScrollTop(e.currentTarget.scrollTop)}
        >
            {!permissionsLoaded ? (
              <ul className="space-y-1 px-3">
                {[...Array(7)].map((_, i) => (
                  <li key={i} className="px-3 py-3">
                    <div className="flex items-center gap-3">
                      <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                      <Skeleton className="h-4 w-24 rounded" />
                    </div>
                  </li>
                ))}
              </ul>
            ) : (
              <ul className="space-y-1 px-3">
                {sidebarMenuItems.map((item) => renderNavItem(item, true))}
              </ul>
            )}
          </nav>
        </aside>
      </>
    );
  }

  // Desktop: permanent sidebar
  return (
    <TooltipProvider>
      <aside
        role="navigation"
        aria-label="Main navigation"
        className={cn(
          "h-screen max-h-[100dvh] min-h-0 bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 border-r border-sidebar-border",
          collapsed ? "w-16" : "w-52"
        )}
      >
        {/* Logo */}
        <div className="h-14 shrink-0 flex items-center justify-center border-b border-sidebar-border px-3">
          <StaffChromeLogo size={32} />
        </div>

        {/* Navigation */}
        <nav
          ref={navRef}
          className="min-h-0 flex-1 overflow-y-auto overflow-x-visible py-4 overscroll-y-contain"
          onScroll={(e) => setNavScrollTop(e.currentTarget.scrollTop)}
        >
          {!permissionsLoaded ? (
            <ul className="space-y-1 px-2">
              {[...Array(7)].map((_, i) => (
                <li key={i} className={cn("px-3 py-2.5", collapsed && "flex justify-center px-0")}>
                  <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-5 rounded flex-shrink-0" />
                    {!collapsed && <Skeleton className="h-4 w-20 rounded" />}
                  </div>
                </li>
              ))}
            </ul>
          ) : (
            <ul className="space-y-1 px-2">
              {sidebarMenuItems.map((item) => renderNavItem(item))}
            </ul>
          )}
        </nav>

        {/* Collapse Button */}
        <button
          type="button"
          onClick={() => setCollapsed(!collapsed)}
          aria-label={
            collapsed
              ? t("展开侧栏", "Expand sidebar")
              : t("收起侧栏", "Collapse sidebar")
          }
          className="h-12 shrink-0 flex items-center justify-center border-t border-sidebar-border hover:bg-sidebar-accent/80 transition-all duration-150"
        >
          <ChevronLeft
            className={cn("h-5 w-5 transition-transform duration-200", collapsed && "rotate-180")}
          />
        </button>
      </aside>
    </TooltipProvider>
  );
}
