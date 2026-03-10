// ============= Webhook 管理组件 =============
import { useState } from 'react';
import { useWebhooks, Webhook, WEBHOOK_EVENT_TYPES } from '@/hooks/useWebhooks';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Switch } from '@/components/ui/switch';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Textarea } from '@/components/ui/textarea';
import { Plus, Webhook as WebhookIcon, Settings, FileText, Trash2, Send, CheckCircle, XCircle, Clock } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';

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
      toast.error('请填写名称和 URL');
      return;
    }
    if (formEvents.length === 0) {
      toast.error('请至少选择一个事件');
      return;
    }

    let headers: Record<string, string> = {};
    if (formHeaders.trim()) {
      try {
        headers = JSON.parse(formHeaders);
      } catch {
        toast.error('自定义请求头格式错误，需为 JSON 格式');
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
        toast.error('自定义请求头格式错误');
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
      toast.success('测试推送成功');
    } else {
      toast.error(`测试失败: ${result.message}`);
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
            Webhook 推送管理
          </CardTitle>
          <CardDescription>
            配置 Webhook 将系统事件实时推送到第三方系统。支持订单创建、会员注册、积分变动等事件。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {webhooks.length} 个 Webhook，其中 {webhooks.filter(w => w.status === 'active').length} 个启用中
            </div>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              添加 Webhook
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Webhook 列表 */}
      {useCompactLayout ? (
        <div className="space-y-3">
          {webhooks.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">暂无 Webhook，点击上方按钮添加</CardContent></Card>
          ) : webhooks.map(webhook => (
            <Card key={webhook.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{webhook.name}</span>
                  <Badge variant={webhook.status === 'active' ? 'default' : 'secondary'}>
                    {webhook.status === 'active' ? '启用' : '禁用'}
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
                  <TableHead>名称</TableHead>
                  <TableHead>URL</TableHead>
                  <TableHead>订阅事件</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>投递统计</TableHead>
                  <TableHead>成功率</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {webhooks.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8 text-muted-foreground">
                      暂无 Webhook，点击上方按钮添加
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
                          {webhook.status === 'active' ? '启用' : '禁用'}
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
                            title="测试推送"
                          >
                            <Send className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openLogsDialog(webhook)} title="投递日志">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(webhook)} title="编辑">
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

      {/* 创建 Webhook 对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>添加 Webhook</DialogTitle>
            <DialogDescription>配置新的 Webhook 推送端点</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>名称 *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="例如：订单通知" />
            </div>
            <div>
              <Label>URL *</Label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} placeholder="https://your-domain.com/webhook" />
            </div>
            <div>
              <Label>订阅事件 *</Label>
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
              <Label>签名密钥（可选）</Label>
              <Input value={formSecret} onChange={e => setFormSecret(e.target.value)} placeholder="用于验证请求来源" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>重试次数</Label>
                <Input type="number" value={formRetryCount} onChange={e => setFormRetryCount(parseInt(e.target.value) || 3)} min={0} max={5} />
              </div>
              <div>
                <Label>超时时间 (ms)</Label>
                <Input type="number" value={formTimeoutMs} onChange={e => setFormTimeoutMs(parseInt(e.target.value) || 5000)} min={1000} max={30000} />
              </div>
            </div>
            <div>
              <Label>自定义请求头（JSON 格式）</Label>
              <Textarea 
                value={formHeaders} 
                onChange={e => setFormHeaders(e.target.value)} 
                placeholder='{"Authorization": "Bearer xxx"}'
                rows={3}
              />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑 Webhook</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>名称</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>URL</Label>
              <Input value={formUrl} onChange={e => setFormUrl(e.target.value)} />
            </div>
            <div>
              <Label>订阅事件</Label>
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
              <Label>签名密钥</Label>
              <Input value={formSecret} onChange={e => setFormSecret(e.target.value)} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <Label>重试次数</Label>
                <Input type="number" value={formRetryCount} onChange={e => setFormRetryCount(parseInt(e.target.value) || 3)} />
              </div>
              <div>
                <Label>超时时间 (ms)</Label>
                <Input type="number" value={formTimeoutMs} onChange={e => setFormTimeoutMs(parseInt(e.target.value) || 5000)} />
              </div>
            </div>
            <div>
              <Label>自定义请求头</Label>
              <Textarea value={formHeaders} onChange={e => setFormHeaders(e.target.value)} rows={3} />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
            <Button 
              variant="destructive" 
              className="w-full" 
              onClick={() => { setShowEditDialog(false); setShowDeleteConfirm(true); }}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              删除此 Webhook
            </Button>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEdit}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={showDeleteConfirm} onOpenChange={setShowDeleteConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除 Webhook "{selectedWebhook?.name}" 吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 投递日志对话框 */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>投递日志 - {selectedWebhook?.name}</DialogTitle>
            <DialogDescription>最近 50 条推送记录</DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">{t("加载中...", "Loading...")}</div>
            ) : deliveryLogs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("暂无投递记录", "No delivery logs")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>事件</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>响应码</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>重试</TableHead>
                    <TableHead>错误</TableHead>
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
        </DialogContent>
      </Dialog>
    </div>
  );
}
