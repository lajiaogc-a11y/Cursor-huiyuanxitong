/**
 * 首次进入会员门户须改密，或管理员下发/重置初始密码后：须先修改密码才能进入业务页。
 * 布局与 InviteLanding / premium-ui-boost 注册页一致。
 */
import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useNavigate } from "react-router-dom";
import { Lock, Loader2, LogOut, KeyRound, ArrowRight } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { ROUTES } from "@/routes/constants";
import { markMemberPostLoginShellTransition } from "@/lib/memberPostLoginTransition";
import { notify } from "@/lib/notifyHub";
import { useMemberPortalSettings } from "@/hooks/useMemberPortalSettings";
import { normalizeLoginBadgesField } from "@/services/members/memberPortalSettingsService";
import { cn } from "@/lib/utils";
import { memberPortalGoldCssVarsFromHex } from "@/utils/memberPortalGoldCssVars";
import "@/styles/member-portal.css";
import { MemberPageAmbientOrbs } from "@/components/member/MemberPageAmbientOrbs";
import { LoginIdleHeaderLogo } from "@/components/member/LoginIdleHeaderLogo";
import { MEMBER_LOGIN_BADGE_SLOT_COUNT, parseMemberLoginBadge } from "@/lib/memberLoginBadge";
import { applyMemberPortalFaviconFromLogoRaw } from "@/lib/memberPortalFavicon";

