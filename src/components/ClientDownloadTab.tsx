/**
 * 平台设置 — 客户端下载地址配置
 *
 * 管理员配置 Windows / macOS 客户端的下载链接，
 * 配置后员工在后台右上角可直接下载。
 */
import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notify } from '@/lib/notifyHub';
import { Download, Save, ExternalLink } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';

const LS_KEY_WIN = 'pc_download_url_windows';
const LS_KEY_MAC = 'pc_download_url_mac';

export default function ClientDownloadTab() {
  const { t } = useLanguage();
  const [winUrl, setWinUrl] = useState('');
  const [macUrl, setMacUrl] = useState('');

  useEffect(() => {
    setWinUrl(localStorage.getItem(LS_KEY_WIN) || '');
    setMacUrl(localStorage.getItem(LS_KEY_MAC) || '');
  }, []);

  const handleSave = () => {
    localStorage.setItem(LS_KEY_WIN, winUrl.trim());
    localStorage.setItem(LS_KEY_MAC, macUrl.trim());
    notify.success(t('保存成功', 'Saved successfully'));
  };

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

        <Button onClick={handleSave} className="gap-2">
          <Save className="w-4 h-4" />
          {t('保存', 'Save')}
        </Button>
      </div>

      {/* 预览 */}
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
