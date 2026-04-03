import { useCallback, useEffect, useState } from "react";
import { Loader2, RefreshCw, Trophy, RotateCcw } from "lucide-react";
import { notify } from "@/lib/notifyHub";
import { useLanguage } from "@/contexts/LanguageContext";
import { useAuth } from "@/contexts/AuthContext";
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
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { CompactTableSkeleton } from "@/components/skeletons/TablePageSkeleton";
import {
  staffListInviteLeaderboardFakes,
  staffPatchInviteLeaderboardFake,
  staffToggleInviteLeaderboardFake,
  staffResetInviteLeaderboardFakeGrowth,
  staffSeedInviteLeaderboardFakes,
  staffRunInviteLeaderboardGrowthNow,
  staffDeleteAllInviteLeaderboardFakes,
  staffRandomizeInviteLeaderboardFakeBase,
  staffGetInviteLeaderboardGrowthSettings,
  staffPatchInviteLeaderboardGrowthSettings,
  type InviteLeaderboardFakeRow,
  type InviteLeaderboardGrowthSettings,
} from "@/services/staff/inviteLeaderboardAdminService";
import { formatBeijingDate } from "@/lib/beijingTime";
import { useIsMobile } from "@/hooks/use-mobile";
import {
  MobileCardList,
  MobileCard,
  MobileCardHeader,
  MobileCardRow,
} from "@/components/ui/mobile-data-card";
import { cn } from "@/lib/utils";
import { ApiError } from "@/api/client";

function computeCycleEnd(settings: InviteLeaderboardGrowthSettings): string | null {
  if (!settings.growth_segment_started_at) return null;
  const startMs = Date.parse(
    settings.growth_segment_started_at.replace(" ", "T") +
      (settings.growth_segment_started_at.includes("Z") ? "" : "Z"),
  );
  if (!Number.isFinite(startMs)) return null;
  const endMs = startMs + settings.growth_segment_hours * 3600 * 1000;
  return new Date(endMs).toISOString().slice(0, 23).replace("T", " ");
}

