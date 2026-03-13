import { useState } from "react";
import { Button, Input } from "antd";
import { ShareAltOutlined, CopyOutlined, CheckOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

export default function MemberInvite() {
  const { member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  const [copied, setCopied] = useState(false);
  const inviteLink =
    typeof window !== "undefined"
      ? `${window.location.origin}/invite/${member?.member_code || ""}`
      : "";

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink).then(() => {
      setCopied(true);
      toast.success("邀请链接已复制到剪贴板");
      setTimeout(() => setCopied(false), 2500);
    });
  };

  const shareWhatsApp = () => {
    const INVITE_MSG = (link: string) =>
      `加入 ${settings.company_name || "Spin & Win"} 抽奖！注册即得 ${settings.invite_reward_spins} 次免费抽奖，赢话费、现金、手机！点击：${link}`;
    const text = encodeURIComponent(INVITE_MSG(inviteLink));
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  if (!member) return null;
  if (!settings.enable_invite) {
    return (
      <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b" } }}>
        <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh", display: "grid", placeItems: "center", padding: 20 }}>
          <div style={{ background: "white", borderRadius: 16, padding: 24, textAlign: "center", boxShadow: "0 1px 3px rgba(15,23,42,0.06)" }}>
            当前租户已关闭邀请功能
          </div>
        </div>
      </ConfigProvider>
    );
  }

  const steps = [
    { num: "1", icon: "📤", label: "分享链接", desc: "复制或分享邀请链接给好友" },
    { num: "2", icon: "📱", label: "好友注册", desc: "好友点击链接完成注册" },
    { num: "3", icon: "🎁", label: "双方获奖", desc: `你们各得 ${settings.invite_reward_spins} 次免费抽奖` },
  ];

  return (
    <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b" } }}>
      <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh" }}>

        {/* ── 英雄区 ── */}
        <div style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)",
          padding: "24px 20px 80px",
          position: "relative",
          overflow: "hidden",
          textAlign: "center",
        }}>
          <div style={{ position: "absolute", top: -80, right: -80, width: 220, height: 220, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -40, left: -40, width: 140, height: 140, borderRadius: "50%", background: "rgba(245,158,11,0.05)", pointerEvents: "none" }} />

          {/* 大图标 */}
          <div style={{
            width: 72, height: 72,
            borderRadius: 20,
            background: "linear-gradient(135deg, #f59e0b, #d97706)",
            display: "flex", alignItems: "center", justifyContent: "center",
            margin: "0 auto 16px",
            boxShadow: "0 8px 28px rgba(245,158,11,0.4)",
            fontSize: 32,
          }}>
            👥
          </div>

          <h1 style={{ color: "white", fontSize: 22, fontWeight: 800, margin: "0 0 8px", letterSpacing: "-0.3px" }}>
            邀请好友
          </h1>
          <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 14, margin: "0 0 16px", lineHeight: 1.5 }}>
            每邀请 1 位好友注册
          </p>

          {/* 奖励展示 */}
          <div style={{
            display: "inline-flex",
            alignItems: "center",
            gap: 10,
            background: "rgba(245,158,11,0.15)",
            border: "1px solid rgba(245,158,11,0.3)",
            borderRadius: 14,
            padding: "10px 20px",
          }}>
            <span style={{ fontSize: 22 }}>🎡</span>
            <div style={{ textAlign: "left" }}>
              <p style={{ color: "#fbbf24", fontWeight: 800, fontSize: 18, margin: 0, lineHeight: 1 }}>
                各得 {settings.invite_reward_spins} 次
              </p>
              <p style={{ color: "rgba(255,255,255,0.6)", fontSize: 12, margin: "2px 0 0" }}>
                免费抽奖机会
              </p>
            </div>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div style={{
          background: "#f1f5f9",
          borderRadius: "24px 24px 0 0",
          marginTop: -28,
          padding: "24px 16px 100px",
          position: "relative",
        }}>

          {/* 3步流程 */}
          <p className="member-section-title" style={{ marginBottom: 16 }}>邀请流程</p>
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "20px 16px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            marginBottom: 20,
          }}>
            <div style={{ display: "flex", alignItems: "flex-start", position: "relative" }}>
              {steps.map((step, idx) => (
                <div key={step.num} style={{ flex: 1, textAlign: "center", position: "relative" }}>
                  {/* 连接线 */}
                  {idx < steps.length - 1 && (
                    <div style={{
                      position: "absolute",
                      top: 20, left: "60%", right: "-40%",
                      height: 1,
                      background: "linear-gradient(90deg, #f59e0b, rgba(245,158,11,0.2))",
                      zIndex: 0,
                    }} />
                  )}

                  {/* 步骤圆 */}
                  <div style={{
                    width: 40, height: 40,
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, #f59e0b, #d97706)",
                    color: "white",
                    fontWeight: 800, fontSize: 16,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    margin: "0 auto 8px",
                    boxShadow: "0 4px 12px rgba(245,158,11,0.3)",
                    position: "relative", zIndex: 1,
                  }}>
                    {step.num}
                  </div>

                  <p style={{ margin: "0 0 2px", fontSize: 12, fontWeight: 700, color: "#0f172a" }}>
                    {step.icon} {step.label}
                  </p>
                  <p style={{ margin: 0, fontSize: 10, color: "#94a3b8", lineHeight: 1.4 }}>
                    {step.desc}
                  </p>
                </div>
              ))}
            </div>
          </div>

          {/* 邀请链接 */}
          <p className="member-section-title" style={{ marginBottom: 12 }}>您的专属邀请链接</p>
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "16px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            marginBottom: 12,
          }}>
            <div style={{
              background: "#f8fafc",
              border: "1px solid #e2e8f0",
              borderRadius: 12,
              padding: "12px 14px",
              marginBottom: 12,
              wordBreak: "break-all",
              fontSize: 13,
              color: "#475569",
              fontFamily: "monospace",
              lineHeight: 1.5,
            }}>
              {inviteLink}
            </div>

            <Button
              type="primary"
              block
              size="large"
              icon={copied ? <CheckOutlined /> : <CopyOutlined />}
              onClick={copyLink}
              style={{
                height: 48, fontSize: 15, fontWeight: 700, borderRadius: 12,
                ...(copied ? {
                  background: "linear-gradient(135deg, #059669, #047857)",
                  borderColor: "transparent",
                  boxShadow: "0 4px 16px rgba(5,150,105,0.3)",
                } : {}),
              }}
            >
              {copied ? "已复制！" : "复制邀请链接"}
            </Button>
          </div>

          {/* WhatsApp 分享 */}
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "16px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            marginBottom: 20,
          }}>
            <p style={{ margin: "0 0 12px", fontSize: 13, color: "#64748b", textAlign: "center" }}>
              或直接通过 WhatsApp 分享给好友
            </p>
            <Button
              block
              size="large"
              icon={<ShareAltOutlined />}
              onClick={shareWhatsApp}
              style={{
                height: 52, fontSize: 15, fontWeight: 700, borderRadius: 12,
                background: "linear-gradient(135deg, #25D366, #128C7E)",
                borderColor: "transparent",
                color: "white",
                boxShadow: "0 4px 16px rgba(37,211,102,0.3)",
              }}
            >
              分享到 WhatsApp →
            </Button>
          </div>

          {/* 说明卡片 */}
          <div style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.15)",
            borderRadius: 14,
            padding: "14px 16px",
          }}>
            <p style={{ margin: "0 0 8px", fontSize: 13, fontWeight: 700, color: "#92400e" }}>
              📋 活动规则
            </p>
            <ul style={{ margin: 0, paddingLeft: 16, fontSize: 12, color: "#b45309", lineHeight: 2 }}>
              <li>好友通过您的专属链接注册即可触发奖励</li>
              <li>双方各获得 {settings.invite_reward_spins} 次免费抽奖机会</li>
              <li>邀请次数无上限，多邀多得</li>
              <li>奖励将在好友完成注册后自动发放</li>
            </ul>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
