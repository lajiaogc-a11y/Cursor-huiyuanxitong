/**
 * MemberNotifications — 收件箱数据来自 /api/member-inbox（门户公告同步 + 商城兑换结果等）。
 */
import { useEffect, useState } from "react";
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
  Bell,
  Megaphone,
  Gift,
  Sparkles,
  Users,
  CheckCircle,
  Trash2,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import BackHeader from "@/components/member/BackHeader";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPageLoadingShell } from "@/components/member/MemberPageLoadingShell";
import { ListSkeleton } from "@/components/member/MemberSkeleton";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import { MEMBER_SKELETON_MIN_MS } from "@/lib/memberPortalUx";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";
import { setMemberInboxUnreadCount } from "@/lib/memberInboxUnreadStore";
import {
  deleteMemberInboxNotification,
  fetchMemberInboxNotifications,
  postMemberInboxMarkAllRead,
  postMemberInboxMarkRead,
  type MemberInboxApiItem,
} from "@/services/memberPortal/memberInboxService";

type NotifType = "system" | "reward" | "activity" | "invite" | "order";

interface NotifItem {
  id: string;
  type: NotifType;
  titleZh: string;
  titleEn: string;
  contentZh: string;
  contentEn: string;
  date: string;
  read: boolean;
}

function coerceNotifType(c: string): NotifType {
  const x = String(c || "").toLowerCase();
  if (x === "reward" || x === "activity" || x === "invite" || x === "order") return x;
  return "system";
}

function formatInboxDate(iso: string, locale: "zh" | "en"): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return String(iso).slice(0, 16);
  return d.toLocaleString(locale === "zh" ? "zh-CN" : "en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function mapApiToNotif(raw: MemberInboxApiItem, locale: "zh" | "en"): NotifItem {
  return {
    id: raw.id,
    type: coerceNotifType(raw.category),
    titleZh: raw.title_zh,
    titleEn: raw.title_en,
    contentZh: raw.content_zh,
    contentEn: raw.content_en,
    date: formatInboxDate(raw.created_at, locale),
    read: raw.read,
  };
}

const TYPE_CONFIG: Record<
  NotifType,
  { icon: typeof Megaphone; colorVar: string; bg: string }
> = {
  system: { icon: Megaphone, colorVar: "--pu-rose", bg: "bg-pu-rose/10" },
  reward: { icon: Sparkles, colorVar: "--pu-gold", bg: "bg-pu-gold/10" },
  activity: { icon: Gift, colorVar: "--pu-emerald", bg: "bg-pu-emerald/10" },
  invite: { icon: Users, colorVar: "--pu-emerald", bg: "bg-pu-emerald/10" },
  order: { icon: CheckCircle, colorVar: "--pu-gold", bg: "bg-pu-gold/10" },
};

const FILTER_KEYS = ["all", "system", "reward", "activity", "invite", "order"] as const;

