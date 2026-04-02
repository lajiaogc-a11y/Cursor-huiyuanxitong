import { useState, useEffect, useCallback } from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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
import { Plus, Trash2, Copy, RefreshCw, Loader2, Ticket, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { apiGet, apiPost } from "@/api/client";
import { deleteInvitationCode, toggleInvitationCodeActive } from "@/services/staff/invitationCodeTableService";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { formatBeijingTime } from "@/lib/beijingTime";
import { cn } from "@/lib/utils";

interface InvitationCode {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function InvitationCodeManagement() {
  const { employee } = useAuth();
  const { t } = useLanguage();
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [batchCount, setBatchCount] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    try {
      const data = await apiGet<InvitationCode[]>(
        "/api/data/table/invitation_codes?select=*&order=created_at.desc",
      );
      setCodes(Array.isArray(data) ? data : []);
    } catch (error) {
      console.error("Failed to fetch invitation codes:", error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const canManageCodes =
    !!employee?.is_platform_super_admin ||
    (!!employee?.tenant_id && (!!employee?.is_super_admin || employee?.role === "admin"));

  const handleGenerate = async () => {
    if (!canManageCodes) {
      toast.error(
        t("仅租户管理员可生成员工邀请码", "Only tenant administrators can generate staff invitation codes"),
      );
      return;
    }

    setGenerating(true);
    try {
      const generatedCodes: string[] = [];

      for (let i = 0; i < batchCount; i++) {
        const code = await apiPost<string>("/api/data/rpc/generate_invitation_code", {
          p_max_uses: maxUses,
          p_creator_id: employee.id,
        });
        if (code) generatedCodes.push(code);
      }

      toast.success(
        t(`成功生成 ${generatedCodes.length} 个邀请码`, `Generated ${generatedCodes.length} invitation code(s)`),
      );
      await fetchCodes();
    } catch (error: unknown) {
      console.error("Failed to generate invitation code:", error);
      toast.error(t("生成邀请码失败", "Failed to generate invitation code"));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteInvitationCode(id);
      toast.success(t("邀请码已删除", "Invitation code deleted"));
      setDeleteConfirm(null);
      await fetchCodes();
    } catch (error) {
      console.error("Failed to delete invitation code:", error);
      toast.error(t("删除失败", "Delete failed"));
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      await toggleInvitationCodeActive(id, !currentActive);
      toast.success(
        currentActive ? t("邀请码已禁用", "Code disabled") : t("邀请码已启用", "Code enabled"),
      );
      await fetchCodes();
    } catch (error) {
      console.error("Failed to toggle invitation code:", error);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(t("已复制到剪贴板", "Copied to clipboard"));
  };

  if (!canManageCodes) {
    return (
      <div className="space-y-6">
        <div className="rounded-2xl border border-border/50 bg-muted/35 p-4 md:p-5 shadow-sm">
          <div className="flex items-start gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-border/40 bg-muted/60 text-muted-foreground">
              <ShieldAlert className="h-5 w-5" strokeWidth={2} aria-hidden />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="text-sm font-bold text-foreground md:text-base">
                {t("员工邀请码", "Staff invitation codes")}
              </h3>
              <p className="text-xs leading-relaxed text-muted-foreground md:text-[13px]">
                {t(
                  "仅租户管理员可在此生成与管理邀请码；注册员工将归属当前租户。如需权限请联系管理员。",
                  "Only tenant admins can generate and manage codes here; invited staff join this tenant. Contact an admin if you need access.",
                )}
              </p>
            </div>
          </div>
        </div>
        <Card className="rounded-2xl border-dashed border-border/80 bg-muted/20">
          <CardContent className="py-12 text-center text-sm text-muted-foreground">
            {t(
              "仅租户管理员可在「系统设置 → 员工邀请码」管理邀请码；注册员工将归属本租户。",
              "Only tenant administrators can manage codes under System Settings → Staff invitation codes; invited staff join this tenant.",
            )}
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-violet-200/80 bg-gradient-to-br from-violet-500/[0.08] via-card to-sky-500/[0.06] p-4 md:p-5 shadow-sm dark:border-violet-900/50 dark:from-violet-500/[0.12]">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-violet-500/15 text-violet-700 dark:text-violet-300">
            <Ticket className="h-5 w-5" strokeWidth={2} aria-hidden />
          </div>
          <div className="min-w-0 space-y-1">
            <h3 className="text-sm font-bold tracking-tight text-foreground md:text-base">
              {t("员工注册邀请码", "Staff signup invitation codes")}
            </h3>
            <p className="text-xs leading-relaxed text-muted-foreground md:text-[13px]">
              {t(
                "用于员工在登录页注册并加入本租户，与会员门户「任务与奖励」里的会员邀请链接不是同一套。可批量生成、限制次数、随时禁用或删除。",
                "For staff signup on the login page to join this tenant—not the same as member-to-member invites in Member Portal → Tasks & rewards. Batch-generate, cap uses, disable or delete anytime.",
              )}
            </p>
          </div>
        </div>
      </div>

      <Card className="rounded-2xl border-border/60 shadow-md overflow-hidden">
        <CardContent className="p-0">
          <div className="border-b border-border/60 bg-muted/30 px-4 py-3 md:px-5 md:py-4">
            <div className="flex flex-wrap items-center gap-2">
              <Plus className="h-4 w-4 text-primary shrink-0" aria-hidden />
              <span className="text-sm font-bold">{t("生成新邀请码", "Generate new codes")}</span>
              <Badge variant="secondary" className="text-[10px] font-semibold">
                {t("租户管理员", "Tenant admin")}
              </Badge>
            </div>
            <p className="mt-1 text-[11px] text-muted-foreground md:text-xs">
              {t("设置单次可用次数与批量数量后点击生成。", "Set max uses per code and batch size, then generate.")}
            </p>
          </div>
          <div className="p-4 md:p-5">
            <div className="flex flex-wrap items-end gap-4 md:gap-6">
              <div className="space-y-1.5 min-w-[100px]">
                <Label className="text-xs font-semibold">{t("可使用次数", "Max uses")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={100}
                  value={maxUses}
                  onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="h-10 w-24 rounded-xl border-border/60"
                />
              </div>
              <div className="space-y-1.5 min-w-[100px]">
                <Label className="text-xs font-semibold">{t("生成数量", "Batch count")}</Label>
                <Input
                  type="number"
                  min={1}
                  max={20}
                  value={batchCount}
                  onChange={(e) =>
                    setBatchCount(Math.max(1, Math.min(20, parseInt(e.target.value, 10) || 1)))
                  }
                  className="h-10 w-24 rounded-xl border-border/60"
                />
              </div>
              <div className="flex flex-wrap gap-2 pt-0.5">
                <Button
                  onClick={handleGenerate}
                  disabled={generating}
                  className="rounded-xl gap-2 shadow-sm"
                >
                  {generating ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
                  ) : (
                    <Plus className="h-4 w-4" aria-hidden />
                  )}
                  {t("生成", "Generate")}
                </Button>
                <Button type="button" variant="outline" onClick={() => void fetchCodes()} className="rounded-xl gap-2">
                  <RefreshCw className="h-4 w-4" aria-hidden />
                  {t("刷新", "Refresh")}
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="rounded-2xl border-border/60 shadow-md overflow-hidden">
        <CardContent className="p-0">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border/60 bg-muted/25 px-4 py-3 md:px-5">
            <span className="text-sm font-bold">{t("邀请码列表", "Invitation codes")}</span>
            <Badge variant="outline" className="rounded-lg font-mono text-xs">
              {codes.length} {t("个", "codes")}
            </Badge>
          </div>
          <div className="p-2 md:p-4">
            {loading ? (
              <div className="flex items-center justify-center py-16">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" aria-hidden />
              </div>
            ) : codes.length === 0 ? (
              <div className="flex flex-col items-center justify-center gap-3 rounded-xl border border-dashed border-border/70 bg-muted/15 py-14 px-4 text-center">
                <div className="flex h-14 w-14 items-center justify-center rounded-2xl bg-muted/60 text-muted-foreground">
                  <Ticket className="h-7 w-7 opacity-60" aria-hidden />
                </div>
                <p className="text-sm font-medium text-foreground">{t("暂无邀请码", "No codes yet")}</p>
                <p className="max-w-sm text-xs text-muted-foreground leading-relaxed">
                  {t("点击上方「生成」创建第一批员工注册码。", "Use Generate above to create your first staff signup codes.")}
                </p>
              </div>
            ) : (
              <div className="rounded-xl border border-border/60 overflow-hidden bg-card">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/40 hover:bg-muted/40 border-border/60">
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("邀请码", "Code")}
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("使用次数", "Usage")}
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("状态", "Status")}
                      </TableHead>
                      <TableHead className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("创建时间", "Created")}
                      </TableHead>
                      <TableHead className="text-center text-xs font-bold uppercase tracking-wider text-muted-foreground">
                        {t("操作", "Actions")}
                      </TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {codes.map((code) => {
                      const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                      const isUsedUp = code.used_count >= code.max_uses;
                      const isAvailable = code.is_active && !isExpired && !isUsedUp;

                      return (
                        <TableRow
                          key={code.id}
                          className={cn("border-border/50", !isAvailable && "opacity-[0.72] bg-muted/10")}
                        >
                          <TableCell>
                            <div className="flex items-center gap-2">
                              <code className="font-mono text-sm font-bold tracking-wide rounded-lg bg-primary/8 dark:bg-primary/15 px-2.5 py-1.5 text-foreground border border-primary/15">
                                {code.code}
                              </code>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 shrink-0 rounded-lg p-0"
                                onClick={() => copyToClipboard(code.code)}
                                aria-label={t("复制", "Copy")}
                              >
                                <Copy className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                          <TableCell>
                            <span
                              className={cn(
                                "text-sm font-medium tabular-nums",
                                code.used_count >= code.max_uses && "text-destructive",
                              )}
                            >
                              {code.used_count}/{code.max_uses}
                            </span>
                          </TableCell>
                          <TableCell>
                            {isExpired ? (
                              <Badge variant="outline" className="rounded-md border-red-300 text-red-600 dark:border-red-900 dark:text-red-400">
                                {t("已过期", "Expired")}
                              </Badge>
                            ) : isUsedUp ? (
                              <Badge variant="outline" className="rounded-md border-orange-300 text-orange-700 dark:border-orange-900 dark:text-orange-400">
                                {t("已用完", "Used up")}
                              </Badge>
                            ) : code.is_active ? (
                              <Badge className="rounded-md bg-emerald-600 hover:bg-emerald-600 text-white border-0 shadow-sm">
                                {t("可用", "Active")}
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="rounded-md">
                                {t("已禁用", "Disabled")}
                              </Badge>
                            )}
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground tabular-nums">
                            {formatBeijingTime(code.created_at)}
                          </TableCell>
                          <TableCell className="text-center">
                            <div className="flex items-center justify-center gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 rounded-lg px-2.5 text-xs"
                                onClick={() => handleToggleActive(code.id, code.is_active)}
                              >
                                {code.is_active ? t("禁用", "Disable") : t("启用", "Enable")}
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                className="h-8 w-8 rounded-lg p-0 text-destructive hover:text-destructive"
                                onClick={() => setDeleteConfirm(code.id)}
                                aria-label={t("删除", "Delete")}
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent className="rounded-2xl">
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "删除后此邀请码将无法使用，确定要删除吗？",
                "This invitation code will become unusable. Are you sure?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-xl">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-xl bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => deleteConfirm && handleDelete(deleteConfirm)}
            >
              {t("确认删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
