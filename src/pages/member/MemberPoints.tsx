import { useEffect, useState } from "react";
import { format } from "date-fns";
import { Card, Row, Col, Button, Statistic, Spin, Empty } from "antd";
import { ThunderboltOutlined, GiftOutlined, ShoppingCartOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPoints } from "@/hooks/useMemberPoints";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

interface Prize {
  id: string;
  name: string;
  type: string;
  points_required: number;
  stock: number;
  auto_issue: boolean;
}

function MemberRedemptionsList({ memberId, refreshKey = 0 }: { memberId: string; refreshKey?: number }) {
  const [list, setList] = useState<{ id: string; prize_name: string; status: string; created_at: string }[]>([]);
  useEffect(() => {
    (async () => {
      const { data: redemptions } = await supabase
        .from("redemptions")
        .select("id, prize_id, status, created_at")
        .eq("member_id", memberId)
        .order("created_at", { ascending: false })
        .limit(10);
      if (!redemptions?.length) {
        setList([]);
        return;
      }
      const prizeIds = [...new Set(redemptions.map((r) => r.prize_id).filter(Boolean))];
      const { data: prizes } = await supabase.from("prizes").select("id, name").in("id", prizeIds);
      const nameMap = new Map((prizes || []).map((p) => [p.id, p.name]));
      setList(
        redemptions.map((r) => ({
          id: r.id,
          prize_name: (r.prize_id && nameMap.get(r.prize_id)) || "—",
          status: r.status,
          created_at: r.created_at,
        }))
      );
    })();
  }, [memberId, refreshKey]);
  if (list.length === 0) return <Empty description="暂无兑换记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />;
  return (
    <div className="space-y-2">
      {list.map((r) => (
        <div key={r.id} className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm">
          <span className="font-medium">{r.prize_name}</span>
          <span className="text-gray-500">
            {r.status} · {format(new Date(r.created_at), "MM/dd")}
          </span>
        </div>
      ))}
    </div>
  );
}

const typeIcons: Record<string, string> = {
  airtime: "📱",
  cash: "💰",
  spin: "🎡",
  gift_card: "🎁",
  phone: "📞",
  points: "⭐",
};

export default function MemberPoints() {
  const { member } = useMemberAuth();
  const { points, loading, refresh: refreshPoints } = useMemberPoints(member?.id);
  const [prizes, setPrizes] = useState<Prize[]>([]);
  const [prizesLoading, setPrizesLoading] = useState(true);
  const [redeeming, setRedeeming] = useState<string | null>(null);
  const [redemptionsKey, setRedemptionsKey] = useState(0);

  useEffect(() => {
    if (!member) return;
    (async () => {
      try {
        const { data } = await supabase
          .from("prizes")
          .select("id, name, type, points_required, stock, auto_issue")
          .or("stock.eq.-1,stock.gt.0")
          .order("points_required");
        setPrizes(data || []);
      } catch {
        setPrizes([]);
      } finally {
        setPrizesLoading(false);
      }
    })();
  }, [member?.id]);

  const handleRedeem = async (prizeId: string) => {
    if (!member) return;
    setRedeeming(prizeId);
    try {
      const { data, error } = await supabase.rpc("member_redeem_prize", {
        p_member_id: member.id,
        p_prize_id: prizeId,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      const r = data as { success: boolean; error?: string; prize?: { name: string }; points_used?: number; required?: number; current?: number };
      if (!r.success) {
        if (r.error === "INSUFFICIENT_POINTS") {
          toast.error(`积分不足，需要 ${r.required}，当前 ${r.current}`);
        } else if (r.error === "OUT_OF_STOCK") {
          toast.error("已售罄");
        } else {
          toast.error(r.error || "兑换失败");
        }
        return;
      }
      toast.success(`兑换成功：${r.prize?.name || ""}`);
      refreshPoints();
      setPrizes((prev) => prev.map((p) => (p.id === prizeId && p.stock > 0 ? { ...p, stock: p.stock - 1 } : p)));
      setRedemptionsKey((k) => k + 1);
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
    } finally {
      setRedeeming(null);
    }
  };

  if (!member) return null;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
        <header className="bg-white px-4 py-4 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 m-0">积分商城</h1>
          <p className="text-gray-500 text-sm m-0 mt-1">积分兑换好礼</p>
        </header>

        <main className="p-4 max-w-md mx-auto">
          <Card className="mb-4 shadow-sm" style={{ borderRadius: 12 }}>
            <Statistic
              title={<span className="text-gray-500 text-sm flex items-center gap-1"><ThunderboltOutlined /> 我的积分</span>}
              value={loading ? "..." : points}
              valueStyle={{ color: "#f59e0b", fontSize: 28, fontWeight: 700 }}
            />
          </Card>

          <h2 className="text-base font-semibold text-gray-900 mb-3">热门兑换</h2>
          {(loading || prizesLoading) ? (
            <div className="flex justify-center py-12">
              <Spin size="large" />
            </div>
          ) : prizes.length === 0 ? (
            <Empty description="暂无商品" />
          ) : (
            <Row gutter={[12, 12]} className="mb-8">
              {prizes.map((p) => {
                const canRedeem = points >= p.points_required && (p.stock === -1 || p.stock > 0);
                const isRedeeming = redeeming === p.id;
                return (
                  <Col span={12} key={p.id}>
                    <Card
                      className="shadow-sm overflow-hidden"
                      style={{ borderRadius: 12 }}
                      bodyStyle={{ padding: 12 }}
                    >
                      <div className="text-center">
                        <div className="w-14 h-14 mx-auto mb-2 rounded-xl bg-amber-50 flex items-center justify-center text-3xl">
                          {typeIcons[p.type] || "🎁"}
                        </div>
                        <p className="font-semibold text-gray-900 m-0 mb-1 text-sm line-clamp-2">{p.name}</p>
                        <p className="text-amber-600 font-bold m-0 mb-2">{p.points_required} 积分</p>
                        {p.stock >= 0 && <p className="text-gray-400 text-xs m-0 mb-2">剩余 {p.stock}</p>}
                        <Button
                          type="primary"
                          block
                          size="small"
                          icon={<ShoppingCartOutlined />}
                          disabled={!canRedeem || isRedeeming}
                          loading={isRedeeming}
                          onClick={() => handleRedeem(p.id)}
                        >
                          {canRedeem ? "立即兑换" : "积分不足"}
                        </Button>
                      </div>
                    </Card>
                  </Col>
                );
              })}
            </Row>
          )}

          <h2 className="text-base font-semibold text-gray-900 mb-3">我的兑换</h2>
          <Card className="shadow-sm" style={{ borderRadius: 12 }}>
            <MemberRedemptionsList memberId={member.id} refreshKey={redemptionsKey} />
          </Card>
          <p className="text-center text-gray-500 text-xs mt-4">
            积分通过消费、邀请获得。部分奖品需人工处理，请耐心等待。
          </p>
        </main>
      </div>
    </ConfigProvider>
  );
}
