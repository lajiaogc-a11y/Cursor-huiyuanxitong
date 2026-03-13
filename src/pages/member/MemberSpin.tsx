import { useState, useEffect, useCallback, useMemo, useRef } from "react";
import { format } from "date-fns";
import { Button, Collapse, Empty } from "antd";
import { GiftOutlined, HistoryOutlined, TrophyOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberSpinQuota } from "@/hooks/useMemberSpinQuota";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { getMemberSpinWheelPrizesByMember } from "@/services/memberPortalSettingsService";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

const WHEEL_COLORS = [
  "#f59e0b", "#ea580c", "#dc2626", "#2563eb",
  "#059669", "#7c3aed", "#db2777", "#0d9488",
];
const DEFAULT_SEGMENTS = ["积分", "话费", "现金", "抽奖", "积分", "话费"];

// 背景星点位置
const STARS = Array.from({ length: 30 }, (_, i) => ({
  id: i,
  left: `${(i * 37) % 100}%`,
  top: `${(i * 53) % 100}%`,
  size: i % 3 === 0 ? 3 : i % 3 === 1 ? 2 : 1,
  opacity: 0.1 + (i % 5) * 0.06,
}));

export default function MemberSpin() {
  const { member } = useMemberAuth();
  const { remaining, loading: quotaLoading, refresh: refreshQuota } = useMemberSpinQuota(member?.id);
  const { settings } = useMemberPortalSettings(member?.id);
  const [spinning, setSpinning] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [result, setResult] = useState<{ name: string; type: string } | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [segments, setSegments] = useState<string[]>(DEFAULT_SEGMENTS);
  const [segmentRates, setSegmentRates] = useState<number[]>(DEFAULT_SEGMENTS.map(() => 1));
  const [spinHistory, setSpinHistory] = useState<{ id: string; result: string; source: string; created_at: string }[]>([]);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const tickTimerRef = useRef<number | null>(null);

  useEffect(() => {
    if (!member) return;
    getMemberSpinWheelPrizesByMember(member.id)
      .then((data) => {
        const enabled = data.filter((x) => x.name && x.hit_rate > 0);
        if (enabled.length >= 6) {
          const list = enabled.slice(0, 10);
          setSegments(list.map((x) => x.name));
          setSegmentRates(list.map((x) => x.hit_rate || 1));
        } else {
          setSegments(DEFAULT_SEGMENTS);
          setSegmentRates(DEFAULT_SEGMENTS.map(() => 1));
        }
      })
      .catch(() => {
        setSegments(DEFAULT_SEGMENTS);
        setSegmentRates(DEFAULT_SEGMENTS.map(() => 1));
      });
  }, [member?.id]);

  const segmentLabelMap = useMemo(() => {
    const total = segmentRates.reduce((acc, x) => acc + (Number.isFinite(x) ? x : 0), 0) || 1;
    return segments.map((s, i) => ({
      name: s,
      rateText: `${(((segmentRates[i] || 0) / total) * 100).toFixed(1)}%`,
    }));
  }, [segments, segmentRates]);

  const loadSpinHistory = useCallback(() => {
    if (!member) return;
    supabase
      .rpc("member_get_spins", { p_member_id: member.id, p_limit: 10 })
      .then(({ data }) => {
        const r = data as { success?: boolean; spins?: { id: string; result: string; source: string; created_at: string }[] };
        setSpinHistory(r?.success && Array.isArray(r.spins) ? r.spins : []);
      });
  }, [member?.id]);

  useEffect(() => { loadSpinHistory(); }, [loadSpinHistory]);

  const ensureAudioCtx = () => {
    if (!audioCtxRef.current) {
      audioCtxRef.current = new window.AudioContext();
    }
    return audioCtxRef.current;
  };
  const playTone = (freq: number, durationMs: number, gainValue: number) => {
    try {
      const ctx = ensureAudioCtx();
      const now = ctx.currentTime;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "triangle";
      osc.frequency.setValueAtTime(freq, now);
      gain.gain.setValueAtTime(0.0001, now);
      gain.gain.exponentialRampToValueAtTime(gainValue, now + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + durationMs / 1000);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(now);
      osc.stop(now + durationMs / 1000 + 0.02);
    } catch {
      // ignore audio errors
    }
  };
  const startSpinTickSound = () => {
    if (tickTimerRef.current) window.clearInterval(tickTimerRef.current);
    let c = 0;
    tickTimerRef.current = window.setInterval(() => {
      c += 1;
      playTone(700 + (c % 6) * 30, 45, 0.02);
      if (c > 32 && tickTimerRef.current) {
        window.clearInterval(tickTimerRef.current);
        tickTimerRef.current = null;
      }
    }, 130);
  };
  const stopSpinTickSound = () => {
    if (tickTimerRef.current) {
      window.clearInterval(tickTimerRef.current);
      tickTimerRef.current = null;
    }
  };
  const playResultSound = () => {
    playTone(880, 120, 0.035);
    window.setTimeout(() => playTone(1175, 160, 0.03), 120);
  };

  const handleSpin = async () => {
    if (!member) return;
    if (remaining <= 0) {
      toast.error("暂无抽奖机会，请先签到");
      return;
    }
    setSpinning(true);
    startSpinTickSound();
    setResult(null);
    setShowResult(false);
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
        } else if (r.error === "SPIN_DISABLED") {
          toast.info("当前租户已关闭抽奖功能");
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
      const targetRotation = 360 * 6 + (360 - targetIndex * segmentAngle - segmentAngle / 2);
      setRotation((prev) => prev + targetRotation);
      setTimeout(() => {
        stopSpinTickSound();
        playResultSound();
        setResult(prize);
        setShowResult(true);
        refreshQuota();
        loadSpinHistory();
        setSpinning(false);
      }, 4600);
    } catch (e: any) {
      stopSpinTickSound();
      toast.error(e?.message || "网络错误");
      setSpinning(false);
    }
  };

  useEffect(() => {
    return () => {
      stopSpinTickSound();
      if (audioCtxRef.current) {
        audioCtxRef.current.close().catch(() => {});
      }
    };
  }, []);

  if (!member) return null;
  if (!settings.enable_spin) {
    return (
      <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b" } }}>
        <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            当前租户已关闭抽奖功能
          </div>
        </div>
      </ConfigProvider>
    );
  }

  const conicGradient = segments
    .map((_, i) => {
      const start = (i / segments.length) * 360;
      const end = ((i + 1) / segments.length) * 360;
      return `${WHEEL_COLORS[i % WHEEL_COLORS.length]} ${start}deg ${end}deg`;
    })
    .join(", ");

  return (
    <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b" } }}>
      <div
        className="member-antd-wrap"
        style={{
          background: "linear-gradient(160deg, #0f172a 0%, #1e293b 50%, #0f2044 100%)",
          minHeight: "100vh",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
        }}
      >
        {/* 星点背景 */}
        <div style={{ position: "fixed", inset: 0, pointerEvents: "none", overflow: "hidden", zIndex: 0 }}>
          {STARS.map((s) => (
            <div
              key={s.id}
              style={{
                position: "absolute",
                left: s.left, top: s.top,
                width: s.size, height: s.size,
                borderRadius: "50%",
                background: "white",
                opacity: s.opacity,
              }}
            />
          ))}
        </div>

        {/* Header */}
        <header style={{
          width: "100%",
          background: "rgba(255,255,255,0.05)",
          backdropFilter: "blur(10px)",
          borderBottom: "1px solid rgba(255,255,255,0.08)",
          padding: "16px 20px",
          textAlign: "center",
          position: "relative",
          zIndex: 1,
        }}>
          <h1 style={{ color: "white", fontSize: 19, fontWeight: 800, margin: 0, letterSpacing: "-0.3px" }}>
            好运转盘
          </h1>
          <div style={{ marginTop: 8, display: "inline-flex", alignItems: "center", gap: 6 }}>
            <div style={{
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              borderRadius: 20,
              padding: "4px 14px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              boxShadow: "0 4px 12px rgba(245,158,11,0.4)",
            }}>
              <GiftOutlined style={{ color: "white", fontSize: 13 }} />
              <span style={{ color: "white", fontWeight: 700, fontSize: 13 }}>
                {quotaLoading ? "..." : `剩余 ${remaining} 次`}
              </span>
            </div>
          </div>
        </header>

        {/* 主区域 */}
        <main style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          padding: "32px 20px 110px",
          width: "100%",
          maxWidth: 480,
          position: "relative",
          zIndex: 1,
        }}>

          {/* 转盘容器 */}
          <div style={{ position: "relative", marginBottom: 28 }}>
            {/* 外发光环 */}
            <div style={{
              position: "absolute",
              inset: -12,
              borderRadius: "50%",
              background: "transparent",
              boxShadow: "0 0 60px rgba(245,158,11,0.2), 0 0 120px rgba(245,158,11,0.1)",
              pointerEvents: "none",
            }} />

            {/* 转盘本体 */}
            <div
              style={{
                width: 300,
                height: 300,
                borderRadius: "50%",
                background: `conic-gradient(${conicGradient})`,
                transition: spinning ? "transform 4.5s cubic-bezier(0.17, 0.67, 0.12, 0.99)" : "none",
                transform: `rotate(${rotation}deg)`,
                boxShadow: "0 0 0 6px rgba(245,158,11,0.35), 0 0 0 12px rgba(245,158,11,0.12), 0 10px 44px rgba(15,23,42,0.55)",
                border: "4px solid rgba(245,158,11,0.6)",
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
                    style={{
                      position: "absolute",
                      left: `${x}%`, top: `${y}%`,
                      transform: "translate(-50%, -50%)",
                      color: "white",
                      fontWeight: 800,
                      fontSize: 13,
                      textAlign: "center",
                      textShadow: "0 1px 3px rgba(0,0,0,0.5)",
                      whiteSpace: "nowrap",
                      pointerEvents: "none",
                      letterSpacing: "0.3px",
                    }}
                  >
                    {label.length > 4 ? label.slice(0, 4) : label}
                  </div>
                );
              })}
            </div>

            {/* 中心按钮 */}
            <div style={{
              position: "absolute",
              top: "50%", left: "50%",
              transform: "translate(-50%, -50%)",
              width: 72, height: 72,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              border: "4px solid white",
              boxShadow: "0 4px 16px rgba(245,158,11,0.5)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              zIndex: 10,
            }}>
              <GiftOutlined style={{ color: "white", fontSize: 28 }} />
            </div>

            {/* 顶部指针 */}
            <div style={{
              position: "absolute",
              top: -14, left: "50%",
              transform: "translateX(-50%)",
              width: 0, height: 0,
              borderLeft: "14px solid transparent",
              borderRight: "14px solid transparent",
              borderTop: "28px solid #f59e0b",
              filter: "drop-shadow(0 3px 6px rgba(245,158,11,0.6))",
              zIndex: 20,
            }} />
          </div>

          {/* 中奖结果卡片 */}
          {showResult && result && (
            <div className="member-prize-result" style={{ width: "100%", maxWidth: 320, marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>🎊</div>
              <p style={{ color: "#64748b", fontSize: 14, margin: "0 0 4px" }}>恭喜您获得</p>
              <p style={{
                fontSize: 22, fontWeight: 800,
                color: "#f59e0b", margin: "0 0 16px",
                letterSpacing: "-0.5px",
              }}>
                {result.name}
              </p>
              <div style={{
                background: "rgba(245,158,11,0.08)",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 12,
                color: "#92400e",
              }}>
                🎁 奖品将由客服处理，请耐心等待
              </div>
            </div>
          )}

          <div style={{ width: "100%", maxWidth: 360, marginBottom: 16 }}>
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(2, 1fr)",
              gap: 8,
            }}>
              {segmentLabelMap.map((x, idx) => (
                <div key={`${x.name}-${idx}`} style={{
                  background: "rgba(255,255,255,0.1)",
                  border: "1px solid rgba(255,255,255,0.12)",
                  borderRadius: 10,
                  padding: "6px 8px",
                  color: "rgba(255,255,255,0.88)",
                  fontSize: 12,
                  display: "flex",
                  justifyContent: "space-between",
                }}>
                  <span>{x.name}</span>
                  <span style={{ color: "#fbbf24", fontWeight: 700 }}>{x.rateText}</span>
                </div>
              ))}
            </div>
          </div>

          {/* 抽奖按钮 */}
          <Button
            type="primary"
            size="large"
            onClick={handleSpin}
            disabled={spinning || remaining <= 0}
            loading={spinning}
            style={{
              width: "100%", maxWidth: 280,
              height: 52, fontSize: 17, fontWeight: 800,
              borderRadius: 14, letterSpacing: "0.5px",
            }}
          >
            {spinning ? "抽奖中..." : remaining <= 0 ? "暂无抽奖机会" : "开始抽奖"}
          </Button>

          {remaining <= 0 && !spinning && (
            <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 13, marginTop: 12, textAlign: "center" }}>
              签到、邀请好友、分享可获得更多抽奖机会
            </p>
          )}

          {/* 抽奖记录折叠 */}
          <div style={{ width: "100%", maxWidth: 400, marginTop: 24 }}>
            <Collapse
              items={[
                {
                  key: "history",
                  label: (
                    <span style={{ display: "flex", alignItems: "center", gap: 8, color: "rgba(255,255,255,0.8)", fontWeight: 600 }}>
                      <HistoryOutlined />
                      我的抽奖记录
                    </span>
                  ),
                  children:
                    spinHistory.length === 0 ? (
                      <Empty description={<span style={{ color: "#64748b" }}>暂无抽奖记录</span>} image={Empty.PRESENTED_IMAGE_SIMPLE} />
                    ) : (
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                        {spinHistory.map((s) => (
                          <div key={s.id} style={{
                            display: "flex", justifyContent: "space-between", alignItems: "center",
                            padding: "10px 12px",
                            background: "#f8fafc",
                            borderRadius: 10,
                            fontSize: 13,
                          }}>
                            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                              <TrophyOutlined style={{ color: "#f59e0b", fontSize: 14 }} />
                              <span style={{ fontWeight: 600, color: "#0f172a" }}>{s.result || "—"}</span>
                            </div>
                            <span style={{ color: "#94a3b8", fontSize: 12 }}>
                              {format(new Date(s.created_at), "MM/dd HH:mm")}
                            </span>
                          </div>
                        ))}
                      </div>
                    ),
                },
              ]}
              style={{
                background: "rgba(255,255,255,0.08)",
                borderRadius: 16,
                border: "1px solid rgba(255,255,255,0.1)",
              }}
            />
          </div>
        </main>
      </div>
    </ConfigProvider>
  );
}
