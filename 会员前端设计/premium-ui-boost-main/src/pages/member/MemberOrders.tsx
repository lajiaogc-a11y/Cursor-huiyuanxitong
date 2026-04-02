import { useState, useCallback, useEffect } from "react";
import {
  ShoppingCart, Package, CheckCircle, Clock, XCircle, Truck,
  ChevronDown, Gift, Loader2, ArrowLeftRight,
} from "lucide-react";
import MemberLayout from "@/components/member/MemberLayout";
import BackHeader from "@/components/member/BackHeader";
import { toast } from "sonner";
import { ListSkeleton } from "@/components/member/MemberSkeleton";

/* ── Mock Data ── */
const allOrders = [
  { id: "#0330R4J5TH9L", item: "1111", amount: "180,500 NGN", faceValue: "100", status: "Paid", date: "2026/03/30 02:03" },
  { id: "#0329K8M2PL4Q", item: "2222", amount: "95,000 NGN", faceValue: "50", status: "Paid", date: "2026/03/29 18:45" },
  { id: "#0328W6X1NR7S", item: "3333", amount: "360,000 NGN", faceValue: "200", status: "Pending", date: "2026/03/28 10:12" },
  { id: "#0327F3G9HJ2K", item: "4444", amount: "45,000 NGN", faceValue: "25", status: "Paid", date: "2026/03/27 14:30" },
  { id: "#0326L5N7QR8T", item: "5555", amount: "720,000 NGN", faceValue: "400", status: "Paid", date: "2026/03/26 09:15" },
  { id: "#0325M2P4ST6V", item: "6666", amount: "180,500 NGN", faceValue: "100", status: "Pending", date: "2026/03/25 16:20" },
  { id: "#0324X8Y1ZA3B", item: "7777", amount: "95,000 NGN", faceValue: "50", status: "Paid", date: "2026/03/24 11:45" },
  { id: "#0323C5D7EF9G", item: "8888", amount: "540,000 NGN", faceValue: "300", status: "Paid", date: "2026/03/23 08:30" },
];

const PAGE_SIZE = 4;

const statusFilters = [
  { key: "all", label: "全部" },
  { key: "Paid", label: "已支付" },
  { key: "Pending", label: "待处理" },
];