export default function MemberNotifications() {
  const { t, language } = useLanguage();
  const { refreshMember, member } = useMemberAuth();
  const [notifications, setNotifications] = useState<NotifItem[]>([]);
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_KEYS)[number]>("all");
  const [loading, setLoading] = useState(true);
  const [deleteNotifId, setDeleteNotifId] = useState<string | null>(null);
  const [reloadGen, setReloadGen] = useState(0);

  useMemberPullRefreshSignal(() => {
    void refreshMember();
    setReloadGen((g) => g + 1);
  });

  useEffect(() => {
    if (!member?.id) {
      setNotifications([]);
      const tmr = window.setTimeout(() => setLoading(false), MEMBER_SKELETON_MIN_MS);
      return () => window.clearTimeout(tmr);
    }
    let cancelled = false;
    const started = Date.now();
    setLoading(true);
    void (async () => {
      try {
        const items = await fetchMemberInboxNotifications(80);
        if (cancelled) return;
        setNotifications(items.map((it) => mapApiToNotif(it, language)));
      } catch {
        if (!cancelled) {
          toast.error(t("加载失败", "Failed to load"));
          setNotifications([]);
        }
      } finally {
        const rest = Math.max(0, MEMBER_SKELETON_MIN_MS - (Date.now() - started));
        window.setTimeout(() => {
          if (!cancelled) setLoading(false);
        }, rest);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [member?.id, reloadGen, language, t]);

  const filtered =
    activeFilter === "all" ? notifications : notifications.filter((n) => n.type === activeFilter);

  const unreadCount = notifications.filter((n) => !n.read).length;

  useEffect(() => {
    setMemberInboxUnreadCount(unreadCount);
  }, [unreadCount]);

  const markAllRead = async () => {
    try {
      await postMemberInboxMarkAllRead();
      setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
      setMemberInboxUnreadCount(0);
      toast.success(t("已全部标为已读", "Marked all as read"));
    } catch {
      toast.error(t("操作失败", "Could not update"));
    }
  };

  const markRead = (id: string) => {
    setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, read: true } : n)));
    void postMemberInboxMarkRead(id).catch(() => {
      toast.error(t("同步失败", "Sync failed"));
    });
  };

  const deleteNotification = async (id: string) => {
    try {
      await deleteMemberInboxNotification(id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      toast.success(t("通知已删除", "Notification removed"));
    } catch {
      toast.error(t("删除失败", "Delete failed"));
    }
  };

  const filterLabel = (key: (typeof FILTER_KEYS)[number]) => {
    const m: Record<(typeof FILTER_KEYS)[number], [string, string]> = {
      all: ["全部", "All"],
      system: ["系统", "System"],
      reward: ["奖励", "Rewards"],
      activity: ["活动", "Activity"],
      invite: ["邀请", "Invite"],
      order: ["订单", "Orders"],
    };
    return t(m[key][0], m[key][1]);
  };

  if (loading) {
    return (
      <MemberPageLoadingShell title={t("消息通知", "Notifications")}>
        <ListSkeleton rows={6} />
      </MemberPageLoadingShell>
    );
  }

  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      <MemberPageAmbientOrbs />
      <div className="relative z-[1] min-h-screen">
      <BackHeader
        title={t("消息通知", "Notifications")}
        rightSlot={
          unreadCount > 0 ? (
            <button
              type="button"
              onClick={markAllRead}
              className="flex items-center gap-1 text-[10px] font-bold text-pu-gold-soft transition motion-reduce:transition-none hover:text-pu-gold"
              aria-label={t("全部标为已读", "Mark all as read")}
            >
              <Check className="h-3 w-3" aria-hidden />
              {t("已读", "Read all")}
            </button>
          ) : undefined
        }
      />

      <div className="relative overflow-x-hidden">
        <div className="relative">
          {unreadCount > 0 ? (
            <p className="px-5 pb-3 text-xs font-medium text-[hsl(var(--pu-m-text-dim))]">
              {t(`${unreadCount} 条未读消息`, `${unreadCount} unread`)}
            </p>
          ) : null}

          <div className="mb-5 px-5">
            <div className="scrollbar-hide flex gap-2 overflow-x-auto pb-2">
              {FILTER_KEYS.map((f) => (
                <button
                  key={f}
                  type="button"
                  onClick={() => setActiveFilter(f)}
                  aria-pressed={activeFilter === f}
                  className={`shrink-0 rounded-full px-4 py-1.5 text-xs font-bold transition-all duration-200 motion-reduce:transition-none ${
                    activeFilter === f
                      ? "bg-pu-gold/15 text-pu-gold-soft ring-1 ring-inset ring-pu-gold/25"
                      : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.4)] text-[hsl(var(--pu-m-text-dim))] hover:text-[hsl(var(--pu-m-text))]"
                  }`}
                >
                  {filterLabel(f)}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2.5 px-5">
        {filtered.map((notif) => {
          const cfg = TYPE_CONFIG[notif.type] || TYPE_CONFIG.system;
          const Icon = cfg.icon;
          return (
            <div
              key={notif.id}
              role="button"
              tabIndex={0}
              onClick={() => markRead(notif.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  markRead(notif.id);
                }
              }}
              className={`m-glass relative cursor-pointer overflow-hidden px-4 py-4 transition-all motion-reduce:transition-none ${
                !notif.read ? "border-l-2" : ""
              }`}
              style={
                !notif.read
                  ? { borderLeftColor: `hsl(var(${cfg.colorVar}))` }
                  : undefined
              }
            >
              <div className="flex items-start gap-3">
                <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${cfg.bg}`}>
                  <Icon
                    className="h-4 w-4"
                    style={{ color: `hsl(var(${cfg.colorVar}-soft))` }}
                    aria-hidden
                  />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="mb-1 flex items-center justify-between">
                    <span
                      className={`text-sm font-bold ${
                        !notif.read ? "text-[hsl(var(--pu-m-text))]" : "text-[hsl(var(--pu-m-text)/0.7)]"
                      }`}
                    >
                      {t(notif.titleZh, notif.titleEn)}
                    </span>
                    {!notif.read ? (
                      <span
                        className="h-2 w-2 shrink-0 rounded-full"
                        style={{ background: `hsl(var(${cfg.colorVar}))` }}
                        aria-hidden
                      />
                    ) : null}
                  </div>
                  <p className="mb-2 line-clamp-2 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
                    {t(notif.contentZh, notif.contentEn)}
                  </p>
                  <div className="flex items-center justify-between">
                    <span className="text-[10px] font-medium text-[hsl(var(--pu-m-text-dim)/0.5)]">
                      {notif.date}
                    </span>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDeleteNotifId(notif.id);
                      }}
                      className="rounded-lg p-1.5 text-[hsl(var(--pu-m-text-dim)/0.3)] transition motion-reduce:transition-none hover:bg-destructive/10 hover:text-destructive"
                      aria-label={t("删除", "Delete")}
                    >
                      <Trash2 className="h-3 w-3" aria-hidden />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          );
        })}

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.45)] bg-[hsl(var(--pu-m-surface)/0.18)] px-4 py-14 text-center">
            <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text-dim)/0.35)]">
              <Bell className="h-8 w-8" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无消息", "No messages")}</p>
            <p className="mt-1.5 text-[11px] leading-relaxed text-[hsl(var(--pu-m-text-dim)/0.65)]">
              {t("新消息会在这里显示", "New messages will appear here")}
            </p>
            <MemberEmptyStateCta
              primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("去首页逛逛", "Go to Home") }}
              secondary={{ to: ROUTES.MEMBER.POINTS, label: t("积分商城", "Points mall") }}
            />
          </div>
        ) : null}
          </div>

          <p className="mt-6 px-5 text-center text-[10px] text-[hsl(var(--pu-m-text-dim)/0.45)]">
            {t("公告与兑换处理结果会同步到此列表", "Portal announcements and redemption updates appear here")}
          </p>

          <div className="h-8" />
        </div>
      </div>
      </div>

      <AlertDialog open={!!deleteNotifId} onOpenChange={(open) => !open && setDeleteNotifId(null)}>
        <AlertDialogContent className="max-w-[min(100vw-2rem,24rem)] border-[hsl(var(--pu-m-surface-border)/0.5)] bg-[hsl(var(--pu-m-surface)/0.95)]">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-[hsl(var(--pu-m-text))]">{t("删除这条通知？", "Delete this notification?")}</AlertDialogTitle>
            <AlertDialogDescription className="text-[hsl(var(--pu-m-text-dim)/0.85)]">
              {t("删除后无法恢复。", "This cannot be undone.")}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="border-[hsl(var(--pu-m-surface-border))]">{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const id = deleteNotifId;
                setDeleteNotifId(null);
                if (id) void deleteNotification(id);
              }}
            >
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
