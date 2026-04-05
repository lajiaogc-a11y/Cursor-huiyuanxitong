import { useCallback, useEffect, useMemo, useState } from "react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { listTenantsResult, type TenantItem } from "@/services/tenantService";
import {
  listSystemAnnouncementsResult,
  publishSystemAnnouncementResult,
  type AnnouncementScope,
  type AnnouncementType,
  type SystemAnnouncement,
} from "@/services/announcementService";
import { showServiceErrorToast } from "@/services/serviceErrorToast";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { MobileCardList, MobileCard, MobileCardHeader, MobileCardRow, MobileEmptyState } from "@/components/ui/mobile-data-card";
import { RefreshCw, Send } from "lucide-react";
import { formatBeijingTime } from "@/lib/beijingTime";

const TYPE_OPTIONS: { value: AnnouncementType; zh: string; en: string }[] = [
  { value: "info", zh: "普通", en: "Info" },
  { value: "warning", zh: "警告", en: "Warning" },
  { value: "success", zh: "成功", en: "Success" },
  { value: "error", zh: "错误", en: "Error" },
];

const TYPE_BADGE_VARIANT: Record<string, "default" | "secondary" | "destructive" | "outline"> = {
  info: "secondary",
  warning: "default",
  success: "default",
  error: "destructive",
};

