/**
 * MemberWallet — premium-ui-boost 视觉对齐；余额取会员 `wallet_balance`，其余流水为演示数据（待接财务 API）。
 */
import { useEffect, useState } from "react";
import {
  Wallet,
  ArrowUpRight,
  ArrowDownLeft,
  TrendingUp,
  Clock,
  CheckCircle,
  XCircle,
  AlertCircle,
  CreditCard,
  DollarSign,
  Sparkles,
} from "lucide-react";
import { toast } from "sonner";
import BackHeader from "@/components/member/BackHeader";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { MemberPageLoadingShell } from "@/components/member/MemberPageLoadingShell";
import { ListSkeleton } from "@/components/member/MemberSkeleton";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { Navigate } from "react-router-dom";
import { ROUTES } from "@/routes/constants";
import { useMemberAnimatedCount } from "@/hooks/useMemberAnimatedCount";
import { MEMBER_SKELETON_MIN_MS } from "@/lib/memberPortalUx";
import { MemberEmptyStateCta } from "@/components/member/MemberEmptyStateCta";
import { useMemberPullRefreshSignal } from "@/hooks/useMemberPullRefreshSignal";

type TxType = "deposit" | "withdraw" | "reward";
type TxStatus = "completed" | "pending" | "rejected";

const DEMO_TRANSACTIONS: Array<{
  id: string;
  type: TxType;
  descZh: string;
  descEn: string;
  amount: number;
  status: TxStatus;
  date: string;
  methodZh: string;
  methodEn: string;
}> = [
  { id: "T001", type: "deposit", descZh: "USDT 充值", descEn: "USDT deposit", amount: 500, status: "completed", date: "2024-03-01 14:30", methodZh: "TRC20", methodEn: "TRC20" },
  { id: "T002", type: "withdraw", descZh: "USDT 提现", descEn: "USDT withdrawal", amount: -200, status: "completed", date: "2024-02-28 10:15", methodZh: "TRC20", methodEn: "TRC20" },
  { id: "T003", type: "reward", descZh: "邀请奖励", descEn: "Invite reward", amount: 50, status: "completed", date: "2024-02-27 18:00", methodZh: "系统", methodEn: "System" },
  { id: "T004", type: "deposit", descZh: "积分兑换", descEn: "Points exchange", amount: 38.5, status: "completed", date: "2024-02-26 09:30", methodZh: "积分", methodEn: "Points" },
  { id: "T005", type: "withdraw", descZh: "USDT 提现", descEn: "USDT withdrawal", amount: -300, status: "pending", date: "2024-02-25 15:45", methodZh: "TRC20", methodEn: "TRC20" },
  { id: "T006", type: "withdraw", descZh: "银行转账", descEn: "Bank transfer", amount: -100, status: "rejected", date: "2024-02-24 11:00", methodZh: "银行", methodEn: "Bank" },
  { id: "T007", type: "reward", descZh: "签到奖励", descEn: "Check-in reward", amount: 10, status: "completed", date: "2024-02-23 08:00", methodZh: "系统", methodEn: "System" },
  { id: "T008", type: "deposit", descZh: "USDT 充值", descEn: "USDT deposit", amount: 1000, status: "completed", date: "2024-02-22 20:00", methodZh: "TRC20", methodEn: "TRC20" },
];

const FILTER_KEYS = ["all", "deposit", "withdraw", "reward"] as const;

/** 与 premium-ui-boost `MemberWallet` 演示卡一致；接入财务 API 后改读服务端 */
const DEMO_WALLET_TOTAL_DEPOSIT = 5000;
const DEMO_WALLET_TOTAL_WITHDRAW = 3569.5;
const DEMO_WALLET_FROZEN = 150;

