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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useIsTablet } from "@/hooks/use-mobile";
import { supabase } from "@/integrations/supabase/client";
import { useUnreadCount } from "@/hooks/useKnowledge";
import { usePendingAuditCount } from "@/hooks/usePendingAuditCount";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import { GCLogo } from "@/components/GCLogo";
import { Skeleton } from "@/components/ui/skeleton";

interface NavConfig {
  id: string;
  nav_key: string;
  display_text_zh: string;
  display_text_en: string;
  is_visible: boolean;
  sort_order: number;
}

interface MenuItem {
  icon: typeof LayoutDashboard;
  labelZh: string;
  labelEn: string;
  path: string;
  navKey: string;
  children?: { labelZh: string; labelEn: string; path: string; sectionLabel?: string }[];
  badgeType?: 'unread' | 'pending';
}

// 所有菜单项配置 - navKey 对应 navigation_config 表中的 nav_key
// 排序：数据统计 汇率计算 订单管理 会员管理 商家结算 公司文档 报表管理 工作任务 商家管理 审核中心 员工管理 操作日志 登录日志 系统设置
const allMenuItems: MenuItem[] = [
  { icon: LayoutDashboard, labelZh: "数据统计", labelEn: "Statistics", path: "/", navKey: "dashboard" },
  { icon: Calculator, labelZh: "汇率计算", labelEn: "Exchange Rate", path: "/exchange-rate", navKey: "exchange_rate" },
  { icon: ClipboardList, labelZh: "订单管理", labelEn: "Orders", path: "/orders", navKey: "orders" },
  {
    icon: Star,
    labelZh: "会员管理",
    labelEn: "Members",
    path: "/members",
    navKey: "members",
    children: [
      { labelZh: "会员数据", labelEn: "Member Data", path: "/members?tab=members" },
      { labelZh: "活动数据", labelEn: "Activity Data", path: "/members?tab=activity" },
      { labelZh: "活动赠送", labelEn: "Activity Gifts", path: "/members?tab=gifts" },
      { labelZh: "积分明细", labelEn: "Points Ledger", path: "/members?tab=points" },
    ],
  },
  { icon: Landmark, labelZh: "商家结算", labelEn: "Settlement", path: "/merchant-settlement", navKey: "merchant_settlement" },
  { icon: BookOpen, labelZh: "公司文档", labelEn: "Company Docs", path: "/knowledge", navKey: "knowledge_base", badgeType: "unread" as const },
  { icon: BarChart3, labelZh: "报表管理", labelEn: "Reports", path: "/reports", navKey: "reports" },
  {
    icon: ListTodo,
    labelZh: "工作任务",
    labelEn: "Tasks",
    path: "/tasks/settings",
    navKey: "work_tasks",
    children: [
      { labelZh: "维护设置", labelEn: "Settings", path: "/tasks/settings" },
      { labelZh: "维护历史", labelEn: "History", path: "/tasks/history" },
      { labelZh: "动态任务", labelEn: "Post Tasks", path: "/tasks/posters" },
      { labelZh: "提取设置", labelEn: "Extract Settings", path: "/tasks/phone-extract" },
    ],
  },
  {
    icon: Store,
    labelZh: "商家管理",
    labelEn: "Merchants",
    path: "/merchants",
    navKey: "merchant_management",
    children: [
      { labelZh: "卡片管理", labelEn: "Cards", path: "/merchants?tab=cards" },
      { labelZh: "卡商管理", labelEn: "Vendors", path: "/merchants?tab=vendors" },
      { labelZh: "代付商家", labelEn: "Payment Providers", path: "/merchants?tab=payment-providers" },
    ],
  },
  { icon: Shield, labelZh: "审核中心", labelEn: "Audit", path: "/audit-center", navKey: "audit_center", badgeType: "pending" as const },
  { icon: UserCog, labelZh: "员工管理", labelEn: "Employees", path: "/employees", navKey: "employees" },
  { icon: History, labelZh: "操作日志", labelEn: "Logs", path: "/operation-logs", navKey: "operation_logs" },
  { icon: LogIn, labelZh: "登录日志", labelEn: "Login Logs", path: "/login-logs", navKey: "login_logs" },
  {
    icon: Settings,
    labelZh: "系统设置",
    labelEn: "Settings",
    path: "/settings",
    navKey: "system_settings",
    children: [
      { labelZh: "手续费设置", labelEn: "Fee", path: "/settings?tab=fee", sectionLabel: "业务配置" },
      { labelZh: "汇率设置", labelEn: "Exchange", path: "/settings?tab=exchange" },
      { labelZh: "币种设置", labelEn: "Currency", path: "/settings?tab=currency" },
      { labelZh: "积分设置", labelEn: "Points", path: "/settings?tab=points", sectionLabel: "会员配置" },
      { labelZh: "活动设置", labelEn: "Activity", path: "/settings?tab=activity" },
      { labelZh: "活动类型", labelEn: "Activity Type", path: "/settings?tab=activityType" },
      { labelZh: "活动分配", labelEn: "Gift Distribution", path: "/settings?tab=giftDistribution" },
      { labelZh: "客户来源", labelEn: "Customer Source", path: "/settings?tab=source" },
      { labelZh: "数据管理", labelEn: "Data", path: "/settings?tab=data", sectionLabel: "系统管理" },
      { labelZh: "复制设置", labelEn: "Copy", path: "/settings?tab=copy" },
      { labelZh: "权限设置", labelEn: "Permissions", path: "/settings?tab=permission" },
      { labelZh: "API管理", labelEn: "API", path: "/settings?tab=api" },
    ],
  },
  { icon: Building2, labelZh: "租户管理", labelEn: "Tenant Management", path: "/company-management", navKey: "platform_tenant_management" },
  { icon: Users, labelZh: "租户数据查看", labelEn: "View Tenant Data", path: "/platform-tenant-view", navKey: "platform_tenant_view" },
  { icon: SlidersHorizontal, labelZh: "平台设置", labelEn: "Platform Settings", path: "/platform-settings", navKey: "platform_settings" },
];

