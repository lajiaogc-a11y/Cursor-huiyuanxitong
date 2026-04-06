/** 登录/注册成功后进入会员壳时，短遮罩过渡（与 Splash 互补：跳过启动屏时仍有过渡） */
export const MEMBER_POST_LOGIN_TRANSITION_KEY = "member_post_login_shell_v1";

export const MEMBER_POST_LOGIN_VEIL_MS = 420;

export function markMemberPostLoginShellTransition(): void {
  try {
    sessionStorage.setItem(MEMBER_POST_LOGIN_TRANSITION_KEY, "1");
  } catch {
    /* ignore */
  }
}

export function peekMemberPostLoginShellTransition(): boolean {
  try {
    return sessionStorage.getItem(MEMBER_POST_LOGIN_TRANSITION_KEY) === "1";
  } catch {
    return false;
  }
}

export function clearMemberPostLoginShellTransition(): void {
  try {
    sessionStorage.removeItem(MEMBER_POST_LOGIN_TRANSITION_KEY);
  } catch {
    /* ignore */
  }
}
