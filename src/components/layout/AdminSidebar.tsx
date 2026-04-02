/**
 * 平台管理后台 - 独立侧边栏
 * 租户管理、租户数据查看、平台设置（含子导航）
 */
import { useState, useEffect } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  Building2,
  Users,
  Settings,
  Shield,
  ChevronDown,
  Activity,
  Gauge,
  ShieldAlert,
  Archive,
  HardDrive,
  Wrench,
  Smartphone,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLanguage } from "@/contexts/LanguageContext";

const PLATFORM_SETTINGS_CHILDREN = [
  { path: "/staff/admin/settings/ip-control", icon: Shield, labelZh: "IP访问控制", labelEn: "IP Access Control" },
  { path: "/staff/admin/settings/system-health", icon: Activity, labelZh: "系统健康", labelEn: "System Health" },
  { path: "/staff/admin/settings/resource-monitor", icon: Gauge, labelZh: "资源监控", labelEn: "Resource Monitor" },
  { path: "/staff/admin/settings/risk-dashboard", icon: ShieldAlert, labelZh: "风险评分", labelEn: "Risk Scoring" },
  { path: "/staff/admin/settings/data-archive", icon: Archive, labelZh: "数据归档", labelEn: "Data Archive" },
  { path: "/staff/admin/settings/data-backup", icon: HardDrive, labelZh: "数据备份", labelEn: "Data Backup" },
  { path: "/staff/admin/settings/data-repair", icon: Wrench, labelZh: "数据修复", labelEn: "Data Repair" },
  { path: "/staff/admin/settings/device-whitelist", icon: Smartphone, labelZh: "设备白名单登录", labelEn: "Device whitelist login" },
];

export function AdminSidebar() {
  const { language } = useLanguage();
  const location = useLocation();
  const navigate = useNavigate();
  const [settingsExpanded, setSettingsExpanded] = useState(false);

  const isSettingsActive = location.pathname.startsWith("/staff/admin/settings");

  useEffect(() => {
    if (isSettingsActive) setSettingsExpanded(true);
  }, [isSettingsActive]);

  return (
    <aside className="flex flex-col w-56 border-r bg-card shrink-0">
      <div className="p-4 border-b flex items-center gap-2">
        <Shield className="h-6 w-6 text-primary" />
        <div>
          <p className="font-semibold text-sm">{language === "zh" ? "平台管理后台" : "Platform Admin"}</p>
          <p className="text-xs text-muted-foreground">{language === "zh" ? "独立后台 · 不操作租户数据" : "Separate backend · No tenant data modification"}</p>
        </div>
      </div>
      <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
        <NavLink
          to="/staff/admin/tenants"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <Building2 className="h-4 w-4 shrink-0" />
          {language === "zh" ? "租户管理" : "Tenant Management"}
        </NavLink>
        <NavLink
          to="/staff/admin/tenant-view"
          className={({ isActive }) =>
            cn(
              "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
              isActive ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )
          }
        >
          <Users className="h-4 w-4 shrink-0" />
          {language === "zh" ? "租户数据查看" : "View Tenant Data"}
        </NavLink>

        {/* 平台设置 - 可展开子导航 */}
        <div className="pt-1">
          <div
            role="button"
            tabIndex={0}
            onClick={() => {
              setSettingsExpanded((v) => !v);
              if (!isSettingsActive) navigate("/staff/admin/settings/ip-control");
            }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                setSettingsExpanded((v) => !v);
                if (!isSettingsActive) navigate("/staff/admin/settings/ip-control");
              }
            }}
            className={cn(
              "flex items-center justify-between w-full gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors cursor-pointer",
              isSettingsActive ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <div className="flex items-center gap-3">
              <Settings className="h-4 w-4 shrink-0" />
              {language === "zh" ? "平台设置" : "Platform Settings"}
            </div>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", settingsExpanded && "rotate-180")} />
          </div>
          {settingsExpanded && (
            <ul className="ml-4 mt-1 space-y-0.5 mt-1">
              {PLATFORM_SETTINGS_CHILDREN.map((item) => (
                <li key={item.path}>
                  <NavLink
                    to={item.path}
                    className={({ isActive }) =>
                      cn(
                        "flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-colors",
                        isActive
                          ? "bg-primary text-primary-foreground"
                          : "text-muted-foreground hover:bg-muted hover:text-foreground"
                      )
                    }
                  >
                    <item.icon className="h-3.5 w-3.5 shrink-0" />
                    {language === "zh" ? item.labelZh : item.labelEn}
                  </NavLink>
                </li>
              ))}
            </ul>
          )}
        </div>
      </nav>
    </aside>
  );
}