export default function MemberOrders() {
  const [activeFilter, setActiveFilter] = useState("all");
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [loadingMore, setLoadingMore] = useState(false);

  useEffect(() => {
    const t = setTimeout(() => setLoading(false), 600);
    return () => clearTimeout(t);
  }, []);

  const filteredAll = activeFilter === "all"
    ? allOrders
    : allOrders.filter((o) => o.status === activeFilter);

  const filtered = filteredAll.slice(0, visibleCount);
  const hasMore = visibleCount < filteredAll.length;

  const loadMore = useCallback(() => {
    setLoadingMore(true);
    setTimeout(() => {
      setVisibleCount((v) => v + PAGE_SIZE);
      setLoadingMore(false);
    }, 600);
  }, []);

  const handleFilterChange = (key: string) => {
    setActiveFilter(key);
    setVisibleCount(PAGE_SIZE);
  };

  if (loading) return <MemberLayout><ListSkeleton /></MemberLayout>;

  return (
    <MemberLayout>
      <div className="m-page-bg pb-24">
        <BackHeader title="订单管理" />

        {/* ── Header: My Orders ── */}
        <div className="px-5 mb-5">
          <div className="flex items-center gap-2 mb-1">
            <div className="w-1 h-5 rounded-full bg-primary" />
            <h2 className="text-base font-extrabold">Transaction History</h2>
          </div>
        </div>

        {/* ── Collapsible Orders Section ── */}
        <div className="px-5 mb-5">
          <button
            onClick={() => setExpandedId(expandedId === "__list__" ? null : "__list__")}
            className="w-full m-glass px-4 py-3.5 flex items-center gap-3 transition-all"
          >
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-emerald/20 to-emerald/5 flex items-center justify-center border border-emerald/10">
              <ArrowLeftRight className="h-4.5 w-4.5 text-emerald" />
            </div>
            <div className="flex-1 text-left">
              <div className="text-sm font-bold">My Orders</div>
              <div className="text-[11px] text-[hsl(var(--m-text-dim))]">{filteredAll.length} records</div>
            </div>
            <ChevronDown className={`w-4 h-4 text-[hsl(var(--m-text-dim)_/_0.5)] transition-transform duration-300 ${expandedId === "__list__" ? "rotate-180" : ""}`} />
          </button>
        </div>

        {/* ── Expanded Order List ── */}
        <div
          className="overflow-hidden transition-all duration-400 ease-in-out"
          style={{
            maxHeight: expandedId === "__list__" ? "3000px" : "0",
            opacity: expandedId === "__list__" ? 1 : 0,
          }}
        >
          {/* Filters */}
          <div className="px-5 mb-4">
            <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-hide">
              {statusFilters.map((f) => (
                <button
                  key={f.key}
                  onClick={() => handleFilterChange(f.key)}
                  className={`shrink-0 px-4 py-1.5 rounded-full text-xs font-bold transition-all duration-200 ${
                    activeFilter === f.key
                      ? "bg-primary/15 text-primary ring-1 ring-inset ring-primary/25"
                      : "bg-[hsl(var(--m-surface)_/_0.4)] text-[hsl(var(--m-text-dim))] border border-[hsl(var(--m-surface-border)_/_0.2)] hover:text-[hsl(var(--m-text))]"
                  }`}>
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {/* Order Cards */}
          <div className="px-5 space-y-2.5">
            {filtered.map((order) => (
              <div
                key={order.id}
                className="m-glass p-4 space-y-2 transition-all duration-200"
              >
                {/* Row 1: Date + Order ID */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[hsl(var(--m-text-dim))] font-medium">{order.date}</span>
                  <span className="text-[11px] text-[hsl(var(--m-text-dim))] font-mono">{order.id}</span>
                </div>

                {/* Row 2: Item + Amount */}
                <div className="flex items-center justify-between">
                  <span className="text-sm font-extrabold">{order.item}</span>
                  <span className="text-base font-extrabold">{order.amount}</span>
                </div>

                {/* Row 3: Face Value + Status */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-[hsl(var(--m-text-dim))]">Face value: {order.faceValue}</span>
                  <span className={`text-[11px] font-bold ${
                    order.status === "Paid" ? "text-emerald" : "text-rose-soft"
                  }`}>
                    {order.status}
                  </span>
                </div>
              </div>
            ))}

            {/* Load More */}
            {hasMore && (
              <button
                onClick={loadMore}
                disabled={loadingMore}
                className="w-full py-3 mt-2 rounded-xl font-bold text-xs flex items-center justify-center gap-2 transition-all active:scale-95 bg-[hsl(var(--m-surface)_/_0.5)] border border-[hsl(var(--m-surface-border)_/_0.3)] text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text))] hover:bg-[hsl(var(--m-surface)_/_0.7)]">
                {loadingMore ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    加载中...
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-4 h-4" />
                    加载更多（剩余 {filteredAll.length - visibleCount} 条）
                  </>
                )}
              </button>
            )}

            {!hasMore && filtered.length > 0 && (
              <p className="text-center text-[10px] text-[hsl(var(--m-text-dim)_/_0.4)] mt-3 pb-2 font-medium">— 已显示全部订单 —</p>
            )}

            {filtered.length === 0 && (
              <div className="text-center py-12">
                <Gift className="w-10 h-10 text-[hsl(var(--m-text-dim)_/_0.2)] mx-auto mb-3" />
                <p className="text-sm text-[hsl(var(--m-text-dim))] font-medium">暂无订单</p>
              </div>
            )}
          </div>
        </div>

        <div className="h-8" />
      </div>
    </MemberLayout>
  );
}
