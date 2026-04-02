import { useState, useEffect, useRef } from "react";
import {
  ShoppingCart, LayoutGrid, Package,
  Clock, CheckCircle, XCircle, Sparkles, Gift, X, AlertTriangle, ShieldCheck,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import { toast } from "sonner";
import { CardGridSkeleton } from "@/components/member/MemberSkeleton";

/* ─── Animated Counter Hook ─── */
function useAnimatedCount(target: number, duration = 800) {
  const [value, setValue] = useState(0);
  const prev = useRef(0);
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    const start = performance.now();
    const tick = (now: number) => {
      const t = Math.min((now - start) / duration, 1);
      const ease = 1 - Math.pow(1 - t, 3);
      setValue(Math.round(from + (target - from) * ease));
      if (t < 1) requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
  }, [target, duration]);
  return value;
}

/* ─── Mock Data ─── */
const member = {
  name: "John Doe", totalPoints: 3850, availablePoints: 2650,
  frozenPoints: 1200, todayEarnedPoints: 150, todayEarned: 150,
};
const catalog = [
  { id: 1, name: "Amazon $10 Gift Card", image: "", points: 1000, stock: 50, category: "gift-card", hot: true, recommended: true, limited: false, desc: "Amazon 电子礼品卡，可用于 Amazon 全平台消费。兑换后 24 小时内发放兑换码。" },
  { id: 2, name: "Netflix 1 Month", image: "", points: 1500, stock: 20, category: "gift-card", hot: false, recommended: true, limited: false, desc: "Netflix 标准版一个月订阅，支持 1080p 高清，可在两台设备同时观看。" },
  { id: 3, name: "Spotify Premium 1 Month", image: "", points: 800, stock: 35, category: "gift-card", hot: false, recommended: false, limited: false, desc: "Spotify Premium 一个月会员，无广告音乐播放，支持离线下载。" },
  { id: 4, name: "Steam $20 Gift Card", image: "", points: 2000, stock: 15, category: "gift-card", hot: true, recommended: true, limited: true, desc: "Steam 平台电子钱包充值卡，可用于购买游戏及 DLC。" },
  { id: 5, name: "Apple $25 Gift Card", image: "", points: 2500, stock: 10, category: "gift-card", hot: false, recommended: false, limited: true, desc: "Apple 礼品卡，可用于 App Store、iTunes、Apple Music 等服务。" },
  { id: 6, name: "Google Play $15", image: "", points: 1500, stock: 25, category: "gift-card", hot: false, recommended: true, limited: false, desc: "Google Play 电子礼品卡，可用于购买应用、游戏、电影等数字内容。" },
  { id: 7, name: "USDT 提现 $10", image: "", points: 1000, stock: 999, category: "gift-card", hot: true, recommended: false, limited: false, desc: "将积分兑换为 USDT，通过 TRC20 网络提现至您的钱包地址。" },
  { id: 8, name: "额外抽奖机会 x3", image: "", points: 500, stock: 999, category: "gift-card", hot: true, recommended: true, limited: true, desc: "获得 3 次额外幸运抽奖机会，立即可用。中奖概率与普通抽奖相同。" },
];
const redeemHistory = [
  { id: "R001", item: "Amazon $10 Gift Card", points: 1000, status: "completed", date: "2024-03-01 14:30", code: "AMZN-XXXX-YYYY" },
  { id: "R002", item: "Netflix 1 Month", points: 1500, status: "pending", date: "2024-02-28 10:15", code: "" },
  { id: "R003", item: "USDT 提现 $10", points: 1000, status: "rejected", date: "2024-02-25 09:00", code: "" },
];
const categories = [
  { key: "recommended", label: "推荐" },
  { key: "hot", label: "热销" },
  { key: "all", label: "全部" },
  { key: "gift-card", label: "礼品" },
  { key: "limited", label: "限购" },
];

