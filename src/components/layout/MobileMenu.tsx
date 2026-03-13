import { useNavigate, useLocation } from "react-router-dom";
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
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useUnreadCount } from "@/hooks/useKnowledge";
import { usePendingAuditCount } from "@/hooks/usePendingAuditCount";

interface MobileMenuProps {
  open: boolean;
  onClose: () => void;
}

const tenantMenuItems = [
  { icon: Calculator, labelZh: "汇率计算", labelEn: "Exchange Rate", path: "/exchange-rate" },
  { icon: LayoutDashboard, labelZh: "数据统计", labelEn: "Statistics", path: "/" },
  { icon: ClipboardList, labelZh: "订单管理", labelEn: "Orders", path: "/orders" },
  { icon: Star, labelZh: "会员管理", labelEn: "Members", path: "/members" },
  { icon: Building2, labelZh: "商家结算", labelEn: "Settlement", path: "/merchant-settlement" },
  { icon: BookOpen, labelZh: "公司文档", labelEn: "Company Docs", path: "/knowledge", badge: "unread" },
  { icon: BarChart3, labelZh: "报表管理", labelEn: "Reports", path: "/reports" },
  { icon: ListTodo, labelZh: "工作任务", labelEn: "Tasks", path: "/tasks/settings" },
  { icon: Store, labelZh: "商家管理", labelEn: "Merchants", path: "/merchants" },
  { icon: Shield, labelZh: "审核中心", labelEn: "Audit", path: "/audit-center", badge: "pending" },
  { icon: UserCog, labelZh: "员工管理", labelEn: "Employees", path: "/employees" },
  { icon: History, labelZh: "操作日志", labelEn: "Logs", path: "/operation-logs" },
  { icon: LogIn, labelZh: "登录日志", labelEn: "Login Logs", path: "/login-logs" },
  { icon: Settings, labelZh: "系统设置", labelEn: "Settings", path: "/settings" },
];

const platformMenuItems = [
  { icon: Building2, labelZh: "租户管理", labelEn: "Tenant Management", path: "/company-management" },
  { icon: Users, labelZh: "租户数据查看", labelEn: "View Tenant Data", path: "/platform-tenant-view" },
  { icon: Settings, labelZh: "平台设置", labelEn: "Platform Settings", path: "/platform-settings" },
];

export function MobileMenu({ open, onClose }: MobileMenuProps) {
  const { employee, signOut } = useAuth();
  const { isViewingTenant } = useTenantView() || {};
  const { t, language, setLanguage } = useLanguage();
  const { theme, setTheme } = useTheme();
  const { unreadCount } = useUnreadCount();
  const { pendingCount } = usePendingAuditCount();
  const { toggleForceDesktopLayout } = useLayout();
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

  const toggleTheme = () => {
    setTheme(theme === 'dark' ? 'light' : 'dark');
  };

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  return (
    <Sheet open={open} onOpenChange={onClose}>
      <SheetContent side="right" className="w-[300px] p-0 flex flex-col">
        <SheetHeader className="p-4 border-b">
          <div className="flex items-center gap-3">
            <Avatar className="h-12 w-12">
              <AvatarFallback className="bg-primary text-primary-foreground text-lg font-semibold">
                {employee?.real_name?.charAt(0) || 'U'}
              </AvatarFallback>
            </Avatar>
            <div className="flex-1 min-w-0">
              <SheetTitle className="text-left text-base truncate">
                {employee?.real_name || t("用户", "User")}
              </SheetTitle>
              <p className="text-sm text-muted-foreground truncate">
                {employee?.username}
              </p>
            </div>
          </div>
        </SheetHeader>

        <ScrollArea className="flex-1">
          <div className="p-2">
            {((employee?.is_platform_super_admin && !isViewingTenant) ? platformMenuItems : tenantMenuItems)
              .map((item) => {
              const Icon = item.icon;
              const label = language === 'zh' ? item.labelZh : item.labelEn;
              const badgeCount = item.badge === 'unread' ? unreadCount : item.badge === 'pending' ? pendingCount : 0;
              const isActive = location.pathname === item.path;
              
              return (
                <button
                  key={item.path}
                  onClick={() => handleNavigate(item.path)}
                  className={cn(
                    "w-full flex items-center gap-3 px-3 py-3.5 rounded-lg text-left transition-all duration-200",
                    isActive
                      ? "bg-primary/10 text-primary"
                      : "hover:bg-muted/50 active:bg-muted"
                  )}
                >
                  <Icon className={cn(
                    "h-5 w-5 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} />
                  <span className={cn(
                    "flex-1",
                    isActive ? "font-semibold" : "font-medium"
                  )}>{label}</span>
                  {badgeCount > 0 && (
                    <span className={cn(
                      "h-5 min-w-5 px-1.5 flex items-center justify-center rounded-full text-xs font-medium",
                      item.badge === 'unread' ? "bg-destructive text-destructive-foreground" : "bg-warning text-warning-foreground"
                    )}>
                      {badgeCount > 99 ? '99+' : badgeCount}
                    </span>
                  )}
                  <ChevronRight className={cn(
                    "h-4 w-4 shrink-0",
                    isActive ? "text-primary" : "text-muted-foreground"
                  )} />
                </button>
              );
            })}
          </div>
        </ScrollArea>

        <div className="p-4 border-t space-y-2">
          {/* 使用电脑端布局 */}
          <Button
            variant="outline"
            size="sm"
            className="w-full h-11"
            onClick={toggleForceDesktopLayout}
          >
            <Monitor className="h-4 w-4 mr-2" />
            {t("使用电脑端布局", "Use Desktop Layout")}
          </Button>
          {/* Theme and Language toggles */}
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-11"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="h-4 w-4 mr-2" /> : <Moon className="h-4 w-4 mr-2" />}
              {theme === 'dark' ? t("浅色", "Light") : t("深色", "Dark")}
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="flex-1 h-11"
              onClick={toggleLanguage}
            >
              {language === 'zh' ? 'EN' : '中文'}
            </Button>
          </div>
          
          <Separator />
          
          {/* Logout button */}
          <Button
            variant="destructive"
            className="w-full h-12"
            onClick={handleLogout}
          >
            <LogOut className="h-4 w-4 mr-2" />
            {t("退出登录", "Logout")}
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}
