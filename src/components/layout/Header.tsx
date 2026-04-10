import { useState, useEffect } from "react";
import { useNavigate, useLocation, useSearchParams, Link } from "react-router-dom";
import { User, LogOut, Settings, Sun, Moon, Maximize2, Minimize2, Menu, BookOpen, Download } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
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
import { DrawerDetail } from "@/components/shell/DrawerDetail";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";
import { useTheme } from "@/contexts/ThemeContext";
import { useAuth } from "@/contexts/AuthContext";
import { useLayout } from "@/contexts/LayoutContext";
import { useIsLgUp } from "@/hooks/ui/use-mobile";
import { useUnreadCount } from "@/hooks/staff/useKnowledge";
import { useTenantView } from "@/contexts/TenantViewContext";
import { getPlatformSettingsSubTabTitle } from "@/pages/platformSettingsTabConfig";
import { updateEmployee, ROLE_LABELS, getRoleLabel } from "@/services/employees/employeeCrudService";
import PerformanceDashboard from "@/components/PerformanceDashboard";
import { NotificationCenter } from "@/components/NotificationCenter";
import { GlobalSearch } from "@/components/GlobalSearch";

// 路由到页面标题的映射
const PAGE_TITLES: Record<string, { zh: string; en: string }> = {
  "/staff": { zh: "数据统计", en: "Dashboard" },
  "/staff/exchange-rate": { zh: "汇率计算", en: "Exchange Rate" },
  "/staff/orders": { zh: "订单管理", en: "Orders" },
  "/staff/reports": { zh: "报表管理", en: "Reports" },
  "/staff/members": { zh: "会员管理", en: "Users" },
  "/staff/employees": { zh: "员工管理", en: "Employees" },
  "/staff/merchant-settlement": { zh: "商家结算", en: "Settlement" },
  "/staff/merchants": { zh: "商家管理", en: "Merchants" },
  "/staff/settings": { zh: "系统设置", en: "Settings" },
  "/staff/audit-center": { zh: "审核中心", en: "Audit" },
  "/staff/operation-logs": { zh: "操作日志", en: "Logs" },
  "/staff/knowledge": { zh: "公司文档", en: "Company Docs" },
  "/staff/admin/tenants": { zh: "租户管理", en: "Tenants" },
  "/staff/admin/tenant-view": { zh: "租户数据查看", en: "Tenant Data" },
  "/staff/admin/settings": { zh: "平台设置", en: "Platform Settings" },
  "/staff/member-management": { zh: "会员管理", en: "Users" },
  "/staff/member-activity": { zh: "会员活动数据", en: "Activity Data" },
  "/staff/login-logs": { zh: "登录日志", en: "Login Logs" },
  "/staff/data-management": { zh: "数据管理", en: "Data Management" },
  "/staff/tasks/dashboard": { zh: "任务看板", en: "Task Dashboard" },
  "/staff/tasks/settings": { zh: "维护设置", en: "Maintenance" },
  "/staff/tasks/history": { zh: "维护历史", en: "History" },
  "/staff/tasks/posters": { zh: "发动态", en: "Posters" },
  "/staff/tasks/phone-extract": { zh: "提取设置", en: "Extract" },
  "/staff/member-portal": { zh: "会员系统", en: "Member Portal" },
  "/staff/customer-query": { zh: "客户查询", en: "Customer Query" },
  "/staff/pending": { zh: "待审批", en: "Pending Approval" },
  "/staff/activity-reports": { zh: "活动报表", en: "Activity Reports" },
};

// 带 tab 的页面：根据 tab 显示子页面标题（不显示父级如「会员管理」「商家管理」）
const TAB_PAGE_TITLES: Record<string, Record<string, { zh: string; en: string }>> = {
  "/staff/members": {
    members: { zh: "会员数据", en: "User Data" },
    activity: { zh: "活动数据", en: "Activity Data" },
    gifts: { zh: "活动赠送", en: "Activity Gifts" },
    points: { zh: "积分明细", en: "Points Ledger" },
  },
  "/staff/merchants": {
    cards: { zh: "卡片管理", en: "Cards" },
    vendors: { zh: "卡商管理", en: "Vendors" },
    "payment-providers": { zh: "代付商家", en: "Payment Providers" },
  },
  "/staff/settings": {
    fee: { zh: "手续费设置", en: "Fee" },
    exchange: { zh: "汇率设置", en: "Exchange" },
    currency: { zh: "币种设置", en: "Currency" },
    points: { zh: "积分设置", en: "Points" },
    activity: { zh: "活动设置", en: "Activity" },
    activityType: { zh: "活动类型", en: "Activity Type" },
    giftDistribution: { zh: "活动分配", en: "Gift Distribution" },
    source: { zh: "客户来源", en: "Customer Source" },
    copy: { zh: "复制设置", en: "Copy" },
    permission: { zh: "权限设置", en: "Permissions" },
    api: { zh: "API管理", en: "API" },
    overview: { zh: "设置总览", en: "Overview" },
    "staff-invite": { zh: "员工邀请码", en: "Staff invitation codes" },
    "member-levels": { zh: "会员等级", en: "User levels" },
    "staff-devices": { zh: "后台登录设备", en: "Staff login devices" },
    "staff-login-ip": { zh: "登录IP限制", en: "Login IP allowlist" },
    "version-update": { zh: "版本更新", en: "Version update" },
  },
  "/staff/operation-logs": {
    logs: { zh: "后台审计", en: "Backend audit" },
    errors: { zh: "前端异常", en: "Frontend errors" },
    member: { zh: "会员端日志", en: "Member activity" },
  },
  "/staff/login-logs": {
    staff: { zh: "员工端登录", en: "Staff sign-in" },
    member: { zh: "会员端登录", en: "Member sign-in" },
  },
};

