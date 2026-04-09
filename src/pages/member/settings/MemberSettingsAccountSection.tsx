import { Camera, User, Lock, Mail, ChevronRight, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { MemberPointsAccountSettings } from "@/components/member/MemberPointsAccountSettings";
import { notify } from "@/lib/notifyHub";
import { cn } from "@/lib/utils";
import type { MemberInfo } from "@/contexts/MemberAuthContext";

export type MemberSettingsExpandedAccount = "avatar" | "nickname" | "password" | null;

export function MemberSettingsAccountSection({
  t,
  themeColor,
  settingsInputClass,
  expandedSection,
  setExpandedSection,
  settingsAvatarUrl,
  setSettingsAvatarFromFile,
  clearSettingsAvatar,
  displayName,
  member,
  nickname,
  setNickname,
  savingNickname,
  onSaveNickname,
  pwdOld,
  setPwdOld,
  pwdNew,
  setPwdNew,
  pwdConfirm,
  setPwdConfirm,
  savingPwd,
  onChangePassword,
}: {
  t: (zh: string, en: string) => string;
  themeColor: string;
  settingsInputClass: string;
  expandedSection: MemberSettingsExpandedAccount;
  setExpandedSection: (v: MemberSettingsExpandedAccount) => void;
  settingsAvatarUrl: string | null;
  setSettingsAvatarFromFile: (file: File) => void;
  clearSettingsAvatar: () => void;
  displayName: string;
  member: MemberInfo;
  nickname: string;
  setNickname: (v: string) => void;
  savingNickname: boolean;
  onSaveNickname: () => void | Promise<void>;
  pwdOld: string;
  setPwdOld: (v: string) => void;
  pwdNew: string;
  setPwdNew: (v: string) => void;
  pwdConfirm: string;
  setPwdConfirm: (v: string) => void;
  savingPwd: boolean;
  onChangePassword: (values: { oldPwd: string; newPwd: string; confirmPwd: string }) => void | Promise<void>;
}) {
  return (
    <div className="mb-5">
      <h3 className="mb-3 flex items-center gap-2 text-[10px] font-bold uppercase tracking-[0.2em] text-pu-gold-soft/90">
        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-pu-gold-soft/90" aria-hidden />
        {t("账号管理", "ACCOUNT")}
      </h3>
      <div className="m-glass overflow-hidden rounded-2xl border border-pu-gold/12">
        <div className="member-settings-row">
          <button
            type="button"
            className="member-settings-trigger"
            onClick={() => setExpandedSection(expandedSection === "avatar" ? null : "avatar")}
            aria-expanded={expandedSection === "avatar"}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
              >
                <Camera size={15} color={themeColor} />
              </div>
              <div className="min-w-0 text-left">
                <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                  {t("账户设置", "Account settings")}
                </p>
                <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                  {t("头像与资料照片", "Profile photo")}
                </p>
              </div>
            </div>
            <ChevronRight
              size={12}
              className={cn(
                "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform member-motion-base",
                expandedSection === "avatar" && "rotate-90",
              )}
            />
          </button>
          <div
            className={cn(
              "member-settings-expand member-settings-collapse member-motion-base",
              expandedSection === "avatar" ? "is-open" : "is-closed",
            )}
            aria-hidden={expandedSection !== "avatar"}
          >
            <div className="member-settings-collapse__inner">
              <MemberPointsAccountSettings
                variant="inline"
                avatarUrl={settingsAvatarUrl}
                displayInitial={displayName}
                onPickAvatar={async (file) => {
                  setSettingsAvatarFromFile(file);
                }}
                onClearAvatar={clearSettingsAvatar}
                t={t}
              />
            </div>
          </div>
        </div>

        <div className="member-settings-row">
          <button
            type="button"
            className="member-settings-trigger"
            onClick={() => setExpandedSection(expandedSection === "nickname" ? null : "nickname")}
            aria-expanded={expandedSection === "nickname"}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-[10px]"
                style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
              >
                <User size={15} color={themeColor} />
              </div>
              <div className="min-w-0 text-left">
                <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                  {t("修改昵称", "Change nickname")}
                </p>
                <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                  {member.nickname || t("未设置", "Not set")}
                </p>
              </div>
            </div>
            <ChevronRight
              size={12}
              className={cn(
                "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform member-motion-base",
                expandedSection === "nickname" && "rotate-90",
              )}
            />
          </button>
          <div
            className={cn(
              "member-settings-expand member-settings-collapse member-motion-base",
              expandedSection === "nickname" ? "is-open" : "is-closed",
            )}
            aria-hidden={expandedSection !== "nickname"}
          >
            <div className="member-settings-collapse__inner">
              <div className="flex flex-wrap gap-2">
                <div className="relative min-w-0 flex-[1_1_160px]">
                  <User
                    size={16}
                    color={themeColor}
                    className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                    aria-hidden
                  />
                  <Input
                    value={nickname}
                    onChange={(e) => setNickname(e.target.value)}
                    placeholder={t("输入新昵称", "Enter new nickname")}
                    className={settingsInputClass}
                  />
                </div>
                <Button
                  type="button"
                  size="lg"
                  disabled={savingNickname}
                  className="h-12 shrink-0 rounded-xl border-0 px-5 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                  }}
                  onClick={() => void onSaveNickname()}
                >
                  {savingNickname ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : null}
                  {t("保存", "Save")}
                </Button>
              </div>
            </div>
          </div>
        </div>

        <div className="member-settings-row">
          <button
            type="button"
            className="member-settings-trigger"
            onClick={() => notify.info(t("维护中", "Under maintenance"))}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
              >
                <Mail size={15} color={themeColor} aria-hidden />
              </div>
              <div className="min-w-0 text-left">
                <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                  {t("绑定邮箱", "Bind email")}
                </p>
                <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                  {t("暂未绑定", "Not bound")}
                </p>
              </div>
            </div>
            <ChevronRight size={12} className="shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)]" aria-hidden />
          </button>
        </div>

        <div className="member-settings-row">
          <button
            type="button"
            className="member-settings-trigger"
            onClick={() => setExpandedSection(expandedSection === "password" ? null : "password")}
            aria-expanded={expandedSection === "password"}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ring-1 ring-inset ring-[hsl(var(--pu-m-surface-border)/0.32)]"
                style={{ background: `color-mix(in srgb, ${themeColor} 14%, transparent)` }}
              >
                <Lock size={15} color={themeColor} />
              </div>
              <div className="min-w-0 text-left">
                <p className="m-0 text-sm font-semibold text-[hsl(var(--pu-m-text))]">
                  {t("修改密码", "Change password")}
                </p>
                <p className="m-0 text-xs text-[hsl(var(--pu-m-text-dim)/0.55)]">
                  {t("定期更新更安全", "Update regularly for security")}
                </p>
              </div>
            </div>
            <ChevronRight
              size={12}
              className={cn(
                "shrink-0 text-[hsl(var(--pu-m-text-dim)/0.35)] transition-transform member-motion-base",
                expandedSection === "password" && "rotate-90",
              )}
            />
          </button>
          <div
            className={cn(
              "member-settings-expand member-settings-collapse member-motion-base",
              expandedSection === "password" ? "is-open" : "is-closed",
            )}
            aria-hidden={expandedSection !== "password"}
          >
            <div className="member-settings-collapse__inner">
              <form
                className="flex flex-col gap-3"
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!pwdOld.trim()) {
                    notify.error(t("请填写当前密码", "Current password is required"));
                    return;
                  }
                  if (!pwdNew.trim()) {
                    notify.error(t("请填写新密码", "New password is required"));
                    return;
                  }
                  if (pwdNew.length < 6) {
                    notify.error(t("新密码至少 6 位", "Min 6 characters"));
                    return;
                  }
                  if (pwdNew !== pwdConfirm) {
                    notify.error(t("两次新密码不一致", "Passwords don't match"));
                    return;
                  }
                  void onChangePassword({ oldPwd: pwdOld, newPwd: pwdNew, confirmPwd: pwdConfirm });
                }}
              >
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">
                    {t("当前密码", "Current password")}
                  </Label>
                  <div className="relative">
                    <Lock
                      size={16}
                      color={themeColor}
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      type="password"
                      autoComplete="current-password"
                      value={pwdOld}
                      onChange={(e) => setPwdOld(e.target.value)}
                      placeholder={t("当前密码", "Current password")}
                      className={settingsInputClass}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">
                    {t("新密码（至少 6 位）", "New password (min 6 chars)")}
                  </Label>
                  <div className="relative">
                    <Lock
                      size={16}
                      color={themeColor}
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pwdNew}
                      onChange={(e) => setPwdNew(e.target.value)}
                      placeholder={t("新密码", "New password")}
                      className={settingsInputClass}
                    />
                  </div>
                </div>
                <div className="space-y-1.5">
                  <Label className="text-[13px] text-[hsl(var(--pu-m-text-dim)/0.78)]">
                    {t("确认新密码", "Confirm password")}
                  </Label>
                  <div className="relative">
                    <Lock
                      size={16}
                      color={themeColor}
                      className="pointer-events-none absolute left-3 top-1/2 z-[1] -translate-y-1/2"
                      aria-hidden
                    />
                    <Input
                      type="password"
                      autoComplete="new-password"
                      value={pwdConfirm}
                      onChange={(e) => setPwdConfirm(e.target.value)}
                      placeholder={t("再次输入新密码", "Confirm password")}
                      className={settingsInputClass}
                    />
                  </div>
                </div>
                <Button
                  type="submit"
                  disabled={savingPwd}
                  className="mt-1 h-12 w-full rounded-xl border-0 font-bold text-[hsl(var(--pu-primary-foreground))] hover:opacity-95"
                  style={{
                    background: "linear-gradient(135deg, hsl(var(--pu-gold)), hsl(var(--pu-gold-soft)))",
                  }}
                >
                  {savingPwd ? (
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden />
                  ) : null}
                  {t("更新密码", "Update password")}
                </Button>
              </form>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
