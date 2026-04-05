import { useNavigate } from "react-router-dom";
import { Bell, Moon, Settings, Sun } from "lucide-react";
import { ROUTES } from "@/routes/constants";

export interface MemberDashboardProfileBarProps {
  portalDisplayName: string;
  tierDisplay: string;
  avatarLetter: string;
  showHomeAvatarImg: boolean;
  homeAvatarResolvedSrc: string;
  onHomeAvatarImageError: () => void;
  theme: "light" | "dark";
  toggleTheme: () => void;
  showMemberInbox: boolean;
  notificationUnreadCount: number;
  t: (zh: string, en: string) => string;
}

const surfaceBtn =
  "rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.3)] bg-[hsl(var(--pu-m-surface)/0.55)] p-2.5 transition motion-reduce:transition-none hover:bg-[hsl(var(--pu-m-surface)/0.85)]";

export function MemberDashboardProfileBar({
  portalDisplayName,
  tierDisplay,
  avatarLetter,
  showHomeAvatarImg,
  homeAvatarResolvedSrc,
  onHomeAvatarImageError,
  theme,
  toggleTheme,
  showMemberInbox,
  notificationUnreadCount,
  t,
}: MemberDashboardProfileBarProps) {
  const navigate = useNavigate();

  return (
    <div className="mb-7">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-3.5">
          <div className="flex h-[52px] w-[52px] shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-pu-gold to-pu-gold-deep text-lg font-extrabold shadow-pu-glow-gold text-[hsl(var(--pu-primary-foreground))]">
            {showHomeAvatarImg ? (
              <img
                src={homeAvatarResolvedSrc}
                alt=""
                className="h-full w-full object-cover"
                onError={onHomeAvatarImageError}
              />
            ) : (
              <span className="tabular-nums">{avatarLetter}</span>
            )}
          </div>
          <div className="min-w-0">
            <h2 className="truncate text-lg font-extrabold text-[hsl(var(--pu-m-text))]">{portalDisplayName}</h2>
            <span className="mt-1 inline-block rounded-full bg-pu-gold/15 px-2.5 py-0.5 text-[11px] font-bold tracking-wide text-pu-gold-soft ring-1 ring-inset ring-pu-gold/20">
              {tierDisplay}
            </span>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button type="button" className={surfaceBtn} onClick={toggleTheme} aria-label={t("主题", "Theme")}>
            {theme === "dark" ? (
              <Sun className="h-5 w-5 text-pu-gold-soft" aria-hidden />
            ) : (
              <Moon className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
            )}
          </button>
          {showMemberInbox ? (
            <button
              type="button"
              className={`relative ${surfaceBtn}`}
              onClick={() => navigate(ROUTES.MEMBER.NOTIFICATIONS)}
              aria-label={t("通知", "Notifications")}
            >
              <Bell className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
              {notificationUnreadCount > 0 ? (
                <span className="absolute -right-0.5 -top-0.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-destructive px-0.5 text-[8px] font-extrabold text-white">
                  {notificationUnreadCount > 9 ? "9+" : notificationUnreadCount}
                </span>
              ) : null}
            </button>
          ) : null}
          <button
            type="button"
            className={surfaceBtn}
            onClick={() => navigate(ROUTES.MEMBER.SETTINGS)}
            aria-label={t("设置", "Settings")}
          >
            <Settings className="h-5 w-5 text-[hsl(var(--pu-m-text-dim))]" aria-hidden />
          </button>
        </div>
      </div>
    </div>
  );
}