export function Header() {
  const navigate = useNavigate();
  const location = useLocation();
  const [searchParams] = useSearchParams();
  const { t, language, toggleLanguage } = useLanguage();
  const { theme, toggleTheme } = useTheme();
  const { employee, signOut, isAdmin, updateEmployeeLocal } = useAuth();
  const { isViewingTenant } = useTenantView() || {};
  const { layoutMode, toggleLayoutMode, toggleTabletSidebar } = useLayout();
  const isLgUp = useIsLgUp();
  /** <1024px：紧凑顶栏 + 汉堡打开侧栏（含手机） */
  const compactChrome = !isLgUp;
  const { unreadCount: knowledgeUnreadTotal } = useUnreadCount();
  const [showLogoutDialog, setShowLogoutDialog] = useState(false);
  const [showSettingsDialog, setShowSettingsDialog] = useState(false);

  // PC 客户端下载链接（从后端 shared_data_store 加载）
  const [pcDownloadUrl, setPcDownloadUrl] = useState('');
  const [macDownloadUrl, setMacDownloadUrl] = useState('');
  useEffect(() => {
    import('@/api/staffData/sharedDataApi').then(({ getSharedDataApi }) => {
      getSharedDataApi<{ windows?: string; mac?: string }>('companionDownloadUrls').then(data => {
        if (data) {
          setPcDownloadUrl(data.windows ?? '');
          setMacDownloadUrl(data.mac ?? '');
        }
      });
    });
  }, []);

  // Settings form
  const [newName, setNewName] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);

  const getPageTitle = () => {
    if (location.pathname.startsWith("/staff/member-portal")) {
      return t("会员系统", "Member Portal");
    }
    const adminSub = location.pathname.match(/^\/staff\/admin\/settings\/([^/]+)/);
    if (adminSub) {
      const st = getPlatformSettingsSubTabTitle(adminSub[1]);
      if (st) return t(st.zh, st.en);
    }
    const tabTitles = TAB_PAGE_TITLES[location.pathname];
    const tab = searchParams.get("tab") || "";
    const defaultTab: Record<string, string> = {
      "/staff/members": "members",
      "/staff/merchants": "cards",
      "/staff/settings": "fee",
      "/staff/operation-logs": "logs",
      "/staff/login-logs": "staff",
    };
    const effectiveTab = tab || defaultTab[location.pathname] || "";
    if (tabTitles && effectiveTab && tabTitles[effectiveTab]) {
      const cfg = tabTitles[effectiveTab];
      return t(cfg.zh, cfg.en);
    }
    const pageConfig = PAGE_TITLES[location.pathname];
    if (pageConfig) {
      return t(pageConfig.zh, pageConfig.en);
    }
    return t("sidebar.systemTitle");
  };

  const handleLogout = async () => {
    await signOut();
    setShowLogoutDialog(false);
    notify.success(t("已退出登录", "Logged out successfully"));
    navigate('/staff/login');
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
      notify.error(t("姓名不能为空", "Name cannot be empty"));
      return;
    }

    if (newPassword && newPassword !== confirmPassword) {
      notify.error(t("两次输入的密码不一致", "Passwords do not match"));
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
        notify.error(result.message || t("保存失败", "Save failed"));
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
    notify.success(t("设置已保存", "Settings saved"));
  };

  const getRoleBadge = () => {
    if (!employee) return null;
    const roleLabel = getRoleLabel(employee.role, language);
    const variant = employee.role === 'admin' ? 'destructive' : 
                   employee.role === 'manager' ? 'default' : 'secondary';
    return <Badge variant={variant} className="ml-2">{roleLabel}</Badge>;
  };

  const getSystemBadge = () => {
    if (!employee) return null;

    // 平台总管理员在“查看租户”模式下，仍属于租户上下文
    // 平台总管理员：在 /staff/admin/* 或未查看租户时显示「平台后台」
    const isOnPlatformAdminPage = location.pathname.startsWith('/staff/admin');
    if (employee.is_platform_super_admin && (isOnPlatformAdminPage || !isViewingTenant)) {
      return (
        <Badge variant="outline" className="ml-2 border-violet-300 text-violet-700 dark:border-violet-700 dark:text-violet-300">
          {t("平台后台", "Platform")}
        </Badge>
      );
    }

    return (
      <Badge variant="outline" className="ml-2 border-border text-muted-foreground">
        {t("租户后台", "Tenant")}
      </Badge>
    );
  };

  return (
    <>
      <TooltipProvider delayDuration={400}>
      <header className={cn(
        "h-14 bg-card border-b border-border flex items-center justify-between",
        "dark:bg-card dark:border-border dark:shadow-none",
        compactChrome ? "px-2.5 sm:px-3" : "px-6"
      )}>
        <div className="flex items-center gap-2 min-w-0">
          {/* 窄视口：汉堡打开叠层侧栏 */}
          {compactChrome && (
            <Button 
              variant="ghost" 
              size="sm" 
              className="h-10 w-10 p-0 hover:bg-accent" 
              onClick={toggleTabletSidebar}
            >
              <Menu className="h-5 w-5" />
            </Button>
          )}
          <div className="font-semibold text-foreground text-base sm:text-lg tracking-tight truncate flex items-center min-w-0">
            {getPageTitle()}
            {!compactChrome && getSystemBadge()}
          </div>
          {/* 固定占位，避免无未读时图标消失导致标题区横向闪跳 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Link
                to="/staff/knowledge"
                className={cn(
                  "relative inline-flex items-center justify-center shrink-0 rounded-md border border-border/60 bg-muted/40 hover:bg-muted ml-2 h-9 w-9",
                  location.pathname.startsWith("/staff/knowledge") && "ring-1 ring-primary/40 bg-primary/10",
                )}
                aria-label={
                  knowledgeUnreadTotal > 0
                    ? t("公司文档未读", "Unread company docs")
                    : t("公司文档", "Company Docs")
                }
              >
                <BookOpen className="h-4 w-4 text-primary" />
                {knowledgeUnreadTotal > 0 && (
                  <span className="absolute -top-1 -right-1 min-w-[16px] h-4 px-0.5 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none">
                    {knowledgeUnreadTotal > 99 ? "99+" : knowledgeUnreadTotal}
                  </span>
                )}
              </Link>
            </TooltipTrigger>
            <TooltipContent side="bottom" className="max-w-[220px]">
              {knowledgeUnreadTotal > 0
                ? t("公司文档尚有未读内容，点此进入", "Unread items in Company Docs — click to open")
                : t("打开公司文档", "Open Company Docs")}
            </TooltipContent>
          </Tooltip>
        </div>
        
        <div className="flex items-center gap-1.5">
          {/* Performance Dashboard - only visible in dev mode */}
          {import.meta.env.DEV && <PerformanceDashboard />}
          
          {/* 界面语言：点击切换中 / EN */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="sm"
                className="h-9 min-w-9 px-2 hover:bg-accent text-xs font-semibold tabular-nums text-muted-foreground"
                onClick={toggleLanguage}
                aria-label={language === "zh" ? t("切换为英文", "Switch to English") : t("切换为中文", "Switch to Chinese")}
              >
                {language === "zh" ? "EN" : "中"}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {language === "zh" ? t("切换为英文", "Switch to English") : t("切换为中文", "Switch to Chinese")}
            </TooltipContent>
          </Tooltip>

          {/* 主题切换按钮 */}
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost" 
                size="sm" 
                className="h-9 w-9 p-0 hover:bg-accent" 
                onClick={toggleTheme}
              >
                {theme === 'light' ? (
                  <Moon className="h-4 w-4 text-muted-foreground" />
                ) : (
                  <Sun className="h-4 w-4 text-amber-400/90" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              {theme === 'light' ? t('深色模式', 'Dark Mode') : t('浅色模式', 'Light Mode')}
            </TooltipContent>
          </Tooltip>
          
          {/* 全局搜索 */}
          <GlobalSearch />

          {/* 通知中心 */}
          <NotificationCenter />

          {/* PC 客户端下载 */}
          <DropdownMenu>
            <Tooltip>
              <TooltipTrigger asChild>
                <DropdownMenuTrigger asChild>
                  <Button variant="ghost" size="sm" className="h-9 w-9 p-0 hover:bg-accent">
                    <Download className="h-4 w-4 text-muted-foreground" />
                  </Button>
                </DropdownMenuTrigger>
              </TooltipTrigger>
              <TooltipContent>{t("下载客户端", "Download Client")}</TooltipContent>
            </Tooltip>
            <DropdownMenuContent align="end" className="w-64">
              <div className="px-3 py-2 text-sm font-medium border-b">
                {t("下载 PC 客户端", "Download PC Client")}
              </div>
              <div className="p-1">
                <DropdownMenuItem asChild className="cursor-pointer py-2.5">
                  <a href={pcDownloadUrl || "#"} download={!!pcDownloadUrl} onClick={!pcDownloadUrl ? (e) => { e.preventDefault(); notify.info(t("下载地址未配置", "Download URL not configured")); } : undefined}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("Windows 客户端", "Windows Client")}
                  </a>
                </DropdownMenuItem>
                <DropdownMenuItem asChild className="cursor-pointer py-2.5">
                  <a href={macDownloadUrl || "#"} download={!!macDownloadUrl} onClick={!macDownloadUrl ? (e) => { e.preventDefault(); notify.info(t("下载地址未配置", "Download URL not configured")); } : undefined}>
                    <Download className="mr-2 h-4 w-4" />
                    {t("macOS 客户端", "macOS Client")}
                  </a>
                </DropdownMenuItem>
              </div>
              <div className="px-3 py-2 text-[11px] text-muted-foreground border-t">
                {t("安装后启动 Companion 即可在 WhatsApp 工作台扫码登录", "After installation, start Companion to scan QR in WhatsApp Workbench")}
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="sm" className={cn("gap-2 h-9", compactChrome ? "pl-1 pr-2" : "pl-2 pr-3")}>
                <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center">
                  <User className="h-4 w-4 text-primary" />
                </div>
                {!compactChrome && (
                  <span className="flex items-center font-medium">
                    {employee?.real_name || t("未登录", "Not logged in")}
                    {getRoleBadge()}
                  </span>
                )}
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="bg-popover w-56 shadow-lg">
              <div className="px-3 py-2 text-sm text-muted-foreground border-b border-border">
                {t("账号", "Account")}: <span className="font-medium text-foreground">{employee?.username}</span>
              </div>
              {typeof __BUILD_TIME__ !== "undefined" && (
                <div className="px-3 py-1.5 text-xs text-muted-foreground/80">
                  {t("构建", "Build")}: {__BUILD_TIME__}
                </div>
              )}
              <div className="p-1">
                {/* 布局模式切换 - 移入用户菜单 */}
                {!compactChrome && (
                  <DropdownMenuItem onClick={toggleLayoutMode} className="cursor-pointer py-2.5">
                    {layoutMode === 'fullWidth' ? (
                      <Minimize2 className="mr-2 h-4 w-4" />
                    ) : (
                      <Maximize2 className="mr-2 h-4 w-4" />
                    )}
                    {layoutMode === 'fullWidth'
                      ? t('居中布局', 'Centered Layout')
                      : t('全宽布局', 'Full Width Layout')}
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem onClick={handleOpenSettings} className="cursor-pointer py-2.5">
                  <Settings className="mr-2 h-4 w-4" />
                  {t("个人设置", "Settings")}
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={() => setShowLogoutDialog(true)} className="text-destructive cursor-pointer py-2.5 focus:text-destructive">
                  <LogOut className="mr-2 h-4 w-4" />
                  {t("退出登录", "Logout")}
                </DropdownMenuItem>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
      </TooltipProvider>

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

      <DrawerDetail
        open={showSettingsDialog}
        onOpenChange={setShowSettingsDialog}
        title={t("个人设置", "Personal Settings")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="staff-settings-username">{t("用户名", "Username")}</Label>
              <Input 
                id="staff-settings-username"
                name="staff_settings_username"
                value={employee?.username || ""} 
                disabled 
                className="bg-muted"
                readOnly
                aria-readonly="true"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-settings-realname">{t("姓名", "Name")}</Label>
              <Input 
                id="staff-settings-realname"
                name="staff_settings_real_name"
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
              <Label htmlFor="staff-settings-new-password">{t("新密码", "New Password")}</Label>
              <Input 
                id="staff-settings-new-password"
                name="staff_settings_new_password"
                type="password"
                value={newPassword} 
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder={t("留空则不修改密码", "Leave empty to keep current")}
                autoComplete="new-password"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="staff-settings-confirm-password">{t("确认密码", "Confirm Password")}</Label>
              <Input 
                id="staff-settings-confirm-password"
                name="staff_settings_confirm_password"
                type="password"
                value={confirmPassword} 
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder={t("再次输入新密码", "Re-enter new password")}
                autoComplete="new-password"
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowSettingsDialog(false)}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleSaveSettings} disabled={saving}>
              {saving ? t("保存中...", "Saving...") : t("保存", "Save")}
            </Button>
          </div>
      </DrawerDetail>
    </>
  );
}

