import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { UserPlus, Plus, Trash2, Pencil, Check, X } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { useIsMobile, useIsTablet } from "@/hooks/use-mobile";
import {
  getCustomerSources,
  initializeCustomerSourceCache,
  saveCustomerSources,
  addCustomerSource,
  updateCustomerSource,
  deleteCustomerSource,
  CustomerSource,
} from "@/stores/customerSourceStore";

export default function CustomerSourceSettingsTab() {
  const { t } = useLanguage();
  const isMobile = useIsMobile();
  const isTablet = useIsTablet();
  const useCompactLayout = isMobile || isTablet;
  const [sources, setSources] = useState<CustomerSource[]>([]);
  const [newSourceName, setNewSourceName] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState("");

  useEffect(() => {
    void loadSources();
  }, []);

  const loadSources = async () => {
    await initializeCustomerSourceCache();
    const loaded = getCustomerSources();
    setSources(loaded.sort((a, b) => a.sortOrder - b.sortOrder));
  };

  const [isAdding, setIsAdding] = useState(false);

  const handleAddSource = async () => {
    const trimmedName = newSourceName.trim();
    
    if (!trimmedName) {
      toast.error(t("请输入来源名称", "Please enter source name"));
      return;
    }

    if (isAdding) return;
    setIsAdding(true);

    try {
      await initializeCustomerSourceCache();
      const latestSources = getCustomerSources();
      
      if (latestSources.some(s => s.name.toLowerCase() === trimmedName.toLowerCase())) {
        toast.error(t("该来源名称已存在", "This source name already exists"));
        return;
      }

      const result = await addCustomerSource(trimmedName);
      if (result) {
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('customer_source', 'create', result.id || null, null, { name: trimmedName }, `新增客户来源: ${trimmedName}`);
        
        setNewSourceName("");
        await loadSources();
        toast.success(t("来源已添加", "Source added"));
      } else {
        toast.error(t("添加失败，该名称可能已存在", "Failed to add, name may already exist"));
      }
    } catch (error: any) {
      if (error?.code === '23505' || error?.message?.includes('duplicate')) {
        toast.error(t("该来源名称已存在", "This source name already exists"));
      } else {
        toast.error(t("添加失败，请重试", "Failed to add, please try again"));
      }
    } finally {
      setIsAdding(false);
    }
  };

  const handleStartEdit = (source: CustomerSource) => {
    setEditingId(source.id);
    setEditingName(source.name);
  };

  const handleSaveEdit = async () => {
    if (!editingName.trim()) {
      toast.error(t("名称不能为空", "Name cannot be empty"));
      return;
    }

    const oldSource = sources.find(s => s.id === editingId);
    if (sources.some(s => s.id !== editingId && s.name === editingName.trim())) {
      toast.error(t("该来源名称已存在", "This source name already exists"));
      return;
    }

    await updateCustomerSource(editingId!, { name: editingName.trim() });
    
    const { logOperation } = await import('@/stores/auditLogStore');
    logOperation('customer_source', 'update', editingId!, { name: oldSource?.name }, { name: editingName.trim() }, `更新客户来源: ${editingName.trim()}`);
    
    setEditingId(null);
    setEditingName("");
    await loadSources();
    toast.success(t("来源已更新", "Source updated"));
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditingName("");
  };

  const handleToggleActive = (id: string, isActive: boolean) => {
    void updateCustomerSource(id, { isActive }).then(() => loadSources());
    toast.success(isActive ? t("来源已启用", "Source enabled") : t("来源已禁用", "Source disabled"));
  };

  const handleDelete = async (id: string) => {
    const source = sources.find(s => s.id === id);
    const success = await deleteCustomerSource(id);
    
    if (!success) {
      toast.error(t("删除失败，可能有会员正在使用该来源", "Delete failed, members may be using this source"));
      return;
    }
    
    const { logOperation } = await import('@/stores/auditLogStore');
    logOperation('customer_source', 'delete', id, source, null, `删除客户来源: ${source?.name || id}`);
    
    await loadSources();
    toast.success(t("来源已删除", "Source deleted"));
  };

  const handleMoveUp = (index: number) => {
    if (index === 0) return;
    const newSources = [...sources];
    [newSources[index - 1], newSources[index]] = [newSources[index], newSources[index - 1]];
    newSources.forEach((s, i) => {
      s.sortOrder = i + 1;
    });
    saveCustomerSources(newSources);
    loadSources();
  };

  const handleMoveDown = (index: number) => {
    if (index === sources.length - 1) return;
    const newSources = [...sources];
    [newSources[index], newSources[index + 1]] = [newSources[index + 1], newSources[index]];
    newSources.forEach((s, i) => {
      s.sortOrder = i + 1;
    });
    saveCustomerSources(newSources);
    loadSources();
  };

  return (
    <SettingsPageContainer>
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="pb-4">
        <CardTitle className="text-lg flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          {t("客户来源设置", "Customer Source Settings")}
        </CardTitle>
        <p className="text-sm text-muted-foreground mt-1">
          {t(
            "配置客户来源渠道，用于标记会员的获取来源",
            "Configure customer source channels to tag member acquisition sources"
          )}
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* 新增来源 */}
        <div className="flex items-end gap-3">
          <div className="flex-1 space-y-1">
            <Label className="text-sm">{t("新增来源渠道", "Add Source Channel")}</Label>
            <Input
              value={newSourceName}
              onChange={(e) => setNewSourceName(e.target.value)}
              placeholder={t("例如：社交媒体、线下活动", "e.g., Social Media, Offline Event")}
              onKeyDown={(e) => e.key === "Enter" && handleAddSource()}
            />
          </div>
          <Button onClick={handleAddSource} className="gap-1" disabled={isAdding}>
            <Plus className="h-4 w-4" />
            {isAdding ? t("添加中...", "Adding...") : t("添加", "Add")}
          </Button>
        </div>

        {/* 来源列表 */}
        {useCompactLayout ? (
          /* Card-based list for mobile/tablet */
          <div className="space-y-2">
            {sources.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground border rounded-lg">
                {t("暂无来源数据，请添加", "No sources yet, please add")}
              </div>
            ) : (
              sources.map((source, index) => (
                <div key={source.id} className="border rounded-lg p-3 space-y-2">
                  {editingId === source.id ? (
                    <div className="flex items-center gap-2">
                      <Input
                        value={editingName}
                        onChange={(e) => setEditingName(e.target.value)}
                        className="h-9 flex-1"
                        autoFocus
                        onKeyDown={(e) => {
                          if (e.key === "Enter") handleSaveEdit();
                          if (e.key === "Escape") handleCancelEdit();
                        }}
                      />
                      <Button variant="ghost" size="icon" className="h-9 w-9 text-green-600 shrink-0" onClick={handleSaveEdit}>
                        <Check className="h-4 w-4" />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-9 w-9 shrink-0" onClick={handleCancelEdit}>
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  ) : (
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{source.name}</span>
                      <Switch
                        checked={source.isActive}
                        onCheckedChange={(checked) => handleToggleActive(source.id, checked)}
                      />
                    </div>
                  )}
                  {editingId !== source.id && (
                    <div className="flex items-center gap-1 pt-1 border-t">
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleMoveUp(index)} disabled={index === 0}>↑</Button>
                      <Button variant="ghost" size="sm" className="h-8 px-2" onClick={() => handleMoveDown(index)} disabled={index === sources.length - 1}>↓</Button>
                      <div className="ml-auto flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleStartEdit(source)} disabled={editingId !== null}>
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(
                                  `确定要删除来源"${source.name}"吗？此操作不可恢复。`,
                                  `Are you sure you want to delete source "${source.name}"? This action cannot be undone.`
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(source.id)}
                                className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                              >
                                {t("删除", "Delete")}
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </div>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        ) : (
          /* Desktop table */
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-[60px]">{t("排序", "Order")}</TableHead>
                  <TableHead>{t("来源名称", "Source Name")}</TableHead>
                  <TableHead className="w-[100px]">{t("状态", "Status")}</TableHead>
                  <TableHead className="w-[120px] text-center">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {sources.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8 text-muted-foreground">
                      {t("暂无来源数据，请添加", "No sources yet, please add")}
                    </TableCell>
                  </TableRow>
                ) : (
                  sources.map((source, index) => (
                    <TableRow key={source.id}>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveUp(index)} disabled={index === 0}>↑</Button>
                          <Button variant="ghost" size="icon" className="h-6 w-6" onClick={() => handleMoveDown(index)} disabled={index === sources.length - 1}>↓</Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        {editingId === source.id ? (
                          <div className="flex items-center gap-2">
                            <Input
                              value={editingName}
                              onChange={(e) => setEditingName(e.target.value)}
                              className="h-8 w-40"
                              autoFocus
                              onKeyDown={(e) => {
                                if (e.key === "Enter") handleSaveEdit();
                                if (e.key === "Escape") handleCancelEdit();
                              }}
                            />
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-green-600" onClick={handleSaveEdit}>
                              <Check className="h-4 w-4" />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleCancelEdit}>
                              <X className="h-4 w-4" />
                            </Button>
                          </div>
                        ) : (
                          <span className="font-medium">{source.name}</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Switch
                          checked={source.isActive}
                          onCheckedChange={(checked) => handleToggleActive(source.id, checked)}
                        />
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center justify-center gap-1">
                          <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleStartEdit(source)} disabled={editingId !== null}>
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <AlertDialog>
                            <AlertDialogTrigger asChild>
                              <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive">
                                <Trash2 className="h-4 w-4" />
                              </Button>
                            </AlertDialogTrigger>
                            <AlertDialogContent>
                              <AlertDialogHeader>
                                <AlertDialogTitle>{t("确认删除", "Confirm Delete")}</AlertDialogTitle>
                                <AlertDialogDescription>
                                  {t(
                                    `确定要删除来源"${source.name}"吗？此操作不可恢复。`,
                                    `Are you sure you want to delete source "${source.name}"? This action cannot be undone.`
                                  )}
                                </AlertDialogDescription>
                              </AlertDialogHeader>
                              <AlertDialogFooter>
                                <AlertDialogCancel>{t("取消", "Cancel")}</AlertDialogCancel>
                                <AlertDialogAction
                                  onClick={() => handleDelete(source.id)}
                                  className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                >
                                  {t("删除", "Delete")}
                                </AlertDialogAction>
                              </AlertDialogFooter>
                            </AlertDialogContent>
                          </AlertDialog>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}

        {/* 说明 */}
        <div className="text-xs text-muted-foreground p-3 bg-muted/30 rounded-lg">
          💡 {t(
            "客户来源用于标记会员的获取渠道。在汇率计算页面填写客户信息时可选择来源，数据将同步到会员管理。",
            "Customer sources are used to tag member acquisition channels. Select source when filling customer info in exchange rate page, data syncs to member management."
          )}
        </div>
      </CardContent>
    </Card>
    </SettingsPageContainer>
  );
}
