import { useState, useEffect } from "react";
import {
  Bell, Megaphone, Gift, Sparkles, Users, AlertCircle,
  CheckCircle, ChevronRight, Trash2, Check,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import BackHeader from "@/components/member/BackHeader";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/member/MemberSkeleton";

/* ── Mock Data ── */
const initialNotifications = [
  {
    id: "N001",
    type: "system",
    title: "系统升级通知",
    content: "系统将于今晚 22:00 进行维护升级，预计持续 2 小时。升级期间部分功能可能暂时不可用。",
    date: "2024-03-01 10:00",
    read: false,
  },
  {
    id: "N002",
    type: "reward",
    title: "积分到账通知",
    content: "您的邀请奖励 100 积分已到账，当前总积分 3,850。",
    date: "2024-03-01 09:30",
    read: false,
  },
  {
    id: "N003",
    type: "activity",
    title: "新活动上线 🎉",
    content: "春季积分狂欢活动开启！消费满 500 积分翻倍，限时 3 天。",
    date: "2024-02-28 14:00",
    read: false,
  },
  {
    id: "N004",
    type: "invite",
    title: "好友注册成功",
    content: "您的好友 Alice 已通过邀请链接成功注册，双方各获得 10 次抽奖机会。",
    date: "2024-02-28 10:15",
    read: true,
  },
  {
    id: "N005",
    type: "order",
    title: "兑换成功通知",
    content: "您兑换的 Amazon $10 Gift Card 已完成处理，兑换码已发放到订单详情。",
    date: "2024-02-27 16:30",
    read: true,
  },
  {
    id: "N006",
    type: "system",
    title: "安全提醒",
    content: "检测到您的账号在新设备登录，如非本人操作请及时修改密码。",
    date: "2024-02-26 08:00",
    read: true,
  },
  {
    id: "N007",
    type: "reward",
    title: "签到奖励",
    content: "恭喜完成今日签到！获得 10 积分奖励。连续签到 7 天可获得额外奖励。",
    date: "2024-02-25 08:05",
    read: true,
  },
  {
    id: "N008",
    type: "activity",
    title: "限时抽奖活动",
    content: "本周末限时抽奖活动开启，iPhone 15 Pro 等你来抽！",
    date: "2024-02-24 12:00",
    read: true,
  },
];

const typeConfig: Record<string, { icon: any; color: string; bgColor: string }> = {
  system: { icon: Megaphone, color: "--rose", bgColor: "bg-rose/10" },
  reward: { icon: Sparkles, color: "--gold", bgColor: "bg-gold/10" },
  activity: { icon: Gift, color: "--emerald", bgColor: "bg-emerald/10" },
  invite: { icon: Users, color: "--emerald", bgColor: "bg-emerald/10" },
  order: { icon: CheckCircle, color: "--gold", bgColor: "bg-gold/10" },
};

const filters = [
  { key: "all", label: "全部" },
  { key: "system", label: "系统" },
  { key: "reward", label: "奖励" },
  { key: "activity", label: "活动" },
  { key: "invite", label: "邀请" },
  { key: "order", label: "订单" },
];

export default function MemberNotifications() {
  const [notifications, setNotifications] = useState(initialNotifications);
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const filtered = activeFilter === "all"
    ? notifications
    : notifications.filter((n) => n.type === activeFilter);

  const unreadCount = notifications.filter((n) => !n.read).length;

  const markAllRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, read: true })));
    toast.success("已全部标为已读");
  };

  const markRead = (id: string) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read: true } : n))
    );
  };

  const deleteNotification = (id: string) => {
    setNotifications((prev) => prev.filter((n) => n.id !== id));
    toast.success("通知已删除");
  };

  if (loading) return <MemberLayout><ListSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        <BackHeader
          title="消息通知"
          rightAction={
            unreadCount > 0 ? (
              <button
                onClick={markAllRead}
                className="text-[10px] font-bold text-gold-soft flex items-center gap-1 transition hover:text-gold">
                <Check className="w-3 h-3" />
                已读
              </button>
            ) : undefined
          }
        />
        
        {unreadCount > 0 && (
          <p className="text-xs text-[hsl(var(--m-text-dim))] font-medium px-5 pb-3">
            {unreadCount} 条未读消息
          </p>
        )}

        {/* Filters */}
        <div className="px-5 mb-5">
          <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
            {filters.map((f) => (
              <button
                key={f.key}
                onClick={() => setActiveFilter(f.key)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                  activeFilter === f.key
                    ? "bg-gold/15 text-gold-soft ring-1 ring-inset ring-gold/25"
                    : "bg-[hsl(var(--m-surface)_/_0.4)] text-[hsl(var(--m-text-dim))] border border-[hsl(var(--m-surface-border)_/_0.2)] hover:text-[hsl(var(--m-text))]"
                }`}>
                {f.label}
              </button>
            ))}
          </div>
        </div>

        {/* Notification List */}
        <div className="px-5 space-y-2.5">
          {filtered.map((notif) => {
            const cfg = typeConfig[notif.type] || typeConfig.system;
            return (
              <div
                key={notif.id}
                className={`m-glass px-4 py-4 relative overflow-hidden transition-all ${
                  !notif.read ? "border-l-2" : ""
                }`}
                style={!notif.read ? { borderLeftColor: `hsl(var(${cfg.color}))` } : undefined}
                onClick={() => markRead(notif.id)}>
                <div className="flex items-start gap-3">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${cfg.bgColor}`}>
                    <cfg.icon className="w-4 h-4" style={{ color: `hsl(var(${cfg.color}-soft))` }} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-sm font-bold ${!notif.read ? "" : "text-[hsl(var(--m-text)_/_0.7)]"}`}>
                        {notif.title}
                      </span>
                      {!notif.read && (
                        <span className="w-2 h-2 rounded-full shrink-0" style={{ background: `hsl(var(${cfg.color}))` }} />
                      )}
                    </div>
                    <p className="text-[11px] text-[hsl(var(--m-text-dim))] leading-relaxed mb-2 line-clamp-2">
                      {notif.content}
                    </p>
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)] font-medium">{notif.date}</span>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          deleteNotification(notif.id);
                        }}
                        className="p-1.5 rounded-lg hover:bg-destructive/10 transition text-[hsl(var(--m-text-dim)_/_0.3)] hover:text-destructive">
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            );
          })}

          {filtered.length === 0 && (
            <div className="text-center py-16">
              <Bell className="w-10 h-10 text-[hsl(var(--m-text-dim)_/_0.2)] mx-auto mb-3" />
              <p className="text-sm text-[hsl(var(--m-text-dim))] font-medium">暂无消息</p>
              <p className="text-[11px] text-[hsl(var(--m-text-dim)_/_0.5)] mt-1">新消息会在这里显示</p>
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>
    </MemberLayout>
  );
}