export default function MemberFirstPassword() {
  const { t } = useLanguage();
  const navigate = useNavigate();
  const { member, setPassword, signOut } = useMemberAuth();
  const [oldPwd, setOldPwd] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [confirmPwd, setConfirmPwd] = useState("");
  const [busy, setBusy] = useState(false);

  const { settings: portalSettings } = useMemberPortalSettings(member?.id);
  const themeColor = useMemo(() => {
    const c = String(portalSettings.theme_primary_color || "").trim();
    return /^#[0-9A-Fa-f]{6}$/i.test(c) ? c : "#4d8cff";
  }, [portalSettings.theme_primary_color]);

  const portalRootStyle = useMemo(
    () =>
      ({
        "--m-theme": themeColor,
        ...memberPortalGoldCssVarsFromHex(themeColor),
      }) as CSSProperties,
    [themeColor],
  );

  const brandName = useMemo(
    () => String(portalSettings.company_name || "").trim() || "FastGC",
    [portalSettings.company_name],
  );

  const loginBadgeSlots = useMemo(() => {
    const lines = normalizeLoginBadgesField(portalSettings.login_badges).slice(0, MEMBER_LOGIN_BADGE_SLOT_COUNT);
    return Array.from({ length: MEMBER_LOGIN_BADGE_SLOT_COUNT }, (_, i) => {
      try {
        return parseMemberLoginBadge(lines[i] ?? "");
      } catch {
        return { icon: "", label: String(lines[i] ?? "").trim() };
      }
    });
  }, [portalSettings.login_badges]);

  useEffect(() => {
    try {
      applyMemberPortalFaviconFromLogoRaw(portalSettings.logo_url);
    } catch {
      /* favicon 失败不阻塞改密页 */
    }
  }, [portalSettings.logo_url]);

  if (!member) return null;

  const inputBase =
    "h-12 w-full rounded-xl border border-[hsl(var(--pu-m-surface-border)/0.25)] bg-[hsl(var(--pu-m-surface)/0.45)] text-sm font-medium text-[hsl(var(--pu-m-text))] outline-none transition-all placeholder:text-[hsl(var(--pu-m-text-dim)/0.4)] focus-visible:ring-2 focus-visible:ring-pu-gold/25";

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!oldPwd.trim()) {
      notify.error(t("请输入当前密码", "Enter your current password"));
      return;
    }
    if (newPwd.length < 6) {
      notify.error(t("新密码至少 6 位", "New password must be at least 6 characters"));
      return;
    }
    if (newPwd !== confirmPwd) {
      notify.error(t("两次新密码不一致", "New passwords do not match"));
      return;
    }
    if (newPwd === oldPwd) {
      notify.error(t("新密码不能与当前密码相同", "New password must differ from the current one"));
      return;
    }
    setBusy(true);
    try {
      const r = await setPassword(oldPwd, newPwd);
      if (r.success) {
        notify.success(t("密码已更新，欢迎使用", "Password updated. Welcome!"));
        markMemberPostLoginShellTransition();
        navigate(ROUTES.MEMBER.DASHBOARD, { replace: true });
      } else {
        notify.error(r.message || t("密码更新失败", "Could not update password"));
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="member-login-premium-root member-portal-wrap flex min-h-dvh flex-col"
      style={{
        ...portalRootStyle,
        background: "hsl(var(--pu-m-bg-1))",
        color: "hsl(var(--pu-m-text))",
      }}
    >
      <div className="relative overflow-hidden pb-6">
        <MemberPageAmbientOrbs />
        <div className="relative z-[1] mx-auto w-full max-w-[min(100%,36rem)] px-5 pt-[max(20px,env(safe-area-inset-top))]">
          <div className="flex items-center gap-2.5">
            <LoginIdleHeaderLogo logoUrl={portalSettings.logo_url} />
            <span className="text-base font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">{brandName}</span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 flex-col px-6 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
        <div className="mb-5">
          <div className="mb-1 flex items-center gap-2">
            <div
              className="flex h-9 w-9 items-center justify-center rounded-xl"
              style={{
                background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                boxShadow: "0 6px 20px -6px hsl(var(--pu-gold) / 0.45)",
              }}
            >
              <KeyRound className="h-4 w-4 text-[hsl(var(--pu-primary-foreground))]" aria-hidden />
            </div>
            <h1 className="text-xl font-extrabold tracking-tight text-[hsl(var(--pu-m-text))]">
              {t("请先修改登录密码", "Change your password to continue")}
            </h1>
          </div>
          <p className="text-xs leading-relaxed text-[hsl(var(--pu-m-text-dim))]">
            {t(
              "首次进入会员中心或当前为初始/管理员重置密码。为保障安全，请先设置新密码后再继续使用。",
              "First visit to the member portal, or you are on an initial/admin-reset password. Set a new password to continue.",
            )}
          </p>
        </div>

        <div className="mb-6 grid grid-cols-3 gap-2.5 [grid-auto-rows:1fr]">
          {loginBadgeSlots.map((slot, idx) => {
            const { icon, label } = slot;
            const isEmpty = !icon && !label;
            return (
              <div
                key={idx}
                className={cn(
                  "flex h-full min-h-[5.75rem] flex-col items-stretch rounded-2xl p-3 text-center",
                  isEmpty
                    ? "border border-dashed border-[hsl(var(--pu-m-surface-border)/0.38)] bg-[hsl(var(--pu-m-surface)/0.12)]"
                    : "border border-[hsl(var(--pu-m-surface-border)/0.2)] bg-[hsl(var(--pu-m-surface)/0.35)]",
                )}
              >
                <div className="flex min-h-[2.25rem] flex-shrink-0 items-center justify-center text-[1.35rem] leading-none">
                  {icon ? (
                    <span className="select-none" aria-hidden>
                      {icon}
                    </span>
                  ) : null}
                </div>
                <div className="flex min-h-0 flex-1 items-start justify-center break-words text-[10px] font-medium leading-snug text-[hsl(var(--pu-m-text-dim))]">
                  {label}
                </div>
              </div>
            );
          })}
        </div>

        <form className="flex flex-1 flex-col" onSubmit={(e) => void onSubmit(e)}>
          <div className="space-y-5">
            <div>
              <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                {t("当前密码", "Current password")}
              </label>
              <div className="relative">
                <KeyRound
                  className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                  aria-hidden
                />
                <Input
                  type="password"
                  value={oldPwd}
                  onChange={(e) => setOldPwd(e.target.value)}
                  autoComplete="current-password"
                  placeholder={t("登录时使用的密码", "The password you signed in with")}
                  className={cn(inputBase, "pl-10")}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                {t("新密码", "New password")}
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                  aria-hidden
                />
                <Input
                  type="password"
                  value={newPwd}
                  onChange={(e) => setNewPwd(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t("至少 6 位", "At least 6 characters")}
                  className={cn(inputBase, "pl-10")}
                />
              </div>
            </div>

            <div>
              <label className="mb-2 block text-[11px] font-bold text-[hsl(var(--pu-m-text-dim))]">
                {t("确认新密码", "Confirm new password")}
              </label>
              <div className="relative">
                <Lock
                  className="pointer-events-none absolute left-3.5 top-1/2 z-[1] h-4 w-4 -translate-y-1/2 text-[hsl(var(--pu-m-text-dim)/0.4)]"
                  aria-hidden
                />
                <Input
                  type="password"
                  value={confirmPwd}
                  onChange={(e) => setConfirmPwd(e.target.value)}
                  autoComplete="new-password"
                  placeholder={t("再次输入新密码", "Re-enter new password")}
                  className={cn(inputBase, "pl-10")}
                />
              </div>
            </div>
          </div>

          <div className="min-h-6 flex-1" />

          <button
            type="submit"
            disabled={busy}
            className="mb-3 flex w-full items-center justify-center gap-2 rounded-2xl py-4 text-sm font-bold text-[hsl(var(--pu-primary-foreground))] transition-all active:scale-[0.97] disabled:opacity-50 motion-reduce:transition-none"
            style={{
              background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
              boxShadow: "0 8px 28px -8px hsl(var(--pu-gold) / 0.5)",
            }}
          >
            {busy ? <Loader2 className="h-5 w-5 animate-spin motion-reduce:animate-none" aria-hidden /> : null}
            {busy ? t("处理中…", "Working…") : t("确认并进入系统", "Confirm and continue")}
            {!busy ? <ArrowRight className="h-4 w-4" aria-hidden /> : null}
          </button>

          <button
            type="button"
            className="mb-2 flex w-full items-center justify-center gap-2 py-3 text-[13px] text-[hsl(var(--pu-m-text-dim))] transition-colors motion-reduce:transition-none hover:text-[hsl(var(--pu-m-text)/0.85)]"
            onClick={() => {
              signOut();
              navigate(ROUTES.MEMBER.ROOT, { replace: true });
            }}
          >
            <LogOut className="h-4 w-4" aria-hidden />
            {t("退出并换账号登录", "Sign out and use another account")}
          </button>
        </form>
      </div>
    </div>
  );
}
