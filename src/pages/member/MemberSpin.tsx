import { useState, useEffect, useCallback } from "react";
import { format } from "date-fns";
import { Button, Card, Collapse, Empty } from "antd";
import { GiftOutlined, HistoryOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberSpinQuota } from "@/hooks/useMemberSpinQuota";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

const WHEEL_COLORS = ["#f59e0b", "#ea580c", "#dc2626", "#2563eb", "#059669", "#7c3aed", "#db2777", "#0d9488"];
const DEFAULT_SEGMENTS = ["话费", "现金", "抽奖", "积分", "话费", "现金", "抽奖", "积分"];

export default function MemberSpin() {
  const { member } = useMemberAuth();
  const { remaining, loading: quotaLoading, refresh: refreshQuota } = useMemberSpinQuota(member?.id);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ name: string; type: string } | null>(null);
  const [segments, setSegments] = useState<string[]>(DEFAULT_SEGMENTS);
  const [spinHistory, setSpinHistory] = useState<{ id: string; result: string; source: string; created_at: string }[]>([]);

  useEffect(() => {
    if (!member) return;
    supabase
      .from("prizes")
      .select("name, type")
      .or("stock.eq.-1,stock.gt.0")
      .limit(8)
      .then(({ data }) => {
        if (data?.length) setSegments(data.map((p) => p.name));
      });
  }, [member?.id]);

  const loadSpinHistory = useCallback(() => {
    if (!member) return;
    supabase
      .rpc("member_get_spins", { p_member_id: member.id, p_limit: 10 })
      .then(({ data }) => {
        const r = data as { success?: boolean; spins?: { id: string; result: string; source: string; created_at: string }[] };
        setSpinHistory(r?.success && Array.isArray(r.spins) ? r.spins : []);
      });
  }, [member?.id]);

  useEffect(() => {
    loadSpinHistory();
  }, [loadSpinHistory]);

  const handleSpin = async () => {
    if (!member) return;
    if (remaining <= 0) {
      toast.error("暂无抽奖机会，请先签到");
      return;
    }
    setSpinning(true);
    setResult(null);
    try {
      const { data, error } = await supabase.rpc("member_spin", {
        p_member_id: member.id,
        p_source: "daily_free",
      });
      if (error) {
        toast.error(error.message);
        setSpinning(false);
        return;
      }
      const r = data as { success: boolean; error?: string; prize?: { name: string; type: string }; remaining?: number };
      if (!r.success) {
        if (r.error === "NO_SPIN_QUOTA") {
          toast.error("暂无抽奖机会，请先签到");
        } else {
          toast.error(r.error || "抽奖失败");
        }
        refreshQuota();
        setSpinning(false);
        return;
      }
      const prize = r.prize!;
      const prizeIndex = segments.findIndex((s) => s === prize.name);
      const targetIndex = prizeIndex >= 0 ? prizeIndex : 0;
      const segmentAngle = 360 / segments.length;
      const targetRotation = 360 * 5 + (360 - targetIndex * segmentAngle - segmentAngle / 2);
      setRotation((prev) => prev + targetRotation);
      setTimeout(() => {
        setResult(prize);
        refreshQuota();
        loadSpinHistory();
        toast.success(`恭喜获得：${prize.name}`);
        setSpinning(false);
      }, 4500);
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
      setSpinning(false);
    }
  };

  if (!member) return null;

  const conicGradient = segments
    .map((_, i) => {
      const start = (i / segments.length) * 360;
      const end = ((i + 1) / segments.length) * 360;
      return `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap min-h-screen bg-[#faf9f7] flex flex-col items-center">
        <header className="w-full bg-white px-4 py-4 shadow-sm text-center">
          <h1 className="text-lg font-bold text-gray-900 m-0">幸运大转盘</h1>
          <p className="text-gray-500 text-sm m-0 mt-1">
            {quotaLoading ? "加载中..." : `剩余 ${remaining} 次抽奖机会`}
          </p>
        </header>

        <main className="flex-1 flex flex-col items-center justify-center p-6 w-full max-w-sm">
          <div className="relative">
            <div
              className="relative w-72 h-72 rounded-full shadow-2xl border-8 border-amber-400"
              style={{
                background: `conic-gradient(${conicGradient})`,
                transition: spinning ? "transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                transform: `rotate(${rotation}deg)`,
              }}
            >
              {segments.map((label, i) => {
                const angle = (i / segments.length) * 360 + 360 / segments.length / 2 - 90;
                const rad = (angle * Math.PI) / 180;
                const x = 50 + 35 * Math.cos(rad);
                const y = 50 + 35 * Math.sin(rad);
                return (
                  <div
                    key={i}
                    className="absolute text-white font-bold text-sm text-center"
                    style={{
                      left: `${x}%`,
                      top: `${y}%`,
                      transform: "translate(-50%, -50%)",
                      textShadow: "1px 1px 2px rgba(0,0,0,0.3)",
                    }}
                  >
                    {label.length > 4 ? label.slice(0, 4) : label}
                  </div>
                );
              })}
            </div>
            <div
              className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-amber-500 border-4 border-white shadow-lg flex items-center justify-center z-10 pointer-events-none"
              style={{ top: "50%", left: "50%", transform: "translate(-50%, -50%)" }}
            >
              <GiftOutlined className="text-white text-2xl" style={{ marginLeft: 4 }} />
            </div>
            <div
              className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[12px] border-r-[12px] border-t-[24px] border-l-transparent border-r-transparent border-t-amber-500 z-20"
              style={{ filter: "drop-shadow(0 2px 4px rgba(0,0,0,0.2))" }}
            />
          </div>

          {result ? (
            <Card className="mt-6 w-full shadow-sm text-center" style={{ borderRadius: 12 }}>
              <GiftOutlined className="text-4xl text-amber-500 mb-2" />
              <p className="font-bold text-lg text-gray-900 m-0">恭喜获得</p>
              <p className="text-amber-600 font-semibold text-xl m-0 mt-1">{result.name}</p>
            </Card>
          ) : null}

          <Button
            type="primary"
            size="large"
            className="mt-6 w-full max-w-xs"
            style={{ height: 48, fontSize: 16, fontWeight: 600 }}
            onClick={handleSpin}
            disabled={spinning || remaining <= 0}
            loading={spinning}
          >
            {spinning ? "抽奖中..." : remaining <= 0 ? "暂无抽奖机会" : "立即抽奖"}
          </Button>

          <p className="mt-6 text-gray-500 text-sm text-center">
            签到、邀请好友可获得更多抽奖机会
          </p>

          <Collapse
            className="mt-6 w-full max-w-sm"
            items={[
              {
                key: "history",
                label: (
                  <span className="flex items-center gap-2">
                    <HistoryOutlined /> 我的抽奖记录
                  </span>
                ),
                children:
                  spinHistory.length === 0 ? (
                    <Empty description="暂无抽奖记录" image={Empty.PRESENTED_IMAGE_SIMPLE} />
                  ) : (
                    <div className="space-y-2">
                      {spinHistory.map((s) => (
                        <div
                          key={s.id}
                          className="flex justify-between items-center py-2 px-3 bg-gray-50 rounded-lg text-sm"
                        >
                          <span className="font-medium">{s.result || "—"}</span>
                          <span className="text-gray-500">{format(new Date(s.created_at), "MM/dd HH:mm")}</span>
                        </div>
                      ))}
                    </div>
                  ),
              },
            ]}
          />
        </main>
      </div>
    </ConfigProvider>
  );
}
