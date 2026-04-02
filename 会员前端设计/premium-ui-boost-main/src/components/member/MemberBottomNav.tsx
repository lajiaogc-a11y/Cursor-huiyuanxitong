import { Home, Gift, Star, Users, Settings } from "lucide-react";
import { useLocation, Link } from "react-router-dom";

const navItems = [
  { icon: Home, label: "首页", path: "/member/dashboard" },
  { icon: Gift, label: "积分", path: "/member/points" },
  { icon: Star, label: "抽奖", path: "/member/spin" },
  { icon: Users, label: "邀请", path: "/member/invite" },
  { icon: Settings, label: "设置", path: "/member/settings" },
];

export default function MemberBottomNav() {
  const location = useLocation();

  return (
    <nav className="fixed bottom-0 left-0 right-0 z-40 border-t safe-area-bottom
      bg-[hsl(220_22%_5%_/_0.92)] dark:bg-[hsl(220_22%_5%_/_0.92)]
      light-nav"
      style={{
        backdropFilter: "blur(24px) saturate(1.2)",
        borderColor: "hsl(var(--m-surface-border) / 0.4)",
      }}
    >
      <div className="flex items-center justify-around h-16 max-w-lg mx-auto px-2">
        {navItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Link
              key={item.path}
              to={item.path}
              aria-current={isActive ? "page" : undefined}
              className={`relative flex flex-col items-center gap-0.5 py-1.5 px-3 rounded-xl transition-all duration-300 ${
                isActive
                  ? "text-[hsl(var(--m-text))]"
                  : "text-[hsl(var(--m-text-dim))] hover:text-[hsl(var(--m-text)_/_0.7)]"
              }`}
            >
              {/* Active glow line */}
              {isActive && (
                <span
                  className="absolute -top-1 left-1/2 -translate-x-1/2 w-5 h-1 rounded-full animate-[nav-glow_2s_ease-in-out_infinite]"
                  style={{
                    background: "linear-gradient(90deg, hsl(var(--gold)), hsl(var(--gold-soft)))",
                    boxShadow: "0 0 12px 2px hsl(var(--gold) / 0.5)",
                  }}
                />
              )}
              <item.icon
                className={`h-5 w-5 transition-all duration-300 ${
                  isActive
                    ? "scale-110 drop-shadow-[0_0_10px_hsl(var(--gold)/0.6)]"
                    : ""
                }`}
                style={isActive ? { color: "hsl(var(--gold-soft))" } : undefined}
              />
              <span
                className={`text-[10px] font-bold tracking-wide transition-all duration-300 ${
                  isActive ? "text-[hsl(var(--gold-soft))]" : ""
                }`}
              >
                {item.label}
              </span>
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
