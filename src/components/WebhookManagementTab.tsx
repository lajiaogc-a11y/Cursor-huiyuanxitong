// ============= Webhook 管理组件 =============
import { useState } from 'react';
import { useWebhooks, Webhook, WEBHOOK_EVENT_TYPES } from '@/hooks/system/useWebhooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DrawerDetail } from '@/components/shell/DrawerDetail';
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
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Webhook as WebhookIcon, Settings, FileText, Trash2, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { notify } from "@/lib/notifyHub";
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile, useIsTablet } from '@/hooks/ui/use-mobile';

export function WebhookManagementTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { webhooks, deliveryLogs, loading, logsLoading, fetchDeliveryLogs, createWebhook, updateWebhook, deleteWebhook, testWebhook } = useWebhooks();

  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [selectedWebhook, setSelectedWebhook] = useState<Webhook | null>(null);
  const [testing, setTesting] = useState(false);

  // 表单状态
  const [formName, setFormName] = useState('');
  const [formUrl, setFormUrl] = useState('');
  const [formEvents, setFormEvents] = useState<string[]>([]);
  const [formSecret, setFormSecret] = useState('');
  const [formHeaders, setFormHeaders] = useState('');
  const [formRetryCount, setFormRetryCount] = useState(3);
  const [formTimeoutMs, setFormTimeoutMs] = useState(5000);
  const [formRemark, setFormRemark] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormUrl('');
    setFormEvents([]);
    setFormSecret('');
    setFormHeaders('');
    setFormRetryCount(3);
    setFormTimeoutMs(5000);
    setFormRemark('');
  };

  const handleCreate = async () => {
    if (!formName.trim() || !formUrl.trim()) {
      notify.error(t('请填写名称和 URL', 'Please enter name and URL'));
      return;
    }
    if (formEvents.length === 0) {
      notify.error(t('请至少选择一个事件', 'Please select at least one event'));
      return;
    }

    let headers: Record<string, string> = {};
    if (formHeaders.trim()) {
      try {
        headers = JSON.parse(formHeaders);
      } catch {
        notify.error(t('自定义请求头格式错误，需为 JSON 格式', 'Invalid custom headers, must be JSON format'));
        return;
      }
    }

    const success = await createWebhook(formName, formUrl, formEvents, {
      secret: formSecret || undefined,
      headers,
      retryCount: formRetryCount,
      timeoutMs: formTimeoutMs,
      remark: formRemark || undefined,
    });

    if (success) {
      setShowCreateDialog(false);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (!selectedWebhook) return;

    let headers: Record<string, string> = {};
    if (formHeaders.trim()) {
      try {
        headers = JSON.parse(formHeaders);
      } catch {
        notify.error(t('自定义请求头格式错误', 'Invalid custom headers format'));
        return;
      }
    }

    await updateWebhook(selectedWebhook.id, {
      name: formName,
      url: formUrl,
      events: formEvents,
      secret: formSecret || null,
      headers,
      retryCount: formRetryCount,
      timeoutMs: formTimeoutMs,
      remark: formRemark || null,
    });

    setShowEditDialog(false);
  };

  const handleDelete = async () => {
    if (!selectedWebhook) return;
    await deleteWebhook(selectedWebhook.id);
    setShowDeleteConfirm(false);
    setSelectedWebhook(null);
  };

  const handleTest = async (webhook: Webhook) => {
    setTesting(true);
    const result = await testWebhook(webhook.id);
    setTesting(false);
    
    if (result.success) {
      notify.success(t('测试推送成功', 'Test push successful'));
    } else {
      notify.error(t(`测试失败: ${result.message}`, `Test failed: ${result.message}`));
    }
  };

  const openEditDialog = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    setFormName(webhook.name);
    setFormUrl(webhook.url);
    setFormEvents(webhook.events);
    setFormSecret(webhook.secret || '');
    setFormHeaders(Object.keys(webhook.headers).length > 0 ? JSON.stringify(webhook.headers, null, 2) : '');
    setFormRetryCount(webhook.retryCount);
    setFormTimeoutMs(webhook.timeoutMs);
    setFormRemark(webhook.remark || '');
    setShowEditDialog(true);
  };

  const openLogsDialog = (webhook: Webhook) => {
    setSelectedWebhook(webhook);
    fetchDeliveryLogs(webhook.id);
    setShowLogsDialog(true);
  };

  const getSuccessRate = (webhook: Webhook) => {
    if (webhook.totalDeliveries === 0) return '-';
    return ((webhook.successfulDeliveries / webhook.totalDeliveries) * 100).toFixed(1) + '%';
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t("加载中...", "Loading...")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 说明卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <WebhookIcon className="h-5 w-5" />
            {t("Webhook 推送管理", "Webhooks")}
          </CardTitle>
          <CardDescription>
            {t("配置 Webhook 将系统事件实时推送到第三方系统。支持订单创建、会员注册、积分变动等事件。", "Configure Webhooks to push system events to third-party systems in real-time. Supports order creation, member registration, points changes, etc.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t(`共 ${webhooks.length} 个 Webhook，其中 ${webhooks.filter(w => w.status === 'active').length} 个启用中`, `${webhooks.length} Webhooks total, ${webhooks.filter(w => w.status === 'active').length} active`)}
            </div>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("添加 Webhook", "Add Webhook")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook 列表 */}
      {useCompactLayout ? (
        <div className="space-y-3">
          {webhooks.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">{t("暂无 Webhook，点击上方按钮添加", "No Webhooks yet, click above to add")}</CardContent></Card>
          ) : webhooks.map(webhook => (
            <Card key={webhook.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{webhook.name}</span>
                  <Badge variant={webhook.status === 'active' ? 'default' : 'secondary'}>
                    {webhook.status === 'active' ? t('启用', 'Active') : t('禁用', 'Disabled')}
                  </Badge>
                </div>
                <code className="text-xs bg-muted px-1.5 py-0.5 rounded block truncate">{webhook.url}</code>
                <div className="flex flex-wrap gap-1">
                  {webhook.events.slice(0, 3).map(e => (
                    <Badge key={e} variant="outline" className="text-xs">
                      {WEBHOOK_EVENT_TYPES.find(t => t.value === e)?.label || e}
                    </Badge>
                  ))}
                  {webhook.events.length > 3 && <Badge variant="outline" className="text-xs">+{webhook.events.length - 3}</Badge>}
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>
                    <span className="text-primary">{webhook.successfulDeliveries}</span>/{webhook.totalDeliveries} · {getSuccessRate(webhook)}
                  </span>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t">
                  <Button variant="ghost" size="sm" onClick={() => handleTest(webhook)} disabled={testing || webhook.status !== 'active'}>
                    <Send className="h-3.5 w-3.5 mr-1" />{t("测试", "Test")}
                  </Button>
                  <Button variant="ghost" size="sm" onClick={() => openLogsDialog(webhook)}><FileText className="h-3.5 w-3.5 mr-1" />{t("日志", "Logs")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(webhook)}><Settings className="h-3.5 w-3.5 mr-1" />{t("编辑", "Edit")}</Button>
                  <div className="ml-auto">
                    <Switch checked={webhook.status === 'active'} onCheckedChange={(checked) => updateWebhook(webhook.id, { status: checked ? 'active' : 'disabled' })} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : (
        <Card>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t("名称", "Name")}</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>{t("订阅事件", "Events")}</TableHead>
                  <TableHead>{t("状态", "Status")}</TableHead>
                  <TableHead>{t("投递统计", "Delivery Stats")}</TableHead>
                  <TableHead>{t("成功率", "Success Rate")}</TableHead>
                  <TableHead className="text-right">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      {t("暂无 Webhook，点击上方按钮添加", "No Webhooks yet, click above to add")}
                    </TableCell>
                  </TableRow>
                ) : (
                  webhooks.map(webhook => (
                    <TableRow key={webhook.id}>
                      <TableCell className="font-medium">{webhook.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded max-w-[200px] truncate block">
                          {webhook.url}
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {webhook.events.slice(0, 2).map(e => (
                            <Badge key={e} variant="outline" className="text-xs">
                              {WEBHOOK_EVENT_TYPES.find(t => t.value === e)?.label || e}
                            </Badge>
                          ))}
                          {webhook.events.length > 2 && (
                            <Badge variant="outline" className="text-xs">+{webhook.events.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant={webhook.status === 'active' ? 'default' : 'secondary'}>
                          {webhook.status === 'active' ? t('启用', 'Active') : t('禁用', 'Disabled')}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-xs">
                          <span className="text-primary">{webhook.successfulDeliveries}</span>
                          {' / '}
                          <span className="text-destructive">{webhook.failedDeliveries}</span>
                          {' / '}
                          <span className="text-muted-foreground">{webhook.totalDeliveries}</span>
                        </div>
                      </TableCell>
                      <TableCell>{getSuccessRate(webhook)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            onClick={() => handleTest(webhook)} 
                            disabled={testing || webhook.status !== 'active'}
                            title={t("测试推送", "Test Push")}
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openLogsDialog(webhook)} title={t("投递日志", "Delivery Logs")}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(webhook)} title={t("编辑", "Edit")}>
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Switch
                            checked={webhook.status === 'active'}
                            onCheckedChange={(checked) => updateWebhook(webhook.id, { status: checked ? 'active' : 'disabled' })}
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      <DrawerDetail
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title={t("添加 Webhook", "Add Webhook")}
        description={t("配置新的 Webhook 推送端点", "Configure a new Webhook push endpoint")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div>
              <Label>{t("名称", "Name")} *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder={t("例如：订单通知", "e.g. Order Notification")} />
            </div>
            <div>
              <Label>URL *</Label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://your-domain.com/webhook" />
            </div>
            <div>
              <Label>{t("订阅事件", "Subscribe Events")} *</Label>
              <div className="mt-2 grid grid-cols-2 gap-2">
                {WEBHOOK_EVENT_TYPES.map(event => (
                  <div key={event.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`event-${event.value}`}
                      checked={formEvents.includes(event.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormEvents(prev => [...prev, event.value]);
                        } else {
                          setFormEvents(prev => prev.filter(e => e !== event.value));
                        }
                      }}
                    />
                    <label htmlFor={`event-${event.value}`} className="text-sm cursor-pointer">
                      {event.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>{t("签名密钥（可选）", "Secret Key (Optional)")}</Label>
              <Input value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder={t("用于验证请求来源", "For verifying request origin")} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("重试次数", "Retry Count")}</Label>
                <Input type="number" value={formRetryCount} onChange={e => setFormRetryCount(parseInt(e.target.value) || 3)} min={0} max={5} />
              </div>
              <div>
                <Label>{t("超时时间 (ms)", "Timeout (ms)")}</Label>
                <Input type="number" value={formTimeoutMs} onChange={e => setFormTimeoutMs(parseInt(e.target.value) || 5000)} min={1000} max={30000} />
              </div>
            </div>
            <div>
              <Label>{t("自定义请求头（JSON 格式）", "Custom Headers (JSON)")}</Label>
              <Textarea 
                value={formHeaders} 
                onChange={e => setFormHeaders(e.target.value)} 
                placeholder='{"Authorization": "Bearer xxx"}'
                rows={3}
              />
            </div>
            <div>
              <Label>{t("备注", "Remark")}</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleCreate}>{t("创建", "Create")}</Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        title={t("编辑 Webhook", "Edit Webhook")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div>
              <Label>{t("名称", "Name")}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} />
            </div>
            <div>
              <Label>{t("订阅事件", "Subscribe Events")}</Label>

              <div className="mt-2 grid grid-cols-2 gap-2">
                {WEBHOOK_EVENT_TYPES.map(event => (
                  <div key={event.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`edit-event-${event.value}`}
                      checked={formEvents.includes(event.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          setFormEvents(prev => [...prev, event.value]);
                        } else {
                          setFormEvents(prev => prev.filter(e => e !== event.value));
                        }
                      }}
                    />
                    <label htmlFor={`edit-event-${event.value}`} className="text-sm cursor-pointer">
                      {event.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>{t("签名密钥", "Secret Key")}</Label>
              <Input value={formSecret} onChange={e => setFormSecret(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>{t("重试次数", "Retry Count")}</Label>
                <Input type="number" value={formRetryCount} onChange={e => setFormRetryCount(parseInt(e.target.value) || 3)} />
              </div>
              <div>
                <Label>{t("超时时间 (ms)", "Timeout (ms)")}</Label>
                <Input type="number" value={formTimeoutMs} onChange={e => setFormTimeoutMs(parseInt(e.target.value) || 5000)} />
              </div>
            </div>
            <div>
              <Label>{t("自定义请求头", "Custom Headers")}</Label>
              <Textarea value={formHeaders} onChange={e => setFormHeaders(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>{t("备注", "Remark")}</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
            <Button 
              variant="destructive" 
              className="w-full" 
              onClick={() => { setShowEditDialog(false); setShowDeleteConfirm(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              {t("删除此 Webhook", "Delete this Webhook")}
            </Button>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleEdit}>{t("保存", "Save")}</Button>
          </div>
      </DrawerDetail>

      <AlertDialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
            <AlertDialogDescription>
              {t(`确定要删除 Webhook "${selectedWebhook?.name}" 吗？此操作不可恢复。`, `Are you sure you want to delete Webhook "${selectedWebhook?.name}"? This action cannot be undone.`)}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {t("删除", "Delete")}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <DrawerDetail
        open={showLogsDialog}
        onOpenChange={setShowLogsDialog}
        title={
          <>
            {t("投递日志", "Delivery Logs")}
            {selectedWebhook?.name ? ` — ${selectedWebhook.name}` : ''}
          </>
        }
        description={t("最近 50 条推送记录", "Last 50 delivery records")}
        sheetMaxWidth="4xl"
      >
          <ScrollArea className="h-[min(500px,55vh)]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">{t("加载中...", "Loading...")}</div>
            ) : deliveryLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("暂无投递记录", "No delivery logs")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("时间", "Time")}</TableHead>
                    <TableHead>{t("事件", "Event")}</TableHead>
                    <TableHead>{t("状态", "Status")}</TableHead>
                    <TableHead>{t("响应码", "Response Code")}</TableHead>
                    <TableHead>{t("耗时", "Duration")}</TableHead>
                    <TableHead>{t("重试", "Retry")}</TableHead>
                    <TableHead>{t("错误", "Error")}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {deliveryLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {format(new Date(log.createdAt), 'MM-dd HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">
                          {WEBHOOK_EVENT_TYPES.find(t => t.value === log.eventType)?.label || log.eventType}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {log.success ? (
                          <CheckCircle className="h-4 w-4 text-primary" />
                        ) : (
                          <XCircle className="h-4 w-4 text-destructive" />
                        )}
                      </TableCell>
                      <TableCell>{log.responseStatus || '-'}</TableCell>
                      <TableCell>{log.responseTimeMs ? `${log.responseTimeMs}ms` : '-'}</TableCell>
                      <TableCell>{log.attemptCount}</TableCell>
                      <TableCell className="text-xs text-destructive max-w-[200px] truncate">
                        {log.errorMessage || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
      </DrawerDetail>
    </div>
  );
}
