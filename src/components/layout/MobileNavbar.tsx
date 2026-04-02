import { NavLink, useLocation } from "react-router-dom";
import { LayoutDashboard, Calculator, ClipboardList, Star, Menu as MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileNavbarProps {
  onMenuOpen: () => void;
  memoUnreadCount?: number;
  knowledgeUnreadCount?: number;
  /** 审核中心待处理条数，与侧栏/抽屉菜单角标同源，合并进「更多」总角标 */
  pendingAuditCount?: number;
}

interface NavItemProps {
  icon: React.ReactNode;
  label: string;
  to: string;
  isActive: boolean;
}

function NavItem({ icon, label, to, isActive }: NavItemProps) {
  return (
    <NavLink
      to={to}
      className={cn(
        "relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-w-0 flex-1 min-h-[48px] rounded-lg transition-colors touch-manipulation",
        isActive
          ? "text-primary"
          : "text-muted-foreground active:text-foreground"
      )}
    >
      {isActive && (
        <span className="absolute top-1 left-1/2 -translate-x-1/2 h-[3px] w-5 rounded-full bg-primary" />
      )}
      <div className={cn(
        "h-6 w-6 flex items-center justify-center transition-transform duration-150",
        isActive && "scale-105"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-[10px] leading-tight truncate max-w-full",
        isActive ? "font-semibold" : "font-medium"
      )}>{label}</span>
    </NavLink>
  );
}

export function MobileNavbar({
  onMenuOpen,
  memoUnreadCount = 0,
  knowledgeUnreadCount = 0,
  pendingAuditCount = 0,
}: MobileNavbarProps) {
  const location = useLocation();
  const { t } = useLanguage();

  const totalBadge = memoUnreadCount + knowledgeUnreadCount + pendingAuditCount;

  const navItems = [
    { icon: <LayoutDashboard className="h-5 w-5" />, labelZh: "首页", labelEn: "Home", to: "/staff" },
    { icon: <Calculator className="h-5 w-5" />, labelZh: "汇率", labelEn: "Rate", to: "/staff/exchange-rate" },
    { icon: <ClipboardList className="h-5 w-5" />, labelZh: "订单", labelEn: "Orders", to: "/staff/orders" },
    { icon: <Star className="h-5 w-5" />, labelZh: "会员", labelEn: "Members", to: "/staff/members" },
  ];

  return (
    <div className="h-14 flex items-center bg-card/95 backdrop-blur-md border-t border-border/40 safe-area-pb shadow-[0_-1px_3px_rgba(0,0,0,0.04)] dark:shadow-none">
      {navItems.map((item) => (
        <NavItem
          key={item.to}
          icon={item.icon}
          label={t(item.labelZh, item.labelEn)}
          to={item.to}
          isActive={
            item.to === "/staff/members"
              ? location.pathname === "/staff/members" || location.pathname === "/staff/member-management"
              : location.pathname === item.to
          }
        />
      ))}
      <button
        onClick={onMenuOpen}
        className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-1 min-w-0 flex-1 min-h-[48px] rounded-lg text-muted-foreground active:text-foreground transition-colors touch-manipulation"
      >
        <div className="h-6 w-6 flex items-center justify-center">
          <MenuIcon className="h-5 w-5" />
        </div>
        <span className="text-[10px] font-medium leading-tight">{t("更多", "More")}</span>
        {totalBadge > 0 && (
          <span className="absolute top-1 right-1.5 min-w-[16px] h-[16px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[9px] font-bold leading-none shadow-sm">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
    </div>
  );
}
