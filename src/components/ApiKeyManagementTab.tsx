// ============= API Key 管理标签页 =============
import { useState } from 'react';
import { useApiKeys, ApiKey, API_PERMISSION_OPTIONS } from '@/hooks/useApiKeys';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Plus, Key, Copy, Eye, EyeOff, RefreshCw, Trash2, Settings, FileText, Clock, Globe, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { toast } from 'sonner';
import { useLanguage } from '@/contexts/LanguageContext';
import { useIsMobile, useIsTablet } from '@/hooks/use-mobile';

export function ApiKeyManagementTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const { keys, logs, loading, logsLoading, fetchLogs, createKey, updateKey, updateKeyStatus, deleteKey, regenerateKey } = useApiKeys();
  
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [showKeyDialog, setShowKeyDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showLogsDialog, setShowLogsDialog] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  
  const [newKeyVisible, setNewKeyVisible] = useState(false);
  const [generatedKey, setGeneratedKey] = useState('');
  const [selectedKey, setSelectedKey] = useState<ApiKey | null>(null);
  
  // 创建表单状态
  const [formName, setFormName] = useState('');
  const [formPermissions, setFormPermissions] = useState<string[]>([]);
  const [formIpWhitelist, setFormIpWhitelist] = useState('');
  const [formRateLimit, setFormRateLimit] = useState(60);
  const [formExpiresAt, setFormExpiresAt] = useState('');
  const [formRemark, setFormRemark] = useState('');

  const resetForm = () => {
    setFormName('');
    setFormPermissions([]);
    setFormIpWhitelist('');
    setFormRateLimit(60);
    setFormExpiresAt('');
    setFormRemark('');
  };

  const handleCreate = async () => {
    if (!formName.trim()) {
      toast.error('请输入 API Key 名称');
      return;
    }
    if (formPermissions.length === 0) {
      toast.error('请至少选择一个权限');
      return;
    }

    const ipWhitelist = formIpWhitelist.split('\n').map(ip => ip.trim()).filter(Boolean);

    const result = await createKey(formName, formPermissions, {
      ipWhitelist: ipWhitelist.length > 0 ? ipWhitelist : undefined,
      rateLimit: formRateLimit,
      expiresAt: formExpiresAt || undefined,
      remark: formRemark || undefined,
    });

    if (result.success && result.key) {
      setGeneratedKey(result.key);
      setShowCreateDialog(false);
      setShowKeyDialog(true);
      resetForm();
    }
  };

  const handleEdit = async () => {
    if (!selectedKey) return;

    const ipWhitelist = formIpWhitelist.split('\n').map(ip => ip.trim()).filter(Boolean);

    await updateKey(selectedKey.id, {
      name: formName,
      permissions: formPermissions,
      ipWhitelist: ipWhitelist.length > 0 ? ipWhitelist : null,
      rateLimit: formRateLimit,
      expiresAt: formExpiresAt || null,
      remark: formRemark || null,
    });

    setShowEditDialog(false);
  };

  const handleRegenerate = async () => {
    if (!selectedKey) return;
    const result = await regenerateKey(selectedKey.id);
    if (result.success && result.key) {
      setGeneratedKey(result.key);
      setShowKeyDialog(true);
    }
  };

  const handleDelete = async () => {
    if (!selectedKey) return;
    await deleteKey(selectedKey.id);
    setShowDeleteConfirm(false);
    setSelectedKey(null);
  };

  const openEditDialog = (key: ApiKey) => {
    setSelectedKey(key);
    setFormName(key.name);
    setFormPermissions(key.permissions);
    setFormIpWhitelist(key.ipWhitelist?.join('\n') || '');
    setFormRateLimit(key.rateLimit);
    setFormExpiresAt(key.expiresAt?.split('T')[0] || '');
    setFormRemark(key.remark || '');
    setShowEditDialog(true);
  };

  const openLogsDialog = (key: ApiKey) => {
    setSelectedKey(key);
    fetchLogs(key.id, 100);
    setShowLogsDialog(true);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('已复制到剪贴板');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-primary/10 text-primary border-primary/20">启用</Badge>;
      case 'disabled':
        return <Badge variant="secondary">禁用</Badge>;
      case 'expired':
        return <Badge variant="destructive">已过期</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getResponseStatusBadge = (status: number) => {
    if (status >= 200 && status < 300) {
      return <Badge className="bg-primary/10 text-primary border-primary/20">{status}</Badge>;
    } else if (status >= 400 && status < 500) {
      return <Badge className="bg-accent text-accent-foreground">{status}</Badge>;
    } else if (status >= 500) {
      return <Badge variant="destructive">{status}</Badge>;
    }
    return <Badge variant="outline">{status}</Badge>;
  };

  if (loading) {
    return <div className="flex items-center justify-center h-64">{t("加载中...", "Loading...")}</div>;
  }

  return (
    <div className="space-y-6">
      {/* 顶部说明卡片 */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Key className="h-5 w-5" />
            对外 API 接口管理
          </CardTitle>
          <CardDescription>
            管理第三方系统访问本平台数据的 API Key，支持权限控制、IP 白名单、频率限制和请求审计。
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              共 {keys.length} 个 API Key，其中 {keys.filter(k => k.status === 'active').length} 个启用中
            </div>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              创建 API Key
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Key 列表 */}
      {useCompactLayout ? (
        <div className="space-y-3">
          {keys.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">暂无 API Key，点击上方按钮创建</CardContent></Card>
          ) : keys.map(key => (
            <Card key={key.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm">{key.name}</span>
                  {getStatusBadge(key.status)}
                </div>
                <div className="text-xs text-muted-foreground">
                  <code className="bg-muted px-1.5 py-0.5 rounded">{key.keyPrefix}</code>
                </div>
                <div className="flex items-center justify-between text-xs text-muted-foreground">
                  <span>{key.rateLimit}/min · {key.totalRequests.toLocaleString()} {t("次", "req")}</span>
                  <span>{key.lastUsedAt ? format(new Date(key.lastUsedAt), 'MM-dd HH:mm') : '-'}</span>
                </div>
                <div className="flex items-center gap-1 pt-1 border-t">
                  <Button variant="ghost" size="sm" onClick={() => openLogsDialog(key)}><FileText className="h-3.5 w-3.5 mr-1" />{t("日志", "Logs")}</Button>
                  <Button variant="ghost" size="sm" onClick={() => openEditDialog(key)}><Settings className="h-3.5 w-3.5 mr-1" />{t("编辑", "Edit")}</Button>
                  <div className="ml-auto">
                    <Switch checked={key.status === 'active'} onCheckedChange={(checked) => updateKeyStatus(key.id, checked ? 'active' : 'disabled')} />
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
                  <TableHead>Key 前缀</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>权限</TableHead>
                  <TableHead>频率限制</TableHead>
                  <TableHead>请求次数</TableHead>
                  <TableHead>最后使用</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      暂无 API Key，点击上方按钮创建
                    </TableCell>
                  </TableRow>
                ) : (
                  keys.map(key => (
                    <TableRow key={key.id}>
                      <TableCell className="font-medium">{key.name}</TableCell>
                      <TableCell>
                        <code className="text-xs bg-muted px-2 py-1 rounded">{key.keyPrefix}</code>
                      </TableCell>
                      <TableCell>{getStatusBadge(key.status)}</TableCell>
                      <TableCell>
                        <div className="flex flex-wrap gap-1">
                          {key.permissions.includes('all') ? (
                            <Badge variant="outline" className="text-xs">全部</Badge>
                          ) : (
                            key.permissions.slice(0, 2).map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {API_PERMISSION_OPTIONS.find(o => o.value === p)?.label || p}
                              </Badge>
                            ))
                          )}
                          {key.permissions.length > 2 && !key.permissions.includes('all') && (
                            <Badge variant="outline" className="text-xs">+{key.permissions.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{key.rateLimit}/分钟</TableCell>
                      <TableCell>{key.totalRequests.toLocaleString()}</TableCell>
                      <TableCell>
                        {key.lastUsedAt ? format(new Date(key.lastUsedAt), 'MM-dd HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openLogsDialog(key)} title="查看日志">
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(key)} title="编辑">
                            <Settings className="h-4 w-4" />
                          </Button>
                          <Switch
                            checked={key.status === 'active'}
                            onCheckedChange={(checked) => updateKeyStatus(key.id, checked ? 'active' : 'disabled')}
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

      {/* API 文档说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">API 使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">认证方式</h4>
            <p className="text-sm text-muted-foreground mb-2">在请求头中添加 API Key：</p>
            <code className="block bg-muted p-3 rounded text-xs">
              X-API-Key: fast_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            </code>
          </div>
          <div>
            <h4 className="font-medium mb-2">可用接口</h4>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/members</code>
                  <span className="text-muted-foreground ml-2">获取会员列表</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/members/detail?member_code=xxx</code>
                  <span className="text-muted-foreground ml-2">获取会员详情</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/summary</code>
                  <span className="text-muted-foreground ml-2">获取活动数据汇总</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/gifts</code>
                  <span className="text-muted-foreground ml-2">获取赠送记录</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/points</code>
                  <span className="text-muted-foreground ml-2">获取积分明细</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 创建 API Key 对话框 */}
      <Dialog open={showCreateDialog} onOpenChange={setShowCreateDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>创建 API Key</DialogTitle>
            <DialogDescription>
              创建新的 API Key 用于第三方系统访问数据
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>名称 *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder="例如：合作网站A"
              />
            </div>
            <div>
              <Label>权限 *</Label>
              <div className="mt-2 space-y-2">
                {API_PERMISSION_OPTIONS.map(opt => (
                  <div key={opt.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`perm-${opt.value}`}
                      checked={formPermissions.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          if (opt.value === 'all') {
                            setFormPermissions(['all']);
                          } else {
                            setFormPermissions(prev => [...prev.filter(p => p !== 'all'), opt.value]);
                          }
                        } else {
                          setFormPermissions(prev => prev.filter(p => p !== opt.value));
                        }
                      }}
                    />
                    <div className="grid gap-0.5 leading-none">
                      <label htmlFor={`perm-${opt.value}`} className="text-sm font-medium cursor-pointer">
                        {opt.label}
                      </label>
                      <p className="text-xs text-muted-foreground">{opt.description}</p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>频率限制（次/分钟）</Label>
              <Input
                type="number"
                value={formRateLimit}
                onChange={e => setFormRateLimit(parseInt(e.target.value) || 60)}
                min={1}
                max={1000}
              />
            </div>
            <div>
              <Label>IP 白名单（可选，每行一个）</Label>
              <Textarea
                value={formIpWhitelist}
                onChange={e => setFormIpWhitelist(e.target.value)}
                placeholder="留空表示不限制 IP"
                rows={3}
              />
            </div>
            <div>
              <Label>过期时间（可选）</Label>
              <Input
                type="date"
                value={formExpiresAt}
                onChange={e => setFormExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <Label>备注</Label>
              <Input
                value={formRemark}
                onChange={e => setFormRemark(e.target.value)}
                placeholder="可选备注信息"
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>取消</Button>
            <Button onClick={handleCreate}>创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 显示新生成的 Key */}
      <Dialog open={showKeyDialog} onOpenChange={setShowKeyDialog}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              保存您的 API Key
            </DialogTitle>
            <DialogDescription>
              这是您唯一一次看到完整 API Key 的机会，请妥善保存！
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="relative">
              <Input
                type={newKeyVisible ? 'text' : 'password'}
                value={generatedKey}
                readOnly
                className="pr-20 font-mono"
              />
              <div className="absolute right-1 top-1 flex gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => setNewKeyVisible(!newKeyVisible)}
                >
                  {newKeyVisible ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7"
                  onClick={() => copyToClipboard(generatedKey)}
                >
                  <Copy className="h-4 w-4" />
                </Button>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              关闭此对话框后将无法再次查看完整 Key。如果丢失，需要重新生成。
            </p>
          </div>
          <DialogFooter>
            <Button onClick={() => { setShowKeyDialog(false); setGeneratedKey(''); setNewKeyVisible(false); }}>
              我已保存，关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>编辑 API Key</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>名称</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>权限</Label>
              <div className="mt-2 space-y-2">
                {API_PERMISSION_OPTIONS.map(opt => (
                  <div key={opt.value} className="flex items-start gap-2">
                    <Checkbox
                      id={`edit-perm-${opt.value}`}
                      checked={formPermissions.includes(opt.value)}
                      onCheckedChange={(checked) => {
                        if (checked) {
                          if (opt.value === 'all') {
                            setFormPermissions(['all']);
                          } else {
                            setFormPermissions(prev => [...prev.filter(p => p !== 'all'), opt.value]);
                          }
                        } else {
                          setFormPermissions(prev => prev.filter(p => p !== opt.value));
                        }
                      }}
                    />
                    <label htmlFor={`edit-perm-${opt.value}`} className="text-sm cursor-pointer">
                      {opt.label}
                    </label>
                  </div>
                ))}
              </div>
            </div>
            <div>
              <Label>频率限制（次/分钟）</Label>
              <Input
                type="number"
                value={formRateLimit}
                onChange={e => setFormRateLimit(parseInt(e.target.value) || 60)}
              />
            </div>
            <div>
              <Label>IP 白名单</Label>
              <Textarea
                value={formIpWhitelist}
                onChange={e => setFormIpWhitelist(e.target.value)}
                placeholder="留空表示不限制"
                rows={3}
              />
            </div>
            <div>
              <Label>过期时间</Label>
              <Input
                type="date"
                value={formExpiresAt}
                onChange={e => setFormExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <Label>备注</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleRegenerate} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                重新生成 Key
              </Button>
              <Button variant="destructive" onClick={() => { setShowEditDialog(false); setShowDeleteConfirm(true); }} className="gap-2">
                <Trash2 className="h-4 w-4" />
                删除
              </Button>
            </div>
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
              确定要删除 API Key "{selectedKey?.name}" 吗？此操作不可恢复。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteConfirm(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 请求日志对话框 */}
      <Dialog open={showLogsDialog} onOpenChange={setShowLogsDialog}>
        <DialogContent className="max-w-4xl max-h-[80vh]">
          <DialogHeader>
            <DialogTitle>请求日志 - {selectedKey?.name}</DialogTitle>
            <DialogDescription>
              最近 100 条 API 请求记录
            </DialogDescription>
          </DialogHeader>
          <ScrollArea className="h-[500px]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">{t("加载中...", "Loading...")}</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("暂无请求记录", "No request logs")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>时间</TableHead>
                    <TableHead>接口</TableHead>
                    <TableHead>状态</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>耗时</TableHead>
                    <TableHead>错误</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {logs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="text-xs">
                        {format(new Date(log.createdAt), 'MM-dd HH:mm:ss')}
                      </TableCell>
                      <TableCell>
                        <code className="text-xs">{log.endpoint}</code>
                      </TableCell>
                      <TableCell>{getResponseStatusBadge(log.responseStatus)}</TableCell>
                      <TableCell className="text-xs">{log.ipAddress}</TableCell>
                      <TableCell className="text-xs">{log.responseTimeMs}ms</TableCell>
                      <TableCell className="text-xs text-destructive">{log.errorMessage || '-'}</TableCell>
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