/* ─── Points Balance Card ─── */
function PointsBalanceCard() {
  const animTotal = useAnimatedCount(member.totalPoints);
  const animAvailable = useAnimatedCount(member.availablePoints, 1000);
  const animFrozen = useAnimatedCount(member.frozenPoints, 1000);
  const animTodayEarned = useAnimatedCount(member.todayEarnedPoints, 1000);

  const blocks = [
    { label: "总积分", value: animTotal, color: "text-[hsl(var(--m-text))]", accent: "from-gold/[0.06] to-gold/[0.02]" },
    { label: "可用积分", value: animAvailable, color: "text-gold", accent: "from-emerald/[0.06] to-emerald/[0.02]" },
    { label: "冻结积分", value: animFrozen, color: "text-rose-soft", accent: "from-rose/[0.06] to-rose/[0.02]" },
    { label: "今日获得", value: animTodayEarned, color: "text-emerald", accent: "from-emerald/[0.06] to-emerald/[0.02]" },
  ];

  return (
    <div className="mb-6">
      <div className="grid grid-cols-2 gap-2.5">
        {blocks.map((item) => (
          <div key={item.label} className="m-glass p-4 text-center relative overflow-hidden">
            <div className={`absolute inset-0 bg-gradient-to-br ${item.accent} pointer-events-none rounded-[inherit]`} />
            <div className="relative">
              <div className="text-[11px] text-[hsl(var(--m-text-dim))] mb-2 font-bold tracking-wide">{item.label}</div>
              <div className={`text-2xl font-extrabold tabular-nums ${item.color}`}>{item.value.toLocaleString()}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ─── Product Card ─── */
function ProductCard({ item, onClick }: { item: typeof catalog[0]; onClick: () => void }) {
  const canAfford = member.totalPoints >= item.points;
  return (
    <div
      onClick={onClick}
      className="rounded-2xl bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.3)] overflow-hidden hover:border-gold/20 transition-all duration-300 group cursor-pointer active:scale-[0.97]">
      <div className="aspect-square bg-gradient-to-br from-[hsl(var(--m-surface)_/_0.8)] to-[hsl(var(--m-bg-1)_/_0.5)] flex items-center justify-center relative">
        <Package className="h-10 w-10 text-[hsl(var(--m-text-dim)_/_0.2)]" />
        {/* Tags row */}
        <div className="absolute top-2.5 left-2.5 flex flex-wrap gap-1">
          {item.hot && (
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-lg bg-gradient-to-r from-rose to-rose-soft text-white">
              热销
            </span>
          )}
          {item.recommended && (
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-lg bg-gradient-to-r from-gold to-gold-soft text-[hsl(220_22%_5%)]">
              推荐
            </span>
          )}
          {item.limited && (
            <span className="px-2 py-0.5 text-[10px] font-extrabold rounded-lg bg-rose/15 text-rose-soft ring-1 ring-inset ring-rose/25">
              限购
            </span>
          )}
        </div>
        {item.stock < 20 && (
          <span className="absolute top-2.5 right-2.5 px-2 py-0.5 text-[10px] rounded-lg bg-rose/10 text-rose-soft ring-1 ring-inset ring-rose/20 font-bold">
            仅剩 {item.stock}
          </span>
        )}
      </div>
      <div className="p-3.5">
        <h4 className="text-sm font-bold truncate mb-2.5 group-hover:text-gold-soft transition-colors">
          {item.name}
        </h4>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1">
            <Sparkles className="h-3.5 w-3.5 text-gold" />
            <span className="text-sm font-extrabold text-gold-soft">{item.points.toLocaleString()}</span>
          </div>
          <span
            className={`px-3.5 py-1.5 text-xs rounded-xl font-bold ${
              canAfford
                ? "btn-glow"
                : "bg-[hsl(var(--m-surface)_/_0.6)] text-[hsl(var(--m-text-dim)_/_0.4)] border border-[hsl(var(--m-surface-border)_/_0.3)]"
            }`}
          >
            {canAfford ? "兑换" : "积分不足"}
          </span>
        </div>
      </div>
    </div>
  );
}

/* ─── Product Detail Modal ─── */
function ProductModal({
  item,
  onClose,
}: {
  item: typeof catalog[0];
  onClose: () => void;
}) {
  const [step, setStep] = useState<"detail" | "confirm" | "success">("detail");
  const canAfford = member.totalPoints >= item.points;

  const handleRedeem = () => {
    if (!canAfford) return;
    setStep("success");
    toast.success(`${item.name} 兑换成功！`);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center animate-fade-in"
      style={{ background: "hsl(var(--m-bg-1) / 0.85)", backdropFilter: "blur(12px)" }}
      onClick={onClose}>
      <div
        className="relative w-full max-w-lg rounded-t-3xl overflow-hidden animate-[slideUp_0.3s_ease-out]"
        style={{
          background: "linear-gradient(180deg, hsl(var(--m-bg-2)), hsl(var(--m-bg-1)))",
          border: "1px solid hsl(var(--m-surface-border) / 0.3)",
          borderBottom: "none",
          maxHeight: "85vh",
        }}
        onClick={(e) => e.stopPropagation()}>

        {/* Close */}
        <button onClick={onClose} className="absolute top-4 right-4 z-10 p-2 rounded-xl bg-[hsl(var(--m-surface)_/_0.6)] hover:bg-[hsl(var(--m-surface)_/_0.9)] transition border border-[hsl(var(--m-surface-border)_/_0.3)]">
          <X className="w-4 h-4 text-[hsl(var(--m-text-dim))]" />
        </button>

        {step === "detail" && (
          <div>
            {/* Product Image */}
            <div className="aspect-[16/9] bg-gradient-to-br from-[hsl(var(--m-surface)_/_0.8)] to-[hsl(var(--m-bg-1)_/_0.5)] flex items-center justify-center relative">
              <Package className="h-16 w-16 text-[hsl(var(--m-text-dim)_/_0.15)]" />
              {/* Tags */}
              <div className="absolute top-4 left-4 flex flex-wrap gap-1.5">
                {item.hot && (
                  <span className="px-3 py-1 text-xs font-extrabold rounded-lg bg-gradient-to-r from-rose to-rose-soft text-white">
                    热销
                  </span>
                )}
                {item.recommended && (
                  <span className="px-3 py-1 text-xs font-extrabold rounded-lg bg-gradient-to-r from-gold to-gold-soft text-white">
                    推荐
                  </span>
                )}
                {item.limited && (
                  <span className="px-3 py-1 text-xs font-extrabold rounded-lg bg-rose/15 text-rose-soft ring-1 ring-inset ring-rose/25">
                    限购
                  </span>
                )}
              </div>
            </div>

            <div className="p-5 pb-8 space-y-5">
              {/* Title & Price */}
              <div>
                <h2 className="text-lg font-extrabold mb-2">{item.name}</h2>
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <Sparkles className="h-4 w-4 text-gold" />
                    <span className="text-xl font-extrabold text-gold-soft">{item.points.toLocaleString()}</span>
                    <span className="text-xs text-[hsl(var(--m-text-dim))] font-bold">积分</span>
                  </div>
                  {item.stock < 20 && (
                    <span className="px-2.5 py-0.5 text-[10px] rounded-full bg-rose/10 text-rose-soft ring-1 ring-inset ring-rose/20 font-bold">
                      仅剩 {item.stock}
                    </span>
                  )}
                </div>
              </div>

              {/* Description */}
              <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.4)] border border-[hsl(var(--m-surface-border)_/_0.2)] p-4">
                <h3 className="text-xs font-bold text-[hsl(var(--m-text-dim))] mb-2 uppercase tracking-widest">商品详情</h3>
                <p className="text-sm text-[hsl(var(--m-text)_/_0.8)] leading-relaxed">{item.desc}</p>
              </div>

              {/* Info Grid */}
              <div className="grid grid-cols-2 gap-2.5">
                <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.35)] border border-[hsl(var(--m-surface-border)_/_0.15)] p-3 text-center">
                  <div className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-0.5">库存</div>
                  <div className="text-sm font-extrabold">{item.stock}</div>
                </div>
                <div className="rounded-xl bg-[hsl(var(--m-surface)_/_0.35)] border border-[hsl(var(--m-surface-border)_/_0.15)] p-3 text-center">
                  <div className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-0.5">分类</div>
                  <div className="text-sm font-extrabold">{categories.find((c) => c.key === item.category)?.label || item.category}</div>
                </div>
              </div>

              {/* CTA */}
              <button
                onClick={() => canAfford && setStep("confirm")}
                disabled={!canAfford}
                className={`w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95 ${
                  canAfford
                    ? ""
                    : "opacity-50 cursor-not-allowed bg-[hsl(var(--m-surface)_/_0.6)] border border-[hsl(var(--m-surface-border)_/_0.3)] text-[hsl(var(--m-text-dim))]"
                }`}
                style={canAfford ? {
                  background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
                  color: "hsl(220 22% 5%)",
                  boxShadow: "0 4px 20px -6px hsl(var(--gold) / 0.5)",
                } : undefined}>
                {canAfford ? (
                  <>
                    <Sparkles className="w-4 h-4" />
                    立即兑换
                  </>
                ) : (
                  <>
                    <AlertTriangle className="w-4 h-4" />
                    积分不足（还差 {(item.points - member.totalPoints).toLocaleString()} 积分）
                  </>
                )}
              </button>
            </div>
          </div>
        )}

        {step === "confirm" && (
          <div className="p-6 pb-8 space-y-6">
            <div className="text-center pt-4">
              <div className="w-14 h-14 rounded-2xl bg-gold/10 flex items-center justify-center mx-auto mb-4 ring-1 ring-inset ring-gold/20">
                <ShieldCheck className="w-7 h-7 text-gold-soft" />
              </div>
              <h2 className="text-lg font-extrabold mb-1">确认兑换</h2>
              <p className="text-xs text-[hsl(var(--m-text-dim))]">请核实以下兑换信息</p>
            </div>

            <div className="m-glass p-4 space-y-3">
              <div className="flex justify-between text-sm">
                <span className="text-[hsl(var(--m-text-dim))]">商品</span>
                <span className="font-bold">{item.name}</span>
              </div>
              <div className="border-t border-[hsl(var(--m-surface-border)_/_0.2)]" />
              <div className="flex justify-between text-sm">
                <span className="text-[hsl(var(--m-text-dim))]">消耗积分</span>
                <span className="font-extrabold text-rose-soft flex items-center gap-1">
                  <Sparkles className="w-3 h-3" />
                  -{item.points.toLocaleString()}
                </span>
              </div>
              <div className="border-t border-[hsl(var(--m-surface-border)_/_0.2)]" />
              <div className="flex justify-between text-sm">
                <span className="text-[hsl(var(--m-text-dim))]">剩余积分</span>
                <span className="font-extrabold text-emerald-soft">{(member.totalPoints - item.points).toLocaleString()}</span>
              </div>
            </div>

            <div className="space-y-2.5">
              <button
                onClick={handleRedeem}
                className="w-full py-3.5 rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-all active:scale-95"
                style={{
                  background: "linear-gradient(135deg, hsl(var(--emerald)), hsl(var(--emerald-soft)))",
                  color: "hsl(var(--m-bg-1))",
                  boxShadow: "0 4px 20px -6px hsl(var(--emerald) / 0.5)",
                }}>
                <CheckCircle className="w-4 h-4" />
                确认兑换
              </button>
              <button
                onClick={() => setStep("detail")}
                className="w-full py-3 rounded-xl font-bold text-sm bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.3)] text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition">
                返回
              </button>
            </div>
          </div>
        )}

        {step === "success" && (
          <div className="p-6 pb-8 space-y-6">
            <div className="text-center pt-8">
              <div className="w-16 h-16 rounded-full bg-emerald/15 flex items-center justify-center mx-auto mb-4 ring-2 ring-inset ring-emerald/25">
                <CheckCircle className="w-8 h-8 text-emerald" />
              </div>
              <h2 className="text-xl font-extrabold mb-2 text-emerald-soft">兑换成功！</h2>
              <p className="text-sm text-[hsl(var(--m-text-dim))] leading-relaxed">
                您已成功兑换 <span className="font-bold text-[hsl(var(--m-text))]">{item.name}</span>
              </p>
              <p className="text-xs text-[hsl(var(--m-text-dim)_/_0.6)] mt-2">
                兑换码将在 24 小时内发放，请前往订单中心查看
              </p>
            </div>

            <div className="m-glass p-4 text-center">
              <div className="text-[10px] text-[hsl(var(--m-text-dim))] font-bold mb-1 uppercase tracking-widest">消耗积分</div>
              <div className="text-2xl font-extrabold text-gold-soft flex items-center justify-center gap-1.5">
                <Sparkles className="w-5 h-5" />
                -{item.points.toLocaleString()}
              </div>
            </div>

            <button
              onClick={onClose}
              className="w-full py-3.5 rounded-xl font-bold text-sm transition-all active:scale-95"
              style={{
                background: "linear-gradient(135deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
                color: "hsl(220 22% 5%)",
                boxShadow: "0 4px 20px -6px hsl(var(--gold) / 0.5)",
              }}>
              完成
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── OrderStatusBadge ─── */
function OrderStatusBadge({ status }: { status: string }) {
  const config: Record<string, { icon: any; label: string; cls: string }> = {
    completed: { icon: CheckCircle, label: "已完成", cls: "text-emerald bg-emerald/10 ring-1 ring-inset ring-emerald/20" },
    pending: { icon: Clock, label: "处理中", cls: "text-rose bg-rose/10 ring-1 ring-inset ring-rose/20" },
    rejected: { icon: XCircle, label: "已拒绝", cls: "text-destructive bg-destructive/10 ring-1 ring-inset ring-destructive/20" },
  };
  const c = config[status] || config.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-bold ${c.cls}`}>
      <c.icon className="h-3 w-3" />
      {c.label}
    </span>
  );
}

/* ─── Main ─── */
export default function MemberPoints() {
  const [activeCat, setActiveCat] = useState("recommended");
  const [selectedItem, setSelectedItem] = useState<typeof catalog[0] | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  if (loading) return <MemberLayout><CardGridSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        {/* Title */}
        <div className="px-5 pt-7 pb-3">
          <h1 className="text-xl font-extrabold flex items-center gap-2">
            <Gift className="h-5 w-5 text-gold" />
            积分商城
          </h1>
          <p className="text-xs text-[hsl(var(--m-text-dim))] mt-1.5 font-medium">用积分兑换精选好礼</p>
        </div>

        <div className="px-5">
          <PointsBalanceCard />

          {/* Tabs */}
          <div className="flex gap-1 bg-[hsl(var(--m-surface)_/_0.4)] rounded-xl p-1 mb-6 border border-[hsl(var(--m-surface-border)_/_0.2)]">
            <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg bg-gold/15 text-sm font-bold text-gold-soft ring-1 ring-inset ring-gold/20">
              <LayoutGrid className="h-4 w-4" />
              商城
            </button>
            <button className="flex-1 flex items-center justify-center gap-1.5 py-2.5 rounded-lg text-sm font-bold text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] transition">
              <Clock className="h-4 w-4" />
              兑换记录
            </button>
          </div>

          {/* Category Filter */}
          <div className="flex gap-2 overflow-x-auto pb-3 mb-5 scrollbar-hide">
            {categories.map((cat) => (
              <button
                key={cat.key}
                onClick={() => setActiveCat(cat.key)}
                className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                  activeCat === cat.key
                    ? "bg-gold/15 text-gold-soft ring-1 ring-inset ring-gold/25"
                    : "bg-[hsl(var(--m-surface)_/_0.4)] text-[hsl(var(--m-text-dim))] border border-[hsl(var(--m-surface-border)_/_0.2)] hover:text-[hsl(var(--m-text))] hover:border-[hsl(var(--m-surface-border)_/_0.5)]"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Product Grid */}
          <div className="grid grid-cols-2 gap-3.5 mb-8">
            {catalog
              .filter((item) => {
                if (activeCat === "all") return true;
                if (activeCat === "recommended") return item.recommended;
                if (activeCat === "hot") return item.hot;
                if (activeCat === "limited") return item.limited;
                if (activeCat === "gift-card") return item.category === "gift-card";
                return true;
              })
              .map((item, i) => (
              <div key={item.id}
                className="animate-fade-in"
                style={{ animationDelay: `${i * 80}ms`, animationFillMode: "backwards" }}>
                <ProductCard item={item} onClick={() => setSelectedItem(item)} />
              </div>
            ))}
          </div>

          {/* Redeem History (hidden structure) */}
          <div className="hidden">
            <h3 className="text-base font-extrabold mb-3 flex items-center gap-2">
              <ShoppingCart className="h-4 w-4 text-[hsl(var(--m-text-dim))]" />
              兑换记录
            </h3>
            <div className="space-y-3">
              {redeemHistory.map((order) => (
                <div key={order.id} className="m-glass p-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-bold">{order.item}</span>
                    <OrderStatusBadge status={order.status} />
                  </div>
                  <div className="flex items-center justify-between text-xs text-[hsl(var(--m-text-dim))]">
                    <span className="font-medium">{order.date}</span>
                    <span className="flex items-center gap-1 font-bold">
                      <Sparkles className="h-3 w-3 text-gold" />
                      -{order.points}
                    </span>
                  </div>
                  {order.code && (
                    <div className="mt-2 px-3 py-1.5 rounded-lg bg-emerald/[0.08] ring-1 ring-inset ring-emerald/15 text-xs text-emerald-soft font-mono font-bold">
                      {order.code}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Product Detail Modal */}
      {selectedItem && (
        <ProductModal item={selectedItem} onClose={() => setSelectedItem(null)} />
      )}
    </MemberLayout>
  );
}
