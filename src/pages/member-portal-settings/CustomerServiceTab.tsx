/**
 * CustomerServiceTab — 客服设置 tab
 * 从 MemberPortalSettings 提取
 */
import { useState, useRef } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Headphones, Plus, Trash2, Upload, Loader2 } from 'lucide-react';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
import { verifyAdminPasswordApi } from '@/services/admin/adminApiService';
import { SectionTitle } from './shared';
import { useMemberResolvableMedia } from '@/hooks/members/useMemberResolvableMedia';

function CustomerServiceTabAgentAvatar({ agent, idx }: { agent: CustomerServiceAgent; idx: number }) {
  const raw = String(agent.avatar_url ?? '').trim();
  const { resolvedSrc, usePlaceholder, onImageError } = useMemberResolvableMedia(
    `cs-tab-${idx}-${agent.link}`,
    raw || undefined,
  );
  const show = raw && !usePlaceholder;
  if (show) {
    return (
      <img
        src={resolvedSrc}
        alt={agent.name}
        className="w-full h-full object-cover"
        onError={onImageError}
      />
    );
  }
  return (
    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-lg font-bold">
      {(agent.name || '?').charAt(0).toUpperCase()}
    </div>
  );
}

interface CustomerServiceAgent {
  name: string;
  avatar_url: string | null;
  link: string;
}

export interface MemberPortalSettingsSlice {
  customer_service_label?: string;
  customer_service_agents?: CustomerServiceAgent[];
  home_first_trade_contact_zh?: string;
  home_first_trade_contact_en?: string;
}

interface Props {
  settings: MemberPortalSettingsSlice;
  onSettingsChange: (patch: Partial<MemberPortalSettingsSlice>) => void;
  imageFileToWebpDataUrl: (file: File, maxSize?: number) => Promise<string>;
}

