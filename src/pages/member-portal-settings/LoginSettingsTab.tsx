/**
 * LoginSettingsTab — 登录设置（未登录落地页）tab
 * 从 MemberPortalSettings 提取
 */
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useLanguage } from '@/contexts/LanguageContext';
import type { LoginCarouselSlideItem } from '@/services/members/memberPortalSettingsService';
import { SectionTitle } from './shared';
import LoginCarouselSettingsBlock from './LoginCarouselSettingsBlock';

export type LoginCarouselFormRow = Omit<LoginCarouselSlideItem, 'sort_order'>;

interface MemberPortalSettingsSlice {
  welcome_title: string;
  welcome_subtitle: string;
  footer_text: string;
  login_carousel_interval_sec: number;
}

interface Props {
  settings: MemberPortalSettingsSlice;
  onSettingsFieldChange: <K extends keyof MemberPortalSettingsSlice>(key: K, value: MemberPortalSettingsSlice[K]) => void;
  badgesText: string;
  onBadgesTextChange: (v: string) => void;
  loginCarouselSlides: LoginCarouselFormRow[];
  onLoginCarouselSlidesChange: React.Dispatch<React.SetStateAction<LoginCarouselFormRow[]>>;
  uploadLoginCarouselImage: (idx: number, file?: File | null) => Promise<void>;
  uploadingLoginCarouselIndex: number | null;
}

export default function LoginSettingsTab({
  settings,
  onSettingsFieldChange,
  badgesText,
  onBadgesTextChange,
  loginCarouselSlides,
  onLoginCarouselSlidesChange,
  uploadLoginCarouselImage,
  uploadingLoginCarouselIndex,
}: Props) {
  const { t } = useLanguage();

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "配置会员未登录时看到的落地页：顶部轮播、主标题与徽章、底栏说明。保存草稿并发布后，会员在登录页即可看到。轮播为空时会员端仍显示系统默认幻灯。",
          "Landing page before sign-in: top carousel, headline, badges, footer. Save draft and publish to sync. If carousel is empty, members still see built-in default slides.",
        )}
      </p>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle>{t("登录页主文案", "Login headline & footer")}</SectionTitle>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <Label>{t("主标题", "Headline")}</Label>
              <Input
                value={settings.welcome_title}
                onChange={(e) => onSettingsFieldChange('welcome_title', e.target.value)}
                placeholder={t("例如：会员中心", "e.g. VIP Portal")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("会员端：有内容则作为主标题；否则为\u300C公司名 + VIP 会员门户\u300D。", "Member app: shown as main title when set; otherwise \u201CCompany + VIP portal\u201D.")}
              </p>
            </div>
            <div className="space-y-2">
              <Label>{t("副标题 / 金句", "Tagline")}</Label>
              <Input
                value={settings.welcome_subtitle}
                onChange={(e) => onSettingsFieldChange('welcome_subtitle', e.target.value)}
                placeholder={t("例如：欢迎登录", "e.g. Welcome")}
              />
              <p className="text-[11px] text-muted-foreground">
                {t("显示在标题下方；空则用默认文案。", "Below headline; default copy if empty.")}
              </p>
            </div>
          </div>
          <div className="space-y-2">
            <Label>{t("底栏说明", "Footer note")}</Label>
            <Input
              value={settings.footer_text}
              onChange={(e) => onSettingsFieldChange('footer_text', e.target.value)}
              placeholder={t("例如：账户数据安全加密…", "e.g. Your data is encrypted…")}
            />
          </div>
          <div className="space-y-2">
            <Label>
              {t("功能徽章", "Feature badges")}{' '}
              <span className="text-muted-foreground font-normal text-xs">{t("（每行一条，最多 6 条）", "(one per line, max 6)")}</span>
            </Label>
            <Textarea
              value={badgesText}
              onChange={(e) => onBadgesTextChange(e.target.value)}
              rows={4}
              placeholder={t("\ud83c\udfc6 签到奖励\n\ud83c\udf81 积分兑换\n\ud83d\udc65 邀请好友", "\ud83c\udfc6 Check-in Rewards\n\ud83c\udf81 Points Redemption\n\ud83d\udc65 Invite Friends")}
            />
            <p className="text-[11px] text-muted-foreground">
              {t(
                "登录页固定 6 格（3×2）：每行建议「表情 + 空格 + 短说明」，会员端格内上方显示表情、下方显示文字；不足 6 条时其余为空白虚线框。若行首无表情，则整行仅作为下方文字。",
                "Login page shows a fixed 3×2 grid (6 cells). Put one badge per line: emoji, space, short label — emoji on top, text below. Empty cells show as dashed placeholders. If a line has no leading emoji, the whole line is shown as text only.",
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 space-y-4">
          <LoginCarouselSettingsBlock
            intervalSec={settings.login_carousel_interval_sec}
            onIntervalSecChange={(v) => onSettingsFieldChange('login_carousel_interval_sec', v)}
            slides={loginCarouselSlides}
            onSlidesChange={onLoginCarouselSlidesChange}
            uploadLoginCarouselImage={uploadLoginCarouselImage}
            uploadingIndex={uploadingLoginCarouselIndex}
          />
        </CardContent>
      </Card>
    </div>
  );
}
