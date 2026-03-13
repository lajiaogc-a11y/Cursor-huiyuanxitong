import { useState, useEffect } from "react";
import { useNavigate, Link } from "react-router-dom";
import { Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { ConfigProvider } from "antd";
import {
  DEFAULT_SETTINGS,
  getMemberPortalSettingsByAccount,
  type MemberPortalSettings,
} from "@/services/memberPortalSettingsService";
import "@/styles/member-antd.css";

export default function MemberLogin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signIn, isAuthenticated, member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);
  const [previewSettings, setPreviewSettings] = useState<MemberPortalSettings>(DEFAULT_SETTINGS);
  const accountValue = Form.useWatch("phone", form);

  useEffect(() => {
    if (isAuthenticated) navigate("/member/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

  useEffect(() => {
    if (member?.id) return;
    const account = String(accountValue || "").trim();
    if (!account) {
      setPreviewSettings(DEFAULT_SETTINGS);
      return;
    }

    const timer = window.setTimeout(async () => {
      const data = await getMemberPortalSettingsByAccount(account);
      if (data?.settings) {
        setPreviewSettings(data.settings);
      } else {
        setPreviewSettings(DEFAULT_SETTINGS);
      }
    }, 350);

    return () => window.clearTimeout(timer);
  }, [accountValue, member?.id]);

  const displaySettings = member?.id ? settings : previewSettings;

  const handleSubmit = async (values: { phone: string; password: string }) => {
    if (!values.phone?.trim()) {
      toast.error(t("请输入手机号或会员编号", "Please enter your phone or member code"));
      return;
    }
    if (!values.password) {
      toast.error(t("请输入密码", "Please enter your password"));
      return;
    }
    setLoading(true);
    try {
      const result = await signIn(values.phone.trim(), values.password);
      if (result.success) {
        toast.success(result.message);
        navigate("/member/dashboard", { replace: true });
      } else {
        toast.error(result.message);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <ConfigProvider
      theme={{
        token: {
          colorPrimary: displaySettings.theme_primary_color || "#f59e0b",
          borderRadius: 12,
        },
      }}
    >
      <div className="member-antd-wrap min-h-screen flex flex-col" style={{ background: "#0f172a" }}>

        {/* ── 上半品牌区 ── */}
        <div
          className="relative flex flex-col items-center justify-center flex-none"
          style={{
            minHeight: "42vh",
            background: "linear-gradient(145deg, #0f172a 0%, #1e3a5f 100%)",
            overflow: "hidden",
            padding: "40px 24px 60px",
          }}
        >
          {/* 装饰性背景圆 */}
          <div style={{
            position: "absolute", top: -80, right: -80,
            width: 260, height: 260, borderRadius: "50%",
            background: "rgba(245,158,11,0.07)", pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", bottom: -40, left: -50,
            width: 160, height: 160, borderRadius: "50%",
            background: "rgba(245,158,11,0.05)", pointerEvents: "none",
          }} />
          <div style={{
            position: "absolute", top: 60, left: 30,
            width: 6, height: 6, borderRadius: "50%",
            background: "rgba(245,158,11,0.4)",
          }} />
          <div style={{
            position: "absolute", top: 120, right: 50,
            width: 4, height: 4, borderRadius: "50%",
            background: "rgba(245,158,11,0.3)",
          }} />
          <div style={{
            position: "absolute", bottom: 60, right: 30,
            width: 5, height: 5, borderRadius: "50%",
            background: "rgba(245,158,11,0.25)",
          }} />

          {/* Logo 图标 */}
          {displaySettings.logo_url ? (
            <img
              src={displaySettings.logo_url}
              alt="company-logo"
              style={{
                width: 72,
                height: 72,
                borderRadius: 20,
                objectFit: "cover",
                marginBottom: 16,
                border: "1px solid rgba(255,255,255,0.2)",
                boxShadow: "0 8px 32px rgba(245,158,11,0.4)",
              }}
            />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: 20,
              background: "linear-gradient(135deg, #f59e0b, #d97706)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 16,
              boxShadow: "0 8px 32px rgba(245,158,11,0.4)",
            }}>
              <span style={{ fontSize: 32 }}>🎡</span>
            </div>
          )}

          {/* 品牌名 */}
          <h1 style={{
            color: "white", fontSize: 30, fontWeight: 800,
            margin: 0, letterSpacing: "-0.5px",
          }}>
            {displaySettings.company_name || "Spin & Win"}
          </h1>
          <p style={{
            color: "rgba(255,255,255,0.55)", fontSize: 13,
            marginTop: 6, marginBottom: 0, letterSpacing: "1px",
            textTransform: "uppercase",
          }}>
            {displaySettings.welcome_title || "Premium Member Platform"}
          </p>

          {/* 装饰性徽章行 */}
          <div style={{ display: "flex", gap: 8, marginTop: 20, flexWrap: "wrap", justifyContent: "center" }}>
            {(displaySettings.login_badges?.length ? displaySettings.login_badges : ["🏆 签到奖励", "🎁 积分兑换", "👥 邀请好友"]).map((item) => (
              <span key={item} style={{
                background: "rgba(245,158,11,0.15)",
                border: "1px solid rgba(245,158,11,0.25)",
                color: "#fbbf24",
                padding: "4px 10px",
                borderRadius: 20,
                fontSize: 11,
                fontWeight: 600,
                whiteSpace: "nowrap",
              }}>
                {item}
              </span>
            ))}
          </div>
        </div>

        {/* ── 下半表单区（白色向上覆盖） ── */}
        <div
          className="flex-1 bg-white"
          style={{
            borderRadius: "24px 24px 0 0",
            marginTop: -28,
            padding: "32px 24px 40px",
            boxShadow: "0 -4px 32px rgba(15,23,42,0.15)",
            position: "relative",
            zIndex: 2,
          }}
        >
          <h2 style={{
            fontSize: 20, fontWeight: 700,
            color: "#0f172a", margin: "0 0 4px",
          }}>
            {t("欢迎登录", "Welcome Back")}
          </h2>
          <p style={{ color: "#64748b", fontSize: 13, margin: "0 0 24px" }}>
          {displaySettings.welcome_subtitle || t("登录您的会员专属账户", "Sign in to your member account")}
          </p>

          {displaySettings.announcement ? (
            <div
              style={{
                marginBottom: 16,
                padding: "10px 12px",
                borderRadius: 10,
                border: "1px solid rgba(245,158,11,0.35)",
                background: "rgba(245,158,11,0.08)",
                fontSize: 12,
                color: "#92400e",
              }}
            >
              📢 {displaySettings.announcement}
            </div>
          ) : null}

          <Form
            form={form}
            layout="vertical"
            onFinish={handleSubmit}
            size="large"
            requiredMark={false}
          >
            <Form.Item
              name="phone"
              label={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  {t("手机号 / 会员编号", "Phone / Member Code")}
                </span>
              }
              rules={[{ required: true, message: t("请输入", "Required") }]}
            >
              <Input
                prefix={<UserOutlined style={{ color: "#f59e0b" }} />}
                placeholder="e.g. 08012345678"
                autoComplete="tel"
              />
            </Form.Item>

            <Form.Item
              name="password"
              label={
                <span style={{ color: "#64748b", fontSize: 13, fontWeight: 500 }}>
                  {t("密码", "Password")}
                </span>
              }
              rules={[{ required: true, message: t("请输入", "Required") }]}
              style={{ marginBottom: 24 }}
            >
              <Input.Password
                prefix={<LockOutlined style={{ color: "#f59e0b" }} />}
                placeholder={t("请输入密码", "Enter password")}
                autoComplete="current-password"
              />
            </Form.Item>

            <Form.Item className="mb-0">
              <Button
                type="primary"
                htmlType="submit"
                block
                loading={loading}
                style={{ height: 50, fontSize: 16, fontWeight: 700, borderRadius: 14 }}
              >
                {t("登 录", "Sign In")}
              </Button>
            </Form.Item>
          </Form>

          <p style={{
            textAlign: "center", fontSize: 12,
            color: "#94a3b8", marginTop: 20, lineHeight: 1.6,
          }}>
            {t("没有密码？请联系管理员获取初始密码。", "No password? Contact admin to get your initial password.")}
          </p>

          {/* 底部安全感文字 */}
          <div style={{
            marginTop: 28,
            padding: "12px 16px",
            background: "rgba(245,158,11,0.06)",
            borderRadius: 12,
            border: "1px solid rgba(245,158,11,0.15)",
            textAlign: "center",
          }}>
            <span style={{ fontSize: 11, color: "#92400e", fontWeight: 500 }}>
              🔒 {displaySettings.footer_text || t("您的数据已加密保护，安全可靠", "Your data is encrypted and secure")}
            </span>
          </div>

          {/* 员工入口 */}
          <div style={{ textAlign: "center", marginTop: 20 }}>
            <Link
              to="/staff/login"
              style={{ fontSize: 12, color: "#94a3b8", textDecoration: "none" }}
            >
              {t("员工入口 →", "Staff Login →")}
            </Link>
          </div>
        </div>
      </div>
    </ConfigProvider>
  );
}
