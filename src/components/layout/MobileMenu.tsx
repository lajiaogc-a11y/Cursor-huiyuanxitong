import { useNavigate, useLocation } from "react-router-dom";
import { useMemo } from "react";
import { useNavigationVisibility } from "@/hooks/useNavigationVisibility";
import { prefetchStaffMemberPortalPage, STAFF_MEMBER_PORTAL_PATH } from "@/lib/prefetchStaffMemberPortalPage";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
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
  BookOpen,
  ListTodo,
  LogOut,
  Moon,
  Sun,
  ChevronRight,
  Monitor,
  Gift,
  List,
  Activity,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useUnreadCount } from "@/hooks/useKnowledge";
import { usePendingAuditCount } from "@/hooks/usePendingAuditCount";
import { canonicalStaffMembersNavPath } from "@/lib/staffMembersNav";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

interface MobileMenuItem {
  icon: typeof Calculator;
  labelZh: string;
  labelEn: string;
  path: string;
  badge?: 'unread' | 'pending';
}

interface MenuGroup {
  titleZh: string;
  titleEn: string;
  items: MobileMenuItem[];
}

const tenantMenuGroups: MenuGroup[] = [
  {
    titleZh: "常用功能",
    titleEn: "Frequently Used",
    items: [
      { icon: LayoutDashboard, labelZh: "数据统计", labelEn: "Statistics", path: "/staff" },
      { icon: Calculator, labelZh: "汇率计算", labelEn: "Exchange Rate", path: "/staff/exchange-rate" },
      { icon: ClipboardList, labelZh: "订单管理", labelEn: "Orders", path: "/staff/orders" },
      { icon: Star, labelZh: "会员数据", labelEn: "Member Data", path: "/staff/members?tab=members" },
      { icon: Activity, labelZh: "活动数据", labelEn: "Activity Data", path: "/staff/members?tab=activity" },
      { icon: Gift, labelZh: "活动赠送", labelEn: "Activity Gifts", path: "/staff/members?tab=gifts" },
      { icon: List, labelZh: "积分明细", labelEn: "Points Ledger", path: "/staff/members?tab=points" },
      { icon: Building2, labelZh: "商家结算", labelEn: "Settlement", path: "/staff/merchant-settlement" },
    ],
  },
  {
    titleZh: "业务管理",
    titleEn: "Business",
    items: [
      { icon: BarChart3, labelZh: "报表管理", labelEn: "Reports", path: "/staff/reports" },
      { icon: Store, labelZh: "商家管理", labelEn: "Merchants", path: "/staff/merchants" },
      { icon: Shield, labelZh: "审核中心", labelEn: "Audit", path: "/staff/audit-center", badge: "pending" },
      { icon: BookOpen, labelZh: "公司文档", labelEn: "Company Docs", path: "/staff/knowledge", badge: "unread" },
      { icon: ListTodo, labelZh: "工作任务", labelEn: "Tasks", path: "/staff/tasks/settings" },
    ],
  },
  {
    titleZh: "系统设置",
    titleEn: "System",
    items: [
      { icon: UserCog, labelZh: "员工管理", labelEn: "Employees", path: "/staff/employees" },
      { icon: Monitor, labelZh: "会员系统", labelEn: "Member Portal", path: "/staff/member-portal" },
      { icon: History, labelZh: "操作日志", labelEn: "Logs", path: "/staff/operation-logs" },
      { icon: LogIn, labelZh: "登录日志", labelEn: "Login Logs", path: "/staff/login-logs" },
      { icon: Settings, labelZh: "系统设置", labelEn: "Settings", path: "/staff/settings" },
    ],
  },
];

function isMenuPathActive(itemPath: string, pathname: string, search: string): boolean {
  if (itemPath.startsWith("/staff/members")) {
    const canonical = canonicalStaffMembersNavPath(pathname, search);
    return canonical === itemPath;
  }
  const [itemPathname, itemSearch] = itemPath.split('?');
  if (itemPathname === "/staff/member-portal") {
    return pathname === itemPathname || pathname.startsWith(`${itemPathname}/`);
  }
  if (!pathname.startsWith(itemPathname)) return false;
  if (itemPathname !== '/staff' && pathname !== itemPathname) return false;
  if (itemPathname === '/staff' && pathname !== '/staff') return false;
  if (itemSearch) {
    const itemParams = new URLSearchParams(itemSearch);
    const currentParams = new URLSearchParams(search);
    for (const [key, value] of itemParams.entries()) {
      if (currentParams.get(key) !== value) return false;
    }
  }
  return true;
}

