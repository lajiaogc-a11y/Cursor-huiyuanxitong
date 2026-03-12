import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card, Row, Col, Button, Statistic } from "antd";
import { WalletOutlined, ThunderboltOutlined, GiftOutlined, ShoppingOutlined, TeamOutlined, CheckCircleOutlined, LogoutOutlined, ShareAltOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPoints } from "@/hooks/useMemberPoints";
import { useMemberSpinQuota } from "@/hooks/useMemberSpinQuota";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

export default function MemberDashboard() {
  const { member, signOut, refreshMember } = useMemberAuth();
  const { points, loading, refresh: refreshPoints } = useMemberPoints(member?.id);
  const { remaining: spinRemaining, refresh: refreshSpinQuota } = useMemberSpinQuota(member?.id);
  const [checkedInToday, setCheckedInToday] = useState(false);
  const [checkingIn, setCheckingIn] = useState(false);
  const [shareClaimedToday, setShareClaimedToday] = useState(false);
  const [claimingShare, setClaimingShare] = useState(false);

  const INVITE_MSG = (link: string) =>
    `加入 Spin & Win 抽奖！注册即得 3 次免费抽奖，赢话费、现金、手机！点击：${link}`;

  useEffect(() => {
    if (!member) return;
    (async () => {
      const { data } = await supabase.rpc("member_check_in_today", { p_member_id: member.id });
      const r = data as { success?: boolean; checked_in_today?: boolean };
      setCheckedInToday(!!r?.checked_in_today);
    })();
  }, [member?.id]);

  const handleShareAndClaim = async () => {
    if (!member || claimingShare || shareClaimedToday) return;
    const inviteLink = `${window.location.origin}/invite/${member.member_code || ""}`;
    const text = encodeURIComponent(INVITE_MSG(inviteLink));
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
    setClaimingShare(true);
    try {
      const { data, error } = await supabase.rpc("member_grant_spin_for_share", { p_member_id: member.id });
      const r = (data || {}) as { success?: boolean; error?: string };
      if (error) {
        toast.error(error.message);
        return;
      }
      if (r?.success) {
        setShareClaimedToday(true);
        refreshSpinQuota();
        toast.success("分享成功！获得 1 次抽奖机会");
      } else if (r?.error === "ALREADY_CLAIMED_TODAY") {
        setShareClaimedToday(true);
        toast.info("今日已领取过分享奖励");
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
      if (error) {
        toast.error(error.message);
        return;
      }
      const r = data as { success: boolean; error?: string; consecutive_days?: number; reward_value?: number };
      if (r.success) {
        setCheckedInToday(true);
        await refreshMember();
        refreshPoints();
        refreshSpinQuota();
        toast.success(`签到成功！连续 ${r.consecutive_days} 天，获得 ${r.reward_value} 次免费抽奖`);
      } else {
        toast.error(r.error || "签到失败");
      }
    } catch (e: any) {
      toast.error(e?.message || "网络错误");
    } finally {
      setCheckingIn(false);
    }
  };

  if (!member) return null;

  const displayName = member.nickname || member.member_code || member.phone_number;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
        <header className="bg-white px-4 py-4 flex justify-between items-center shadow-sm">
          <div>
            <p className="text-gray-500 text-sm">欢迎回来</p>
            <h1 className="text-lg font-bold text-gray-900">{displayName}</h1>
          </div>
          <Button type="text" icon={<LogoutOutlined />} onClick={signOut} className="text-gray-500">
            退出
          </Button>
        </header>

        <main className="p-4 max-w-md mx-auto">
          <Row gutter={[12, 12]} className="mb-4">
            <Col span={12}>
              <Card className="shadow-sm" style={{ borderRadius: 12 }}>
                <Statistic
                  title={<span className="text-gray-500 text-sm">钱包余额</span>}
                  value={Number(member.wallet_balance || 0)}
                  prefix="₦"
                  suffix=""
                  valueStyle={{ color: "#f59e0b", fontSize: 20, fontWeight: 600 }}
                />
              </Card>
            </Col>
            <Col span={12}>
              <Card className="shadow-sm" style={{ borderRadius: 12 }}>
                <Statistic
                  title={<span className="text-gray-500 text-sm">积分</span>}
                  value={loading ? "..." : points}
                  valueStyle={{ color: "#f59e0b", fontSize: 20, fontWeight: 600 }}
                />
              </Card>
            </Col>
          </Row>

          <Row gutter={[12, 12]} className="mb-4">
            <Col span={12}>
              <Link to="/member/spin">
                <Card className="shadow-sm h-full cursor-pointer hover:shadow-md transition-shadow" style={{ borderRadius: 12 }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-amber-100 flex items-center justify-center">
                      <GiftOutlined className="text-2xl text-amber-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 m-0">幸运抽奖</p>
                      <p className="text-gray-500 text-xs m-0">剩余 {spinRemaining} 次</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Col>
            <Col span={12}>
              <Link to="/member/points">
                <Card className="shadow-sm h-full cursor-pointer hover:shadow-md transition-shadow" style={{ borderRadius: 12 }}>
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 rounded-xl bg-orange-100 flex items-center justify-center">
                      <ShoppingOutlined className="text-2xl text-orange-600" />
                    </div>
                    <div>
                      <p className="font-semibold text-gray-900 m-0">积分商城</p>
                      <p className="text-gray-500 text-xs m-0">兑换好礼</p>
                    </div>
                  </div>
                </Card>
              </Link>
            </Col>
          </Row>

          <Link to="/member/invite" className="block mb-4">
            <Card className="shadow-sm cursor-pointer hover:shadow-md transition-shadow" style={{ borderRadius: 12 }}>
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                  <TeamOutlined className="text-2xl text-green-600" />
                </div>
                <div>
                  <p className="font-semibold text-gray-900 m-0">邀请好友</p>
                  <p className="text-gray-500 text-xs m-0">邀请即得 3 次抽奖</p>
                </div>
              </div>
            </Card>
          </Link>

          <Card title="今日任务" className="shadow-sm mb-4" style={{ borderRadius: 12 }}>
            <div className="space-y-3">
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700">每日签到 — 获得 1 次免费抽奖</span>
                {checkedInToday ? (
                  <CheckCircleOutlined className="text-green-500 text-lg" />
                ) : (
                  <Button type="primary" size="small" loading={checkingIn} onClick={handleCheckIn}>
                    {checkingIn ? "..." : "签到"}
                  </Button>
                )}
              </div>
              <div className="flex items-center gap-2 text-gray-600 text-sm">
                <TeamOutlined /> 邀请好友 — 各得 3 次抽奖
              </div>
              <div className="flex items-center justify-between py-2 border-b border-gray-100">
                <span className="text-gray-700 flex items-center gap-2">
                  <ShareAltOutlined /> 分享到 WhatsApp — 获得 1 次抽奖
                </span>
                {shareClaimedToday ? (
                  <CheckCircleOutlined className="text-green-500 text-lg" />
                ) : (
                  <Button
                    type="primary"
                    size="small"
                    loading={claimingShare}
                    onClick={handleShareAndClaim}
                    icon={<ShareAltOutlined />}
                    style={{ background: "#25D366", borderColor: "#25D366" }}
                  >
                    {claimingShare ? "..." : "分享领取"}
                  </Button>
                )}
              </div>
            </div>
          </Card>
        </main>
      </div>
    </ConfigProvider>
  );
}
