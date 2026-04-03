// API 管理 - 合并 API密钥、统计、Webhook、文档 于同一导航
// forceMount + CSS 显隐，避免切换 Tab 时子组件卸载重新加载数据
import { Link } from 'react-router-dom';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Key, BarChart3, Webhook, FileText, Info } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { ApiKeyManagementTab } from '@/components/ApiKeyManagementTab';
import { ApiStatsDashboard } from '@/components/ApiStatsDashboard';
import { WebhookManagementTab } from '@/components/WebhookManagementTab';
import { ApiDocumentationTab } from '@/components/ApiDocumentationTab';

export type ApiManagementTabScope = 'tenant' | 'platform';

export interface ApiManagementTabProps {
  scope?: ApiManagementTabScope;
}

export function ApiManagementTab({ scope = 'tenant' }: ApiManagementTabProps) {
  const { t } = useLanguage();
  const { employee } = useAuth();
  return (
    <div className="space-y-4 w-full">
      {scope === 'platform' ? (
        <Alert className="border-blue-200 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/20">
          <Info className="h-4 w-4" />
          <AlertDescription>
            {t(
              '全站视角：调用统计汇总全站请求；在平台超管权限下可浏览与管理各租户的 API 密钥、Webhook 与文档。',
              'Site-wide view: usage stats cover all traffic; with platform super-admin access you can review and manage API keys, webhooks, and docs across tenants.',
            )}
          </AlertDescription>
        </Alert>
      ) : null}
      {scope === 'tenant' && employee?.is_platform_super_admin ? (
        <Alert>
          <Info className="h-4 w-4" />
          <AlertDescription className="text-sm [&_a]:underline">
            {t('需要全站统计与跨租户密钥列表时，请打开', 'For site-wide stats and keys across tenants, open ')}
            <Link to="/staff/admin/settings/open-api" className="font-medium text-primary px-0.5">
              {t('平台设置 → 开放 API', 'Platform Settings → Open API')}
            </Link>
            。
          </AlertDescription>
        </Alert>
      ) : null}
    <Tabs defaultValue="keys" className="w-full">
      <TabsList className="grid w-full grid-cols-4 max-w-2xl mb-4">
        <TabsTrigger value="keys" className="gap-2">
          <Key className="h-4 w-4" />
          {t('API密钥', 'API Keys')}
        </TabsTrigger>
        <TabsTrigger value="stats" className="gap-2">
          <BarChart3 className="h-4 w-4" />
          {t('调用统计', 'Stats')}
        </TabsTrigger>
        <TabsTrigger value="webhooks" className="gap-2">
          <Webhook className="h-4 w-4" />
          {t('Webhook', 'Webhooks')}
        </TabsTrigger>
        <TabsTrigger value="docs" className="gap-2">
          <FileText className="h-4 w-4" />
          {t('API文档', 'API Docs')}
        </TabsTrigger>
      </TabsList>
      <TabsContent value="keys" forceMount>
        <ApiKeyManagementTab />
      </TabsContent>
      <TabsContent value="stats" forceMount>
        <ApiStatsDashboard />
      </TabsContent>
      <TabsContent value="webhooks" forceMount>
        <WebhookManagementTab />
      </TabsContent>
      <TabsContent value="docs" forceMount>
        <ApiDocumentationTab />
      </TabsContent>
    </Tabs>
    </div>
  );
}
