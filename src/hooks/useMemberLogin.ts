import { useState, useEffect, useCallback, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { notify } from "@/lib/notifyHub";
import { useMemberAuth } from "@/contexts/MemberAuthContext";
import { useLanguage } from "@/contexts/LanguageContext";
import { memberPortalNetworkToastMessage } from "@/lib/memberPortalUx";
import { ROUTES } from "@/routes/constants";

const SAVED_ACCOUNT_KEY = "member_saved_account";

function loadSavedAccount(): string | null {
  try {
    return localStorage.getItem(SAVED_ACCOUNT_KEY) || null;
  } catch {
    return null;
  }
}

function saveAccount(phone: string) {
  try {
    localStorage.setItem(SAVED_ACCOUNT_KEY, phone);
  } catch {
    /* storage may be unavailable */
  }
}

function clearSavedAccount() {
  try {
    localStorage.removeItem(SAVED_ACCOUNT_KEY);
    localStorage.removeItem("member_saved_credentials");
  } catch {
    /* storage may be unavailable */
  }
}

export type UseMemberLoginOptions = {
  /** Called after successful sign-in, before navigation (e.g. reset landing panel). */
  onSignedIn?: () => void;
};

export function useMemberLogin(options?: UseMemberLoginOptions) {
  const navigate = useNavigate();
  const { t } = useLanguage();
  const { signIn } = useMemberAuth();
  const onSignedInRef = useRef(options?.onSignedIn);
  onSignedInRef.current = options?.onSignedIn;

  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [rememberMe, setRememberMe] = useState(false);

  useEffect(() => {
    const savedPhone = loadSavedAccount();
    if (savedPhone) {
      setPhone(savedPhone);
      setRememberMe(true);
    }
  }, []);

  const handleSubmit = useCallback(
    async (values: { phone: string; password: string }) => {
      if (!values.phone?.trim()) {
        notify.error(t("请输入手机号或会员编号", "Please enter your phone or member code"));
        return;
      }
      if (!values.password) {
        notify.error(t("请输入密码", "Please enter your password"));
        return;
      }
      setLoading(true);
      try {
        const result = await signIn(values.phone.trim(), values.password);
        if (result.success) {
          if (rememberMe) saveAccount(values.phone.trim());
          else clearSavedAccount();
          notify.success(t("登录成功", "Signed in successfully"));
          onSignedInRef.current?.();
          navigate(
            result.mustChangePassword ? ROUTES.MEMBER.FIRST_PASSWORD : ROUTES.MEMBER.DASHBOARD,
            { replace: true },
          );
          return;
        }
        const errText = (() => {
          switch (result.code) {
            case "WRONG_PASSWORD":
              return t("密码错误", "Wrong password");
            case "MEMBER_NOT_FOUND":
              return t("未找到该会员账号", "Member not found");
            case "NO_PASSWORD_SET":
              return t("尚未设置登录密码，请联系管理员", "No password set. Please contact your admin.");
            case "VALIDATION_ERROR":
              return t("请填写手机号和密码", "Enter phone and password.");
            default:
              return t("登录失败，请检查账号或密码", "Sign-in failed. Check your credentials.");
          }
        })();
        notify.error(errText);
      } catch {
        notify.error(memberPortalNetworkToastMessage(t));
      } finally {
        setLoading(false);
      }
    },
    [rememberMe, signIn, navigate, t],
  );

  return {
    phone,
    setPhone,
    password,
    setPassword,
    showPassword,
    setShowPassword,
    loading,
    rememberMe,
    setRememberMe,
    handleSubmit,
  };
}
