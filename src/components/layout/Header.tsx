import { useState } from "react";
import { useNavigate, useLocation, useSearchParams } from "react-router-dom";
import { Globe, User, LogOut, Settings, Sun, Moon, Maximize2, Minimize2, Menu, Monitor, Smartphone } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useIsTablet } from "@/hooks/use-mobile";
import { updateEmployee, ROLE_LABELS, getRoleLabel } from "@/stores/employeeStore";
import PerformanceDashboard from "@/components/PerformanceDashboard";
import { NotificationCenter } from "@/components/NotificationCenter";
import { GlobalSearch } from "@/components/GlobalSearch";

// 路由到页面标题的映射
const PAGE_TITLES: Record<string, { zh: string; en: string }> = {
  "/": { zh: "数据统计", en: "Statistics" },
  "/exchange-rate": { zh: "汇率计算", en: "Exchange Rate" },
  "/orders": { zh: "订单管理", en: "Order Management" },
  "/reports": { zh: "报表管理", en: "Report Management" },
  "/activity-reports": { zh: "会员管理", en: "Member Management" },
  "/employees": { zh: "员工管理", en: "Employee Management" },
  "/merchant-settlement": { zh: "商家结算", en: "Merchant Settlement" },
  "/merchants": { zh: "商家管理", en: "Merchant Management" },
  "/settings": { zh: "系统设置", en: "System Settings" },
  "/audit-center": { zh: "审核中心", en: "Audit Center" },
  "/operation-logs": { zh: "操作日志", en: "Operation Logs" },
  "/knowledge": { zh: "公司文档", en: "Company Docs" },
  "/company-management": { zh: "租户管理", en: "Tenant Management" },
  "/platform-tenant-view": { zh: "租户数据查看", en: "View Tenant Data" },
  "/platform-settings": { zh: "平台设置", en: "Platform Settings" },
  "/member-management": { zh: "会员管理", en: "Member Management" },
  "/member-activity": { zh: "会员活动数据", en: "Member Activity Data" },
  "/login-logs": { zh: "登录日志", en: "Login Logs" },
  "/tasks/dashboard": { zh: "任务看板", en: "Task Dashboard" },
  "/tasks/settings": { zh: "维护设置", en: "Maintenance Settings" },
  "/tasks/history": { zh: "维护历史", en: "Maintenance History" },
  "/tasks/posters": { zh: "发动态", en: "Posters" },
  "/tasks/phone-extract": { zh: "提取设置", en: "Extract Settings" },
};

