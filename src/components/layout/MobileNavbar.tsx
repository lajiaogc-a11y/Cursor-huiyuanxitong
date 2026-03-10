import { NavLink, useLocation } from "react-router-dom";
import { Home, Calculator, ClipboardList, Star, Building2, Menu as MenuIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

interface MobileNavbarProps {
  onMenuOpen: () => void;
  memoUnreadCount?: number;
  knowledgeUnreadCount?: number;
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
        "flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 min-w-[52px] min-h-[48px] rounded-lg transition-all duration-200",
        isActive 
          ? "text-primary" 
          : "text-muted-foreground hover:text-foreground active:bg-muted/30"
      )}
    >
      <div className={cn(
        "h-6 w-6 flex items-center justify-center rounded-full transition-all duration-200",
        isActive && "bg-primary/15 scale-110"
      )}>
        {icon}
      </div>
      <span className={cn(
        "text-[10px] leading-tight transition-all duration-200",
        isActive ? "font-semibold" : "font-medium"
      )}>{label}</span>
      {isActive && (
        <div className="absolute bottom-1 w-4 h-0.5 rounded-full bg-primary" />
      )}
    </NavLink>
  );
}

export function MobileNavbar({ onMenuOpen, memoUnreadCount = 0, knowledgeUnreadCount = 0 }: MobileNavbarProps) {
  const location = useLocation();
  const { t } = useLanguage();
  
  const totalBadge = memoUnreadCount + knowledgeUnreadCount;
  
  const navItems = [
    { icon: <Home className="h-5 w-5" />, labelZh: "首页", labelEn: "Home", to: "/" },
    { icon: <Calculator className="h-5 w-5" />, labelZh: "汇率", labelEn: "Rate", to: "/exchange-rate" },
    { icon: <ClipboardList className="h-5 w-5" />, labelZh: "订单", labelEn: "Orders", to: "/orders" },
    { icon: <Star className="h-5 w-5" />, labelZh: "会员", labelEn: "Members", to: "/activity-reports" },
    { icon: <Building2 className="h-5 w-5" />, labelZh: "结算", labelEn: "Settle", to: "/merchant-settlement" },
  ];

  return (
    <nav className="h-16 flex items-center justify-around bg-card/95 backdrop-blur-md border-t border-border safe-area-pb relative fixed bottom-0 left-0 right-0 z-50">
      {navItems.map((item) => (
        <NavItem
          key={item.to}
          icon={item.icon}
          label={t(item.labelZh, item.labelEn)}
          to={item.to}
          isActive={location.pathname === item.to}
        />
      ))}
      <button
        onClick={onMenuOpen}
        className="relative flex flex-col items-center justify-center gap-0.5 py-1.5 px-2 min-w-[52px] min-h-[48px] rounded-lg text-muted-foreground hover:text-foreground active:bg-muted/30 transition-all duration-200"
      >
        <div className="h-6 w-6 flex items-center justify-center">
          <MenuIcon className="h-5 w-5" />
        </div>
        <span className="text-[10px] font-medium leading-tight">{t("菜单", "Menu")}</span>
        {totalBadge > 0 && (
          <span className="absolute top-0.5 right-0.5 min-w-[18px] h-[18px] px-1 flex items-center justify-center rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold leading-none shadow-sm">
            {totalBadge > 99 ? "99+" : totalBadge}
          </span>
        )}
      </button>
    </nav>
  );
}
