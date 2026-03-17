import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ClipboardCheck, Bell, AlertTriangle, ChevronRight, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
import { useTenantView } from "@/contexts/TenantViewContext";
import { useNavigate } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";

interface PendingItem {
  type: "audit" | "notification" | "anomaly";
  count: number;
  label: string;
  icon: typeof ClipboardCheck;
  color: string;
  link: string;
}

export default function PendingTasksPanel() {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const navigate = useNavigate();
  const [items, setItems] = useState<PendingItem[]>([]);
  const [loading, setLoading] = useState(true);
  const effectiveTenantId = viewingTenantId || employee?.tenant_id || null;

  const canViewAudit = employee?.role === 'admin' || employee?.role === 'manager';

  useEffect(() => {
    const load = async () => {
      try {
        // Pending audit records (admin/manager only)
        const auditPromise = canViewAudit
          ? import('@/services/reports/reportsApiService').then((m) => m.getDashboardStatsApi(effectiveTenantId))
          : Promise.resolve({ count: 0 });

        // Unread notifications for current user
        const notifPromise = employee?.id
          ? supabase.from("notifications").select("*", { count: "exact", head: true })
              .eq("recipient_id", employee.id).eq("is_read", false).then(r => r)
          : Promise.resolve({ count: 0 });

        // Recent error reports (24h, admin only)
        const errorPromise = employee?.role === 'admin'
          ? (() => {
              const yesterday = new Date(Date.now() - 86400000).toISOString();
              return supabase.from("error_reports").select("*", { count: "exact", head: true }).gte("created_at", yesterday).then(r => r);
            })()
          : Promise.resolve({ count: 0 });

        const [auditRes, notifRes, errorRes] = await Promise.all([auditPromise, notifPromise, errorPromise]);

        const result: PendingItem[] = [];

        const pendingAuditCount = 'pendingAudits' in auditRes ? (auditRes.pendingAudits || 0) : (auditRes.count || 0);
        if (canViewAudit && pendingAuditCount > 0) {
          result.push({
            type: "audit",
            count: pendingAuditCount,
            label: t("待审核记录", "Pending Audits"),
            icon: ClipboardCheck,
            color: "text-amber-500",
            link: "/audit-center",
          });
        }

        if ((notifRes.count || 0) > 0) {
          result.push({
            type: "notification",
            count: notifRes.count || 0,
            label: t("未读通知", "Unread Notifications"),
            icon: Bell,
            color: "text-blue-500",
            link: "/",
          });
        }

        if (employee?.role === 'admin' && (errorRes.count || 0) > 0) {
          result.push({
            type: "anomaly",
            count: errorRes.count || 0,
            label: t("24h异常报告", "24h Error Reports"),
            icon: AlertTriangle,
            color: "text-destructive",
            link: "/operation-logs?tab=errors",
          });
        }

        setItems(result);
      } catch (err) {
        console.error("PendingTasksPanel error:", err);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [employee, canViewAudit, effectiveTenantId]);

  // Don't render if nothing pending
  if (!loading && items.length === 0) return null;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm flex items-center gap-2">
          <div className="flex items-center justify-center h-6 w-6 rounded-md bg-amber-500/10">
            <ClipboardCheck className="h-3.5 w-3.5 text-amber-500" />
          </div>
          {t("待办事项", "Pending Tasks")}
          {!loading && items.length > 0 && (
            <Badge variant="destructive" className="text-[10px] ml-auto">
              {items.reduce((s, i) => s + i.count, 0)}
            </Badge>
          )}
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0">
        {loading ? (
          <div className="space-y-2">
            {[1,2].map(i => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <div className="space-y-1">
            {items.map((item) => {
              const Icon = item.icon;
              return (
                <button
                  key={item.type}
                  onClick={() => navigate(item.link)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 rounded-md hover:bg-muted/60 transition-colors text-left group"
                >
                  <Icon className={`h-4 w-4 ${item.color} shrink-0`} />
                  <span className="text-sm font-medium flex-1">{item.label}</span>
                  <Badge variant="secondary" className="text-[10px] tabular-nums">
                    {item.count}
                  </Badge>
                  <ChevronRight className="h-3.5 w-3.5 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
                </button>
              );
            })}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
