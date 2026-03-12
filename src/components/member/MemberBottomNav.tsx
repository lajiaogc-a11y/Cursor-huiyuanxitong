import { Link, useLocation } from "react-router-dom";
import { HomeOutlined, GiftOutlined, ShoppingOutlined, TeamOutlined, SettingOutlined } from "@ant-design/icons";
import { ConfigProvider } from "antd";

const navItems = [
  { path: "/member/dashboard", icon: HomeOutlined, label: "首页" },
  { path: "/member/spin", icon: GiftOutlined, label: "抽奖" },
  { path: "/member/points", icon: ShoppingOutlined, label: "积分商城" },
  { path: "/member/invite", icon: TeamOutlined, label: "邀请" },
  { path: "/member/settings", icon: SettingOutlined, label: "设置" },
];

export function MemberBottomNav() {
  const location = useLocation();

  return (
    <ConfigProvider theme={{ token: { colorPrimary: "#f59e0b" } }}>
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 bg-white border-t border-gray-100 shadow-[0_-2px_10px_rgba(0,0,0,0.05)]"
        style={{ paddingBottom: "env(safe-area-inset-bottom)", paddingTop: 12 }}
      >
        <div className="flex justify-around items-center max-w-md mx-auto">
          {navItems.map(({ path, icon: Icon, label }) => {
            const isActive = location.pathname === path;
            return (
              <Link
                key={path}
                to={path}
                className={`flex flex-col items-center justify-center flex-1 py-1 text-xs transition-colors ${
                  isActive ? "text-amber-600 font-semibold" : "text-gray-400"
                }`}
              >
                <Icon className="text-xl mb-1" style={{ fontSize: 22 }} />
                <span>{label}</span>
              </Link>
            );
          })}
        </div>
      </nav>
    </ConfigProvider>
  );
}