interface NavPermission {
  field_name: string;
  can_view: boolean;
}

export function Sidebar() {
  const isTablet = useIsTablet();
  const { tabletSidebarOpen, setTabletSidebarOpen, navScrollTop, setNavScrollTop } = useLayout();
  const [collapsed, setCollapsed] = useState(false);
  const [expandedMenus, setExpandedMenus] = useState<Set<string>>(new Set());
  const [navPermissions, setNavPermissions] = useState<NavPermission[]>([]);
  const [navConfigs, setNavConfigs] = useState<NavConfig[]>([]);
  const [permissionsLoaded, setPermissionsLoaded] = useState(false);
  const location = useLocation();
  const { employee } = useAuth();
  const { isViewingTenant } = useTenantView() || {};
  const { language } = useLanguage();
  const { unreadCount } = useUnreadCount();
  const { pendingCount } = usePendingAuditCount();
  const navRef = useRef<HTMLElement | null>(null);

  // 在组件挂载或路由/权限加载完成后，恢复上一次的滚动位置
  useEffect(() => {
    if (navRef.current && navScrollTop > 0) {
      navRef.current.scrollTop = navScrollTop;
    }
  }, [navScrollTop, permissionsLoaded]);

  // Close tablet sidebar on route change
  useEffect(() => {
    if (isTablet) {
      setTabletSidebarOpen(false);
    }
  }, [location.pathname]);

  // 进入对应路径时自动展开下拉菜单
  useEffect(() => {
    setExpandedMenus((prev) => {
      const next = new Set(prev);
      if (location.pathname.startsWith("/tasks")) next.add("工作任务");
      if (location.pathname === "/members") next.add("会员管理");
      if (location.pathname === "/merchants") next.add("商家管理");
      if (location.pathname === "/settings") next.add("系统设置");
      return next;
    });
  }, [location.pathname]);

  // 加载导航配置和权限 - 实时从数据库读取，禁止缓存
  useEffect(() => {
    const fetchData = async () => {
      if (!employee?.role) {
        return;
      }
      
      try {
        const { data: configData, error: configError } = await supabase
          .from("navigation_config")
          .select("*")
          .order("sort_order");
        
        if (configError) {
          console.error("Error fetching nav config:", configError);
        }
        
        if (configData) {
          setNavConfigs(configData);
        }

        if (employee.role === 'admin') {
          setPermissionsLoaded(true);
          return;
        }

        const { data: permData, error: permError } = await supabase
          .from("role_permissions")
          .select("field_name, can_view")
          .eq("module_name", "navigation")
          .eq("role", employee.role);

        if (permError) {
          console.error("Error fetching nav permissions:", permError);
        }

        setNavPermissions(permData || []);
      } catch (err) {
        console.error("Error fetching nav data:", err);
      } finally {
        setPermissionsLoaded(true);
      }
    };

    setPermissionsLoaded(false);
    fetchData();
    
    const permChannel = supabase
      .channel('sidebar-permissions-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'role_permissions' }, () => {
        fetchData();
      })
      .subscribe();
    
    const navChannel = supabase
      .channel('sidebar-nav-config-sync')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'navigation_config' }, () => {
        fetchData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(permChannel);
      supabase.removeChannel(navChannel);
    };
  }, [employee?.role, employee?.id]);

  const getMenuLabel = (item: MenuItem) => {
    if (item.navKey === "work_tasks") {
      return language === "zh" ? "工作任务" : "Tasks";
    }
    if (item.navKey === "dashboard") {
      return language === "zh" ? "数据统计" : "Statistics";
    }
    if (item.navKey === "knowledge_base") {
      return language === "zh" ? "公司文档" : "Company Docs";
    }
    if (item.navKey === "platform_tenant_management") {
      return language === "zh" ? "租户管理" : "Tenant Management";
    }
    if (item.navKey === "platform_tenant_view") {
      return language === "zh" ? "租户数据查看" : "View Tenant Data";
    }
    if (item.navKey === "platform_settings") {
      return language === "zh" ? "平台设置" : "Platform Settings";
    }
    const config = navConfigs.find(c => c.nav_key === item.navKey);
    if (config) {
      return language === 'zh' ? config.display_text_zh : config.display_text_en;
    }
    return language === 'zh' ? item.labelZh : item.labelEn;
  };

  const platformOnlyNavKeys = ["platform_tenant_management", "platform_tenant_view", "platform_settings"];

  const menuItems = allMenuItems.filter(item => {
    // 平台总管理员：独立后台导航（租户管理、租户数据查看、平台设置）
    // 查看租户时显示租户菜单，否则仅显示平台专属三项
    if (employee?.is_platform_super_admin) {
      if (isViewingTenant) {
        return !platformOnlyNavKeys.includes(item.navKey); // 查看租户时显示租户菜单，隐藏平台专属
      }
      return platformOnlyNavKeys.includes(item.navKey); // 平台后台：仅显示 3 项
    }

    // 租户用户：永不显示平台专属功能
    if (platformOnlyNavKeys.includes(item.navKey)) {
      return false;
    }

    const navConfig = navConfigs.find(c => c.nav_key === item.navKey);
    
    if (navConfig && !navConfig.is_visible) {
      return false;
    }
    
    if (employee?.role === 'admin') {
      return true;
    }

    if (!permissionsLoaded) {
      return false;
    }

    const permission = navPermissions.find(p => p.field_name === item.navKey);
    
    if (!permission) {
      return navConfig?.is_visible === true;
    }

    return permission.can_view;
  });

  const toggleMenu = (label: string) => {
    const newExpanded = new Set(expandedMenus);
    if (newExpanded.has(label)) {
      newExpanded.delete(label);
    } else {
      newExpanded.add(label);
    }
    setExpandedMenus(newExpanded);
  };

  // Shared nav item renderer
  const renderNavItem = (item: MenuItem, isOverlay = false) => {
    const hasChildren = item.children && item.children.length > 0;
    const isExpanded = expandedMenus.has(item.labelZh);
    const fullPath = location.pathname + (location.search || "");
    const isActive = location.pathname === item.path || 
      (hasChildren && item.children?.some(c => fullPath === c.path));
    const isChildActive = hasChildren && item.children?.some(c => fullPath === c.path);
    const menuLabel = getMenuLabel(item);
    const showLabel = isOverlay || !collapsed;

    if (hasChildren && showLabel) {
      return (
        <li key={item.path}>
          <button
            onClick={() => toggleMenu(item.labelZh)}
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
                  if (pathTab === "permission" || pathTab === "api") return employee?.role === "admin";
                  return true;
                })
                ?.map((child) => {
                const isSubActive = fullPath === child.path;
                const childLabel = language === 'zh' ? child.labelZh : child.labelEn;
                const sectionLabel = language === 'zh' ? child.sectionLabel : undefined;
                return (
                  <li key={child.path}>
                    {sectionLabel && (
                      <div className="px-3 pt-2 pb-0.5 text-[10px] font-semibold text-sidebar-foreground/40 uppercase tracking-wider select-none">
                        {sectionLabel}
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

  // Tablet: overlay sidebar
  if (isTablet) {
    return (
      <>
        {/* Backdrop */}
        {tabletSidebarOpen && (
          <div 
            className="fixed inset-0 z-40 bg-black/50 transition-opacity"
            onClick={() => setTabletSidebarOpen(false)} 
          />
        )}
        {/* Sliding sidebar */}
        <aside role="navigation" aria-label="Main navigation" className={cn(
          "fixed left-0 top-0 z-50 h-screen w-64 bg-sidebar text-sidebar-foreground flex flex-col border-r border-sidebar-border shadow-xl transition-transform duration-300",
          tabletSidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}>
          {/* Header */}
          <div className="h-14 flex items-center justify-between border-b border-sidebar-border px-4">
            <div className="flex items-center gap-2.5">
              <GCLogo size={32} />
              <h1 className="font-bold text-base tracking-tight whitespace-nowrap">
                {language === 'zh' ? 'GC会员系统' : 'GC Member System'}
              </h1>
            </div>
            <button 
              onClick={() => setTabletSidebarOpen(false)}
              aria-label="Close sidebar"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Navigation */}
        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto py-4"
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
                {menuItems.map(item => renderNavItem(item, true))}
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
          "h-screen bg-sidebar text-sidebar-foreground flex flex-col transition-all duration-300 border-r border-sidebar-border",
          collapsed ? "w-16" : "w-52"
        )}
      >
        {/* Logo */}
        <div className="h-14 flex items-center justify-center border-b border-sidebar-border gap-2.5 px-3">
          <GCLogo size={32} />
          {!collapsed && (
            <h1 className="font-bold text-base tracking-tight whitespace-nowrap">
              {language === 'zh' ? 'GC会员系统' : 'GC Member System'}
            </h1>
          )}
        </div>

        {/* Navigation */}
        <nav
          ref={navRef}
          className="flex-1 overflow-y-auto overflow-x-visible py-4"
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
              {menuItems.map(item => renderNavItem(item))}
            </ul>
          )}
        </nav>

        {/* Collapse Button */}
        <button
          onClick={() => setCollapsed(!collapsed)}
          aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          className="h-12 flex items-center justify-center border-t border-sidebar-border hover:bg-sidebar-accent/80 transition-all duration-150"
        >
          <ChevronLeft
            className={cn("h-5 w-5 transition-transform duration-200", collapsed && "rotate-180")}
          />
        </button>
      </aside>
    </TooltipProvider>
  );
}