export default function AnnouncementsTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [scope, setScope] = useState<AnnouncementScope>("global");
  const [tenantId, setTenantId] = useState<string>("");
  const [title, setTitle] = useState("");
  const [message, setMessage] = useState("");
  const [type, setType] = useState<AnnouncementType>("info");
  const [link, setLink] = useState("");
  const [tenants, setTenants] = useState<TenantItem[]>([]);
  const [announcements, setAnnouncements] = useState<SystemAnnouncement[]>([]);

  const tenantNameMap = useMemo(() => {
    const map = new Map<string, string>();
    tenants.forEach((item) => {
      map.set(item.id, item.tenant_name || item.tenant_code || item.id);
    });
    return map;
  }, [tenants]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [tenantResult, announcementResult] = await Promise.all([
        listTenantsResult(),
        listSystemAnnouncementsResult(100),
      ]);
      if (!tenantResult.ok) {
        showServiceErrorToast(tenantResult.error, t, "加载租户失败", "Failed to load tenants");
      } else {
        setTenants(tenantResult.data);
      }
      if (!announcementResult.ok) {
        showServiceErrorToast(announcementResult.error, t, "加载公告记录失败", "Failed to load announcement history");
      } else {
        setAnnouncements(announcementResult.data);
      }
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "加载公告记录失败", "Failed to load announcement history");
    } finally {
      setLoading(false);
    }
  }, [t]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const handlePublish = useCallback(async () => {
    if (!title.trim()) {
      notify.error(t("请输入公告标题", "Please enter announcement title"));
      return;
    }
    if (!message.trim()) {
      notify.error(t("请输入公告内容", "Please enter announcement message"));
      return;
    }
    if (scope === "tenant" && !tenantId) {
      notify.error(t("请选择租户", "Please select tenant"));
      return;
    }

    setPublishing(true);
    try {
      const result = await publishSystemAnnouncementResult({
        scope,
        tenantId: scope === "tenant" ? tenantId : null,
        title: title.trim(),
        message: message.trim(),
        type,
        link: link.trim() || null,
      });
      if (!result.ok) {
        if ((result.error.message || "").startsWith("RATE_LIMITED_ANNOUNCEMENT:")) {
          const minutes = Number((result.error.message || "").split(":")[1] || 1);
          notify.error(t(`发布过于频繁，请${minutes}分钟后再试`, `Too many publish requests, retry in ${minutes} minute(s)`));
          return;
        }
        showServiceErrorToast(result.error, t, "发布公告失败", "Failed to publish announcement");
        return;
      }
      notify.success(
        t(
          `发布成功，已投递 ${result.data.recipientCount} 个站内信`,
          `Published successfully, delivered to ${result.data.recipientCount} recipients`
        )
      );
      setTitle("");
      setMessage("");
      setLink("");
      await loadData();
    } catch (error) {
      console.error(error);
      showServiceErrorToast(error, t, "发布公告失败", "Failed to publish announcement");
    } finally {
      setPublishing(false);
    }
  }, [scope, tenantId, title, message, type, link, t, loadData]);

  return (
    <div className="space-y-5">
      <div className="rounded-lg border p-4 space-y-3">
        <h3 className="text-base font-semibold">{t("发布公告/站内信", "Publish Announcement / Site Message")}</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("范围", "Scope")}</p>
            <Select value={scope} onValueChange={(v) => setScope(v as AnnouncementScope)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="global">{t("全站", "Global")}</SelectItem>
                <SelectItem value="tenant">{t("租户", "Tenant")}</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("租户（租户范围时必选）", "Tenant (required for tenant scope)")}</p>
            <Select value={tenantId} onValueChange={setTenantId} disabled={scope !== "tenant"}>
              <SelectTrigger>
                <SelectValue placeholder={t("请选择租户", "Select tenant")} />
              </SelectTrigger>
              <SelectContent>
                {tenants.map((tenant) => (
                  <SelectItem key={tenant.id} value={tenant.id}>
                    {(tenant.tenant_name || tenant.tenant_code || tenant.id) as string}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("类型", "Type")}</p>
            <Select value={type} onValueChange={(v) => setType(v as AnnouncementType)}>
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {TYPE_OPTIONS.map((item) => (
                  <SelectItem key={item.value} value={item.value}>
                    {t(item.zh, item.en)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div>
            <p className="text-xs text-muted-foreground mb-1">{t("可选跳转链接", "Optional link")}</p>
            <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="/staff/report-management" />
          </div>
        </div>

        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("公告标题", "Announcement title")}
        />
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          placeholder={t("公告内容（将发送到通知中心）", "Announcement message (will be delivered to Notification Center)")}
          rows={isMobile ? 3 : 5}
        />

        <div className="flex items-center gap-2">
          <Button onClick={() => void handlePublish()} disabled={publishing}>
            {publishing ? <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> : <Send className="h-4 w-4 mr-2" />}
            {t("发布", "Publish")}
          </Button>
          <Button variant="outline" onClick={() => void loadData()} disabled={loading}>
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? "animate-spin" : ""}`} />
            {t("刷新记录", "Refresh")}
          </Button>
        </div>
      </div>

      {isMobile ? (
        <MobileCardList>
          {loading && announcements.length === 0 ? (
            <div className="flex items-center justify-center py-8">
              <RefreshCw className="h-5 w-5 animate-spin text-muted-foreground" />
            </div>
          ) : announcements.length === 0 ? (
            <MobileEmptyState message={t("暂无公告记录", "No announcements")} />
          ) : announcements.map((item) => (
            <MobileCard key={item.id} accent={item.type === "error" ? "danger" : item.type === "warning" ? "warning" : "muted"}>
              <MobileCardHeader>
                <div className="min-w-0 flex-1">
                  <span className="text-sm font-semibold block truncate">{item.title}</span>
                  <span className="text-[11px] text-muted-foreground">{formatBeijingTime(item.created_at)}</span>
                </div>
                <Badge variant={TYPE_BADGE_VARIANT[item.type] || "secondary"} className="text-[10px] shrink-0">
                  {t(TYPE_OPTIONS.find(o => o.value === item.type)?.zh || item.type, TYPE_OPTIONS.find(o => o.value === item.type)?.en || item.type)}
                </Badge>
              </MobileCardHeader>
              <MobileCardRow label={t("范围", "Scope")}>
                {item.scope === "global"
                  ? t("全站", "Global")
                  : `${t("租户", "Tenant")}: ${tenantNameMap.get(item.tenant_id || "") || "-"}`}
              </MobileCardRow>
              <MobileCardRow label={t("内容", "Message")}>
                <span className="line-clamp-2 text-xs">{item.message}</span>
              </MobileCardRow>
            </MobileCard>
          ))}
        </MobileCardList>
      ) : (
        <div className="rounded-lg border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t("时间", "Time")}</TableHead>
                <TableHead>{t("范围", "Scope")}</TableHead>
                <TableHead>{t("标题", "Title")}</TableHead>
                <TableHead>{t("内容", "Message")}</TableHead>
                <TableHead>{t("类型", "Type")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {announcements.map((item) => (
                <TableRow key={item.id}>
                  <TableCell className="whitespace-nowrap">{formatBeijingTime(item.created_at)}</TableCell>
                  <TableCell>
                    {item.scope === "global"
                      ? t("全站", "Global")
                      : `${t("租户", "Tenant")}: ${tenantNameMap.get(item.tenant_id || "") || "-"}`}
                  </TableCell>
                  <TableCell className="font-medium">{item.title}</TableCell>
                  <TableCell className="max-w-[500px] truncate">{item.message}</TableCell>
                  <TableCell>
                    <Badge variant={TYPE_BADGE_VARIANT[item.type] || "secondary"}>
                      {t(TYPE_OPTIONS.find(o => o.value === item.type)?.zh || item.type, TYPE_OPTIONS.find(o => o.value === item.type)?.en || item.type)}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
              {announcements.length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                    {t("暂无公告记录", "No announcements")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
