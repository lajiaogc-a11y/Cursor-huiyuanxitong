import { useLanguage } from '@/contexts/LanguageContext';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  DEFAULT_MEMBER_INBOX_COPY_TEMPLATES,
  type MemberInboxCopyBlock,
  type MemberInboxCopyTemplates,
  type MemberPortalSettings,
} from '@/services/members/memberPortalSettingsService';
import { SectionTitle, SwitchRow } from './shared';

export function MemberInboxTab({
  settings,
  onSettingsChange,
}: {
  settings: MemberPortalSettings;
  onSettingsChange: (patch: Partial<MemberPortalSettings>) => void;
}) {
  const { t } = useLanguage();

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t(
          '控制会员端「消息通知」入口与收件箱。总开关关闭时：会员端不展示铃铛、接口不返回列表且不会写入新通知；下方子项仍可预先勾选，保存/发布后写入数据库，待总开关打开即按子项生效。',
          'Member inbox and bell. When master is off: bell hidden, API returns no rows, no new writes. Sub-options stay editable as presets—save/publish stores them; when you turn master on, each channel follows its switch.',
        )}
      </p>
      <SwitchRow
        label={t('启用会员收件箱', 'Enable member inbox')}
        desc={t('关闭后会员端隐藏通知入口，列表与未读数为空。', 'When off, the bell is hidden; list and unread count are empty.')}
        checked={!!settings.enable_member_inbox}
        onChange={(v) => onSettingsChange({ enable_member_inbox: v })}
      />
      <SwitchRow
        label={t('交易完成转盘奖励通知', 'Trade completed — spin reward')}
        desc={t(
          '总开关开启且此项开启时写入通知；总开关关闭时仅保存偏好，不推送。',
          'Writes when master is on and this is on; when master is off, only saves your preference.',
        )}
        checked={!!settings.member_inbox_notify_order_spin}
        onChange={(v) => onSettingsChange({ member_inbox_notify_order_spin: v })}
      />
      <SwitchRow
        label={t('积分商城兑换结果通知', 'Points mall redemption outcome')}
        desc={t(
          '总开关开启且此项开启时写入通知；总开关关闭时仅保存偏好，不推送。',
          'Writes when master is on and this is on; when master is off, only saves your preference.',
        )}
        checked={!!settings.member_inbox_notify_mall_redemption}
        onChange={(v) => onSettingsChange({ member_inbox_notify_mall_redemption: v })}
      />
      <SwitchRow
        label={t('门户公告同步至收件箱', 'Portal announcements → inbox')}
        desc={t(
          '总开关开启且此项开启时同步公告；总开关关闭时仅保存偏好，不推送。',
          'Fan-out when master is on and this is on; when master is off, only saves your preference.',
        )}
        checked={!!settings.member_inbox_notify_announcement}
        onChange={(v) => onSettingsChange({ member_inbox_notify_announcement: v })}
      />

      <Card className="border-border/60">
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">
            {t('收件箱通知文案（可选）', 'Inbox notification copy (optional)')}
          </CardTitle>
          <p className="text-xs text-muted-foreground font-normal leading-relaxed">
            {t(
              '仅填写您希望强调的句式；留空则使用系统内置默认，并由系统自动填入订单、转盘次数、商品名、积分、公告标题与正文等变量。使用英文双花括号占位符，例如 {{spins}}、{{item}}。',
              'Write only the wording you want; leave blank for built-in defaults. The system fills order id, spins, item name, points, announcement titles, etc. Use placeholders like {{spins}}, {{item}}.',
            )}
          </p>
        </CardHeader>
        <CardContent className="space-y-6 text-xs">
          {(() => {
            const tpl = settings.member_inbox_copy_templates ?? DEFAULT_MEMBER_INBOX_COPY_TEMPLATES;
            const setTpl = (next: MemberInboxCopyTemplates) => onSettingsChange({ member_inbox_copy_templates: next });
            const blockFields = (
              label: string,
              b: MemberInboxCopyBlock,
              path: 'trade' | 'announcement' | 'redemption.completed' | 'redemption.rejected',
            ) => (
              <div className="space-y-2 rounded-lg border border-border/50 bg-muted/20 p-3">
                <p className="font-semibold text-foreground">{label}</p>
                <div className="grid gap-2 sm:grid-cols-2">
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('标题（中文）', 'Title (ZH)')}</Label>
                    <Input
                      value={b.titleZh}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (path === 'trade') setTpl({ ...tpl, trade: { ...tpl.trade, titleZh: v } });
                        else if (path === 'announcement') setTpl({ ...tpl, announcement: { ...tpl.announcement, titleZh: v } });
                        else if (path === 'redemption.completed')
                          setTpl({ ...tpl, redemption: { ...tpl.redemption, completed: { ...tpl.redemption.completed, titleZh: v } } });
                        else setTpl({ ...tpl, redemption: { ...tpl.redemption, rejected: { ...tpl.redemption.rejected, titleZh: v } } });
                      }}
                      placeholder={t('可含 {{spins}} 等', 'May include {{spins}}, etc.')}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label className="text-[11px]">{t('标题（English）', 'Title (EN)')}</Label>
                    <Input
                      value={b.titleEn}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (path === 'trade') setTpl({ ...tpl, trade: { ...tpl.trade, titleEn: v } });
                        else if (path === 'announcement') setTpl({ ...tpl, announcement: { ...tpl.announcement, titleEn: v } });
                        else if (path === 'redemption.completed')
                          setTpl({ ...tpl, redemption: { ...tpl.redemption, completed: { ...tpl.redemption.completed, titleEn: v } } });
                        else setTpl({ ...tpl, redemption: { ...tpl.redemption, rejected: { ...tpl.redemption.rejected, titleEn: v } } });
                      }}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px]">{t('正文（中文）', 'Body (ZH)')}</Label>
                    <Textarea
                      rows={2}
                      value={b.bodyZh}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (path === 'trade') setTpl({ ...tpl, trade: { ...tpl.trade, bodyZh: v } });
                        else if (path === 'announcement') setTpl({ ...tpl, announcement: { ...tpl.announcement, bodyZh: v } });
                        else if (path === 'redemption.completed')
                          setTpl({ ...tpl, redemption: { ...tpl.redemption, completed: { ...tpl.redemption.completed, bodyZh: v } } });
                        else setTpl({ ...tpl, redemption: { ...tpl.redemption, rejected: { ...tpl.redemption.rejected, bodyZh: v } } });
                      }}
                      placeholder={t('例如：恭喜您获得 {{spins}} 次转盘机会', 'e.g. You earned {{spins}} spin(s)')}
                    />
                  </div>
                  <div className="space-y-1 sm:col-span-2">
                    <Label className="text-[11px]">{t('正文（English）', 'Body (EN)')}</Label>
                    <Textarea
                      rows={2}
                      value={b.bodyEn}
                      onChange={(e) => {
                        const v = e.target.value;
                        if (path === 'trade') setTpl({ ...tpl, trade: { ...tpl.trade, bodyEn: v } });
                        else if (path === 'announcement') setTpl({ ...tpl, announcement: { ...tpl.announcement, bodyEn: v } });
                        else if (path === 'redemption.completed')
                          setTpl({ ...tpl, redemption: { ...tpl.redemption, completed: { ...tpl.redemption.completed, bodyEn: v } } });
                        else setTpl({ ...tpl, redemption: { ...tpl.redemption, rejected: { ...tpl.redemption.rejected, bodyEn: v } } });
                      }}
                    />
                  </div>
                </div>
              </div>
            );
            return (
              <>
                <div>
                  <SectionTitle className="!mt-0 mb-2">{t('交易（转盘奖励）', 'Trade (spin reward)')}</SectionTitle>
                  <p className="mb-2 text-muted-foreground">
                    {t('占位符：{{spins}} 次数，{{order_id}} 订单号', 'Placeholders: {{spins}}, {{order_id}}')}
                  </p>
                  {blockFields(t('交易通知', 'Trade notification'), tpl.trade, 'trade')}
                </div>
                <div>
                  <SectionTitle className="!mt-0 mb-2">{t('兑换（商城审核）', 'Redemption (mall)')}</SectionTitle>
                  <p className="mb-2 text-muted-foreground">
                    {t(
                      '占位符：{{item}} 商品名，{{qty}} 数量，{{points}} 积分数，{{points_hint}} 系统生成的扣款/退回说明，{{note_line}} 驳回备注（若有）。',
                      'Placeholders: {{item}}, {{qty}}, {{points}}, {{points_hint}}, {{note_line}} (rejection note if any).',
                    )}
                  </p>
                  {blockFields(t('审核通过', 'Approved'), tpl.redemption.completed, 'redemption.completed')}
                  {blockFields(t('已驳回', 'Rejected'), tpl.redemption.rejected, 'redemption.rejected')}
                </div>
                <div>
                  <SectionTitle className="!mt-0 mb-2">{t('公告（首页公告同步）', 'Announcements (home feed)')}</SectionTitle>
                  <p className="mb-2 text-muted-foreground">
                    {t(
                      '四项全空则收件箱标题/正文与首页公告一致；填写后可用 {{titleZh}} {{titleEn}} {{contentZh}} {{contentEn}} 引用公告原文。',
                      'Leave all empty to mirror homepage text. Or wrap with {{titleZh}}, {{titleEn}}, {{contentZh}}, {{contentEn}}.',
                    )}
                  </p>
                  {blockFields(t('公告通知', 'Announcement inbox'), tpl.announcement, 'announcement')}
                </div>
              </>
            );
          })()}
        </CardContent>
      </Card>
    </div>
  );
}
