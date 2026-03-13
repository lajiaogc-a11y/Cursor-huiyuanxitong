import { useState, useEffect } from "react";
import { Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined, RightOutlined, LogoutOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

export default function MemberSettings() {
  const { t } = useLanguage();
  const { member, setPassword, refreshMember, signOut } = useMemberAuth();
  const [nickname, setNickname] = useState(member?.nickname || "");
  const [form] = Form.useForm();
  const [expandedSection, setExpandedSection] = useState<"nickname" | "password" | null>(null);

  useEffect(() => {
    setNickname(member?.nickname || "");
  }, [member?.nickname]);

  const [savingNickname, setSavingNickname] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);

  const handleSaveNickname = async () => {
    if (!member) return;
    setSavingNickname(true);
    try {
      const { data, error } = await supabase.rpc("member_update_nickname", {
        p_member_id: member.id,
        p_nickname: nickname.trim(),
      });
      if (error) throw error;
      const r = data as { success?: boolean; error?: string };
      if (!r?.success) throw new Error(r?.error || "Failed");
      await refreshMember();
      toast.success(t("昵称已更新", "Nickname updated"));
      setExpandedSection(null);
    } catch (e: any) {
      toast.error(e?.message || t("失败", "Failed"));
    } finally {
      setSavingNickname(false);
    }
  };

  const handleChangePassword = async (values: { oldPwd: string; newPwd: string; confirmPwd: string }) => {
    if (values.newPwd.length < 6) {
      toast.error(t("密码至少6位", "Password must be at least 6 characters"));
      return;
    }
    if (values.newPwd !== values.confirmPwd) {
      toast.error(t("两次密码不一致", "Passwords do not match"));
      return;
    }
    setSavingPwd(true);
    try {
      const result = await setPassword(values.oldPwd, values.newPwd);
      if (result.success) {
        toast.success(result.message);
        form.resetFields();
        setExpandedSection(null);
      } else {
        toast.error(result.message);
      }
    } finally {
      setSavingPwd(false);
    }
  };

  if (!member) return null;

  const displayName = member.nickname || member.member_code || member.phone_number;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap" style={{ background: "#f1f5f9", minHeight: "100vh" }}>

        {/* ── 英雄区（用户信息卡） ── */}
        <div style={{
          background: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)",
          padding: "24px 20px 80px",
          position: "relative",
          overflow: "hidden",
        }}>
          <div style={{ position: "absolute", top: -60, right: -60, width: 180, height: 180, borderRadius: "50%", background: "rgba(245,158,11,0.08)", pointerEvents: "none" }} />

          <h1 style={{ color: "white", fontSize: 18, fontWeight: 700, margin: "0 0 20px" }}>
            {t("我的账户", "My Account")}
          </h1>

          {/* 用户信息行 */}
          <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
            {/* 头像占位 */}
            <div style={{
              width: 64, height: 64,
              borderRadius: "50%",
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              display: "flex", alignItems: "center", justifyContent: "center",
              fontSize: 26, fontWeight: 800, color: "white",
              boxShadow: "0 4px 16px rgba(245,158,11,0.4)",
              flexShrink: 0,
              border: "3px solid rgba(255,255,255,0.2)",
            }}>
              {(displayName || "U").charAt(0).toUpperCase()}
            </div>

            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
                <h2 style={{
                  color: "white", fontSize: 18, fontWeight: 700,
                  margin: 0, overflow: "hidden",
                  textOverflow: "ellipsis", whiteSpace: "nowrap",
                }}>
                  {displayName}
                </h2>
                <span className="member-badge member-badge-gold">MEMBER</span>
              </div>
              <p style={{ color: "rgba(255,255,255,0.5)", fontSize: 12, margin: 0, fontFamily: "monospace", letterSpacing: "0.5px" }}>
                ID: {member.member_code || member.phone_number}
              </p>
              {member.phone_number && member.member_code && (
                <p style={{ color: "rgba(255,255,255,0.4)", fontSize: 11, margin: "2px 0 0" }}>
                  📱 {member.phone_number}
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 内容区 ── */}
        <div style={{
          background: "#f1f5f9",
          borderRadius: "24px 24px 0 0",
          marginTop: -28,
          padding: "24px 16px 100px",
        }}>

          {/* 账户设置标题 */}
          <p className="member-section-title" style={{ marginBottom: 12 }}>账户设置</p>

          {/* 设置列表卡片 */}
          <div style={{
            background: "white",
            borderRadius: 16,
            padding: "0 16px",
            boxShadow: "0 1px 3px rgba(15,23,42,0.06)",
            marginBottom: 16,
          }}>

            {/* 修改昵称 */}
            <div>
              <button
                onClick={() => setExpandedSection(expandedSection === "nickname" ? null : "nickname")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "16px 0",
                  background: "none", border: "none", cursor: "pointer",
                  borderBottom: expandedSection === "nickname" ? "none" : "1px solid rgba(15,23,42,0.06)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(245,158,11,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <UserOutlined style={{ color: "#f59e0b", fontSize: 16 }} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
                      {t("修改昵称", "Change Nickname")}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                      {member.nickname || t("未设置", "Not set")}
                    </p>
                  </div>
                </div>
                <RightOutlined style={{
                  color: "#94a3b8", fontSize: 12,
                  transform: expandedSection === "nickname" ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s ease",
                }} />
              </button>

              {/* 昵称表单展开 */}
              {expandedSection === "nickname" && (
                <div style={{ padding: "0 0 16px", borderBottom: "1px solid rgba(15,23,42,0.06)" }}>
                  <div style={{ display: "flex", gap: 8 }}>
                    <Input
                      prefix={<UserOutlined style={{ color: "#f59e0b" }} />}
                      value={nickname}
                      onChange={(e) => setNickname(e.target.value)}
                      placeholder={t("输入新昵称", "Enter new nickname")}
                      size="large"
                      style={{ flex: 1 }}
                    />
                    <Button
                      type="primary"
                      loading={savingNickname}
                      onClick={handleSaveNickname}
                      size="large"
                      style={{ height: 48, padding: "0 20px", borderRadius: 12, fontWeight: 700 }}
                    >
                      {t("保存", "Save")}
                    </Button>
                  </div>
                </div>
              )}
            </div>

            {/* 修改密码 */}
            <div>
              <button
                onClick={() => setExpandedSection(expandedSection === "password" ? null : "password")}
                style={{
                  display: "flex", alignItems: "center", justifyContent: "space-between",
                  width: "100%", padding: "16px 0",
                  background: "none", border: "none", cursor: "pointer",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 10,
                    background: "rgba(99,102,241,0.1)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                  }}>
                    <LockOutlined style={{ color: "#6366f1", fontSize: 16 }} />
                  </div>
                  <div style={{ textAlign: "left" }}>
                    <p style={{ margin: 0, fontWeight: 600, fontSize: 14, color: "#0f172a" }}>
                      {t("修改密码", "Change Password")}
                    </p>
                    <p style={{ margin: 0, fontSize: 12, color: "#94a3b8" }}>
                      {t("定期修改以保护账户安全", "Update regularly for security")}
                    </p>
                  </div>
                </div>
                <RightOutlined style={{
                  color: "#94a3b8", fontSize: 12,
                  transform: expandedSection === "password" ? "rotate(90deg)" : "none",
                  transition: "transform 0.2s ease",
                }} />
              </button>

              {/* 密码表单展开 */}
              {expandedSection === "password" && (
                <div style={{ paddingBottom: 16 }}>
                  <Form form={form} layout="vertical" onFinish={handleChangePassword} size="large" requiredMark={false}>
                    <Form.Item
                      name="oldPwd"
                      label={<span style={{ fontSize: 13, color: "#64748b" }}>{t("当前密码", "Current Password")}</span>}
                      rules={[{ required: true, message: t("请输入", "Required") }]}
                      style={{ marginBottom: 12 }}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: "#f59e0b" }} />}
                        placeholder={t("当前密码", "Current password")}
                      />
                    </Form.Item>
                    <Form.Item
                      name="newPwd"
                      label={<span style={{ fontSize: 13, color: "#64748b" }}>{t("新密码（至少6位）", "New Password (min 6 chars)")}</span>}
                      rules={[
                        { required: true, message: t("请输入", "Required") },
                        { min: 6, message: t("至少6位", "At least 6 characters") },
                      ]}
                      style={{ marginBottom: 12 }}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: "#f59e0b" }} />}
                        placeholder={t("新密码", "New password")}
                      />
                    </Form.Item>
                    <Form.Item
                      name="confirmPwd"
                      label={<span style={{ fontSize: 13, color: "#64748b" }}>{t("确认新密码", "Confirm New Password")}</span>}
                      rules={[
                        { required: true, message: t("请输入", "Required") },
                        ({ getFieldValue }) => ({
                          validator(_, value) {
                            if (!value || getFieldValue("newPwd") === value) return Promise.resolve();
                            return Promise.reject(new Error(t("两次密码不一致", "Passwords do not match")));
                          },
                        }),
                      ]}
                      style={{ marginBottom: 16 }}
                    >
                      <Input.Password
                        prefix={<LockOutlined style={{ color: "#f59e0b" }} />}
                        placeholder={t("确认新密码", "Confirm new password")}
                      />
                    </Form.Item>
                    <Form.Item className="mb-0">
                      <Button
                        type="primary"
                        htmlType="submit"
                        block
                        loading={savingPwd}
                        style={{ height: 48, borderRadius: 12, fontWeight: 700 }}
                      >
                        {t("更新密码", "Update Password")}
                      </Button>
                    </Form.Item>
                  </Form>
                </div>
              )}
            </div>
          </div>

          {/* 安全提示 */}
          <div style={{
            background: "rgba(245,158,11,0.06)",
            border: "1px solid rgba(245,158,11,0.15)",
            borderRadius: 14,
            padding: "12px 16px",
            marginBottom: 20,
          }}>
            <p style={{ margin: 0, fontSize: 12, color: "#92400e" }}>
              🔒 您的账户信息经过加密保护，我们不会向第三方透露您的任何信息
            </p>
          </div>

          {/* 退出登录 */}
          <Button
            block
            size="large"
            icon={<LogoutOutlined />}
            onClick={signOut}
            style={{
              height: 50, borderRadius: 14,
              fontSize: 15, fontWeight: 600,
              border: "1px solid rgba(239,68,68,0.3)",
              color: "#ef4444",
              background: "rgba(239,68,68,0.05)",
            }}
          >
            {t("退出登录", "Sign Out")}
          </Button>
        </div>
      </div>
    </ConfigProvider>
  );
}
