import { useState, useEffect, useCallback } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
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
} from "@/components/ui/alert-dialog";
import { Plus, Trash2, Copy, RefreshCw, Loader2, Ticket } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useLanguage } from "@/contexts/LanguageContext";

interface InvitationCode {
  id: string;
  code: string;
  max_uses: number;
  used_count: number;
  is_active: boolean;
  created_by: string | null;
  created_at: string;
  expires_at: string | null;
}

export default function InvitationCodeManagement() {
  const { employee } = useAuth();
  const { t } = useLanguage();
  const [codes, setCodes] = useState<InvitationCode[]>([]);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [maxUses, setMaxUses] = useState(1);
  const [batchCount, setBatchCount] = useState(1);
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);

  const fetchCodes = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('invitation_codes')
        .select('*')
        .order('created_at', { ascending: false });

      if (error) throw error;
      setCodes(data || []);
    } catch (error) {
      console.error('Failed to fetch invitation codes:', error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCodes();
  }, [fetchCodes]);

  const handleGenerate = async () => {
    if (!employee?.is_super_admin) {
      toast.error(t('只有总管理员可以生成邀请码', 'Only super admin can generate invitation codes'));
      return;
    }

    setGenerating(true);
    try {
      const generatedCodes: string[] = [];
      
      for (let i = 0; i < batchCount; i++) {
        const { data, error } = await supabase.rpc('generate_invitation_code', {
          p_max_uses: maxUses,
          p_creator_id: employee.id,
        });

        if (error) throw error;
        if (data) generatedCodes.push(data);
      }

      toast.success(t(
        `成功生成 ${generatedCodes.length} 个邀请码`,
        `Generated ${generatedCodes.length} invitation code(s)`
      ));
      await fetchCodes();
    } catch (error: any) {
      console.error('Failed to generate invitation code:', error);
      toast.error(t('生成邀请码失败', 'Failed to generate invitation code'));
    } finally {
      setGenerating(false);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      const { error } = await supabase
        .from('invitation_codes')
        .delete()
        .eq('id', id);

      if (error) throw error;
      toast.success(t('邀请码已删除', 'Invitation code deleted'));
      setDeleteConfirm(null);
      await fetchCodes();
    } catch (error) {
      console.error('Failed to delete invitation code:', error);
      toast.error(t('删除失败', 'Delete failed'));
    }
  };

  const handleToggleActive = async (id: string, currentActive: boolean) => {
    try {
      const { error } = await supabase
        .from('invitation_codes')
        .update({ is_active: !currentActive })
        .eq('id', id);

      if (error) throw error;
      toast.success(currentActive 
        ? t('邀请码已禁用', 'Code disabled') 
        : t('邀请码已启用', 'Code enabled'));
      await fetchCodes();
    } catch (error) {
      console.error('Failed to toggle invitation code:', error);
    }
  };

  const copyToClipboard = (code: string) => {
    navigator.clipboard.writeText(code);
    toast.success(t('已复制到剪贴板', 'Copied to clipboard'));
  };

  if (!employee?.is_super_admin) {
    return (
      <Card>
        <CardContent className="py-8 text-center text-muted-foreground">
          {t('只有总管理员可以管理邀请码', 'Only super admin can manage invitation codes')}
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Ticket className="h-5 w-5" />
            {t('生成邀请码', 'Generate Invitation Codes')}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1">
              <Label>{t('可使用次数', 'Max Uses')}</Label>
              <Input
                type="number"
                min={1}
                max={100}
                value={maxUses}
                onChange={(e) => setMaxUses(Math.max(1, parseInt(e.target.value) || 1))}
                className="w-24"
              />
            </div>
            <div className="space-y-1">
              <Label>{t('生成数量', 'Batch Count')}</Label>
              <Input
                type="number"
                min={1}
                max={20}
                value={batchCount}
                onChange={(e) => setBatchCount(Math.max(1, Math.min(20, parseInt(e.target.value) || 1)))}
                className="w-24"
              />
            </div>
            <Button onClick={handleGenerate} disabled={generating}>
              {generating ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : (
                <Plus className="h-4 w-4 mr-2" />
              )}
              {t('生成', 'Generate')}
            </Button>
            <Button variant="outline" onClick={fetchCodes}>
              <RefreshCw className="h-4 w-4 mr-2" />
              {t('刷新', 'Refresh')}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span>{t('邀请码列表', 'Invitation Codes')}</span>
            <Badge variant="outline">{codes.length} {t('个', 'codes')}</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : codes.length === 0 ? (
            <p className="text-center py-8 text-muted-foreground">
              {t('暂无邀请码，请点击上方按钮生成', 'No codes yet. Click Generate above.')}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('邀请码', 'Code')}</TableHead>
                  <TableHead>{t('使用次数', 'Usage')}</TableHead>
                  <TableHead>{t('状态', 'Status')}</TableHead>
                  <TableHead>{t('创建时间', 'Created')}</TableHead>
                  <TableHead className="text-center">{t('操作', 'Actions')}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {codes.map((code) => {
                  const isExpired = code.expires_at && new Date(code.expires_at) < new Date();
                  const isUsedUp = code.used_count >= code.max_uses;
                  const isAvailable = code.is_active && !isExpired && !isUsedUp;

                  return (
                    <TableRow key={code.id} className={!isAvailable ? 'opacity-60' : ''}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono font-bold text-sm tracking-wider bg-muted px-2 py-1 rounded">
                            {code.code}
                          </code>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 w-7 p-0"
                            onClick={() => copyToClipboard(code.code)}
                          >
                            <Copy className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <span className={code.used_count >= code.max_uses ? 'text-red-500 font-medium' : ''}>
                          {code.used_count}/{code.max_uses}
                        </span>
                      </TableCell>
                      <TableCell>
                        {isExpired ? (
                          <Badge variant="outline" className="text-red-500 border-red-300">{t('已过期', 'Expired')}</Badge>
                        ) : isUsedUp ? (
                          <Badge variant="outline" className="text-orange-500 border-orange-300">{t('已用完', 'Used Up')}</Badge>
                        ) : code.is_active ? (
                          <Badge className="bg-green-500">{t('可用', 'Active')}</Badge>
                        ) : (
                          <Badge variant="outline">{t('已禁用', 'Disabled')}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="text-sm text-muted-foreground">
                        {new Date(code.created_at).toLocaleString('zh-CN')}
                      </TableCell>
                      <TableCell className="text-center">
                        <div className="flex items-center justify-center gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2"
                            onClick={() => handleToggleActive(code.id, code.is_active)}
                          >
                            {code.is_active ? t('禁用', 'Disable') : t('启用', 'Enable')}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-red-600 hover:text-red-700"
                            onClick={() => setDeleteConfirm(code.id)}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteConfirm} onOpenChange={(open) => !open && setDeleteConfirm(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t('确认删除', 'Confirm Delete')}</AlertDialogTitle>
            <AlertDialogDescription>
              {t('删除后此邀请码将无法使用，确定要删除吗？', 'This invitation code will become unusable. Are you sure?')}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>{t('取消', 'Cancel')}</AlertDialogCancel>
            <AlertDialogAction onClick={() => deleteConfirm && handleDelete(deleteConfirm)}>
              {t('确认删除', 'Delete')}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
