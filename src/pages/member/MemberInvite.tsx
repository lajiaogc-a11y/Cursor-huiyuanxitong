import { Card, Button, Input } from "antd";
import { ShareAltOutlined, CopyOutlined, TeamOutlined } from "@ant-design/icons";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { toast } from "sonner";
import { ConfigProvider } from "antd";
import "@/styles/member-antd.css";

const INVITE_MSG = (link: string) =>
  `加入 Spin & Win 抽奖！注册即得 3 次免费抽奖，赢话费、现金、手机！点击：${link}`;

export default function MemberInvite() {
  const { member } = useMemberAuth();
  const inviteLink = typeof window !== "undefined" ? `${window.location.origin}/invite/${member?.member_code || ""}` : "";

  const copyLink = () => {
    navigator.clipboard.writeText(inviteLink);
    toast.success("链接已复制");
  };

  const shareWhatsApp = () => {
    const text = encodeURIComponent(INVITE_MSG(inviteLink));
    window.open(`https://wa.me/?text=${text}`, "_blank", "noopener,noreferrer");
  };

  if (!member) return null;

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <div className="member-antd-wrap min-h-screen bg-[#faf9f7]">
        <header className="bg-white px-4 py-4 shadow-sm">
          <h1 className="text-lg font-bold text-gray-900 m-0">邀请好友</h1>
          <p className="text-gray-500 text-sm m-0 mt-1">邀请即得 3 次抽奖，好友也得 3 次</p>
        </header>

        <main className="p-4 max-w-md mx-auto">
          <Card className="mb-4 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 rounded-xl bg-green-100 flex items-center justify-center">
                <TeamOutlined className="text-2xl text-green-600" />
              </div>
              <div>
                <p className="font-semibold text-gray-900 m-0">邀请有礼</p>
                <p className="text-gray-500 text-sm m-0">好友注册并完成首单，双方各得 3 次抽奖</p>
              </div>
            </div>
          </Card>

          <Card title="您的邀请链接" className="mb-4 shadow-sm" style={{ borderRadius: 12 }}>
            <Input.Group compact>
              <Input value={inviteLink} readOnly style={{ flex: 1 }} />
              <Button type="primary" icon={<CopyOutlined />} onClick={copyLink}>
                复制
              </Button>
            </Input.Group>
          </Card>

          <Card title="分享到 WhatsApp" className="shadow-sm" style={{ borderRadius: 12 }}>
            <Button
              type="primary"
              block
              size="large"
              icon={<ShareAltOutlined />}
              onClick={shareWhatsApp}
              style={{ background: "#25D366", borderColor: "#25D366" }}
            >
              分享到 WhatsApp
            </Button>
          </Card>
        </main>
      </div>
    </ConfigProvider>
  );
}
