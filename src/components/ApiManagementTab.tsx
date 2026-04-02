// API 管理 - 合并 API密钥、统计、Webhook、文档 于同一导航
// forceMount + CSS 显隐，避免切换 Tab 时子组件卸载重新加载数据
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Key, BarChart3, Webhook, FileText } from 'lucide-react';
import { useLanguage } from '@/contexts/LanguageContext';
import { ApiKeyManagementTab } from '@/components/ApiKeyManagementTab';
import { ApiStatsDashboard } from '@/components/ApiStatsDashboard';
import { WebhookManagementTab } from '@/components/WebhookManagementTab';
import { ApiDocumentationTab } from '@/components/ApiDocumentationTab';

export function ApiManagementTab() {
  const { t } = useLanguage();
  return (
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
  );
}
