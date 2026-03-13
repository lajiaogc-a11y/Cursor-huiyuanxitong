import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Button, Spin, Empty, Modal, InputNumber } from "antd";
import { StarOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPoints } from "@/hooks/useMemberPoints";
import { supabase } from "@/integrations/supabase/client";
import { listMemberPointsMallItems, redeemPointsMallItem, type PointsMallItem } from "@/services/memberPointsMallService";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

function RedemptionStatusBadge({ status }: { status: string }) {
  if (status === "completed" || status === "fulfilled") {
    return <span className="member-status-done">已完成</span>;
  }
  if (status === "pending" || status === "processing") {
    return <span className="member-status-pending">处理中</span>;
  }
  return <span style={{ fontSize: 11, color: "#94a3b8" }}>{status}</span>;
}

function MemberRedemptionsList({ memberId, refreshKey = 0 }: { memberId: string; refreshKey?: number }) {
  const [list, setList] = useState<{ id: string; prize_name: string; quantity: number; status: string; created_at: string; points_used?: number }[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    setLoading(true);
    (async () => {
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select("id, prize_id, mall_item_id, item_title, status, created_at, points_used, quantity")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!redemptions?.length) { setList([]); setLoading(false); return; }
      const prizeIds = [...new Set(redemptions.map((r) => r.prize_id).filter(Boolean))];
      const { data: prizes } = await supabase.from("prizes").select("id, name").in("id", prizeIds);
      const nameMap = new Map((prizes || []).map((p) => [p.id, p.name]));
      setList(
        redemptions.map((r) => ({
          id: r.id,
          prize_name: (r.item_title || "").trim() || (r.prize_id && nameMap.get(r.prize_id)) || "—",
          quantity: Number(r.quantity || 1),
          status: r.status,
          created_at: r.created_at,
          points_used: r.points_used,
        }))
      );
      setLoading(false);
    })();
  }, [memberId, refreshKey]);

  if (loading) return <div style={{ textAlign: "center", padding: 20 }}><Spin size="small" /></div>;
  if (list.length === 0) return <Empty description="暂无兑换记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {list.map((r) => (
        <div key={r.id} style={{
          display: "flex", justifyContent: "space-between", alignItems: "center",
          padding: "12px 14px",
          background: "#f8fafc",
          borderRadius: 12,
          border: "1px solid rgba(15,23,42,0.05)",
        }}>
          <div>
            <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
              {r.prize_name}
              <span style={{ marginLeft: 6, color: "#64748b", fontWeight: 500, fontSize: 12 }}>x{r.quantity}</span>
            </p>
            <p style={{ margin: "2px 0 0", fontSize: 11, color: "#94a3b8" }}>
              {format(new Date(r.created_at), "yyyy/MM/dd HH:mm")}
              {r.points_used ? <span style={{ marginLeft: 6, color: "#f59e0b", fontWeight: 600 }}>-{r.points_used}积分</span> : null}
            </p>
          </div>
          <RedemptionStatusBadge status={r.status} />
        </div>
      ))}
    </div>
  );
}

