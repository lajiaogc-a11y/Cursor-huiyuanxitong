import { useState, useEffect } from "react";
import { Card, Form, Input, Button } from "antd";
import { UserOutlined, LockOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

export default function MemberSettings() {
  const { t } = useLanguage();
  const { member, setPassword, refreshMember } = useMemberAuth();
  const [nickname, setNickname] = useState(member?.nickname || "");
  const [form] = Form.useForm();

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
      } else {
        toast.error(result.message);
      }
    } finally {
      setSavingPwd(false);
    }
  };

  if (!member) return null;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
        <header className="bg-white px-4 py-4 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 m-0">{t("设置", "Settings")}</h1>
          <p className="text-gray-500 text-sm m-0 mt-1">{t("管理您的账户", "Manage your account")}</p>
        </header>

        <main className="p-4 max-w-md mx-auto">
          <Card title={t("昵称", "Nickname")} className="mb-4 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="flex gap-2">
              <Input
                prefix={<UserOutlined className="text-amber-500" />}
                value={nickname}
                onChange={(e) => setNickname(e.target.value)}
                placeholder={t("您的显示名称", "Your display name")}
                size="large"
              />
              <Button type="primary" loading={savingNickname} onClick={handleSaveNickname} size="large">
                {t("保存", "Save")}
              </Button>
            </div>
          </Card>

          <Card title={t("修改密码", "Change password")} className="shadow-sm" style={{ borderRadius: 12 }}>
            <Form form={form} layout="vertical" onFinish={handleChangePassword} size="large">
              <Form.Item
                name="oldPwd"
                label={t("当前密码", "Current password")}
                rules={[{ required: true, message: t("请输入", "Required") }]}
              >
                <Input.Password prefix={<LockOutlined className="text-amber-500" />} placeholder={t("当前密码", "Current password")} />
              </Form.Item>
              <Form.Item
                name="newPwd"
                label={t("新密码（至少6位）", "New password (min 6 chars)")}
                rules={[{ required: true, message: t("请输入", "Required") }, { min: 6, message: t("至少6位", "At least 6 characters") }]}
              >
                <Input.Password prefix={<LockOutlined className="text-amber-500" />} placeholder={t("新密码", "New password")} />
              </Form.Item>
              <Form.Item
                name="confirmPwd"
                label={t("确认新密码", "Confirm new password")}
                rules={[
                  { required: true, message: t("请输入", "Required") },
                  ({ getFieldValue }) => ({
                    validator(_, value) {
                      if (!value || getFieldValue("newPwd") === value) return Promise.resolve();
                      return Promise.reject(new Error(t("两次密码不一致", "Passwords do not match")));
                    },
                  }),
                ]}
              >
                <Input.Password prefix={<LockOutlined className="text-amber-500" />} placeholder={t("确认", "Confirm")} />
              </Form.Item>
              <Form.Item className="mb-0">
                <Button type="primary" htmlType="submit" block loading={savingPwd} size="large">
                  {t("更新密码", "Update password")}
                </Button>
              </Form.Item>
            </Form>
          </Card>
        </main>
      </div>
    </ConfigProvider>
  );
}
