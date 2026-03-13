import { Link, useLocation } from "react-router-dom";
import {
  HomeOutlined, GiftOutlined, ShoppingOutlined,
  TeamOutlined, SettingOutlined,
} from "@ant-design/icons";
import { ConfigProvider } from "antd";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";

const navItems = [
  { path: "/member/dashboard", icon: HomeOutlined, label: "首页" },
  { path: "/member/points", icon: ShoppingOutlined, label: "积分商城" },
  { path: "/member/spin", icon: GiftOutlined, label: "抽奖", isSpin: true },
  { path: "/member/invite", icon: TeamOutlined, label: "邀请" },
  { path: "/member/settings", icon: SettingOutlined, label: "设置" },
];

export function MemberBottomNav() {
  const location = useLocation();
  const { member } = useMemberAuth();
  const { settings } = useMemberPortalSettings(member?.id);
  const filteredItems = navItems.filter((item) => {
    if (item.path === "/member/spin") return settings.enable_spin;
    if (item.path === "/member/invite") return settings.enable_invite;
    return true;
  });

  return (
    <ConfigProvider theme={{ token: { colorPrimary: settings.theme_primary_color || "#f59e0b" } }}>
      <nav
        style={{
          position: "fixed",
          bottom: 0,
          left: 0,
          right: 0,
          zIndex: 50,
          background: "rgba(255,255,255,0.94)",
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          borderTop: "1px solid rgba(15,23,42,0.08)",
          boxShadow: "0 -4px 20px rgba(15,23,42,0.08)",
          paddingBottom: "env(safe-area-inset-bottom)",
          paddingTop: 8,
          paddingLeft: 4,
          paddingRight: 4,
        }}
      >
        <div style={{
          display: "flex",
          justifyContent: "space-around",
          alignItems: "flex-end",
          maxWidth: 480,
          margin: "0 auto",
        }}>
          {filteredItems.map(({ path, icon: Icon, label, isSpin }) => {
            const isActive = location.pathname === path;

            if (isSpin) {
              return (
                <Link
                  key={path}
                  to={path}
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    flex: 1,
                    textDecoration: "none",
                    paddingBottom: 6,
                    position: "relative",
                  }}
                >
                  {/* 凸出的金色圆形抽奖按钮 */}
                  <div
                    className="member-nav-spin-btn"
                    style={{
                      width: 56,
                      height: 56,
                      borderRadius: "50%",
                      background: isActive
                        ? "linear-gradient(135deg, #fbbf24 0%, #f59e0b 100%)"
                        : "linear-gradient(135deg, #f59e0b 0%, #d97706 100%)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      boxShadow: isActive
                        ? "0 -4px 20px rgba(245,158,11,0.55), 0 4px 16px rgba(245,158,11,0.4)"
                        : "0 -2px 16px rgba(245,158,11,0.35), 0 4px 12px rgba(245,158,11,0.25)",
                      marginTop: -22,
                      border: "3px solid white",
                      transition: "all 0.2s ease",
                    }}
                  >
                    <Icon style={{ fontSize: 22, color: "white" }} />
                  </div>
                  <span style={{
                    fontSize: 10,
                    fontWeight: isActive ? 700 : 500,
                    color: isActive ? "#d97706" : "#94a3b8",
                    marginTop: 4,
                    letterSpacing: "0.2px",
                  }}>
                    {label}
                  </span>
                </Link>
              );
            }

            return (
              <Link
                key={path}
                to={path}
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "center",
                  flex: 1,
                  textDecoration: "none",
                  padding: "4px 0 8px",
                  position: "relative",
                  transition: "opacity 0.15s ease",
                }}
              >
                {/* 激活背景胶囊 */}
                {isActive && (
                  <div style={{
                    position: "absolute",
                    top: 0,
                    left: "50%",
                    transform: "translateX(-50%)",
                    width: 40,
                    height: 32,
                    borderRadius: 10,
                    background: "rgba(245,158,11,0.1)",
                  }} />
                )}

                <Icon
                  style={{
                    fontSize: isActive ? 22 : 20,
                    color: isActive ? "#f59e0b" : "#94a3b8",
                    transition: "all 0.2s ease",
                    transform: isActive ? "scale(1.1)" : "scale(1)",
                    position: "relative",
                    zIndex: 1,
                    marginBottom: 2,
                  }}
                />

                <span style={{
                  fontSize: 10,
                  fontWeight: isActive ? 700 : 500,
                  color: isActive ? "#d97706" : "#94a3b8",
                  letterSpacing: "0.2px",
                  position: "relative",
                  zIndex: 1,
                }}>
                  {label}
                </span>

                {/* 金色指示圆点 */}
                {isActive && (
                  <div style={{
                    width: 4,
                    height: 4,
                    borderRadius: "50%",
                    background: "#f59e0b",
                    marginTop: 3,
                    boxShadow: "0 0 6px rgba(245,158,11,0.6)",
                  }} />
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </ConfigProvider>
  );
}
