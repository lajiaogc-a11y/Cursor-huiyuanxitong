import { useState, useEffect } from "react";
import {
  Wallet, ArrowUpRight, ArrowDownLeft, TrendingUp,
  ChevronRight, Clock, CheckCircle, XCircle, AlertCircle,
  CreditCard, DollarSign, Sparkles,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/member/MemberSkeleton";

/* ── Mock Data ── */
const walletData = {
  balance: 1280.50,
  frozen: 150.00,
  totalDeposit: 5000.00,
  totalWithdraw: 3569.50,
};

const transactions = [
  { id: "T001", type: "deposit", desc: "USDT 充值", amount: 500, status: "completed", date: "2024-03-01 14:30", method: "TRC20" },
  { id: "T002", type: "withdraw", desc: "USDT 提现", amount: -200, status: "completed", date: "2024-02-28 10:15", method: "TRC20" },
  { id: "T003", type: "reward", desc: "邀请奖励", amount: 50, status: "completed", date: "2024-02-27 18:00", method: "系统" },
  { id: "T004", type: "deposit", desc: "积分兑换", amount: 38.50, status: "completed", date: "2024-02-26 09:30", method: "积分" },
  { id: "T005", type: "withdraw", desc: "USDT 提现", amount: -300, status: "pending", date: "2024-02-25 15:45", method: "TRC20" },
  { id: "T006", type: "withdraw", desc: "银行转账", amount: -100, status: "rejected", date: "2024-02-24 11:00", method: "银行" },
  { id: "T007", type: "reward", desc: "签到奖励", amount: 10, status: "completed", date: "2024-02-23 08:00", method: "系统" },
  { id: "T008", type: "deposit", desc: "USDT 充值", amount: 1000, status: "completed", date: "2024-02-22 20:00", method: "TRC20" },
];

const filters = [
  { key: "all", label: "全部" },
  { key: "deposit", label: "充值" },
  { key: "withdraw", label: "提现" },
  { key: "reward", label: "奖励" },
];

function StatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; label: string; cls: string }> = {
    completed: { icon: CheckCircle, label: "已完成", cls: "text-emerald bg-emerald/10 ring-1 ring-inset ring-emerald/20" },
    pending: { icon: Clock, label: "处理中", cls: "text-rose bg-rose/10 ring-1 ring-inset ring-rose/20" },
    rejected: { icon: XCircle, label: "已拒绝", cls: "text-destructive bg-destructive/10 ring-1 ring-inset ring-destructive/20" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold ${c.cls}`}>
      <c.icon className="h-2.5 w-2.5" />
      {c.label}
    </span>
  );
}

export default function MemberWallet() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const filtered = activeFilter === "all"
    ? transactions
    : transactions.filter((t) => t.type === activeFilter);

  if (loading) return <MemberLayout><ListSkeleton /></MemberLayout>;


  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        {/* Header */}
        <div className="relative overflow-hidden">
          <div className="absolute -top-20 -right-20 w-72 h-72 rounded-full bg-gold/[0.07] blur-[100px]" />
          <div className="absolute -bottom-16 -left-16 w-56 h-56 rounded-full bg-emerald/[0.05] blur-[80px]" />

          <div className="relative px-5 pt-8 pb-6">
            <div className="flex items-center gap-2 mb-6">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-gold to-gold-soft flex items-center justify-center">
                <Wallet className="w-4 h-4 text-white" />
              </div>
              <h1 className="text-xl font-extrabold">我的钱包</h1>
            </div>

            {/* Balance Card */}
            <div className="m-glass p-6 relative overflow-hidden" style={{ borderColor: 'hsl(var(--m-glow-gold) / 0.15)' }}>
              <div className="absolute inset-0 bg-gradient-to-br from-gold/[0.06] to-emerald/[0.04] pointer-events-none rounded-[inherit]" />
              <div className="relative">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-sm text-[hsl(var(--m-text-dim))] font-bold">可用余额</span>
                  <span className="text-[10px] font-bold text-[hsl(var(--m-text-dim))] bg-[hsl(var(--m-surface)_/_0.6)] px-2.5 py-0.5 rounded-full">
                    冻结: ${walletData.frozen.toFixed(2)}
                  </span>
                </div>
                <div className="num-display-xl bg-gradient-to-r from-[hsl(var(--m-text))] to-[hsl(var(--m-text)_/_0.7)] bg-clip-text text-transparent mb-5">
                  ${walletData.balance.toFixed(2)}
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] p-3.5 border border-[hsl(var(--m-surface-border)_/_0.3)]">
                    <div className="text-[10px] text-[hsl(var(--m-text-dim))] mb-1 font-bold tracking-[0.15em] uppercase">累计充值</div>
                    <div className="text-lg font-extrabold text-emerald-soft">${walletData.totalDeposit.toFixed(0)}</div>
                  </div>
                  <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] p-3.5 border border-[hsl(var(--m-surface-border)_/_0.3)]">
                    <div className="text-[10px] text-[hsl(var(--m-text-dim))] mb-1 font-bold tracking-[0.15em] uppercase">累计提现</div>
                    <div className="text-lg font-extrabold text-rose-soft">${walletData.totalWithdraw.toFixed(0)}</div>
                  </div>
                </div>

                {/* Action Buttons */}
                <div className="grid grid-cols-2 gap-3">
                  <button
                    onClick={() => toast.info("充值功能即将上线")}
                    className="py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                    style={{
                      background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald-soft)))",
                      color: "hsl(var(--m-bg-1))",
                      boxShadow: "0 4px 16px -4px hsl(var(--emerald) / 0.4)",
                    }}>
                    <ArrowDownLeft className="w-4 h-4" />
                    充值
                  </button>
                  <button
                    onClick={() => toast.info("提现功能即将上线")}
                    className="py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 bg-[hsl(var(--m-surface)_/_0.7)] border border-[hsl(var(--m-surface-border)_/_0.4)] hover:border-gold/30">
                    <ArrowUpRight className="w-4 h-4 text-gold-soft" />
                    提现
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="px-5 mb-6">
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: CreditCard, label: "本月充值", value: "$500", color: "--emerald" },
              { icon: DollarSign, label: "本月提现", value: "$200", color: "--rose" },
              { icon: Sparkles, label: "本月奖励", value: "$60", color: "--gold" },
            ].map((s) => (
              <div key={s.label} className="m-glass p-3 text-center relative overflow-hidden">
                <div className={`absolute inset-0 bg-gradient-to-br from-[hsl(var(${s.color})_/_0.06)] to-transparent pointer-events-none rounded-[inherit]`} />
                <div className="relative">
                  <s.icon className="w-3.5 h-3.5 mx-auto mb-1.5" style={{ color: `hsl(var(${s.color}-soft))` }} />
                  <div className="text-sm font-extrabold mb-0.5">{s.value}</div>
                  <div className="text-[9px] font-bold text-[hsl(var(--m-text-dim))] tracking-wider uppercase">{s.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Transaction History */}
        <div className="px-5">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-extrabold flex items-center gap-2">
              <TrendingUp className="w-4 h-4 text-[hsl(var(--m-text-dim))]" />
              交易明细
            </h2>
          </div>

          {/* Filters */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-4 scrollbar-hide">
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

          {/* Transaction List */}
          <div className="space-y-2">
            {filtered.map((tx) => (
              <div key={tx.id}
                className="m-glass px-4 py-3.5 flex items-center gap-3 transition hover:bg-[hsl(var(--m-surface)_/_0.4)]">
                <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                  tx.type === "deposit" ? "bg-emerald/10" :
                  tx.type === "withdraw" ? "bg-rose/10" : "bg-gold/10"
                }`}>
                  {tx.type === "deposit" ? <ArrowDownLeft className="w-4 h-4 text-emerald-soft" /> :
                   tx.type === "withdraw" ? <ArrowUpRight className="w-4 h-4 text-rose-soft" /> :
                   <Sparkles className="w-4 h-4 text-gold-soft" />}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-bold truncate">{tx.desc}</span>
                    <StatusBadge status={tx.status} />
                  </div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-[10px] text-[hsl(var(--m-text-dim))]">{tx.date}</span>
                    <span className="text-[10px] text-[hsl(var(--m-text-dim)_/_0.5)]">· {tx.method}</span>
                  </div>
                </div>
                <span className={`text-sm font-extrabold tabular-nums shrink-0 ${
                  tx.amount > 0 ? "text-emerald-soft" : "text-rose-soft"
                }`}>
                  {tx.amount > 0 ? "+" : ""}{tx.amount.toFixed(2)}
                </span>
              </div>
            ))}
          </div>

          {filtered.length === 0 && (
            <div className="text-center py-12">
              <AlertCircle className="w-8 h-8 text-[hsl(var(--m-text-dim)_/_0.3)] mx-auto mb-3" />
              <p className="text-sm text-[hsl(var(--m-text-dim))]">暂无交易记录</p>
            </div>
          )}
        </div>

        <div className="h-8" />
      </div>
    </MemberLayout>
  );
}
