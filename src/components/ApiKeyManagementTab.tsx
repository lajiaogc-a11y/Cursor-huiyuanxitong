// ============= API Key 管理标签页 =============
import { useState, type Dispatch, type SetStateAction } from 'react';
import { useApiKeys, ApiKey, API_PERMISSION_GROUPS, API_PERMISSION_OPTIONS } from '@/hooks/useApiKeys';
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
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Separator } from '@/components/ui/separator';
import { Plus, Key, Copy, Eye, EyeOff, RefreshCw, Trash2, Settings, FileText, Clock, Globe, Shield, AlertTriangle } from 'lucide-react';
import { format } from 'date-fns';
import { notify } from "@/lib/notifyHub";
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
      notify.error(t('请输入 API Key 名称', 'Please enter API Key name'));
      return;
    }
    if (formPermissions.length === 0) {
      notify.error(t('请至少选择一个权限', 'Please select at least one permission'));
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
    notify.success(t('已复制到剪贴板', 'Copied to clipboard'));
  };

  const permissionLabel = (value: string) => {
    const o = API_PERMISSION_OPTIONS.find((x) => x.value === value);
    return o ? t(o.label, o.labelEn) : value;
  };

  const togglePermission = (
    value: string,
    checked: boolean,
    setFn: Dispatch<SetStateAction<string[]>>,
  ) => {
    if (checked) {
      if (value === 'all') {
        setFn(['all']);
      } else {
        setFn((prev) => [...prev.filter((p) => p !== 'all'), value]);
      }
    } else {
      setFn((prev) => prev.filter((p) => p !== value));
    }
  };

  const renderPermissionFields = (idPrefix: 'perm' | 'edit-perm') => (
    <div className="mt-2 space-y-4">
      {API_PERMISSION_GROUPS.map((group, gi) => (
        <div key={group.title} className="space-y-2">
          {gi > 0 ? <Separator className="my-1" /> : null}
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
            {t(group.title, group.titleEn)}
          </p>
          <div className="space-y-2 pl-0.5">
            {group.options.map((opt) => (
              <div key={opt.value} className="flex items-start gap-2">
                <Checkbox
                  id={`${idPrefix}-${opt.value}`}
                  checked={formPermissions.includes(opt.value)}
                  onCheckedChange={(checked) => togglePermission(opt.value, checked === true, setFormPermissions)}
                />
                <div className="grid gap-0.5 leading-none">
                  <label htmlFor={`${idPrefix}-${opt.value}`} className="text-sm font-medium cursor-pointer">
                    {t(opt.label, opt.labelEn)}
                  </label>
                  <p className="text-xs text-muted-foreground">{t(opt.description, opt.descriptionEn)}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'active':
        return <Badge className="bg-primary/10 text-primary border-primary/20">{t("启用", "Active")}</Badge>;
      case 'disabled':
        return <Badge variant="secondary">{t("禁用", "Disabled")}</Badge>;
      case 'expired':
        return <Badge variant="destructive">{t("已过期", "Expired")}</Badge>;
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
            {t("对外 API 接口管理", "External API")}
          </CardTitle>
          <CardDescription>
            {t("管理第三方系统访问本平台数据的 API Key，支持权限控制、IP 白名单、频率限制和请求审计。", "Manage API Keys for third-party access. Supports permission control, IP whitelist, rate limiting, and request auditing.")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              {t(`共 ${keys.length} 个 API Key，其中 ${keys.filter(k => k.status === 'active').length} 个启用中`, `${keys.length} API Keys total, ${keys.filter(k => k.status === 'active').length} active`)}
            </div>
            <Button onClick={() => { resetForm(); setShowCreateDialog(true); }}>
              <Plus className="h-4 w-4 mr-2" />
              {t("创建 API Key", "Create API Key")}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* API Key 列表 */}
      {useCompactLayout ? (
        <div className="space-y-3">
          {keys.length === 0 ? (
            <Card><CardContent className="py-8 text-center text-muted-foreground">{t("暂无 API Key，点击上方按钮创建", "No API Keys yet, click above to create")}</CardContent></Card>
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
                  <TableHead>{t("名称", "Name")}</TableHead>
                  <TableHead>{t("Key 前缀", "Key Prefix")}</TableHead>
                  <TableHead>{t("状态", "Status")}</TableHead>
                  <TableHead>{t("权限", "Permissions")}</TableHead>
                  <TableHead>{t("频率限制", "Rate Limit")}</TableHead>
                  <TableHead>{t("请求次数", "Requests")}</TableHead>
                  <TableHead>{t("最后使用", "Last Used")}</TableHead>
                  <TableHead className="text-right">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {keys.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center py-8 text-muted-foreground">
                      {t("暂无 API Key，点击上方按钮创建", "No API Keys yet, click above to create")}
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
                            <Badge variant="outline" className="text-xs">{t("全部", "All")}</Badge>
                          ) : (
                            key.permissions.slice(0, 2).map(p => (
                              <Badge key={p} variant="outline" className="text-xs">
                                {permissionLabel(p)}
                              </Badge>
                            ))
                          )}
                          {key.permissions.length > 2 && !key.permissions.includes('all') && (
                            <Badge variant="outline" className="text-xs">+{key.permissions.length - 2}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell>{key.rateLimit}/{t("分钟", "min")}</TableCell>
                      <TableCell>{key.totalRequests.toLocaleString()}</TableCell>
                      <TableCell>
                        {key.lastUsedAt ? format(new Date(key.lastUsedAt), 'MM-dd HH:mm') : '-'}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button variant="ghost" size="icon" onClick={() => openLogsDialog(key)} title={t("查看日志", "View Logs")}>
                            <FileText className="h-4 w-4" />
                          </Button>
                          <Button variant="ghost" size="icon" onClick={() => openEditDialog(key)} title={t("编辑", "Edit")}>
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
          <CardTitle className="text-base">{t("API 使用说明", "API Usage Guide")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <h4 className="font-medium mb-2">{t("认证方式", "Authentication")}</h4>
            <p className="text-sm text-muted-foreground mb-2">{t("在请求头中添加 API Key：", "Add API Key in request header:")}</p>
            <code className="block bg-muted p-3 rounded text-xs">
              X-API-Key: fast_xxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
            </code>
          </div>
          <div>
            <h4 className="font-medium mb-2">{t("可用接口", "Available Endpoints")}</h4>
            <div className="grid gap-2 text-sm">
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/members</code>
                  <span className="text-muted-foreground ml-2">{t("获取会员列表", "Get member list")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/members/detail?member_code=xxx</code>
                  <span className="text-muted-foreground ml-2">{t("获取会员详情", "Get member details")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/summary</code>
                  <span className="text-muted-foreground ml-2">{t("获取活动数据汇总", "Get activity summary")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/gifts</code>
                  <span className="text-muted-foreground ml-2">{t("获取赠送记录", "Get gift records")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/activity/points</code>
                  <span className="text-muted-foreground ml-2">{t("获取积分明细", "Get points details")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/orders</code>
                  <span className="text-muted-foreground ml-2">{t("订单列表与统计等（见 API 文档页）", "Orders list & stats (see API Docs tab)")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/merchants/vendors</code>
                  <span className="text-muted-foreground ml-2">{t("卡商列表", "Card vendors")}</span>
                </div>
              </div>
              <div className="flex items-start gap-2">
                <Badge variant="outline" className="shrink-0">GET</Badge>
                <div>
                  <code className="text-xs">/external-api/referrals</code>
                  <span className="text-muted-foreground ml-2">{t("推荐关系", "Referrals")}</span>
                </div>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <DrawerDetail
        open={showCreateDialog}
        onOpenChange={setShowCreateDialog}
        title={t("创建 API Key", "Create API Key")}
        description={t("创建新的 API Key 用于第三方系统访问数据", "Create a new API Key for third-party data access")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div>
              <Label>{t("名称", "Name")} *</Label>
              <Input
                value={formName}
                onChange={e => setFormName(e.target.value)}
                placeholder={t("例如：合作网站A", "e.g. Partner Website A")}
              />
            </div>
            <div>
              <Label>{t("权限", "Permissions")} *</Label>
              {renderPermissionFields('perm')}
            </div>
            <div>
              <Label>{t("频率限制（次/分钟）", "Rate Limit (req/min)")}</Label>
              <Input
                type="number"
                value={formRateLimit}
                onChange={e => setFormRateLimit(parseInt(e.target.value) || 60)}
                min={1}
                max={1000}
              />
            </div>
            <div>
              <Label>{t("IP 白名单（可选，每行一个）", "IP Whitelist (Optional, one per line)")}</Label>
              <Textarea
                value={formIpWhitelist}
                onChange={e => setFormIpWhitelist(e.target.value)}
                placeholder={t("留空表示不限制 IP", "Leave empty for no IP restriction")}
                rows={3}
              />
            </div>
            <div>
              <Label>{t("过期时间（可选）", "Expiry Date (Optional)")}</Label>
              <Input
                type="date"
                value={formExpiresAt}
                onChange={e => setFormExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("备注", "Remark")}</Label>
              <Input
                value={formRemark}
                onChange={e => setFormRemark(e.target.value)}
                placeholder={t("可选备注信息", "Optional notes")}
              />
            </div>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button variant="outline" onClick={() => setShowCreateDialog(false)}>{t("取消", "Cancel")}</Button>
            <Button onClick={handleCreate}>{t("创建", "Create")}</Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={showKeyDialog}
        onOpenChange={setShowKeyDialog}
        title={
          <span className="flex items-center gap-2">
            <AlertTriangle className="h-5 w-5 text-amber-500 shrink-0" />
            {t("保存您的 API Key", "Save Your API Key")}
          </span>
        }
        description={t("这是您唯一一次看到完整 API Key 的机会，请妥善保存！", "This is the only time you can see the full API Key. Please save it safely!")}
        sheetMaxWidth="xl"
      >
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
              {t("关闭此对话框后将无法再次查看完整 Key。如果丢失，需要重新生成。", "You won't be able to see the full Key after closing this dialog. If lost, you'll need to regenerate.")}
            </p>
          </div>
          <div className="flex flex-wrap justify-end gap-2 pt-4 mt-4 border-t border-border">
            <Button onClick={() => { setShowKeyDialog(false); setGeneratedKey(''); setNewKeyVisible(false); }}>
              {t("我已保存，关闭", "I've saved it, close")}
            </Button>
          </div>
      </DrawerDetail>

      <DrawerDetail
        open={showEditDialog}
        onOpenChange={setShowEditDialog}
        title={t("编辑 API Key", "Edit API Key")}
        sheetMaxWidth="xl"
      >
          <div className="space-y-4">
            <div>
              <Label>{t("名称", "Name")}</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} />
            </div>
            <div>
              <Label>{t("权限", "Permissions")}</Label>
              {renderPermissionFields('edit-perm')}
            </div>
            <div>
              <Label>{t("频率限制（次/分钟）", "Rate Limit (req/min)")}</Label>
              <Input
                type="number"
                value={formRateLimit}
                onChange={e => setFormRateLimit(parseInt(e.target.value) || 60)}
              />
            </div>
            <div>
              <Label>{t("IP 白名单", "IP Whitelist")}</Label>
              <Textarea
                value={formIpWhitelist}
                onChange={e => setFormIpWhitelist(e.target.value)}
                placeholder={t("留空表示不限制", "Leave empty for no restriction")}
                rows={3}
              />
            </div>
            <div>
              <Label>{t("过期时间", "Expiry Date")}</Label>
              <Input
                type="date"
                value={formExpiresAt}
                onChange={e => setFormExpiresAt(e.target.value)}
              />
            </div>
            <div>
              <Label>{t("备注", "Remark")}</Label>
              <Input value={formRemark} onChange={e => setFormRemark(e.target.value)} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button variant="outline" onClick={handleRegenerate} className="gap-2">
                <RefreshCw className="h-4 w-4" />
                {t("重新生成 Key", "Regenerate Key")}
              </Button>
              <Button variant="destructive" onClick={() => { setShowEditDialog(false); setShowDeleteConfirm(true); }} className="gap-2">
                <Trash2 className="h-4 w-4" />
                {t("删除", "Delete")}
              </Button>
            </div>
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
              {t(`确定要删除 API Key "${selectedKey?.name}" 吗？此操作不可恢复。`, `Are you sure you want to delete API Key "${selectedKey?.name}"? This action cannot be undone.`)}
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
            {t("请求日志", "Request Logs")}
            {selectedKey?.name ? ` — ${selectedKey.name}` : ''}
          </>
        }
        description={t("最近 100 条 API 请求记录", "Last 100 API request records")}
        sheetMaxWidth="4xl"
      >
          <ScrollArea className="h-[min(500px,55vh)]">
            {logsLoading ? (
              <div className="flex items-center justify-center py-8">{t("加载中...", "Loading...")}</div>
            ) : logs.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">{t("暂无请求记录", "No request logs")}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t("时间", "Time")}</TableHead>
                    <TableHead>{t("接口", "Endpoint")}</TableHead>
                    <TableHead>{t("状态", "Status")}</TableHead>
                    <TableHead>IP</TableHead>
                    <TableHead>{t("耗时", "Duration")}</TableHead>
                    <TableHead>{t("错误", "Error")}</TableHead>
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
      </DrawerDetail>
    </div>
  );
}