export function InviteLeaderboardSettingsTab({
  tenantId,
  canManage,
}: {
  tenantId: string | null;
  canManage: boolean;
}) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  const isMobile = useIsMobile();
  const [rows, setRows] = useState<InviteLeaderboardFakeRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState<string | null>(null);
  const [seedBusy, setSeedBusy] = useState(false);
  const [growthBusy, setGrowthBusy] = useState(false);
  const [deleteAllBusy, setDeleteAllBusy] = useState(false);
  const [randomizeBusy, setRandomizeBusy] = useState(false);
  const [replaceSeedConfirmOpen, setReplaceSeedConfirmOpen] = useState(false);
  const [growthJobConfirmOpen, setGrowthJobConfirmOpen] = useState(false);
  const [deleteAllConfirmOpen, setDeleteAllConfirmOpen] = useState(false);
  const [randomizeConfirmOpen, setRandomizeConfirmOpen] = useState(false);
  const [resetGrowthId, setResetGrowthId] = useState<string | null>(null);
  const [growthDraft, setGrowthDraft] = useState<InviteLeaderboardGrowthSettings | null>(null);
  const [growthSaving, setGrowthSaving] = useState(false);

  const role = String(employee?.role ?? "").toLowerCase();
  const canReplaceSeed = !!(
    employee?.is_super_admin ||
    employee?.is_platform_super_admin ||
    role === "admin"
  );
  const canMutate = !!(
    canManage &&
    (employee?.is_super_admin || employee?.is_platform_super_admin || role === "admin" || role === "manager")
  );

  const load = useCallback(async () => {
    if (!tenantId) return;
    setLoading(true);
    try {
      const [list, growth] = await Promise.all([
        staffListInviteLeaderboardFakes(tenantId),
        staffGetInviteLeaderboardGrowthSettings(tenantId),
      ]);
      setRows(list);
      setGrowthDraft(growth);
    } catch {
      notify.error(t("加载失败", "Load failed"));
      setRows([]);
      setGrowthDraft(null);
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  const handleSaveGrowthSettings = async () => {
    if (!tenantId || !canMutate || !growthDraft) return;
    setGrowthSaving(true);
    try {
      const next = await staffPatchInviteLeaderboardGrowthSettings(tenantId, {
        auto_growth_enabled: growthDraft.auto_growth_enabled,
        growth_segment_hours: growthDraft.growth_segment_hours,
        growth_delta_min: growthDraft.growth_delta_min,
        growth_delta_max: growthDraft.growth_delta_max,
      });
      if (next) setGrowthDraft(next);
      notify.success(
        t("增长策略已保存，当前周期已重置", "Saved; current cycle has been reset"),
      );
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("保存失败", "Save failed"));
    } finally {
      setGrowthSaving(false);
    }
  };

  useEffect(() => {
    void load();
  }, [load]);

  const handleSaveRow = async (id: string, name: string, base: number) => {
    if (!tenantId || !canMutate) return;
    setSavingId(id);
    try {
      await staffPatchInviteLeaderboardFake(tenantId, id, {
        name: name.trim(),
        base_invite_count: Math.max(0, Math.floor(base)),
      });
      notify.success(t("已保存", "Saved"));
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("保存失败", "Save failed"));
    } finally {
      setSavingId(null);
    }
  };

  const handleToggle = async (id: string, is_active: boolean) => {
    if (!tenantId || !canMutate) return;
    try {
      await staffToggleInviteLeaderboardFake(tenantId, id, is_active);
      notify.success(t("已更新", "Updated"));
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("操作失败", "Failed"));
    }
  };

  const handleReset = async (id: string) => {
    if (!tenantId || !canMutate) return;
    try {
      await staffResetInviteLeaderboardFakeGrowth(tenantId, id);
      notify.success(t("已重置增长", "Growth reset"));
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("操作失败", "Failed"));
    }
  };

  const handleSeed = async (replace: boolean) => {
    if (!tenantId || !canMutate) return;
    if (replace && !canReplaceSeed) {
      notify.error(t("仅管理员可替换初始化", "Admin only for replace"));
      return;
    }
    setSeedBusy(true);
    try {
      const { inserted } = await staffSeedInviteLeaderboardFakes(tenantId, replace);
      notify.success(t(`已写入 ${inserted} 条`, `Inserted ${inserted} rows`));
      await load();
    } catch (e) {
      if (e instanceof ApiError && e.statusCode === 409) {
        notify.message(t("已有假用户数据", "Already seeded"), {
          description: t("如需覆盖请使用「替换初始化」（仅管理员）", "Use replace (admin) to overwrite"),
        });
        await load();
        return;
      }
      const msg = e instanceof ApiError ? e.message : t("初始化失败", "Seed failed");
      notify.error(msg);
    } finally {
      setSeedBusy(false);
    }
  };

  const handleRunGrowth = async () => {
    if (!canReplaceSeed) return;
    setGrowthBusy(true);
    try {
      const r = await staffRunInviteLeaderboardGrowthNow();
      if (r.success) {
        notify.success(
          r.message
            ? t(`增长任务已完成：${r.message}`, `Growth job done: ${r.message}`)
            : t("已触发增长任务", "Growth job triggered"),
        );
      } else {
        notify.error(r.message || t("增长任务失败", "Growth job failed"));
      }
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("触发失败", "Failed"));
    } finally {
      setGrowthBusy(false);
    }
  };

  const handleDeleteAllFakes = async () => {
    if (!tenantId || !canReplaceSeed) return;
    setDeleteAllBusy(true);
    try {
      const { deleted } = await staffDeleteAllInviteLeaderboardFakes(tenantId);
      notify.success(t(`已删除 ${deleted} 条假用户`, `Deleted ${deleted} synthetic rows`));
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("删除失败", "Delete failed"));
    } finally {
      setDeleteAllBusy(false);
    }
  };

  const handleRandomizeBase = async () => {
    if (!tenantId || !canMutate) return;
    setRandomizeBusy(true);
    try {
      const { updated, min, max } = await staffRandomizeInviteLeaderboardFakeBase(tenantId, 1, 3);
      notify.success(
        t(
          `已为 ${updated} 条随机设定基础人数（${min}–${max}），自动增长部分未改动`,
          `Updated ${updated} rows with random base (${min}–${max}); auto increment unchanged`,
        ),
      );
      await load();
    } catch (e) {
      notify.error(e instanceof ApiError ? e.message : t("随机分配失败", "Randomize failed"));
    } finally {
      setRandomizeBusy(false);
    }
  };

  const pendingCount = rows.filter((r) => r.is_active && r.next_growth_at).length;
  const processedCount = rows.filter(
    (r) => r.is_active && !r.next_growth_at && r.growth_cycles > 0,
  ).length;
  const cycleEnd = growthDraft ? computeCycleEnd(growthDraft) : null;

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-1 border-l-2 border-primary/30 pl-2 leading-relaxed">
        {t(
          "假用户与真实会员合并排序，邀请页展示前 5 名。自动增长以「周期时长」为一个完整周期（如 72 小时）：周期开始时为每个假用户分配一个周期内的随机时间点，到时间后自动增加 0～3 人。每个假用户在一个周期内只增长一次，且各自在不同时刻触发。周期结束后自动开始新周期。每小时检测一次。单条假用户最多 30 个生命周期。",
          "Synthetic users merge with real members for the top 5 invite ranking. Auto-growth runs in cycles (e.g. 72h): at cycle start, each user is assigned a random time within the window. When that time arrives, they get +0~3 invites. Each user grows exactly once per cycle at their own random time. New cycle starts when the previous one ends. Checked hourly. Max 30 lifetime cycles per row.",
        )}
      </p>

      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base">
            {t("自动增长策略", "Auto-growth policy")}
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            {t(
              "保存后当前周期重置，所有假用户会重新分配随机增长时间。",
              "Saving resets the current cycle; all users get new random growth times.",
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {!tenantId ? (
            <p className="text-sm text-muted-foreground">{t("无租户上下文", "No tenant context")}</p>
          ) : loading && !growthDraft ? (
            <p className="text-sm text-muted-foreground">{t("加载中…", "Loading…")}</p>
          ) : growthDraft ? (
            <div className="space-y-4 max-w-xl">
              <div className="flex items-center justify-between gap-3 rounded-md border border-border px-3 py-2">
                <span className="text-sm">{t("启用自动增长任务", "Enable auto-growth")}</span>
                <Switch
                  checked={growthDraft.auto_growth_enabled}
                  disabled={!canMutate || growthSaving}
                  onCheckedChange={(v) => setGrowthDraft((d) => (d ? { ...d, auto_growth_enabled: v } : d))}
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1 col-span-2">
                  <label className="text-xs text-muted-foreground">{t("周期时长（小时）", "Cycle length (hours)")}</label>
                  <Input
                    type="number"
                    min={1}
                    max={720}
                    disabled={!canMutate || growthSaving}
                    value={growthDraft.growth_segment_hours}
                    onChange={(e) =>
                      setGrowthDraft((d) =>
                        d
                          ? {
                              ...d,
                              growth_segment_hours: Math.max(1, Math.min(720, Math.floor(Number(e.target.value) || 1))),
                            }
                          : d,
                      )
                    }
                  />
                  <p className="text-[11px] text-muted-foreground leading-snug">
                    {t(
                      "每个周期内，每个假用户在随机时刻自动增长一次。周期结束后自动开始新周期。",
                      "Within each cycle, every user grows once at their own random time. A new cycle starts automatically when the current one ends.",
                    )}
                  </p>
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("每次增量下限（人）", "Delta min (people)")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canMutate || growthSaving}
                    value={growthDraft.growth_delta_min}
                    onChange={(e) =>
                      setGrowthDraft((d) =>
                        d ? { ...d, growth_delta_min: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : d,
                      )
                    }
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-muted-foreground">{t("每次增量上限（人）", "Delta max (people)")}</label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    disabled={!canMutate || growthSaving}
                    value={growthDraft.growth_delta_max}
                    onChange={(e) =>
                      setGrowthDraft((d) =>
                        d ? { ...d, growth_delta_max: Math.max(0, Math.floor(Number(e.target.value) || 0)) } : d,
                      )
                    }
                  />
                </div>
              </div>
              <div className="text-xs text-muted-foreground space-y-1 rounded-md border border-border/50 px-3 py-2">
                <p>
                  {t("当前周期开始：", "Cycle started: ")}{" "}
                  {growthDraft.growth_segment_started_at ? formatBeijingDate(growthDraft.growth_segment_started_at) : "—"}
                </p>
                <p>
                  {t("当前周期结束：", "Cycle ends: ")}{" "}
                  {cycleEnd ? formatBeijingDate(cycleEnd) : "—"}
                </p>
                <p>
                  {t("上次增长：", "Last growth: ")}{" "}
                  {growthDraft.last_fake_growth_at ? formatBeijingDate(growthDraft.last_fake_growth_at) : "—"}
                </p>
                <p>
                  {t("下一个用户增长：", "Next user growth: ")}{" "}
                  {growthDraft.next_fake_growth_at ? formatBeijingDate(growthDraft.next_fake_growth_at) : "—"}
                </p>
                <p>
                  {t(`本周期：待增长 ${pendingCount} 人，已完成 ${processedCount} 人`,
                     `This cycle: ${pendingCount} pending, ${processedCount} done`)}
                </p>
              </div>
              {canMutate ? (
                <Button type="button" size="sm" disabled={growthSaving} onClick={() => void handleSaveGrowthSettings()}>
                  {growthSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin mr-1" /> : null}
                  {t("保存增长策略", "Save policy")}
                </Button>
              ) : null}
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">{t("无法加载策略", "Could not load policy")}</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="py-3 pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Trophy className="h-4 w-4 text-muted-foreground" />
            {t("邀请排行榜 · 系统假用户", "Invite leaderboard · synthetic users")}
          </CardTitle>
          <p className="text-sm text-muted-foreground font-normal mt-1">
            {t(
              "可编辑昵称与基础邀请人数（不影响已自动叠加部分）。重置增长将清空自动增量与周期计数。",
              "Edit display name and base invite count (does not erase auto increment). Reset clears auto increment and cycle count.",
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          {canMutate ? (
            <div className="flex flex-wrap gap-2">
              <Button type="button" size="sm" variant="default" disabled={seedBusy || !tenantId} onClick={() => void handleSeed(false)}>
                {seedBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("初始化 50 条（空库）", "Seed 50 if empty")}
              </Button>
              {canReplaceSeed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={seedBusy || !tenantId}
                  onClick={() => setReplaceSeedConfirmOpen(true)}
                >
                  {t("替换初始化 50 条", "Replace with 50")}
                </Button>
              ) : null}
              {canReplaceSeed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="outline"
                  disabled={growthBusy}
                  onClick={() => setGrowthJobConfirmOpen(true)}
                >
                  {growthBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("立即跑增长任务", "Run growth job")}
                </Button>
              ) : null}
              {canReplaceSeed ? (
                <Button
                  type="button"
                  size="sm"
                  variant="destructive"
                  disabled={deleteAllBusy || !tenantId || rows.length === 0}
                  onClick={() => setDeleteAllConfirmOpen(true)}
                >
                  {deleteAllBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                  {t("一键删除全部假用户", "Delete all fakes")}
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                variant="secondary"
                disabled={randomizeBusy || !tenantId || rows.length === 0}
                onClick={() => setRandomizeConfirmOpen(true)}
              >
                {randomizeBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
                {t("随机基础人数(1–3)", "Random base 1–3")}
              </Button>
              <Button type="button" size="sm" variant="outline" disabled={loading} onClick={() => void load()}>
                <RefreshCw className={cn("h-3.5 w-3.5", loading && "animate-spin")} />
                {t("刷新", "Refresh")}
              </Button>
            </div>
          ) : null}

          {!tenantId ? (
            <p className="text-sm text-muted-foreground">{t("无租户上下文", "No tenant context")}</p>
          ) : loading ? (
            <div className="py-4" role="status" aria-busy="true" aria-label={t("加载中…", "Loading…")}>
              <CompactTableSkeleton columns={7} rows={8} />
            </div>
          ) : rows.length === 0 ? (
            <p className="py-6 text-sm text-muted-foreground">
              {t("暂无假用户，请先初始化。", "No synthetic users — run seed first.")}
            </p>
          ) : isMobile ? (
            <MobileCardList>
              {rows.map((r) => (
                <FakeUserMobileCard
                  key={r.id}
                  row={r}
                  canMutate={canMutate}
                  saving={savingId === r.id}
                  onSave={(name, base) => void handleSaveRow(r.id, name, base)}
                  onToggle={(v) => void handleToggle(r.id, v)}
                  onReset={() => setResetGrowthId(r.id)}
                  t={t}
                />
              ))}
            </MobileCardList>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("昵称", "Name")}</TableHead>
                  <TableHead className="text-right">{t("基础", "Base")}</TableHead>
                  <TableHead className="text-right">{t("自动", "Auto")}</TableHead>
                  <TableHead className="text-right">{t("合计", "Total")}</TableHead>
                  <TableHead className="text-right">{t("周期", "Cycles")}</TableHead>
                  <TableHead>{t("启用", "On")}</TableHead>
                  <TableHead className="w-[120px]">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r) => (
                  <FakeUserTableRow
                    key={r.id}
                    row={r}
                    canMutate={canMutate}
                    saving={savingId === r.id}
                    onSave={(name, base) => void handleSaveRow(r.id, name, base)}
                    onToggle={(v) => void handleToggle(r.id, v)}
                    onReset={() => setResetGrowthId(r.id)}
                    t={t}
                  />
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <AlertDialog open={replaceSeedConfirmOpen} onOpenChange={setReplaceSeedConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("替换初始化 50 条？", "Replace with 50 synthetic users?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将删除本租户当前全部假用户并重新写入 50 条，此操作不可撤销。确定继续？",
                "This removes all synthetic invite users for this tenant and inserts 50 new rows. This cannot be undone. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setReplaceSeedConfirmOpen(false);
                void handleSeed(true);
              }}
            >
              {t("确认替换", "Confirm replace")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={deleteAllConfirmOpen} onOpenChange={setDeleteAllConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("一键删除全部假用户？", "Delete all synthetic invite users?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将删除本租户邀请排行榜中的全部系统假用户记录，并清除对应增长调度；不会动真实会员数据。删除后需重新「初始化」才有假用户。不可撤销。",
                "Removes every synthetic invite-leaderboard row for this tenant and clears its growth schedule. Real members are untouched. Re-seed to get fakes back. Cannot be undone.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setDeleteAllConfirmOpen(false);
                void handleDeleteAllFakes();
              }}
            >
              {t("确认删除", "Delete all")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={randomizeConfirmOpen} onOpenChange={setRandomizeConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("随机分配基础人数(1–3)？", "Randomize base invites 1–3?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "每条假用户的「基础」人数将独立随机为 1、2 或 3；「自动」叠加部分不变，合计会随之变化。",
                "Each row gets an independent random base count of 1, 2, or 3. Auto-increment totals are unchanged; combined totals will update.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setRandomizeConfirmOpen(false);
                void handleRandomizeBase();
              }}
            >
              {t("确认随机", "Randomize")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={growthJobConfirmOpen} onOpenChange={setGrowthJobConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("立即跑增长任务？", "Run growth job now?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "立即检查并处理所有已到时间的假用户增长。如果当前周期已结束，会自动开始新周期。确定继续？",
                "Immediately checks and processes all due fake user growth. If the current cycle has ended, a new cycle starts automatically. Continue?",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                setGrowthJobConfirmOpen(false);
                void handleRunGrowth();
              }}
            >
              {t("确认执行", "Run now")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={resetGrowthId !== null} onOpenChange={(o) => !o && setResetGrowthId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("重置该假用户的增长？", "Reset growth for this row?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                `将清空「${rows.find((x) => x.id === resetGrowthId)?.name ?? "—"}」的自动增量与周期计数，不可撤销。`,
                `Clears auto increment and cycle count for "${rows.find((x) => x.id === resetGrowthId)?.name ?? "—"}". This cannot be undone.`,
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = resetGrowthId;
                setResetGrowthId(null);
                if (id) void handleReset(id);
              }}
            >
              {t("确认重置", "Confirm reset")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}

function FakeUserTableRow({
  row,
  canMutate,
  saving,
  onSave,
  onToggle,
  onReset,
  t,
}: {
  row: InviteLeaderboardFakeRow;
  canMutate: boolean;
  saving: boolean;
  onSave: (name: string, base: number) => void;
  onToggle: (v: boolean) => void;
  onReset: () => void;
  t: (zh: string, en: string) => string;
}) {
  const [name, setName] = useState(row.name);
  const [base, setBase] = useState(String(row.base_invite_count));
  useEffect(() => {
    setName(row.name);
    setBase(String(row.base_invite_count));
  }, [row.name, row.base_invite_count]);

  return (
    <TableRow>
      <TableCell>
        <Input
          className="h-8 max-w-[200px]"
          value={name}
          disabled={!canMutate}
          onChange={(e) => setName(e.target.value)}
        />
      </TableCell>
      <TableCell className="text-right">
        <Input
          className="ml-auto h-8 w-20 text-right"
          type="number"
          min={0}
          disabled={!canMutate}
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </TableCell>
      <TableCell className="text-right tabular-nums">{row.auto_increment_count}</TableCell>
      <TableCell className="text-right font-medium tabular-nums">{row.total_invite_count}</TableCell>
      <TableCell className="text-right text-muted-foreground tabular-nums text-xs">
        {row.growth_cycles}/{row.max_growth_cycles}
      </TableCell>
      <TableCell>
        <Switch checked={row.is_active} disabled={!canMutate} onCheckedChange={(v) => onToggle(v === true)} />
      </TableCell>
      <TableCell>
        <div className="flex flex-wrap gap-1">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 px-2 text-xs"
            disabled={!canMutate || saving}
            onClick={() => onSave(name, Number(base) || 0)}
          >
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : t("保存", "Save")}
          </Button>
          <Button type="button" variant="ghost" size="sm" className="h-7 px-2 text-xs" disabled={!canMutate} onClick={onReset}>
            <RotateCcw className="h-3 w-3" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

function FakeUserMobileCard({
  row,
  canMutate,
  saving,
  onSave,
  onToggle,
  onReset,
  t,
}: {
  row: InviteLeaderboardFakeRow;
  canMutate: boolean;
  saving: boolean;
  onSave: (name: string, base: number) => void;
  onToggle: (v: boolean) => void;
  onReset: () => void;
  t: (zh: string, en: string) => string;
}) {
  const [name, setName] = useState(row.name);
  const [base, setBase] = useState(String(row.base_invite_count));
  useEffect(() => {
    setName(row.name);
    setBase(String(row.base_invite_count));
  }, [row.name, row.base_invite_count]);

  return (
    <MobileCard compact>
      <MobileCardHeader>
        <span className="font-medium text-sm truncate">{row.name}</span>
        <span className="text-xs tabular-nums text-muted-foreground">{row.total_invite_count}</span>
      </MobileCardHeader>
      <div className="flex items-center justify-between gap-2 px-3 py-1 text-[13px]">
        <span className="text-xs text-muted-foreground shrink-0">{t("昵称", "Name")}</span>
        <Input className="h-8 max-w-[65%]" value={name} disabled={!canMutate} onChange={(e) => setName(e.target.value)} />
      </div>
      <div className="flex items-center justify-between gap-2 px-3 py-1 text-[13px]">
        <span className="text-xs text-muted-foreground shrink-0">{t("基础人数", "Base")}</span>
        <Input
          className="h-8 w-24 text-right"
          type="number"
          min={0}
          disabled={!canMutate}
          value={base}
          onChange={(e) => setBase(e.target.value)}
        />
      </div>
      <MobileCardRow
        label={t("自动 / 周期", "Auto / cycles")}
        value={`${row.auto_increment_count} · ${row.growth_cycles}/${row.max_growth_cycles}`}
        mono
      />
      <div className="flex items-center justify-between gap-2 px-3 py-1 text-[13px]">
        <span className="text-xs text-muted-foreground">{t("启用", "On")}</span>
        <Switch checked={row.is_active} disabled={!canMutate} onCheckedChange={(v) => onToggle(v === true)} />
      </div>
      <div className="mt-2 flex gap-2 px-3 pb-3">
        <Button type="button" size="sm" variant="default" className="flex-1" disabled={!canMutate || saving} onClick={() => onSave(name, Number(base) || 0)}>
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : t("保存", "Save")}
        </Button>
        <Button type="button" size="sm" variant="outline" disabled={!canMutate} onClick={onReset}>
          <RotateCcw className="h-3.5 w-3.5" />
        </Button>
      </div>
    </MobileCard>
  );
}
