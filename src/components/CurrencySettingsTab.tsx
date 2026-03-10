import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SettingsPageContainer } from "@/components/SettingsSection";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
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
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { Plus, Pencil, Trash2, DollarSign } from "lucide-react";
import { toast } from "sonner";
import { useLanguage } from "@/contexts/LanguageContext";
import { supabase } from "@/integrations/supabase/client";

interface Currency {
  id: string;
  code: string;
  name_zh: string;
  badge_color: string;
  sort_order: number;
  is_active: boolean;
}

export default function CurrencySettingsTab() {
  const { t } = useLanguage();
  const [currencies, setCurrencies] = useState<Currency[]>([]);
  const [loading, setLoading] = useState(true);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCurrency, setEditingCurrency] = useState<Currency | null>(null);
  const [formData, setFormData] = useState({
    code: "",
    name_zh: "",
    badge_color: "bg-gray-100 text-gray-700 border-gray-200",
    sort_order: 0,
    is_active: true,
  });

  useEffect(() => {
    fetchCurrencies();
  }, []);

  const fetchCurrencies = async () => {
    try {
      const { data, error } = await supabase
        .from("currencies")
        .select("*")
        .order("sort_order", { ascending: true });

      if (error) throw error;
      setCurrencies(data || []);
    } catch (error) {
      console.error("Failed to fetch currencies:", error);
      toast.error(t("加载币种失败", "Failed to load currencies"));
    } finally {
      setLoading(false);
    }
  };

  const handleAdd = () => {
    setEditingCurrency(null);
    setFormData({
      code: "",
      name_zh: "",
      badge_color: "bg-gray-100 text-gray-700 border-gray-200",
      sort_order: currencies.length,
      is_active: true,
    });
    setIsDialogOpen(true);
  };

  const handleEdit = (currency: Currency) => {
    setEditingCurrency(currency);
    setFormData({
      code: currency.code,
      name_zh: currency.name_zh,
      badge_color: currency.badge_color,
      sort_order: currency.sort_order,
      is_active: currency.is_active,
    });
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.code || !formData.name_zh) {
      toast.error(t("请填写所有必填字段", "Please fill in all required fields"));
      return;
    }

    try {
      if (editingCurrency) {
        const { error } = await supabase
          .from("currencies")
          .update({
            code: formData.code.toUpperCase(),
            name_zh: formData.name_zh,
            badge_color: formData.badge_color,
            sort_order: formData.sort_order,
            is_active: formData.is_active,
          })
          .eq("id", editingCurrency.id);

        if (error) throw error;
        
        // 记录操作日志
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('currency_settings', 'update', editingCurrency.id, editingCurrency, formData, `更新币种: ${formData.code}`);
        
        toast.success(t("币种已更新", "Currency updated"));
      } else {
        const { data: insertedData, error } = await supabase.from("currencies").insert({
          code: formData.code.toUpperCase(),
          name_zh: formData.name_zh,
          name_en: formData.name_zh, // Use Chinese name as default for English
          badge_color: formData.badge_color,
          sort_order: formData.sort_order,
          is_active: formData.is_active,
        }).select();

        if (error) throw error;
        
        // 记录操作日志
        const { logOperation } = await import('@/stores/auditLogStore');
        logOperation('currency_settings', 'create', insertedData?.[0]?.id || null, null, formData, `新增币种: ${formData.code}`);
        
        toast.success(t("币种已添加", "Currency added"));
      }

      setIsDialogOpen(false);
      fetchCurrencies();
    } catch (error: any) {
      console.error("Failed to save currency:", error);
      toast.error(error.message || t("保存失败", "Failed to save"));
    }
  };

  const handleDelete = async (currency: Currency) => {
    try {
      const { error } = await supabase
        .from("currencies")
        .delete()
        .eq("id", currency.id);

      if (error) throw error;
      
      // 记录操作日志
      const { logOperation } = await import('@/stores/auditLogStore');
      logOperation('currency_settings', 'delete', currency.id, currency, null, `删除币种: ${currency.code}`);
      
      toast.success(t("币种已删除", "Currency deleted"));
      fetchCurrencies();
    } catch (error: any) {
      console.error("Failed to delete currency:", error);
      toast.error(error.message || t("删除失败", "Failed to delete"));
    }
  };

  const toggleActive = async (currency: Currency) => {
    try {
      const { error } = await supabase
        .from("currencies")
        .update({ is_active: !currency.is_active })
        .eq("id", currency.id);

      if (error) throw error;
      fetchCurrencies();
    } catch (error) {
      console.error("Failed to toggle currency status:", error);
      toast.error(t("更新失败", "Failed to update"));
    }
  };

  const badgeColorOptions = [
    { label: t("橙色", "Orange"), value: "bg-orange-100 text-orange-700 border-orange-200" },
    { label: t("绿色", "Green"), value: "bg-green-100 text-green-700 border-green-200" },
    { label: t("蓝色", "Blue"), value: "bg-blue-100 text-blue-700 border-blue-200" },
    { label: t("紫色", "Purple"), value: "bg-purple-100 text-purple-700 border-purple-200" },
    { label: t("红色", "Red"), value: "bg-red-100 text-red-700 border-red-200" },
    { label: t("黄色", "Yellow"), value: "bg-yellow-100 text-yellow-700 border-yellow-200" },
    { label: t("灰色", "Gray"), value: "bg-gray-100 text-gray-700 border-gray-200" },
  ];

  return (
    <SettingsPageContainer>
    <Card className="rounded-xl shadow-sm">
      <CardHeader className="flex flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <DollarSign className="h-5 w-5" />
          {t("币种设置", "Currency Settings")}
        </CardTitle>
        <Button onClick={handleAdd} size="sm">
          <Plus className="h-4 w-4 mr-1" />
          {t("添加币种", "Add Currency")}
        </Button>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            {t("加载中...", "Loading...")}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-20">{t("排序", "Order")}</TableHead>
                <TableHead>{t("代码", "Code")}</TableHead>
                <TableHead>{t("中文名称", "Chinese Name")}</TableHead>
                <TableHead>{t("样式预览", "Style Preview")}</TableHead>
                <TableHead>{t("状态", "Status")}</TableHead>
                <TableHead className="text-right">{t("操作", "Actions")}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {currencies.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center text-muted-foreground">
                    {t("暂无币种数据", "No currency data")}
                  </TableCell>
                </TableRow>
              ) : (
                currencies.map((currency) => (
                  <TableRow key={currency.id}>
                    <TableCell>{currency.sort_order}</TableCell>
                    <TableCell className="font-mono font-medium">{currency.code}</TableCell>
                    <TableCell>{currency.name_zh}</TableCell>
                    <TableCell>
                      <Badge variant="outline" className={currency.badge_color}>
                        {currency.code}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Switch
                        checked={currency.is_active}
                        onCheckedChange={() => toggleActive(currency)}
                      />
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-2">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => handleEdit(currency)}
                        >
                          <Pencil className="h-4 w-4" />
                        </Button>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>
                                {t("确认删除", "Confirm Delete")}
                              </AlertDialogTitle>
                              <AlertDialogDescription>
                                {t(
                                  `确定要删除币种 ${currency.code} 吗？此操作无法撤销。`,
                                  `Are you sure you want to delete currency ${currency.code}? This action cannot be undone.`
                                )}
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>
                                {t("取消", "Cancel")}
                              </AlertDialogCancel>
                              <AlertDialogAction
                                onClick={() => handleDelete(currency)}
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
        )}

        <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>
                {editingCurrency
                  ? t("编辑币种", "Edit Currency")
                  : t("添加币种", "Add Currency")}
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("币种代码", "Currency Code")} *</Label>
                  <Input
                    value={formData.code}
                    onChange={(e) =>
                      setFormData({ ...formData, code: e.target.value.toUpperCase() })
                    }
                    placeholder="NGN, GHS, USDT..."
                    maxLength={10}
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("中文名称", "Chinese Name")} *</Label>
                  <Input
                    value={formData.name_zh}
                    onChange={(e) =>
                      setFormData({ ...formData, name_zh: e.target.value })
                    }
                    placeholder={t("例如：奈拉", "e.g. Naira")}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>{t("排序", "Sort Order")}</Label>
                  <Input
                    type="number"
                    value={formData.sort_order}
                    onChange={(e) =>
                      setFormData({ ...formData, sort_order: parseInt(e.target.value) || 0 })
                    }
                  />
                </div>
                <div className="space-y-2">
                  <Label>{t("标签颜色", "Badge Color")}</Label>
                  <select
                    className="w-full h-10 px-3 rounded-md border border-input bg-background"
                    value={formData.badge_color}
                    onChange={(e) =>
                      setFormData({ ...formData, badge_color: e.target.value })
                    }
                  >
                    {badgeColorOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <Label>{t("启用", "Active")}</Label>
                <Switch
                  checked={formData.is_active}
                  onCheckedChange={(checked) =>
                    setFormData({ ...formData, is_active: checked })
                  }
                />
              </div>
              <div className="pt-2">
                <Label>{t("预览", "Preview")}</Label>
                <div className="mt-2">
                  <Badge variant="outline" className={formData.badge_color}>
                    {formData.code || "CODE"}
                  </Badge>
                </div>
              </div>
            </div>
            <DialogFooter>
              <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
                {t("取消", "Cancel")}
              </Button>
              <Button onClick={handleSave}>
                {t("保存", "Save")}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
    </SettingsPageContainer>
  );
}