// 带 tab 的页面：根据 tab 显示子页面标题（不显示父级如「会员管理」「商家管理」）
const TAB_PAGE_TITLES: Record<string, Record<string, { zh: string; en: string }>> = {
  "/activity-reports": {
    members: { zh: "会员数据", en: "Member Data" },
    activity: { zh: "活动数据", en: "Activity Data" },
    gifts: { zh: "活动赠送", en: "Activity Gifts" },
    points: { zh: "积分明细", en: "Points Ledger" },
  },
  "/merchants": {
    cards: { zh: "卡片管理", en: "Cards" },
    vendors: { zh: "卡商管理", en: "Vendors" },
    "payment-providers": { zh: "代付商家", en: "Payment Providers" },
  },
  "/settings": {
    fee: { zh: "手续费设置", en: "Fee" },
    exchange: { zh: "汇率设置", en: "Exchange" },
    currency: { zh: "币种设置", en: "Currency" },
    points: { zh: "积分设置", en: "Points" },
    activity: { zh: "活动设置", en: "Activity" },
    activityType: { zh: "活动类型", en: "Activity Type" },
    giftDistribution: { zh: "活动分配", en: "Gift Distribution" },
    source: { zh: "客户来源", en: "Customer Source" },
    data: { zh: "数据管理", en: "Data" },
    copy: { zh: "复制设置", en: "Copy" },
    permission: { zh: "权限设置", en: "Permissions" },
    api: { zh: "API管理", en: "API" },
  },
};

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { language, setLanguage, t } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { employee, signOut, isAdmin, updateEmployeeLocal } = useAuth();
  const { layoutMode, toggleLayoutMode, toggleTabletSidebar, forceDesktopLayout, toggleForceDesktopLayout } = useLayout();
  const isTablet = useIsTablet();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);
  
  // Settings form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const getPageTitle = () => {
    const tabTitles = TAB_PAGE_TITLES[location.pathname];
    const tab = searchParams.get("tab") || "";
    const defaultTab: Record<string, string> = {
      "/activity-reports": "members",
      "/merchants": "cards",
      "/settings": "fee",
    };
    const effectiveTab = tab || defaultTab[location.pathname] || "";
    if (tabTitles && effectiveTab && tabTitles[effectiveTab]) {
      const cfg = tabTitles[effectiveTab];
      return language === "zh" ? cfg.zh : cfg.en;
    }
    const pageConfig = PAGE_TITLES[location.pathname];
    if (pageConfig) {
      return language === "zh" ? pageConfig.zh : pageConfig.en;
    }
    return language === "zh" ? "GC会员系统" : "GC Member System";
  };

  const handleLogout = async () => {
    await signOut();
    setShowLogoutDialog(false);
    toast.success(t("已退出登录", "Logged out successfully"));
    navigate('/login');
  };

  const handleOpenSettings = () => {
    if (employee) {
      setNewName(employee.real_name);
    }
    setNewPassword("");
    setConfirmPassword("");
    setShowSettingsDialog(true);
  };

  const handleSaveSettings = async () => {
    if (!newName.trim()) {
      toast.error(t("姓名不能为空", "Name cannot be empty"));
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      toast.error(t("两次输入的密码不一致", "Passwords do not match"));
      return;
    }

    if (!employee) return;

    setSaving(true);

    const updates: { real_name?: string; password?: string } = {};
    
    if (isAdmin && newName !== employee.real_name) {
      updates.real_name = newName;
    }
    
    if (newPassword) {
      updates.password = newPassword;
    }

    if (Object.keys(updates).length > 0) {
      const result = await updateEmployee(employee.id, updates);
      if (!result.success) {
        toast.error(result.message || t("保存失败", "Save failed"));
        setSaving(false);
        return;
      }

      if (result.data) {
        updateEmployeeLocal({
          id: result.data.id,
          username: result.data.username,
          real_name: result.data.real_name,
          role: result.data.role,
          status: result.data.status,
        });
      }
    }

    setSaving(false);
    setShowSettingsDialog(false);
    toast.success(t("设置已保存", "Settings saved"));
  };

  const toggleLanguage = () => {
    setLanguage(language === 'zh' ? 'en' : 'zh');
  };

  const getRoleBadge = () => {
    if (!employee) return null;
    const roleLabel = getRoleLabel(employee.role, language as 'zh' | 'en');
    const variant = employee.role === 'admin' ? 'destructive' : 
                   employee.role === 'manager' ? 'default' : 'secondary';
    return <Badge variant={variant} className="ml-2">{roleLabel}</Badge>;
  };

  return (
    <>
      <header className={cn(
        "h-14 bg-card border-b border-border flex items-center justify-between",
        "dark:bg-card dark:border-border dark:shadow-none",
        isTablet ? "px-3" : "px-6"
      )}>
        <div className="flex items-center gap-2">
          {/* Hamburger menu for tablet sidebar */}
          {isTablet && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-10 w-10 p-0 hover:bg-accent" 
              onClick={toggleTabletSidebar}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="font-semibold text-foreground text-lg tracking-tight truncate">
            {getPageTitle()}
          </div>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Performance Dashboard - only visible in dev mode */}
          {import.meta.env.DEV && <PerformanceDashboard />}
          
          {/* 布局模式切换按钮 - hide on tablet */}
          {!isTablet && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-9 w-9 p-0 hover:bg-accent" 
              onClick={toggleLayoutMode}
              title={layoutMode === 'fullWidth' 
                ? t('切换居中模式', 'Switch to Centered') 
                : t('切换全屏模式', 'Switch to Full Width')}
            >
              {layoutMode === 'fullWidth' ? (
                <Minimize2 className="h-4 w-4 text-muted-foreground" />
              ) : (
                <Maximize2 className="h-4 w-4 text-muted-foreground" />
              )}
            </Button>
          )}
          
          {/* 主题切换按钮 */}
          <Button
            variant="ghost" 
            size="sm" 
            className="h-9 w-9 p-0 hover:bg-accent" 
            onClick={toggleTheme}
            title={theme === 'light' ? t('切换深色模式', 'Switch to Dark Mode') : t('切换浅色模式', 'Switch to Light Mode')}
          >
            {theme === 'light' ? (
              <Moon className="h-4 w-4 text-muted-foreground" />
            ) : (
              <Sun className="h-4 w-4 text-amber-400/90" />
            )}
          </Button>
          
          {/* 全局搜索 */}
          <GlobalSearch />

          {/* 通知中心 */}
          <NotificationCenter />

          {/* 语言切换 - compact on tablet */}
          <Button variant="ghost" size="sm" className={cn("h-9", isTablet ? "w-9 p-0" : "gap-2")} onClick={toggleLanguage}>
            <Globe className="h-4 w-4" />
            {!isTablet && <span className="font-medium">{language === 'zh' ? '中' : 'EN'}</span>}
          </Button>
          
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("gap-2 h-9", isTablet ? "pl-1 pr-2" : "pl-2 pr-3")}>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                {!isTablet && (
                  <span className="flex items-center font-medium">
                    {employee?.real_name || t("未登录", "Not logged in")}
                    {getRoleBadge()}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover w-52 shadow-lg">
              <div className="px-3 py-2 text-sm text-muted-foreground border-b border-border">
                {t("账号", "Account")}: <span className="font-medium text-foreground">{employee?.username}</span>
              </div>
              {typeof __BUILD_TIME__ !== "undefined" && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground/80">
                  {t("构建", "Build")}: {__BUILD_TIME__}
                </div>
              )}
              <div className="p-1">
                {forceDesktopLayout && (
                  <DropdownMenuItem onClick={toggleForceDesktopLayout} className="cursor-pointer py-2.5">
                    <Smartphone className="mr-2 h-4 w-4" />
                    {t("切换回自适应布局", "Switch to Responsive Layout")}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleOpenSettings} className="cursor-pointer py-2.5">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("个人设置", "Settings")}
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="text-destructive cursor-pointer py-2.5 focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("退出登录", "Logout")}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>

      {/* Logout Confirmation Dialog */}
      <AlertDialog open={showLogoutDialog} onOpenChange={setShowLogoutDialog}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认退出", "Confirm Logout")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t("您确定要退出登录吗？", "Are you sure you want to logout?")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogout}>{t("确定", "Confirm")}</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Personal Settings Dialog */}
      <Dialog open={showSettingsDialog} onOpenChange={setShowSettingsDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("个人设置", "Personal Settings")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("用户名", "Username")}</Label>
              <Input 
                value={employee?.username || ""} 
                disabled 
                className="bg-muted"
              />
            </div>
            <div className="space-y-2">
              <Label>{t("姓名", "Name")}</Label>
              <Input 
                value={newName} 
                onChange={(e) => setNewName(e.target.value)}
                placeholder={t("请输入姓名", "Enter name")}
                disabled={!isAdmin}
              />
              {!isAdmin && (
                <p className="text-xs text-muted-foreground">
                  {t("只有管理员可以修改姓名", "Only admin can modify name")}
                </p>
              )}
            </div>
            <div className="space-y-2">
              <Label>{t("新密码", "New Password")}</Label>
              <Input 
                type="password"
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("留空则不修改密码", "Leave empty to keep current")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("确认密码", "Confirm Password")}</Label>
              <Input 
                type="password"
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("再次输入新密码", "Re-enter new password")}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

