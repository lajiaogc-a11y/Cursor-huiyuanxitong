import { useEffect, useState } from "react";
import { useParams, Link } from "react-router-dom";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import { useLanguage } from "@/contexts/LanguageContext";
import { Gift, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { getMemberPortalSettingsByInviteCode } from "@/services/members/memberPortalSettingsService";

export default function InviteLanding() {
  const { t } = useLanguage();
  const { code } = useParams<{ code: string }>();
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [brandName, setBrandName] = useState("Spin & Win");
  const [inviteReward, setInviteReward] = useState(3);
  const [inviteEnabled, setInviteEnabled] = useState(true);

  useEffect(() => {
    if (!code) return;
    (async () => {
      const data = await getMemberPortalSettingsByInviteCode(code);
      if (!data) return;
      setBrandName(data.settings.company_name || "Spin & Win");
      setInviteReward(Number(data.settings.invite_reward_spins || 3));
      setInviteEnabled(!!data.settings.enable_invite);
    })();
  }, [code]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code?.trim() || !phone.trim()) {
      toast.error(t("请输入手机号", "Please enter your phone number"));
      return;
    }
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc("validate_invite_and_submit", {
        p_code: code.trim(),
        p_invitee_phone: phone.trim(),
      });

      if (error) {
        toast.error(error.message);
        setLoading(false);
        return;
      }

      const r = data as { success: boolean; error?: string };
      if (!r.success) {
        if (r.error === "INVALID_CODE") toast.error(t("邀请码无效", "Invalid invite code"));
        else if (r.error === "ALREADY_INVITED") toast.error(t("您已被该邀请人邀请过", "You have already been invited by this person"));
        else if (r.error === "INVITE_DISABLED") toast.error(t("该租户已关闭邀请活动", "Invite activity is disabled"));
        else if (r.error?.includes("invitee") || r.error?.includes("unique")) toast.error(t("该手机号已提交过", "This phone has already been submitted"));
        else toast.error(r.error || t("失败", "Failed"));
        setLoading(false);
        return;
      }

      setSubmitted(true);
      toast.success(t("感谢提交！我们会尽快联系您。", "Thanks! We'll contact you soon."));
    } catch (e: any) {
      toast.error(e?.message || t("出错了", "Something went wrong"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-amber-50 to-orange-100 p-4">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6">
          <h1 className="text-2xl font-bold text-amber-900">{brandName}</h1>
          <p className="text-amber-700 mt-1">
            {inviteEnabled
              ? t(`您被邀请了！邀请即得 ${inviteReward} 次免费抽奖。`, `You're invited! Get ${inviteReward} free spins when you join.`)
              : t("当前邀请活动未开放", "Invite activity is currently disabled")}
          </p>
        </div>

        <Card className="bg-white/90 border-amber-200">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm flex items-center justify-center gap-2">
              <Gift className="h-4 w-4 text-amber-600" /> {t("立即加入", "Join now")}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {!inviteEnabled ? (
              <div className="text-center space-y-3">
                <p className="text-amber-800 font-medium">{t("邀请活动已关闭", "Invite activity disabled")}</p>
                <Link to="/member/login">
                  <Button variant="outline" className="border-amber-300 text-amber-900">
                    {t("去登录", "Go to Login")}
                  </Button>
                </Link>
              </div>
            ) : submitted ? (
              <div className="text-center space-y-4">
                <p className="text-amber-800 font-medium">{t("感谢提交！", "Thanks for joining!")}</p>
                <p className="text-amber-700 text-sm">{t(`我们已收到您的信息。管理员将为您创建账号，创建后您将获得 ${inviteReward} 次免费抽奖机会。请联系管理员获取登录密码。`, `We've received your info. An admin will create your account and you'll get ${inviteReward} free spins. Contact admin to get your login password.`)}</p>
                <Link to="/member/login">
                  <Button variant="outline" className="border-amber-300 text-amber-900">
                    {t("去登录", "Go to Login")}
                  </Button>
                </Link>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="phone">{t("您的手机号", "Your phone number")}</Label>
                  <Input
                    id="phone"
                    type="tel"
                    placeholder="e.g. 08012345678"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    required
                  />
                </div>
                <Button type="submit" className="w-full bg-amber-600 hover:bg-amber-700" disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : t("加入", "Join")}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>

        <p className="text-center text-sm text-amber-700 mt-4">
          {t("已有账号？", "Already have an account?")}{" "}
          <Link to="/member/login" className="underline font-medium">
            {t("登录", "Sign in")}
          </Link>
        </p>
      </div>
    </div>
  );
}
