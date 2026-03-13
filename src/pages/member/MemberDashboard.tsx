import { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Button, Carousel, Modal, Tooltip } from "antd";
import {
  GiftOutlined, ShoppingOutlined, TeamOutlined,
  CheckCircleOutlined, LogoutOutlined, ShareAltOutlined,
  StarOutlined, InfoCircleOutlined,
} from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPointsBreakdown } from "@/hooks/useMemberPointsBreakdown";
import { useMemberSpinQuota } from "@/hooks/useMemberSpinQuota";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

const BACKGROUND_PRESETS: Record<string, string> = {
  deep_blue: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)",
  sunset: "linear-gradient(145deg, #7c2d12 0%, #f97316 100%)",
  emerald: "linear-gradient(145deg, #064e3b 0%, #10b981 100%)",
  violet: "linear-gradient(145deg, #312e81 0%, #8b5cf6 100%)",
};

export default function MemberDashboard() {
  const { member, signOut, refreshMember } = useMemberAuth();
  const { breakdown, loading, refresh: refreshPoints } = useMemberPointsBreakdown(member?.id);
  const { remaining: spinRemaining, refresh: refreshSpinQuota } = useMemberSpinQuota(member?.id);
  const { settings: portalSettings } = useMemberPortalSettings(member?.id);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [shareClaimedToday, setShareClaimedToday] = useState(false);
  const [claimingShare, setClaimingShare] = useState(false);
  const [popupOpen, setPopupOpen] = useState(false);

  const INVITE_MSG = (link: string) =>
    `加入 ${portalSettings.company_name || "Spin & Win"} 抽奖！注册即得 ${portalSettings.invite_reward_spins} 次免费抽奖，赢话费、现金、手机！点击：${link}`;

  useEffect(() => {
    if (!member) return;
    (async () => {
      const { data } = await supabase.rpc("member_check_in_today", { p_member_id: member.id });
      const r = data as { success?: boolean; checked_in_today?: boolean };
      setCheckedInToday(!!r?.checked_in_today);
    })();
  }, [member?.id]);

  useEffect(() => {
    if (!member?.id) return;
    if (!portalSettings.show_announcement_popup || !portalSettings.announcement_popup_content) return;
    const key = `member_popup_seen_${member.id}`;
    try {
      const seen = sessionStorage.getItem(key);
      if (!seen) {
        setPopupOpen(true);
        sessionStorage.setItem(key, "1");
      }
    } catch {
      setPopupOpen(true);
    }
  }, [
    member?.id,
    portalSettings.show_announcement_popup,
    portalSettings.announcement_popup_content,
  ]);

  const handleShareAndClaim = async () => {
    if (!member || claimingShare || shareClaimedToday) return;
    const inviteLink = `${window.location.origin}/invite/${member.member_code || ""}`;
    const text = encodeURIComponent(INVITE_MSG(inviteLink));
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    setClaimingShare(true);
    try {
      const { data, error } = await supabase.rpc("member_grant_spin_for_share", { p_member_id: member.id });
      const r = (data || {}) as { success?: boolean; error?: string };
      if (error) { toast.error(error.message); return; }
      if (r?.success) {
        setShareClaimedToday(true);
        refreshSpinQuota();
        toast.success("分享成功！获得 1 次抽奖机会");
      } else if (r?.error === "ALREADY_CLAIMED_TODAY") {
        setShareClaimedToday(true);
        toast.info("今日已领取过分享奖励");
      } else if (r?.error === "SHARE_REWARD_DISABLED") {
        toast.info("当前租户已关闭分享奖励");
      } else {
        toast.error(r?.error || "领取失败");
      }
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
    } finally {
      setClaimingShare(false);
    }
  };

  const handleCheckIn = async () => {
    if (!member || checkedInToday || checkingIn) return;
    setCheckingIn(true);
    try {
      const { data, error } = await supabase.rpc("member_check_in", { p_member_id: member.id });
      if (error) { toast.error(error.message); return; }
      const r = data as { success: boolean; error?: string; consecutive_days?: number; reward_value?: number };
      if (r.success) {
        setCheckedInToday(true);
        await refreshMember();
        refreshPoints();
        refreshSpinQuota();
        toast.success(`签到成功！连续 ${r.consecutive_days} 天，获得 ${r.reward_value} 次免费抽奖`);
      } else {
        if (r.error === "CHECK_IN_DISABLED") toast.info("当前租户已关闭签到任务");
        else toast.error(r.error || "签到失败");
      }
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
    } finally {
      setCheckingIn(false);
    }
  };

  if (!member) return null;

  const displayName = member.nickname || member.member_code || member.phone_number;
  const showSpin = !!portalSettings.enable_spin;
  const showInvite = !!portalSettings.enable_invite;
  const showCheckIn = !!portalSettings.enable_check_in;
  const showShare = !!portalSettings.enable_share_reward;
  const heroBg =
    BACKGROUND_PRESETS[portalSettings.home_background_preset || "deep_blue"] || BACKGROUND_PRESETS.deep_blue;
  const moduleOrder = useMemo(() => {
    const fallback = ["shortcuts", "tasks", "security"];
    const source = Array.isArray(portalSettings.home_module_order)
      ? portalSettings.home_module_order
      : fallback;
    const filtered = source.filter((x) => fallback.includes(x));
    const merged = [...filtered, ...fallback.filter((x) => !filtered.includes(x))];
    return merged;
  }, [portalSettings.home_module_order]);

  const shortcutsSection = (
    <>
      <p className="member-section-title" style={{ marginBottom: 14 }}>快捷入口</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 20 }}>
        {showSpin ? <Link to="/member/spin" className="member-shortcut-card">
          <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #fef3c7, #fde68a)" }}>
            <GiftOutlined style={{ fontSize: 22, color: "#d97706" }} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a" }}>幸运抽奖</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#f59e0b", fontWeight: 600 }}>
            剩余 {spinRemaining} 次
          </p>
        </Link> : null}

        <Link to="/member/points" className="member-shortcut-card">
          <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #ede9fe, #ddd6fe)" }}>
            <ShoppingOutlined style={{ fontSize: 22, color: "#7c3aed" }} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a" }}>积分商城</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#64748b" }}>兑换好礼</p>
        </Link>

        {showInvite ? <Link to="/member/invite" className="member-shortcut-card">
          <div className="member-shortcut-icon" style={{ background: "linear-gradient(135deg, #dcfce7, #bbf7d0)" }}>
            <TeamOutlined style={{ fontSize: 22, color: "#059669" }} />
          </div>
          <p style={{ margin: 0, fontWeight: 700, fontSize: 13, color: "#0f172a" }}>邀请好友</p>
          <p style={{ margin: "4px 0 0", fontSize: 11, color: "#059669", fontWeight: 600 }}>+{portalSettings.invite_reward_spins}次抽奖</p>
        </Link> : null}
      </div>
    </>
  );

  const tasksSection = (
    <>
      <p className="member-section-title">今日任务</p>
      <div style={{
        background: "white",
        borderRadius: 16,
        padding: "4px 16px",
        boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
        border: "1px solid rgba(15,23,42,0.05)",
      }}>
        {showCheckIn ? <div className="member-task-item">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: checkedInToday ? "rgba(5,150,105,0.1)" : "rgba(245,158,11,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>📅</div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>每日签到</p>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>获得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{portalSettings.checkin_reward_base} 次</span> 免费抽奖</p>
            </div>
          </div>
          {checkedInToday ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#059669" }}>
              <CheckCircleOutlined style={{ fontSize: 20 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>已完成</span>
            </div>
          ) : (
            <Button type="primary" size="small" loading={checkingIn} onClick={handleCheckIn} style={{ height: 32, padding: "0 16px", borderRadius: 8, fontSize: 13, fontWeight: 600 }}>
              签到
            </Button>
          )}
        </div> : null}

        {showShare ? <div className="member-task-item">
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: shareClaimedToday ? "rgba(5,150,105,0.1)" : "rgba(37,211,102,0.1)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>💬</div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>分享到 WhatsApp</p>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>获得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{portalSettings.share_reward_spins} 次</span> 抽奖机会</p>
            </div>
          </div>
          {shareClaimedToday ? (
            <div style={{ display: "flex", alignItems: "center", gap: 4, color: "#059669" }}>
              <CheckCircleOutlined style={{ fontSize: 20 }} />
              <span style={{ fontSize: 12, fontWeight: 600 }}>已完成</span>
            </div>
          ) : (
            <Button size="small" loading={claimingShare} onClick={handleShareAndClaim} icon={<ShareAltOutlined />} style={{ height: 32, padding: "0 12px", borderRadius: 8, fontSize: 12, fontWeight: 600, background: "#25D366", borderColor: "#25D366", color: "white" }}>
              分享
            </Button>
          )}
        </div> : null}

        {showInvite ? <div className="member-task-item" style={{ borderBottom: "none" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: "rgba(5,150,105,0.08)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 18, flexShrink: 0 }}>👥</div>
            <div>
              <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>邀请好友</p>
              <p style={{ margin: 0, fontSize: 12, color: "#64748b" }}>双方各得 <span style={{ color: "#f59e0b", fontWeight: 700 }}>+{portalSettings.invite_reward_spins} 次</span> 抽奖</p>
            </div>
          </div>
          <Link to="/member/invite">
            <Button size="small" style={{ height: 32, padding: "0 14px", borderRadius: 8, fontSize: 12, fontWeight: 600, borderColor: "#e2e8f0", color: "#475569" }}>
              去邀请 →
            </Button>
          </Link>
        </div> : null}
      </div>
    </>
  );

  const securitySection = (
    <div style={{
      marginTop: 20,
      padding: "14px 16px",
      background: "linear-gradient(135deg, rgba(245,158,11,0.06), rgba(217,119,6,0.04))",
      borderRadius: 12,
      border: "1px solid rgba(245,158,11,0.12)",
      textAlign: "center",
    }}>
      <p style={{ margin: 0, fontSize: 12, color: "#92400e", fontWeight: 500 }}>
        🔐 {portalSettings.footer_text || "账户数据安全加密，平台合规运营，请放心使用"}
      </p>
    </div>
  );

  return (
    <ConfigProvider theme={{ token: { colorPrimary: portalSettings.theme_primary_color || "#f59e0b" } }}>
      <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh" }}>

        {/* ── 英雄区 ── */}
        <div style={{
          background: heroBg,
          padding: "20px 20px 88px",
          position: "relative",
          overflow: "hidden",
        }}>
          {/* 背景装饰 */}
          <div style={{ position: "absolute", top: -60, right: -60, width: 200, height: 200, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />
          <div style={{ position: "absolute", bottom: -30, left: -30, width: 120, height: 120, borderRadius: "50%", background: "rgba(245,158,11,0.05)", pointerEvents: "none" }} />

          {/* 顶部栏 */}
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
            <div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0, letterSpacing: "0.5px", textTransform: "uppercase" }}>
                欢迎回来
              </p>
              <h1 style={{ color: "white", fontSize: 20, fontWeight: 700, margin: "4px 0 0", letterSpacing: "-0.3px" }}>
                {displayName}
              </h1>
            </div>
            <button
              onClick={signOut}
              style={{
                background: "rgba(255,255,255,0.1)",
                border: "1px solid rgba(255,255,255,0.15)",
                borderRadius: 10,
                color: "rgba(255,255,255,0.7)",
                padding: "6px 12px",
                fontSize: 12,
                cursor: "pointer",
                display: "flex",
                alignItems: "center",
                gap: 4,
              }}
            >
              <LogoutOutlined style={{ fontSize: 12 }} />
              退出
            </button>
          </div>

          {/* 会员卡 */}
          <div className="member-card">
            {/* 卡片顶部行 */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 20 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {portalSettings.logo_url ? (
                  <img
                    src={portalSettings.logo_url}
                    alt="company-logo"
                    style={{ width: 24, height: 24, borderRadius: 6, objectFit: "cover", border: "1px solid rgba(255,255,255,0.2)" }}
                  />
                ) : null}
                <span style={{ color: "white", fontSize: 14, fontWeight: 800, letterSpacing: "1px" }}>
                  {portalSettings.company_name || "SPIN & WIN"}
                </span>
              </div>
              <span className="member-badge member-badge-gold">
                ★ MEMBER
              </span>
            </div>

            {/* 积分三列 */}
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 0 }}>
              {/* 消费积分 */}
              <div>
                <p className="member-stat-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StarOutlined style={{ color: "#f59e0b" }} />
                  消费积分
                  <Tooltip title="自己消费产生的积分">
                    <InfoCircleOutlined style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer" }} />
                  </Tooltip>
                </p>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#fbbf24", margin: 0, lineHeight: 1.2 }}>
                  {loading ? "..." : breakdown.consumption_points.toLocaleString()}
                </p>
              </div>

              {/* 推广积分 */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 12 }}>
                <p className="member-stat-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StarOutlined style={{ color: "#34d399" }} />
                  推广积分
                  <Tooltip title="推广用户兑换产生的积分">
                    <InfoCircleOutlined style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer" }} />
                  </Tooltip>
                </p>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#34d399", margin: 0, lineHeight: 1.2 }}>
                  {loading ? "..." : breakdown.referral_points.toLocaleString()}
                </p>
              </div>

              {/* 总积分 */}
              <div style={{ borderLeft: "1px solid rgba(255,255,255,0.1)", paddingLeft: 12 }}>
                <p className="member-stat-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
                  <StarOutlined style={{ color: "#a78bfa" }} />
                  总积分
                  <Tooltip title="消费积分 + 推广积分总和">
                    <InfoCircleOutlined style={{ fontSize: 11, color: "rgba(255,255,255,0.4)", cursor: "pointer" }} />
                  </Tooltip>
                </p>
                <p style={{ fontSize: 20, fontWeight: 800, color: "#a78bfa", margin: 0, lineHeight: 1.2 }}>
                  {loading ? "..." : breakdown.total_points.toLocaleString()}
                </p>
              </div>
            </div>

            {/* 会员编号 */}
            <div style={{
              marginTop: 16,
              paddingTop: 14,
              borderTop: "1px solid rgba(255,255,255,0.1)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}>
              <span style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, letterSpacing: "1px", textTransform: "uppercase" }}>
                Member ID
              </span>
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: 12, fontFamily: "monospace", letterSpacing: "1.5px" }}>
                {member.member_code || member.phone_number}
              </span>
            </div>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div style={{
          background: "#f1f5f9",
          borderRadius: "24px 24px 0 0",
          marginTop: -32,
          padding: "24px 16px 100px",
          position: "relative",
        }}>
          {portalSettings.announcement ? (
            <div
              style={{
                marginBottom: 14,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(245,158,11,0.3)",
                background: "rgba(245,158,11,0.08)",
                color: "#92400e",
                fontSize: 12,
              }}
            >
              📢 {portalSettings.announcement}
            </div>
          ) : null}

          {Array.isArray(portalSettings.home_banners) && portalSettings.home_banners.length > 0 ? (
            <div style={{ marginBottom: 14 }}>
              <Carousel autoplay dots>
                {portalSettings.home_banners.map((banner, idx) => (
                  <div key={`${banner.title}-${idx}`}>
                    <a
                      href={banner.link || "#"}
                      style={{ textDecoration: "none" }}
                      onClick={(e) => {
                        if (!banner.link) e.preventDefault();
                      }}
                    >
                      <div
                        style={{
                          background: banner.image_url
                            ? `linear-gradient(rgba(0,0,0,0.22), rgba(0,0,0,0.35)), url(${banner.image_url}) center/cover no-repeat`
                            : "linear-gradient(135deg, #fde68a, #f59e0b)",
                          borderRadius: 12,
                          padding: "14px 16px",
                          minHeight: 78,
                        }}
                      >
                        <p
                          style={{
                            margin: 0,
                            fontSize: 15,
                            fontWeight: 800,
                            color: banner.image_url ? "white" : "#7c2d12",
                          }}
                        >
                          {banner.title}
                        </p>
                        <p style={{ margin: "6px 0 0", fontSize: 12, color: banner.image_url ? "rgba(255,255,255,0.9)" : "#78350f" }}>
                          {banner.subtitle || ""}
                        </p>
                      </div>
                    </a>
                  </div>
                ))}
              </Carousel>
            </div>
          ) : null}

          {moduleOrder.map((moduleKey) => {
            if (moduleKey === "shortcuts") return <div key="shortcuts">{shortcutsSection}</div>;
            if (moduleKey === "tasks") return <div key="tasks">{tasksSection}</div>;
            if (moduleKey === "security") return <div key="security">{securitySection}</div>;
            return null;
          })}
        </div>

        {portalSettings.customer_service_link ? (
          <a
            href={portalSettings.customer_service_link}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              position: "fixed",
              right: 16,
              bottom: 86,
              zIndex: 1000,
              background: "#10b981",
              color: "white",
              borderRadius: 9999,
              padding: "10px 14px",
              fontSize: 12,
              fontWeight: 700,
              textDecoration: "none",
              boxShadow: "0 6px 20px rgba(16,185,129,0.35)",
            }}
          >
            {portalSettings.customer_service_label || "联系客服"}
          </a>
        ) : null}

        <Modal
          title={portalSettings.announcement_popup_title || "系统公告"}
          open={popupOpen}
          onCancel={() => setPopupOpen(false)}
          onOk={() => setPopupOpen(false)}
          okText="我知道了"
          cancelButtonProps={{ style: { display: "none" } }}
        >
          <div style={{ whiteSpace: "pre-wrap" }}>{portalSettings.announcement_popup_content || ""}</div>
        </Modal>
      </div>
    </ConfigProvider>
  );
}
