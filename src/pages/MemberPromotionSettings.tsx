import { useCallback, useEffect, useMemo, useState } from 'react';
import { trackRender } from '@/lib/performanceUtils';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { toast } from 'sonner';
import { Loader2, Plus, Trash2 } from 'lucide-react';
import { ConfirmDialog } from '@/components/dialogs/ConfirmDialog';
import { useLanguage } from '@/contexts/LanguageContext';
import { useAuth } from '@/contexts/AuthContext';
import { useTenantView } from '@/contexts/TenantViewContext';
import { useIsPlatformAdminViewingTenant } from '@/hooks/useIsPlatformAdminViewingTenant';
import {
  fetchMemberLevelsApi,
  saveMemberLevelsApi,
  type MemberLevelRuleDTO,
} from '@/services/members/memberLevelsApi';

type EditableRule = Omit<MemberLevelRuleDTO, 'id' | 'tenant_id'> & { id?: string };

export interface MemberPromotionSettingsPageProps {
  /** 嵌入系统设置页时省略大标题与外层留白，由外层卡片承接 */
  embedded?: boolean;
}

export default function MemberPromotionSettingsPage({ embedded = false }: MemberPromotionSettingsPageProps) {
  trackRender('MemberPromotionSettings');
  const { t } = useLanguage();
  const { employee } = useAuth();
  const { viewingTenantId } = useTenantView() || {};
  const isReadonlyView = useIsPlatformAdminViewingTenant();

  const tenantId = useMemo(() => {
    if (employee?.is_platform_super_admin) {
      return viewingTenantId || employee?.tenant_id || null;
    }
    return viewingTenantId || employee?.tenant_id || null;
  }, [employee?.is_platform_super_admin, employee?.tenant_id, viewingTenantId]);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [rows, setRows] = useState<EditableRule[]>([]);

  const load = useCallback(async () => {
    if (!tenantId) {
      setRows([]);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const data = await fetchMemberLevelsApi(tenantId);
      setRows(
        (data || []).map((r) => ({
          id: r.id,
          level_name: r.level_name,
          required_points: Number(r.required_points) || 0,
          level_order: Number(r.level_order) || 0,
          rate_bonus: r.rate_bonus ?? null,
          priority_level: r.priority_level ?? null,
        })),
      );
    } catch (e) {
      console.error(e);
      toast.error(t('加载等级规则失败', 'Failed to load level rules'));
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [tenantId, t]);

  useEffect(() => {
    void load();
  }, [load]);

  const addRow = () => {
    const nextOrder = rows.length ? Math.max(...rows.map((r) => r.level_order)) + 1 : 1;
    setRows([
      ...rows,
      {
        level_name: '',
        required_points: 0,
        level_order: nextOrder,
        rate_bonus: null,
        priority_level: null,
      },
    ]);
  };

  const removeRow = (index: number) => {
    setRows(rows.filter((_, i) => i !== index));
  };

  const save = async () => {
    if (!tenantId || isReadonlyView) {
      toast.error(t('只读视图下无法保存', 'Cannot save in read-only view'));
      return;
    }
    const cleaned = rows
      .map((r, i) => ({
        level_name: String(r.level_name || '').trim() || `Level ${i + 1}`,
        required_points: Math.max(0, Number(r.required_points) || 0),
        level_order: Number(r.level_order) || i + 1,
        rate_bonus:
          r.rate_bonus != null && String(r.rate_bonus) !== '' && Number.isFinite(Number(r.rate_bonus))
            ? Number(r.rate_bonus)
            : null,
        priority_level:
          r.priority_level != null &&
          String(r.priority_level) !== '' &&
          Number.isFinite(Number(r.priority_level))
            ? Number(r.priority_level)
            : null,
      }))
      .sort((a, b) => a.level_order - b.level_order || a.required_points - b.required_points);

    if (cleaned.length === 0) {
      toast.error(t('至少保留一条等级', 'Keep at least one level'));
      return;
    }

    setSaving(true);
    try {
      await saveMemberLevelsApi(tenantId, cleaned);
      toast.success(t('已保存并重新计算会员等级', 'Saved and recalculated member levels'));
      await load();
    } catch (e) {
      console.error(e);
      toast.error(t('保存失败', 'Save failed'));
    } finally {
      setSaving(false);
    }
  };

  if (!tenantId) {
    return (
      <div className={embedded ? "py-2" : "p-6"}>
        <p className="text-muted-foreground text-sm">
          {t('请先选择租户（平台总管理）或确保已登录租户账号', 'Select a tenant or sign in with a tenant account')}
        </p>
      </div>
    );
  }

  return (
    <div
      className={
        embedded
          ? "flex flex-col gap-4 max-w-5xl mx-auto"
          : "flex flex-col gap-4 p-4 md:p-6 max-w-5xl mx-auto"
      }
    >
      {!embedded && (
        <div>
          <h1 className="text-xl font-semibold">{t('会员等级', 'Member levels')}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t(
              '按累计积分自动匹配等级；保存后将按新规则全量重算本租户会员的 current_level。',
              'Levels match lifetime total points; saving recalculates all members in this tenant.',
            )}
          </p>
        </div>
      )}
      {embedded && (
        <p className="text-sm text-muted-foreground">
          {t(
            '按累计积分自动匹配等级；保存后将按新规则全量重算本租户会员等级。',
            'Levels match lifetime total points; saving recalculates all members in this tenant.',
          )}
        </p>
      )}

      <Card>
        <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
          <CardTitle className="text-base">{t('等级规则', 'Level rules')}</CardTitle>
          <div className="flex gap-2">
            <Button type="button" variant="outline" size="sm" onClick={addRow} disabled={isReadonlyView || loading}>
              <Plus className="h-4 w-4 mr-1" />
              {t('添加', 'Add')}
            </Button>
            <Button type="button" size="sm" onClick={() => void save()} disabled={isReadonlyView || loading || saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : t('保存', 'Save')}
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-12 text-muted-foreground">
              <Loader2 className="h-8 w-8 animate-spin" />
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t('排序', 'Order')}</TableHead>
                  <TableHead>{t('等级名称', 'Name')}</TableHead>
                  <TableHead>{t('所需累计积分', 'Points required')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('汇率加成(预留)', 'Rate bonus')}</TableHead>
                  <TableHead className="hidden md:table-cell">{t('优先级(预留)', 'Priority')}</TableHead>
                  <TableHead className="w-[60px]" />
                </TableRow>
              </TableHeader>
              <TableBody>
                {rows.map((r, i) => (
                  <TableRow key={r.id || `new-${i}`}>
                    <TableCell className="w-24">
                      <Input
                        type="number"
                        value={r.level_order}
                        onChange={(e) => {
                          const v = rows.slice();
                          v[i] = { ...v[i], level_order: Number(e.target.value) || 0 };
                          setRows(v);
                        }}
                        disabled={isReadonlyView}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        value={r.level_name}
                        onChange={(e) => {
                          const v = rows.slice();
                          v[i] = { ...v[i], level_name: e.target.value };
                          setRows(v);
                        }}
                        disabled={isReadonlyView}
                        placeholder="Starter"
                      />
                    </TableCell>
                    <TableCell className="w-36">
                      <Input
                        type="number"
                        value={r.required_points}
                        onChange={(e) => {
                          const v = rows.slice();
                          v[i] = { ...v[i], required_points: Number(e.target.value) || 0 };
                          setRows(v);
                        }}
                        disabled={isReadonlyView}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell w-28">
                      <Input
                        type="number"
                        step="0.000001"
                        value={r.rate_bonus ?? ''}
                        onChange={(e) => {
                          const v = rows.slice();
                          const raw = e.target.value;
                          v[i] = { ...v[i], rate_bonus: raw === '' ? null : Number(raw) };
                          setRows(v);
                        }}
                        disabled={isReadonlyView}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell w-24">
                      <Input
                        type="number"
                        value={r.priority_level ?? ''}
                        onChange={(e) => {
                          const v = rows.slice();
                          const raw = e.target.value;
                          v[i] = { ...v[i], priority_level: raw === '' ? null : Number(raw) };
                          setRows(v);
                        }}
                        disabled={isReadonlyView}
                      />
                    </TableCell>
                    <TableCell>
                      <ConfirmDialog
                        disabled={isReadonlyView || rows.length <= 1}
                        trigger={
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="text-destructive"
                            disabled={isReadonlyView || rows.length <= 1}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        }
                        title={t('确认删除', 'Confirm Delete')}
                        description={t(
                          '确定删除该条积分等级规则吗？请点击页面底部保存后才会写入服务端。',
                          'Remove this tier rule? Click Save at the bottom to persist.',
                        )}
                        confirmText={t('删除', 'Delete')}
                        cancelText={t('取消', 'Cancel')}
                        onConfirm={() => removeRow(i)}
                        confirmVariant="destructive"
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
          <p className="text-xs text-muted-foreground mt-4">
            {t(
              '匹配规则：取 required_points ≤ 会员 total_points 的最大档。total_points 仅在获得正积分流水时增加，删单不减。',
              'Rule: highest tier with required_points ≤ member total_points. total_points only increases on positive ledger deltas.',
            )}
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
