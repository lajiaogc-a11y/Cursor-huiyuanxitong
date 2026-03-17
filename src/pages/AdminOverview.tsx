import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Building2, Users, ClipboardList, ShieldAlert, RefreshCw, Settings, Eye, Globe, GitBranch } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { getDashboardStatsApi } from "@/services/reports/reportsApiService";
import { useLanguage } from "@/contexts/LanguageContext";
import { STAFF } from "@/config/paths";

type Stats = {
  tenants: number | null;
  activeEmployees: number | null;
  todayOrders: number | null;
  pendingAudits: number | null;
};

export default function AdminOverview() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [stats, setStats] = useState<Stats>({
    tenants: null,
    activeEmployees: null,
    todayOrders: null,
    pendingAudits: null,
  });
  const [loading, setLoading] = useState(true);
  const currentOrigin = typeof window !== "undefined" ? window.location.origin : "https://crm.fastgc.cc";
  const buildTime = typeof __BUILD_TIME__ !== "undefined" ? __BUILD_TIME__ : t("未知", "Unknown");

  const loadStats = async () => {
    setLoading(true);
    try {
      const data = await getDashboardStatsApi();
      setStats({
        tenants: data.tenants,
        activeEmployees: data.activeEmployees,
        todayOrders: data.todayOrders,
        pendingAudits: data.pendingAudits,
      });
    } catch {
      setStats({
        tenants: null,
        activeEmployees: null,
        todayOrders: null,
        pendingAudits: null,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, []);

  const riskLevel = useMemo(() => {
    const pending = stats.pendingAudits ?? 0;
    if (pending >= 20) return { label: t("高风险", "High Risk"), variant: "destructive" as const };
    if (pending >= 5) return { label: t("中风险", "Medium Risk"), variant: "secondary" as const };
    return { label: t("正常", "Normal"), variant: "default" as const };
  }, [stats.pendingAudits, t]);

  const cards = [
    { title: t("租户总数", "Total Tenants"), value: stats.tenants, icon: Building2 },
    { title: t("活跃员工", "Active Employees"), value: stats.activeEmployees, icon: Users },
    { title: t("今日订单", "Today's Orders"), value: stats.todayOrders, icon: ClipboardList },
    { title: t("待审核", "Pending Audits"), value: stats.pendingAudits, icon: ShieldAlert },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{t("平台总览", "Platform Overview")}</h1>
          <p className="text-sm text-muted-foreground">
            {t("监控平台关键指标并快速进入核心管理模块。", "Monitor key platform metrics and jump to core management modules.")}
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={loadStats} disabled={loading}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t("刷新", "Refresh")}
        </Button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
        {cards.map((card) => (
          <Card key={card.title}>
            <CardHeader className="pb-2">
              <CardTitle className="text-sm font-medium text-muted-foreground flex items-center justify-between">
                {card.title}
                <card.icon className="h-4 w-4" />
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="text-2xl font-bold">{card.value ?? "-"}</div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("平台风险状态", "Platform Risk Status")}</CardTitle>
        </CardHeader>
        <CardContent className="flex items-center justify-between">
          <div className="text-sm text-muted-foreground">
            {t("基于待审核任务数量自动评估，建议每日巡检。", "Auto-evaluated by pending audits; daily review is recommended.")}
          </div>
          <Badge variant={riskLevel.variant}>{riskLevel.label}</Badge>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("版本与环境信息", "Version & Environment")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <Globe className="h-4 w-4" />
              {t("当前访问域名", "Current Origin")}
            </div>
            <div className="font-mono break-all">{currentOrigin}</div>
          </div>
          <div className="rounded-lg border p-3">
            <div className="flex items-center gap-2 text-muted-foreground mb-1">
              <GitBranch className="h-4 w-4" />
              {t("当前构建版本", "Current Build")}
            </div>
            <div className="font-mono break-all">{buildTime}</div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("快捷操作", "Quick Actions")}</CardTitle>
        </CardHeader>
        <CardContent className="grid grid-cols-1 md:grid-cols-3 gap-3">
          <Button variant="outline" className="justify-start" onClick={() => navigate(STAFF.ADMIN_TENANTS)}>
            <Building2 className="h-4 w-4 mr-2" />
            {t("进入租户管理", "Open Tenant Management")}
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => navigate(STAFF.ADMIN_TENANT_VIEW)}>
            <Eye className="h-4 w-4 mr-2" />
            {t("进入租户数据查看", "Open Tenant Data View")}
          </Button>
          <Button variant="outline" className="justify-start" onClick={() => navigate(`${STAFF.ADMIN_SETTINGS}/ip-control`)}>
            <Settings className="h-4 w-4 mr-2" />
            {t("进入平台设置", "Open Platform Settings")}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