function StatusBadge({ status, t }: { status: TxStatus; t: (zh: string, en: string) => string }) {
  const config: Record<
    TxStatus,
    { icon: typeof CheckCircle; labelZh: string; labelEn: string; cls: string }
  > = {
    completed: {
      icon: CheckCircle,
      labelZh: "已完成",
      labelEn: "Done",
      cls: "text-pu-emerald bg-pu-emerald/10 ring-1 ring-inset ring-pu-emerald/20",
    },
    pending: {
      icon: Clock,
      labelZh: "处理中",
      labelEn: "Pending",
      cls: "text-pu-rose bg-pu-rose/10 ring-1 ring-inset ring-pu-rose/20",
    },
    rejected: {
      icon: XCircle,
      labelZh: "已拒绝",
      labelEn: "Rejected",
      cls: "text-destructive bg-destructive/10 ring-1 ring-inset ring-destructive/20",
    },
  };
  const c = config[status];
  const Icon = c.icon;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${c.cls}`}>
      <Icon className="h-2.5 w-2.5" aria-hidden />
      {t(c.labelZh, c.labelEn)}
    </span>
  );
}

export default function MemberWallet() {
  const { member, refreshMember } = useMemberAuth();
  const { t } = useLanguage();
  const [activeFilter, setActiveFilter] = useState<(typeof FILTER_KEYS)[number]>("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const id = window.setTimeout(() => setLoading(false), MEMBER_SKELETON_MIN_MS);
    return () => window.clearTimeout(id);
  }, []);

  useMemberPullRefreshSignal(() => {
    if (!member?.id) return;
    void refreshMember();
  });

  const walletBalanceRaw = Number(member?.wallet_balance) || 0;
  const walletAnimOn = Boolean(member) && !loading;
  const animWalletBalance = useMemberAnimatedCount(walletBalanceRaw, { enabled: walletAnimOn, durationMs: 900 });
  const animDemoDeposit = useMemberAnimatedCount(DEMO_WALLET_TOTAL_DEPOSIT, { enabled: walletAnimOn, durationMs: 760 });
  const animDemoWithdraw = useMemberAnimatedCount(DEMO_WALLET_TOTAL_WITHDRAW, { enabled: walletAnimOn, durationMs: 820 });
  const animDemoFrozen = useMemberAnimatedCount(DEMO_WALLET_FROZEN, { enabled: walletAnimOn, durationMs: 700 });

  if (!member) return <Navigate to={ROUTES.MEMBER.ROOT} replace />;

  const filterLabel = (key: (typeof FILTER_KEYS)[number]) => {
    const m: Record<(typeof FILTER_KEYS)[number], [string, string]> = {
      all: ["全部", "All"],
      deposit: ["充值", "Deposit"],
      withdraw: ["提现", "Withdraw"],
      reward: ["奖励", "Rewards"],
    };
    return t(m[key][0], m[key][1]);
  };

  const filtered =
    activeFilter === "all" ? DEMO_TRANSACTIONS : DEMO_TRANSACTIONS.filter((x) => x.type === activeFilter);

  if (loading) {
    return (
      <MemberPageLoadingShell title={t("我的钱包", "My wallet")}>
        <ListSkeleton rows={6} />
      </MemberPageLoadingShell>
    );
  }

  return (
    <div className="m-page-bg relative min-h-screen pb-24">
      <BackHeader title={t("我的钱包", "My wallet")} />

      <div className="relative overflow-hidden">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] px-5 pb-6 pt-8">
          <div className="mb-6 flex items-center gap-2">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-to-br from-pu-gold to-pu-gold-soft shadow-pu-glow-gold">
              <Wallet className="h-4 w-4 text-[hsl(var(--pu-primary-foreground))]" aria-hidden />
            </div>
            <h1 className="text-xl font-extrabold text-[hsl(var(--pu-m-text))]">{t("我的钱包", "My wallet")}</h1>
          </div>

          <div
            className="m-glass relative overflow-hidden p-6"
            style={{ borderColor: "hsl(var(--pu-gold) / 0.15)" }}
          >
            <div
              className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br from-pu-gold/[0.06] to-pu-emerald/[0.04]"
              aria-hidden
            />
            <div className="relative">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-sm font-bold text-[hsl(var(--pu-m-text-dim))]">{t("可用余额", "Available")}</span>
                <span className="rounded-full bg-[hsl(var(--pu-m-surface)/0.6)] px-2.5 py-0.5 text-[10px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                  {t("冻结", "Frozen")}: ${animDemoFrozen.toFixed(2)}
                  <span className="ml-1 opacity-60">({t("演示", "demo")})</span>
                </span>
              </div>
              <div className="num-display-xl mb-5 bg-gradient-to-r from-[hsl(var(--pu-m-text))] to-[hsl(var(--pu-m-text)/0.7)] bg-clip-text text-transparent tabular-nums">
                ${animWalletBalance.toFixed(2)}
              </div>

              <div className="mb-5 grid grid-cols-2 gap-3">
                <div className="rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.6)] p-3.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--pu-m-text-dim))]">
                    {t("累计充值", "Total deposit")}
                  </div>
                  <div className="text-lg font-extrabold text-pu-emerald-soft tabular-nums">
                    ${Math.round(animDemoDeposit).toLocaleString()}
                  </div>
                  <p className="mt-1 text-[9px] text-[hsl(var(--pu-m-text-dim)/0.6)]">
                    {t("演示数据 · 接入 API 后同步", "Demo — replaces when API is live")}
                  </p>
                </div>
                <div className="rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.6)] p-3.5">
                  <div className="mb-1 text-[10px] font-bold uppercase tracking-[0.15em] text-[hsl(var(--pu-m-text-dim))]">
                    {t("累计提现", "Total withdraw")}
                  </div>
                  <div className="text-lg font-extrabold text-pu-rose-soft tabular-nums">
                    ${Math.round(animDemoWithdraw).toLocaleString()}
                  </div>
                  <p className="mt-1 text-[9px] text-[hsl(var(--pu-m-text-dim)/0.6)]">
                    {t("演示数据 · 接入 API 后同步", "Demo — replaces when API is live")}
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  onClick={() => toast.info(t("充值功能即将上线", "Deposit — coming soon"))}
                  className="flex items-center justify-center gap-2 rounded-xl py-3.5 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 active:scale-95"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-emerald)), hsl(var(--pu-emerald-soft)))",
                    color: "hsl(var(--pu-m-bg-1))",
                    boxShadow: "0 4px 16px -4px hsl(var(--pu-emerald) / 0.4)",
                  }}
                >
                  <ArrowDownLeft className="h-4 w-4" aria-hidden />
                  {t("充值", "Deposit")}
                </button>
                <button
                  type="button"
                  onClick={() => toast.info(t("提现功能即将上线", "Withdraw — coming soon"))}
                  className="flex items-center justify-center gap-2 rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.4)] bg-[hsl(var(--pu-m-surface)/0.7)] py-3.5 text-sm font-bold transition-all motion-reduce:transition-none motion-reduce:active:scale-100 hover:border-pu-gold/30 active:scale-95"
                >
                  <ArrowUpRight className="h-4 w-4 text-pu-gold-soft" aria-hidden />
                  {t("提现", "Withdraw")}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mb-6 px-5">
        <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.2em] text-[hsl(var(--pu-m-text-dim))]">
          {t("本月概览 · 演示", "Month overview · demo")}
        </p>
        <div className="grid grid-cols-3 gap-2.5">
          {[
            {
              icon: CreditCard,
              labelZh: "本月充值",
              labelEn: "Deposits",
              value: "$500",
              gradFrom: "hsl(var(--pu-emerald) / 0.06)",
              iconClass: "text-pu-emerald-soft",
            },
            {
              icon: DollarSign,
              labelZh: "本月提现",
              labelEn: "Withdrawals",
              value: "$200",
              gradFrom: "hsl(var(--pu-rose) / 0.06)",
              iconClass: "text-pu-rose-soft",
            },
            {
              icon: Sparkles,
              labelZh: "本月奖励",
              labelEn: "Rewards",
              value: "$60",
              gradFrom: "hsl(var(--pu-gold) / 0.06)",
              iconClass: "text-pu-gold-soft",
            },
          ].map((s) => (
            <div key={s.labelZh} className="m-glass relative overflow-hidden p-3 text-center">
              <div
                className="pointer-events-none absolute inset-0 rounded-[inherit] bg-gradient-to-br to-transparent"
                style={{ backgroundImage: `linear-gradient(to bottom right, ${s.gradFrom}, transparent)` }}
                aria-hidden
              />
              <div className="relative">
                <s.icon className={`mx-auto mb-1.5 h-3.5 w-3.5 ${s.iconClass}`} aria-hidden />
                <div className="mb-0.5 text-sm font-extrabold">{s.value}</div>
                <div className="text-[9px] font-bold uppercase tracking-wider text-[hsl(var(--pu-m-text-dim))]">
                  {t(s.labelZh, s.labelEn)}
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="px-5">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-extrabold text-[hsl(var(--pu-m-text))]">
            <TrendingUp className="h-4 w-4 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
            {t("交易明细", "Transactions")}
          </h2>
          <span className="text-[10px] font-bold text-[hsl(var(--pu-m-text-dim)/0.7)]">{t("演示数据", "Demo data")}</span>
        </div>

        <div className="scrollbar-hide mb-4 flex gap-2 overflow-x-auto pb-3">
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

        <div className="space-y-2">
          {filtered.map((tx) => (
            <div
              key={tx.id}
              className="m-glass flex items-center gap-3 rounded-2xl px-4 py-3.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.4)]"
            >
              <div
                className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
                  tx.type === "deposit" ? "bg-pu-emerald/10" : tx.type === "withdraw" ? "bg-pu-rose/10" : "bg-pu-gold/10"
                }`}
              >
                {tx.type === "deposit" ? (
                  <ArrowDownLeft className="h-4 w-4 text-pu-emerald-soft" aria-hidden />
                ) : tx.type === "withdraw" ? (
                  <ArrowUpRight className="h-4 w-4 text-pu-rose-soft" aria-hidden />
                ) : (
                  <Sparkles className="h-4 w-4 text-pu-gold-soft" aria-hidden />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="truncate text-sm font-bold text-[hsl(var(--pu-m-text))]">
                    {t(tx.descZh, tx.descEn)}
                  </span>
                  <StatusBadge status={tx.status} t={t} />
                </div>
                <div className="mt-0.5 flex items-center gap-2">
                  <span className="text-[10px] text-[hsl(var(--pu-m-text-dim))]">{tx.date}</span>
                  <span className="text-[10px] text-[hsl(var(--pu-m-text-dim)/0.5)]">
                    · {t(tx.methodZh, tx.methodEn)}
                  </span>
                </div>
              </div>
              <span
                className={`shrink-0 text-sm font-extrabold tabular-nums ${
                  tx.amount > 0 ? "text-pu-emerald-soft" : "text-pu-rose-soft"
                }`}
              >
                {tx.amount > 0 ? "+" : ""}
                {tx.amount.toFixed(2)}
              </span>
            </div>
          ))}
        </div>

        {filtered.length === 0 ? (
          <div className="rounded-2xl border border-dashed border-[hsl(var(--pu-m-surface-border)/0.45)] bg-[hsl(var(--pu-m-surface)/0.18)] px-4 py-12 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-[hsl(var(--pu-m-surface)/0.45)] text-[hsl(var(--pu-m-text-dim)/0.35)]">
              <AlertCircle className="h-7 w-7" aria-hidden />
            </div>
            <p className="text-sm font-semibold text-[hsl(var(--pu-m-text))]">{t("暂无交易记录", "No transactions")}</p>
            <p className="mt-1.5 text-[11px] text-[hsl(var(--pu-m-text-dim)/0.65)]">
              {t("切换筛选或接入 API 后将显示流水", "Try another filter or connect the API for live history")}
            </p>
            <MemberEmptyStateCta
              primary={{ to: ROUTES.MEMBER.DASHBOARD, label: t("回首页", "Home") }}
              secondary={{ to: ROUTES.MEMBER.SETTINGS, label: t("账户设置", "Account") }}
            />
          </div>
        ) : null}
      </div>

      <div className="h-8" />
    </div>
  );
}
