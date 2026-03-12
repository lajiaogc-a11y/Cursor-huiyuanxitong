import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Form, Input, Button, Card } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { toast } from "sonner";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

export default function MemberLogin() {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signIn, isAuthenticated } = useMemberAuth();
  const [form] = Form.useForm();
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (isAuthenticated) navigate("/member/dashboard", { replace: true });
  }, [isAuthenticated, navigate]);

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
          colorPrimary: "#f59e0b",
          borderRadius: 12,
        },
      }}
    >
      <div className="member-antd-wrap min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 via-orange-50 to-amber-100 p-4">
        <div className="w-full max-w-sm">
          <div className="text-center mb-6">
            <h1 className="text-2xl font-bold text-amber-900">Spin & Win</h1>
            <p className="text-amber-700 mt-1 text-sm">
              {t("欢迎回来，请登录", "Welcome back! Sign in to continue")}
            </p>
          </div>
          <Card className="shadow-lg border-0" style={{ borderRadius: 16 }}>
            <Form
              form={form}
              layout="vertical"
              onFinish={handleSubmit}
              size="large"
              requiredMark={false}
            >
              <Form.Item
                name="phone"
                label={t("手机号 / 会员编号", "Phone / Member Code")}
                rules={[{ required: true, message: t("请输入", "Required") }]}
              >
                <Input
                  prefix={<UserOutlined className="text-amber-500" />}
                  placeholder="e.g. 08012345678"
                  autoComplete="tel"
                />
              </Form.Item>
              <Form.Item
                name="password"
                label={t("密码", "Password")}
                rules={[{ required: true, message: t("请输入", "Required") }]}
              >
                <Input.Password
                  prefix={<LockOutlined className="text-amber-500" />}
                  placeholder="Enter password"
                  autoComplete="current-password"
                />
              </Form.Item>
              <Form.Item className="mb-0">
                <Button type="primary" htmlType="submit" block loading={loading} size="large">
                  {t("登录", "Sign In")}
                </Button>
              </Form.Item>
            </Form>
          </Card>
          <p className="text-center text-sm text-amber-700 mt-4">
            {t("没有密码？请联系管理员获取初始密码。", "No password? Contact admin to get your initial password.")}
          </p>
        </div>
      </div>
    </ConfigProvider>
  );
}