export default function CustomerServiceTab({ settings, onSettingsChange, imageFileToWebpDataUrl }: Props) {
  const { t } = useLanguage();
  const agentAvatarInputRefs = useRef<Record<number, HTMLInputElement | null>>({});
  const [uploadingAgentAvatarIdx, setUploadingAgentAvatarIdx] = useState<number | null>(null);
  const [deleteAgentIdx, setDeleteAgentIdx] = useState<number | null>(null);
  const [deleteAgentPwd, setDeleteAgentPwd] = useState('');
  const [deletingAgent, setDeletingAgent] = useState(false);
  const [confirmClearAvatarIdx, setConfirmClearAvatarIdx] = useState<number | null>(null);

  const agents = settings.customer_service_agents || [];

  return (
    <div className="space-y-6">
      <p className="text-xs text-muted-foreground -mb-2">
        {t(
          "仅使用下方客服坐席列表：全站右下角悬浮按钮、「我的 → 联系客服」与首页「完成一笔订单」跳转页使用同一套坐席。会员端只显示已保存且填写了名称与链接的客服。保存并发布后约 30 秒内生效。",
          "The agent list below powers the floating button, Settings \u2192 Contact, and the Home \u201cComplete an order\u201d trade-contact page. Members only see rows with name and link. Publish for changes in ~30s.",
        )}
      </p>
      <Card>
        <CardContent className="pt-5 space-y-4">
          <SectionTitle className="flex items-center gap-2">
            <Headphones className="h-4 w-4" />
            {t("客服与联系", "Customer Service")}
          </SectionTitle>
          <p className="text-xs text-muted-foreground -mt-2">
            {t(
              "建议每条坐席填写 WhatsApp 等链接（如 https://wa.me/区号号码，无 + 号）。未填写名称或链接的条目不会出现在会员端。",
              "For each agent, set a WhatsApp or chat URL (e.g. https://wa.me/... without +). Rows missing name or link are hidden on the member app.",
            )}
          </p>

          <div className="grid gap-3 sm:grid-cols-1 max-w-md">
            <div className="space-y-1.5">
              <Label className="text-xs">{t("入口标题", "Entry title")}</Label>
              <Input
                value={settings.customer_service_label || ''}
                onChange={(e) => onSettingsChange({ customer_service_label: e.target.value })}
                placeholder={t("联系客服", "Contact support")}
              />
            </div>
          </div>

          <div className="rounded-lg border border-border/60 bg-muted/20 p-4 space-y-3">
            <p className="text-sm font-semibold">{t("首页交易第一笔", "First trade on Home")}</p>
            <p className="text-xs text-muted-foreground -mt-1">
              {t(
                "会员首页每日任务「完成一笔订单」跳转页的说明文字（中英各一）。空则会员端使用默认提示。需保存草稿并发布。",
                "Intro text on the Home daily task \u201cComplete an order\u201d page (CN/EN). Empty = default copy on the member app. Save draft and publish.",
              )}
            </p>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("说明（中文）", "Copy (Chinese)")}</Label>
              <Textarea
                rows={3}
                value={settings.home_first_trade_contact_zh || ''}
                onChange={(e) => onSettingsChange({ home_first_trade_contact_zh: e.target.value })}
                placeholder={t("例如：首笔交易请通过客服确认收款方式。", "e.g. For your first trade, confirm payment with support.")}
              />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("说明（English）", "Copy (English)")}</Label>
              <Textarea
                rows={3}
                value={settings.home_first_trade_contact_en || ''}
                onChange={(e) => onSettingsChange({ home_first_trade_contact_en: e.target.value })}
                placeholder="For your first trade, confirm payment with support."
              />
            </div>
          </div>

          {agents.map((agent, idx) => (
            <div key={idx} className="flex items-start gap-3 p-3 border rounded-lg bg-muted/30">
              {/* Avatar upload */}
              <div className="flex flex-col items-center gap-1 pt-4 shrink-0">
                <input
                  ref={(el) => { agentAvatarInputRefs.current[idx] = el; }}
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    setUploadingAgentAvatarIdx(idx);
                    try {
                      const webpUrl = await imageFileToWebpDataUrl(file, 200);
                      const updated = [...agents];
                      updated[idx] = { ...updated[idx], avatar_url: webpUrl };
                      onSettingsChange({ customer_service_agents: updated });
                      notify.success(t("头像已转换为 WebP", "Avatar converted to WebP"));
                    } catch {
                      notify.error(t("图片处理失败", "Image processing failed"));
                    } finally {
                      setUploadingAgentAvatarIdx(null);
                      e.target.value = '';
                    }
                  }}
                />
                <button
                  type="button"
                  className="relative w-14 h-14 rounded-full border-2 border-dashed border-muted-foreground/30 hover:border-primary/50 transition-colors overflow-hidden group cursor-pointer"
                  onClick={() => agentAvatarInputRefs.current[idx]?.click()}
                  disabled={uploadingAgentAvatarIdx === idx}
                >
                  {String(agent.avatar_url || '').trim() ? (
                    <CustomerServiceTabAgentAvatar agent={agent} idx={idx} />
                  ) : (
                    <div className="w-full h-full bg-muted flex items-center justify-center text-muted-foreground text-lg font-bold">
                      {(agent.name || '?').charAt(0).toUpperCase()}
                    </div>
                  )}
                  <div className="absolute inset-0 bg-black/40 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                    {uploadingAgentAvatarIdx === idx
                      ? <Loader2 className="h-4 w-4 text-white animate-spin" />
                      : <Upload className="h-4 w-4 text-white" />}
                  </div>
                </button>
                <span className="text-[10px] text-muted-foreground">{t("点击上传", "Upload")}</span>
                {String(agent.avatar_url || '').trim() ? (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-7 px-1.5 text-[10px] text-muted-foreground hover:text-destructive"
                    onClick={() => setConfirmClearAvatarIdx(idx)}
                  >
                    {t("移除头像", "Remove avatar")}
                  </Button>
                ) : null}
              </div>
              <div className="flex-1 grid gap-2 sm:grid-cols-2">
                <div className="space-y-1">
                  <Label className="text-xs">{t("名称", "Name")}</Label>
                  <Input
                    value={agent.name}
                    onChange={(e) => {
                      const updated = [...agents];
                      updated[idx] = { ...updated[idx], name: e.target.value };
                      onSettingsChange({ customer_service_agents: updated });
                    }}
                    placeholder={t("客服昵称", "Agent name")}
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">{t("WhatsApp / 联系链接", "WhatsApp / link")}</Label>
                  <Input
                    value={agent.link || ''}
                    onChange={(e) => {
                      const updated = [...agents];
                      updated[idx] = { ...updated[idx], link: e.target.value };
                      onSettingsChange({ customer_service_agents: updated });
                    }}
                    placeholder="https://wa.me/601153799923"
                  />
                </div>
              </div>
              <Button
                variant="ghost"
                size="icon"
                className="mt-5 text-destructive hover:text-destructive"
                aria-label="Delete"
                onClick={() => {
                  setDeleteAgentIdx(idx);
                  setDeleteAgentPwd('');
                }}
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          ))}

          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              onSettingsChange({ customer_service_agents: [...agents, { name: '', avatar_url: null, link: '' }] });
            }}
          >
            <Plus className="h-4 w-4 mr-1" />
            {t("添加客服", "Add agent")}
          </Button>
        </CardContent>
      </Card>

      <AlertDialog open={confirmClearAvatarIdx !== null} onOpenChange={(o) => !o && setConfirmClearAvatarIdx(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("移除该客服头像？", "Remove this agent’s avatar?")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(
                "将恢复为默认首字母占位图；需保存并发布后会员端才会更新。",
                "Reverts to the default initial. Save and publish to update the member app.",
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                const i = confirmClearAvatarIdx;
                setConfirmClearAvatarIdx(null);
                if (i === null) return;
                const updated = [...agents];
                updated[i] = { ...updated[i], avatar_url: null };
                onSettingsChange({ customer_service_agents: updated });
                notify.success(t("头像已移除", "Avatar removed"));
              }}
            >
              {t("移除", "Remove")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DrawerDetail
        open={deleteAgentIdx !== null}
        onOpenChange={(open) => {
          if (!open) {
            setDeleteAgentIdx(null);
            setDeleteAgentPwd('');
          }
        }}
        title={t("确认删除客服", "Confirm Agent Deletion")}
        description={t("删除客服需要输入您的登录密码进行安全验证。", "Enter your login password to verify this deletion.")}
        sheetMaxWidth="xl"
      >
        <div className="space-y-4">
          <div className="space-y-2">
            <Label>{t("员工密码", "Staff Password")}</Label>
            <Input
              type="password"
              value={deleteAgentPwd}
              onChange={(e) => setDeleteAgentPwd(e.target.value)}
              placeholder={t("请输入您的登录密码", "Enter your login password")}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && deleteAgentPwd.trim()) {
                  (document.getElementById('btn-confirm-delete-agent') as HTMLButtonElement)?.click();
                }
              }}
            />
          </div>
          <div className="flex flex-wrap justify-end gap-2 border-t border-border pt-4">
            <Button
              variant="outline"
              onClick={() => {
                setDeleteAgentIdx(null);
                setDeleteAgentPwd('');
              }}
            >
              {t("取消", "Cancel")}
            </Button>
            <Button
              id="btn-confirm-delete-agent"
              variant="destructive"
              disabled={!deleteAgentPwd.trim() || deletingAgent}
              onClick={async () => {
                if (deleteAgentIdx === null) return;
                setDeletingAgent(true);
                try {
                  const ok = await verifyAdminPasswordApi(deleteAgentPwd);
                  if (!ok) {
                    notify.error(t("密码错误，操作已取消", "Invalid password, action cancelled"));
                    return;
                  }
                  const updated = agents.filter((_, i) => i !== deleteAgentIdx);
                  onSettingsChange({ customer_service_agents: updated });
                  notify.success(t("客服已删除", "Agent removed"));
                  setDeleteAgentIdx(null);
                  setDeleteAgentPwd('');
                } catch {
                  notify.error(t("验证失败，请重试", "Verification failed, please retry"));
                } finally {
                  setDeletingAgent(false);
                }
              }}
            >
              {deletingAgent ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
              {t("确认删除", "Confirm Delete")}
            </Button>
          </div>
        </div>
      </DrawerDetail>
    </div>
  );
}