/** 平台总管理员专用：放在抽屉最底部（语言/主题/退出之上），不与业务菜单混排滚动 */
const platformBottomNavItems: MobileMenuItem[] = [
  { icon: Building2, labelZh: "租户管理", labelEn: "Tenant Management", path: "/staff/admin/tenants" },
  { icon: Users, labelZh: "租户数据查看", labelEn: "View Tenant Data", path: "/staff/admin/tenant-view" },
  { icon: Settings, labelZh: "平台设置", labelEn: "Platform Settings", path: "/staff/admin/settings" },
];

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { employee, signOut } = useAuth();
  const { isViewingTenant } = useTenantView() || {};
  const { t, language, toggleLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { unreadCount } = useUnreadCount();
  const { pendingCount } = usePendingAuditCount();
  const { isPathVisible, loaded: navPermLoaded } = useNavigationVisibility();
  const navigate = useNavigate();
  const location = useLocation();

  const handleNavigate = (path: string) => {
    navigate(path);
    onClose();
  };

  const handleLogout = async () => {
    await signOut();
    onClose();
  };

  const menuGroups = useMemo(() => {
    const raw = tenantMenuGroups;
    if (!employee?.is_platform_super_admin) {
      return raw
        .map((g) => ({
          ...g,
          items: g.items.filter((item) => {
            if (!navPermLoaded) return true;
            return isPathVisible(item.path);
          }),
        }))
        .filter((g) => g.items.length > 0);
    }
    return raw;
  }, [employee?.is_platform_super_admin, navPermLoaded, isPathVisible]);

  const getBadgeCount = (badge?: 'unread' | 'pending') => {
    if (badge === 'unread') return unreadCount;
    if (badge === 'pending') return pendingCount;
    return 0;
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent
        side="right"
        overlayClassName="z-[1100]"
        className="z-[1100] w-[min(300px,100vw)] max-w-[100vw] h-full max-h-[100dvh] p-0 flex flex-col"
      >
        <SheetHeader className="shrink-0 px-4 pt-4 pb-3 border-b pr-12">
          <div className="flex items-center gap-3">
            <Avatar className="h-11 w-11">
              <AvatarFallback className="bg-primary text-primary-foreground text-base font-semibold">
                {employee?.real_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left text-sm truncate">
                {employee?.real_name || t("用户", "User")}
              </SheetTitle>
              <p className="text-xs text-muted-foreground truncate mt-0.5">
                {employee?.username}
              </p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1 min-h-0">
          <div className="py-2">
            {menuGroups.map((group, groupIdx) => (
              <div key={group.titleEn}>
                {groupIdx > 0 && <Separator className="my-1.5 mx-3" />}
                <div className="px-4 pt-2 pb-1">
                  <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                    {t(group.titleZh, group.titleEn)}
                  </span>
                </div>
                {group.items.map((item) => {
                  const Icon = item.icon;
                  const label = t(item.labelZh, item.labelEn);
                  const badgeCount = getBadgeCount(item.badge);
                  const isActive = isMenuPathActive(item.path, location.pathname, location.search);

                  return (
                    <button
                      key={item.path}
                      type="button"
                      onMouseEnter={item.path === STAFF_MEMBER_PORTAL_PATH ? prefetchStaffMemberPortalPage : undefined}
                      onClick={() => handleNavigate(item.path)}
                      className={cn(
                        "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                        isActive
                          ? "bg-primary/8 text-primary"
                          : "active:bg-muted/50"
                      )}
                    >
                      <Icon className={cn(
                        "h-[18px] w-[18px] shrink-0",
                        isActive ? "text-primary" : "text-muted-foreground"
                      )} />
                      <span className={cn(
                        "flex-1 text-sm",
                        isActive ? "font-semibold" : "font-normal"
                      )}>{label}</span>
                      {badgeCount > 0 && (
                        <span className={cn(
                          "h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full text-[10px] font-medium",
                          item.badge === 'unread' ? "bg-destructive text-destructive-foreground" : "bg-orange-500 text-white"
                        )}>
                          {badgeCount > 99 ? '99+' : badgeCount}
                        </span>
                      )}
                      <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                    </button>
                  );
                })}
              </div>
            ))}
          </div>
        </ScrollArea>

        {employee?.is_platform_super_admin ? (
          <div className="shrink-0 border-t border-border bg-background">
            <div className="px-4 pt-2 pb-1">
              <span className="text-[11px] font-medium text-muted-foreground uppercase tracking-wider">
                {t("平台管理", "Platform")}
              </span>
            </div>
            {platformBottomNavItems.map((item) => {
              const Icon = item.icon;
              const label = t(item.labelZh, item.labelEn);
              const isActive = isMenuPathActive(item.path, location.pathname, location.search);
              return (
                <button
                  key={item.path}
                  type="button"
                  onClick={() => handleNavigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-4 py-2.5 text-left transition-colors",
                    isActive ? "bg-primary/8 text-primary" : "active:bg-muted/50"
                  )}
                >
                  <Icon
                    className={cn(
                      "h-[18px] w-[18px] shrink-0",
                      isActive ? "text-primary" : "text-muted-foreground"
                    )}
                  />
                  <span className={cn("flex-1 text-sm", isActive ? "font-semibold" : "font-normal")}>{label}</span>
                  <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground/50" />
                </button>
              );
            })}
          </div>
        ) : null}

        <div className="shrink-0 p-3 pt-2 border-t border-border bg-background space-y-2 pb-[max(0.75rem,env(safe-area-inset-bottom,0px))]">
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-xs font-semibold tabular-nums"
              onClick={toggleLanguage}
              aria-label={language === "zh" ? t("切换为英文", "Switch to English") : t("切换为中文", "Switch to Chinese")}
            >
              {language === "zh" ? "EN" : "中"}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-9 text-xs"
              onClick={() => setTheme(theme === 'dark' ? 'light' : 'dark')}
            >
              {theme === 'dark' ? <Sun className="h-3.5 w-3.5 mr-1.5" /> : <Moon className="h-3.5 w-3.5 mr-1.5" />}
              {theme === 'dark' ? t("浅色", "Light") : t("深色", "Dark")}
            </Button>
          </div>

          <Button
            variant="destructive"
            size="sm"
            className="w-full h-10"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-1.5" />
            {t("退出登录", "Logout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
