/**
 * 平台设置 — 客户端下载地址配置
 *
 * 下载 URL 存储在后端 shared_data_store（key: companionDownloadUrls），
 * 所有用户/浏览器共享同一配置。
 */
import { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notifyHub';
import { Download, Save, ExternalLink, Loader2 } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { getSharedDataApi, postSharedDataApi } from '@/api/staffData/sharedDataApi';

const STORE_KEY = 'companionDownloadUrls';

interface DownloadUrls {
  windows?: string;
  mac?: string;
}

export default function ClientDownloadTab() {
  const { t } = useLanguage();
  const [winUrl, setWinUrl] = useState('');
  const [macUrl, setMacUrl] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const data = await getSharedDataApi<DownloadUrls>(STORE_KEY);
      if (data) {
        setWinUrl(data.windows ?? '');
        setMacUrl(data.mac ?? '');
      }
      setLoading(false);
    })();
  }, []);

  const handleSave = useCallback(async () => {
    setSaving(true);
    const payload: DownloadUrls = { windows: winUrl.trim(), mac: macUrl.trim() };
    const ok = await postSharedDataApi(STORE_KEY, payload);
    setSaving(false);
    if (ok) {
      notify.success(t('保存成功', 'Saved successfully'));
    } else {
      notify.error(t('保存失败，请重试', 'Save failed, please retry'));
    }
  }, [winUrl, macUrl, t]);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-10 justify-center text-muted-foreground">
        <Loader2 className="w-4 h-4 animate-spin" /> {t('加载中...', 'Loading...')}
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-2xl">
      <div>
        <h3 className="text-lg font-semibold mb-1">
          {t('客户端下载地址配置', 'Client Download URL Configuration')}
        </h3>
        <p className="text-sm text-muted-foreground">
          {t(
            '配置 PC 客户端（WhatsApp Companion）的下载地址，员工可在后台右上角下载按钮中获取。',
            'Configure download URLs for the PC client (WhatsApp Companion). Staff can access them via the download button in the top-right corner.',
          )}
        </p>
      </div>

      <div className="space-y-4 rounded-lg border p-4">
        <div className="flex items-center gap-2 text-sm font-medium">
          <Download className="w-4 h-4 text-primary" />
          {t('下载链接', 'Download URLs')}
        </div>

        <div className="space-y-3">
          <div className="space-y-1.5">
            <Label htmlFor="dl-win">{t('Windows 客户端下载地址', 'Windows Client Download URL')}</Label>
            <Input
              id="dl-win"
              name="windowsDownloadUrl"
              value={winUrl}
              onChange={e => setWinUrl(e.target.value)}
              placeholder="https://example.com/FastGC-Companion-Setup.exe"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('支持 .exe / .msi 等安装包格式，也可以填网盘链接', 'Supports .exe / .msi installer formats, or cloud drive links')}
            </p>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="dl-mac">{t('macOS 客户端下载地址', 'macOS Client Download URL')}</Label>
            <Input
              id="dl-mac"
              name="macDownloadUrl"
              value={macUrl}
              onChange={e => setMacUrl(e.target.value)}
              placeholder="https://example.com/FastGC-Companion.dmg"
              className="font-mono text-sm"
            />
            <p className="text-xs text-muted-foreground">
              {t('支持 .dmg / .pkg 等安装包格式', 'Supports .dmg / .pkg installer formats')}
            </p>
          </div>
        </div>

        <Button onClick={handleSave} disabled={saving} className="gap-2">
          {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          {t('保存', 'Save')}
        </Button>
      </div>

      {(winUrl || macUrl) && (
        <div className="rounded-lg border p-4 space-y-2">
          <div className="text-sm font-medium">{t('当前配置预览', 'Current Configuration Preview')}</div>
          {winUrl && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">Windows:</span>
              <a href={winUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 truncate">
                {winUrl}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}
          {macUrl && (
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground">macOS:</span>
              <a href={macUrl} target="_blank" rel="noopener noreferrer" className="text-primary hover:underline flex items-center gap-1 truncate">
                {macUrl}
                <ExternalLink className="w-3 h-3 flex-shrink-0" />
              </a>
            </div>
          )}
        </div>
      )}

      <div className="rounded-lg bg-muted/50 p-4 text-sm text-muted-foreground space-y-2">
        <div className="font-medium text-foreground">{t('使用说明', 'Usage Guide')}</div>
        <ol className="list-decimal pl-4 space-y-1">
          <li>{t('将编译好的 WhatsApp Companion 安装包上传到服务器或网盘', 'Upload the compiled WhatsApp Companion installer to server or cloud storage')}</li>
          <li>{t('在上方填入下载链接并保存', 'Enter the download URL above and save')}</li>
          <li>{t('员工即可在后台右上角看到下载按钮（↓ 图标）', 'Staff will see the download button (↓ icon) in the top-right corner')}</li>
          <li>{t('安装并启动 Companion 后，在 WhatsApp 工作台可扫码登录真实账号', 'After installing and launching Companion, staff can scan QR to login real accounts in WhatsApp Workbench')}</li>
        </ol>
      </div>
    </div>
  );
}
