import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Plus, Pencil, Trash2, Globe, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { 
  Country,
  getCountriesAsync,
  addCountryAsync,
  updateCountryAsync,
  deleteCountryAsync,
} from "@/stores/systemSettings";
import { useLanguage } from "@/contexts/LanguageContext";
import { subscribeToSharedData } from "@/services/finance/sharedDataService";
export default function ExchangeRateSettingsTab() {
  const { t } = useLanguage();
  const [countries, setCountries] = useState<Country[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isCountryDialogOpen, setIsCountryDialogOpen] = useState(false);
  const [newCountryName, setNewCountryName] = useState("");
  const [newCountryRemark, setNewCountryRemark] = useState("");
  const [editingCountry, setEditingCountry] = useState<Country | null>(null);

  // 从数据库加载最新数据
  const loadCountries = useCallback(async () => {
    try {
      setIsLoading(true);
      const data = await getCountriesAsync();
      setCountries(data);
    } catch (error) {
      console.error('Failed to load countries:', error);
      toast.error(t("加载国家数据失败", "Failed to load countries"));
    } finally {
      setIsLoading(false);
    }
  }, [t]);

  // 初始加载
  useEffect(() => {
    loadCountries();
  }, [loadCountries]);

  // 订阅实时变更（其他用户的修改）
  useEffect(() => {
    const unsubscribe = subscribeToSharedData((key, value) => {
      if (key === 'countries' && !isSaving) {
        // 只在非保存状态下接受外部更新，避免覆盖本地操作
        setCountries(value as Country[]);
        toast.info(t("国家数据已被其他用户更新", "Country data updated by another user"));
      }
    });

    return unsubscribe;
  }, [t, isSaving]);

  // 添加国家 - Save-First Pattern
  const handleAddCountry = async () => {
    if (!newCountryName.trim()) {
      toast.error(t("请输入国家名称", "Please enter country name"));
      return;
    }

    setIsSaving(true);
    try {
      const newCountry = await addCountryAsync(newCountryName.trim(), newCountryRemark.trim());
      
      if (newCountry) {
        // 成功后重新加载最新数据
        await loadCountries();
        setNewCountryName("");
        setNewCountryRemark("");
        setIsCountryDialogOpen(false);
        toast.success(t("国家添加成功", "Country added"));
      } else {
        toast.error(t("添加失败，请重试", "Failed to add, please retry"));
      }
    } catch (error) {
      console.error('Failed to add country:', error);
      toast.error(t("添加失败", "Failed to add"));
    } finally {
      setIsSaving(false);
    }
  };

  // 更新国家 - Save-First Pattern
  const handleUpdateCountry = async () => {
    if (!editingCountry || !editingCountry.name.trim()) {
      toast.error(t("请输入国家名称", "Please enter country name"));
      return;
    }

    setIsSaving(true);
    try {
      const success = await updateCountryAsync(
        editingCountry.id, 
        editingCountry.name.trim(), 
        editingCountry.remark
      );
      
      if (success) {
        // 成功后重新加载最新数据
        await loadCountries();
        setEditingCountry(null);
        toast.success(t("国家更新成功", "Country updated"));
      } else {
        toast.error(t("更新失败，可能已被删除", "Failed to update, might be deleted"));
      }
    } catch (error) {
      console.error('Failed to update country:', error);
      toast.error(t("更新失败", "Failed to update"));
    } finally {
      setIsSaving(false);
    }
  };

  // 删除国家 - Save-First Pattern
  const handleDeleteCountry = async (id: string) => {
    setIsSaving(true);
    try {
      const success = await deleteCountryAsync(id);
      
      if (success) {
        // 成功后重新加载最新数据
        await loadCountries();
        toast.success(t("国家删除成功", "Country deleted"));
      } else {
        toast.error(t("删除失败，请重试", "Failed to delete, please retry"));
      }
    } catch (error) {
      console.error('Failed to delete country:', error);
      toast.error(t("删除失败", "Failed to delete"));
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <SettingsPageContainer>
      {/* 国家管理 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Globe className="h-5 w-5" />
            {t("汇率设置 - 国家管理", "Rate Settings - Country Management")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex justify-end">
            <Button 
              size="sm" 
              onClick={() => setIsCountryDialogOpen(true)} 
              className="gap-1"
              disabled={isSaving}
            >
              <Plus className="h-4 w-4" />
              {t("添加国家", "Add Country")}
            </Button>
          </div>
          
          <div className="border rounded-lg overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50">
                  <TableHead className="w-16 text-center">{t("序号", "No.")}</TableHead>
                  <TableHead>{t("国家名称", "Country Name")}</TableHead>
                  <TableHead>{t("备注", "Remark")}</TableHead>
                  <TableHead className="w-24 text-center">{t("操作", "Actions")}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center py-8">
                      <Loader2 className="h-5 w-5 animate-spin mx-auto" />
                    </TableCell>
                  </TableRow>
                ) : countries.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={4} className="text-center text-muted-foreground py-8">
                      {t("暂无国家数据", "No countries")}
                    </TableCell>
                  </TableRow>
                ) : (
                  countries.map((country, index) => (
                    <TableRow key={country.id}>
                      <TableCell className="text-center font-medium text-muted-foreground">{index + 1}</TableCell>
                      <TableCell className="font-medium">{country.name}</TableCell>
                      <TableCell className="text-muted-foreground">{country.remark || "-"}</TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8"
                            onClick={() => setEditingCountry(country)}
                            disabled={isSaving}
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button 
                            variant="ghost" 
                            size="icon" 
                            className="h-8 w-8 text-destructive"
                            onClick={() => handleDeleteCountry(country.id)}
                            disabled={isSaving}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Add Country Dialog */}
      <Dialog open={isCountryDialogOpen} onOpenChange={setIsCountryDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("添加国家", "Add Country")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("国家名称", "Country Name")}</Label>
              <Input 
                value={newCountryName}
                onChange={(e) => setNewCountryName(e.target.value)}
                placeholder={t("请输入国家名称", "Enter country name")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea 
                value={newCountryRemark}
                onChange={(e) => setNewCountryRemark(e.target.value)}
                placeholder={t("请输入备注（可选）", "Enter remark (optional)")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsCountryDialogOpen(false)} disabled={isSaving}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleAddCountry} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("添加", "Add")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Country Dialog */}
      <Dialog open={!!editingCountry} onOpenChange={(open) => !open && setEditingCountry(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("编辑国家", "Edit Country")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>{t("国家名称", "Country Name")}</Label>
              <Input 
                value={editingCountry?.name || ""}
                onChange={(e) => setEditingCountry(prev => prev ? { ...prev, name: e.target.value } : null)}
                placeholder={t("请输入国家名称", "Enter country name")}
              />
            </div>
            <div className="space-y-2">
              <Label>{t("备注", "Remark")}</Label>
              <Textarea 
                value={editingCountry?.remark || ""}
                onChange={(e) => setEditingCountry(prev => prev ? { ...prev, remark: e.target.value } : null)}
                placeholder={t("请输入备注（可选）", "Enter remark (optional)")}
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingCountry(null)} disabled={isSaving}>
              {t("取消", "Cancel")}
            </Button>
            <Button onClick={handleUpdateCountry} disabled={isSaving}>
              {isSaving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {t("保存", "Save")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </SettingsPageContainer>
  );
}