export default function MemberPoints() {
  const { member } = useMemberAuth();
  const { points, loading, refresh: refreshPoints } = useMemberPoints(member?.id);
  const [items, setItems] = useState<PointsMallItem[]>([]);
  const [itemsLoading, setItemsLoading] = useState(true);
  const [redeeming, setRedeeming] = useState(false);
  const [redeemTarget, setRedeemTarget] = useState<PointsMallItem | null>(null);
  const [redeemQty, setRedeemQty] = useState(1);
  const [redemptionsKey, setRedemptionsKey] = useState(0);

  useEffect(() => {
    if (!member) return;
    (async () => {
      try {
        setItems(await listMemberPointsMallItems(member.id));
      } catch {
        setItems([]);
      } finally { setItemsLoading(false); }
    })();
  }, [member?.id]);

  const handleRedeem = async () => {
    if (!member || !redeemTarget) return;
    const qty = Math.max(1, Math.min(Number(redeemQty || 1), redeemTarget.per_order_limit || 1));
    setRedeeming(true);
    try {
      const r = await redeemPointsMallItem(member.id, redeemTarget.id, qty);
      if (!r.success) {
        if (r.error === "INSUFFICIENT_POINTS") {
          toast.error(`积分不足，需要 ${r.required}，当前 ${r.current}`);
        } else if (r.error === "OUT_OF_STOCK" || r.error === "ITEM_NOT_FOUND") {
          toast.error("已售罄");
        } else if (r.error === "EXCEED_PER_ORDER_LIMIT") {
          toast.error(`超过单次限制，最多 ${r.limit}`);
        } else if (r.error === "EXCEED_DAILY_LIMIT") {
          toast.error(`超过每日限制，今日已兑 ${r.used}，上限 ${r.limit}`);
        } else if (r.error === "EXCEED_LIFETIME_LIMIT") {
          toast.error(`超过终身限制，已兑 ${r.used}，上限 ${r.limit}`);
        } else {
          toast.error(r.error || "兑换失败");
        }
        return;
      }
      toast.success(`兑换成功：${r.item?.title || redeemTarget.title}`);
      setRedeemTarget(null);
      refreshPoints();
      setItems((prev) =>
        prev.map((p) =>
          p.id === redeemTarget.id && p.stock_remaining > 0
            ? { ...p, stock_remaining: Math.max(0, p.stock_remaining - qty) }
            : p
        )
      );
      setRedemptionsKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
    } finally {
      setRedeeming(false);
    }
  };

  if (!member) return null;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh" }}>

        {/* ── 英雄区 ── */}
        <div style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)",
          padding: "24px 20px 72px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />

          <h1 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: "0 0 16px" }}>积分商城</h1>

          {/* 积分大卡 */}
          <div style={{
            background: "rgba(255,255,255,0.08)",
            backdropFilter: "blur(10px)",
            border: "1px solid rgba(245,158,11,0.2)",
            borderRadius: 16,
            padding: "16px 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: "0 0 4px", letterSpacing: "0.5px", textTransform: "uppercase" }}>
                我的积分余额
              </p>
              <div style={{ display: "flex", alignItems: "baseline", gap: 6 }}>
                <span style={{ fontSize: 36, fontWeight: 800, color: "#fbbf24", letterSpacing: "-1px", lineHeight: 1 }}>
                  {loading ? "..." : points}
                </span>
                <span style={{ color: "#f59e0b", fontWeight: 600, fontSize: 14 }}>积分</span>
              </div>
            </div>
            <div style={{
              width: 56, height: 56,
              borderRadius: 16,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              display: "flex", alignItems: "center", justifyContent: "center",
              boxShadow: "0 4px 16px rgba(245,158,11,0.4)",
            }}>
              <StarOutlined style={{ fontSize: 26, color: "white" }} />
            </div>
          </div>

          <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "10px 0 0", textAlign: "center" }}>
            通过消费、签到、邀请好友可获得积分
          </p>
        </div>

        {/* ── 内容区 ── */}
        <div style={{
          background: "#f1f5f9",
          borderRadius: "24px 24px 0 0",
          marginTop: -28,
          padding: "24px 16px 100px",
        }}>
          {/* 商品标题 */}
          <p className="member-section-title" style={{ marginBottom: 14 }}>热门兑换</p>

          {(loading || itemsLoading) ? (
            <div style={{ display: "flex", justifyContent: "center", padding: "48px 0" }}>
              <Spin size="large" />
            </div>
          ) : items.length === 0 ? (
            <Empty description="暂无商品" />
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 12,
              marginBottom: 28,
            }}>
              {items.map((p, idx) => {
                const canRedeem = points >= p.points_cost && (p.stock_remaining === -1 || p.stock_remaining > 0);
                const isLowStock = p.stock_remaining >= 0 && p.stock_remaining <= 3;
                const isHot = idx < 2;
                const deficit = p.points_cost - points;

                return (
                  <div key={p.id} className="member-product-card">
                    {/* 徽章 */}
                    {isHot && p.stock !== 0 && (
                      <span className="member-product-hot-badge">HOT</span>
                    )}
                    {isLowStock && !isHot && (
                      <span className="member-product-stock-badge">仅剩{p.stock_remaining}</span>
                    )}

                    <div style={{ padding: "16px 12px 14px" }}>
                      {p.image_url ? (
                        <img
                          src={p.image_url}
                          alt={p.title}
                          style={{ width: "100%", height: 92, objectFit: "cover", borderRadius: 10, marginBottom: 10 }}
                        />
                      ) : (
                        <div className="member-product-icon-wrap">🎁</div>
                      )}

                      <p style={{
                        margin: "0 0 4px",
                        fontWeight: 700, fontSize: 14,
                        color: "#0f172a", textAlign: "center",
                        lineHeight: 1.3,
                        overflow: "hidden",
                        display: "-webkit-box",
                        WebkitLineClamp: 2,
                        WebkitBoxOrient: "vertical",
                      }}>
                        {p.title}
                      </p>
                      {p.description ? (
                        <p style={{
                          margin: "0 0 8px",
                          color: "#64748b",
                          fontSize: 11,
                          textAlign: "center",
                          minHeight: 30,
                          overflow: "hidden",
                          display: "-webkit-box",
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: "vertical",
                        }}>
                          {p.description}
                        </p>
                      ) : null}

                      <p style={{
                        margin: "0 0 10px",
                        color: "#f59e0b", fontWeight: 800,
                        fontSize: 16, textAlign: "center",
                      }}>
                        {p.points_cost} 积分
                      </p>

                      {p.stock_remaining >= 0 && (
                        <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, margin: "0 0 10px" }}>
                          库存 {p.stock_remaining === -1 ? "充足" : p.stock_remaining}
                        </p>
                      )}

                      <Button
                        type={canRedeem ? "primary" : "default"}
                        block
                        size="small"
                        icon={canRedeem ? <ShoppingCartOutlined /> : undefined}
                        disabled={!canRedeem || redeeming}
                        loading={redeeming && redeemTarget?.id === p.id}
                        onClick={() => {
                          setRedeemTarget(p);
                          setRedeemQty(1);
                        }}
                        style={{
                          height: 34, borderRadius: 10,
                          fontSize: 12, fontWeight: 700,
                          ...(canRedeem ? {} : {
                            background: "#f1f5f9",
                            borderColor: "#e2e8f0",
                            color: "#94a3b8",
                          }),
                        }}
                      >
                        {canRedeem
                          ? "立即兑换"
                          : `还差 ${deficit} 积分`}
                      </Button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 兑换记录 */}
          <p className="member-section-title">我的兑换记录</p>
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "14px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
          }}>
            <MemberRedemptionsList memberId={member.id} refreshKey={redemptionsKey} />
          </div>

          <p style={{ textAlign: "center", color: "#94a3b8", fontSize: 11, marginTop: 16 }}>
            部分奖品需人工处理，客服将尽快联系您
          </p>
        </div>

        <Modal
          title={redeemTarget ? `兑换：${redeemTarget.title}` : "兑换商品"}
          open={!!redeemTarget}
          onCancel={() => setRedeemTarget(null)}
          onOk={handleRedeem}
          okText="确认兑换"
          cancelText="取消"
          confirmLoading={redeeming}
        >
          {redeemTarget && (
            <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
              <p style={{ margin: 0, color: "#64748b", fontSize: 12 }}>
                单价 {redeemTarget.points_cost} 积分 | 库存 {redeemTarget.stock_remaining < 0 ? "无限" : redeemTarget.stock_remaining}
              </p>
              <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
                <span>兑换数量</span>
                <InputNumber
                  min={1}
                  max={Math.max(1, Math.min(redeemTarget.per_order_limit || 1, redeemTarget.stock_remaining < 0 ? 9999 : redeemTarget.stock_remaining))}
                  value={redeemQty}
                  onChange={(v) => setRedeemQty(Number(v || 1))}
                />
              </div>
              <p style={{ margin: 0, color: "#0f172a", fontWeight: 600 }}>
                预计消耗：{(redeemTarget.points_cost || 0) * Math.max(1, Number(redeemQty || 1))} 积分
              </p>
              <p style={{ margin: 0, color: "#94a3b8", fontSize: 12 }}>
                限制：每单最多 {redeemTarget.per_order_limit} 件；
                每日 {redeemTarget.per_user_daily_limit > 0 ? `${redeemTarget.per_user_daily_limit} 件` : "不限"}；
                终身 {redeemTarget.per_user_lifetime_limit > 0 ? `${redeemTarget.per_user_lifetime_limit} 件` : "不限"}。
              </p>
            </div>
          )}
        </Modal>
      </div>
    </ConfigProvider>
  );
}
